# Research: Apify TikTok Scraper for SEA Product Discovery

> Date: 2025-02-06
> Status: Complete
> Context: Phase 2 of product-scout - Integrate Apify TikTok Scraper (SEA)

---

## Executive Summary

The `clockworks/tiktok-scraper` is actually a **family of 9+ specialized actors**, not one monolithic scraper. For product discovery in Southeast Asia, we should use a **multi-actor strategy** combining hashtag search, keyword discovery, and trending/explore scraping. The key challenge is that **Apify returns video engagement data but NO e-commerce/shop data** - we must infer product signals from video metadata (descriptions, hashtags, engagement patterns) and validate through Shopee.

---

## 1. Apify Actor Ecosystem (clockworks/*)

### Available Actors

| Actor | ID | Purpose | Input | Best For |
|-------|-----|---------|-------|----------|
| **tiktok-scraper** | `GdWCkxBtKWOsKjdch` | All-in-one: videos, hashtags, users | URLs or search queries | General purpose |
| **tiktok-hashtag-scraper** | `f1ZeP0K58iwlqG2pY` | Videos by hashtag | Hashtag list | **Primary: product hashtag monitoring** |
| **tiktok-discover-scraper** | `DdSkpbFy5T8FyCsor` | Discover page + related trends | Hashtags | **Primary: trend discovery + subtopics** |
| **tiktok-explore-scraper** | `qdfdPm13uGf2TeSnt` | Explore categories | Categories | Category-based browsing |
| **tiktok-profile-scraper** | `0FXVyOXXEmdGcV88a` | Creator profile + recent videos | Profile URLs | Monitor known product reviewers |
| **tiktok-user-search-scraper** | `urbACh26VF8yHR72m` | Search users by keyword | Search terms | Find new product reviewers |
| **tiktok-video-scraper** | `S5h7zRLfKFEr8pdj7` | Specific video data | Video URLs | Deep-dive on viral product videos |
| **tiktok-comments-scraper** | `BDec00yAmCm1QbMEI` | Video comments | Video URLs | Sentiment/purchase intent analysis |
| **tiktok-sound-scraper** | `JVisUAY6oGn2dBn99` | Videos using a sound | Sound URLs | Track trending product sounds |
| **free-tiktok-scraper** | `OtzYfK1ndEGdwWFKQ` | Basic hashtag/profile (free tier) | Hashtags | Testing/low-cost runs |

### Also Notable (Non-clockworks)

| Actor | Purpose | Price |
|-------|---------|-------|
| `scrapio/tiktok-trending-videos-scraper` | **Trending videos by region** | $14.99/mo |
| `scraper-engine/tiktok-trending-videos-scraper` | Trending videos with full metrics | Pay-per-event |

### Recommendation for Product Scout

**Primary actors (daily use):**
1. `clockworks/tiktok-hashtag-scraper` - Monitor product-related hashtags
2. `clockworks/tiktok-discover-scraper` - Discover related trends and subtopics
3. `scrapio/tiktok-trending-videos-scraper` - Regional trending (supports by-region)

**Secondary actors (weekly/on-demand):**
4. `clockworks/tiktok-profile-scraper` - Monitor known product review creators
5. `clockworks/tiktok-comments-scraper` - Validate purchase intent signals

---

## 2. Input Configuration

### tiktok-hashtag-scraper (Primary)

```typescript
const runInput = {
  hashtags: ["tiktokshop", "รีวิวสินค้า"],  // Array of hashtags (no # prefix)
  resultsPerPage: 100,                         // Videos per hashtag (max ~1000-3000)
  shouldDownloadVideos: false,                  // Keep false to save cost
  shouldDownloadCovers: false,
  shouldDownloadSlideshowImages: false,
  shouldDownloadSubtitles: false,
};
```

### tiktok-discover-scraper (Trend Discovery)

```typescript
const runInput = {
  hashtags: ["tiktokshop"],     // Seed hashtags
  // Returns: related videos, tag breadcrumbs, similar trends, subtopics
};
```

### tiktok-profile-scraper (Creator Monitoring)

```typescript
const runInput = {
  profiles: [
    "https://www.tiktok.com/@reviewer_th",
    "https://www.tiktok.com/@shopee_haul",
  ],
  resultsPerPage: 6,            // Recent videos per profile
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadSlideshowImages: false,
  shouldDownloadSubtitles: false,
};
```

### Trending Videos Scraper (Regional)

```typescript
// scrapio/tiktok-trending-videos-scraper
const runInput = {
  region: "TH",                 // Country code: TH, ID, PH, VN, MY
  // Returns: trending videos with full engagement metrics
};
```

### Pagination

- Results are paginated internally by the actor
- Retrieve via `dataset.listItems({ offset, limit: 1000 })` in 1000-item batches
- Loop until `items.length < pageSize`
- Typical: 100-3000 results per hashtag depending on `resultsPerPage`

---

## 3. Output Data Schema

### Video Record Fields (confirmed from real usage)

```typescript
interface TikTokVideoOutput {
  // === Video Metadata ===
  id: string;                    // Video ID
  webVideoUrl: string;           // Full video URL
  text: string;                  // Video description/caption
  createTime: number;            // Unix timestamp

  // === Engagement Metrics ===
  diggCount: number;             // Likes
  shareCount: number;            // Shares
  commentCount: number;          // Comments
  playCount: number;             // Views/plays
  collectCount: number;          // Bookmarks/saves

  // === Creator Data ===
  authorMeta: {
    id: string;
    name: string;                // Username
    nickName: string;            // Display name
    signature: string;           // Bio
    verified: boolean;
    followers: number;
    following: number;
    hearts: number;              // Total likes on all videos
    videos: number;              // Total video count
    bioLink?: string;            // Link in bio
  };

  // === Hashtags ===
  hashtags: Array<{
    id: string;
    name: string;
    title: string;
    cover: string;
  }>;

  // === Music/Sound ===
  musicMeta: {
    musicId: string;
    musicName: string;
    musicAuthor: string;
    musicOriginal: boolean;
  };

  // === Location (when available) ===
  locationCreated?: string;      // Country code where video was created

  // === Media ===
  videoMeta: {
    duration: number;            // Video duration in seconds
    width: number;
    height: number;
  };
  covers?: { default: string; };
}
```

### Key Fields for Product Discovery

| Field | Product Signal | Usage |
|-------|---------------|-------|
| `text` (description) | Product names, brand mentions, specs | **NLP extraction** |
| `hashtags[].name` | Category signals, brand names | **Classification** |
| `diggCount` / `playCount` | Virality / reach | **Engagement scoring** |
| `commentCount` | Discussion level (purchase intent) | **Demand signal** |
| `collectCount` | Save-for-later (strong purchase intent) | **High-weight signal** |
| `shareCount` | Word-of-mouth potential | **Virality signal** |
| `authorMeta.signature` | Creator type (reviewer, seller, affiliate) | **Source classification** |
| `authorMeta.bioLink` | Link to shop/affiliate | **Commerce indicator** |
| `musicMeta.musicOriginal` | Original sound = likely review/demo | **Content type signal** |
| `locationCreated` | Region identification | **Market targeting** |
| `videoMeta.duration` | Long videos = reviews; short = ads | **Content type signal** |

---

## 4. Search Strategy for SEA Product Discovery

### 4.1 Hashtag Strategy by Region

#### Thailand (TH)

**Universal commerce hashtags:**
- `tiktokshop` (465K posts/week globally, TH is #1 engagement)
- `tiktokmademebuyit`
- `tiktokshopfinds`

**Thai-language product hashtags:**
- `รีวิวสินค้า` (product review)
- `สินค้าน่าใช้` (products worth using)
- `ของดีบอกต่อ` (good stuff, spread the word)
- `ของดีติ๊กต๊อก` (TikTok good stuff)
- `รีวิว` (review)
- `แนะนำสินค้า` (product recommendation)
- `ช้อปปี้` (Shopee)
- `ลาซาด้า` (Lazada)
- `สั่งเลย` (order now)
- `ถูกและดี` (cheap and good)
- `ของมันต้องมี` (must-have items)

**Category-specific (TH):**
- `สกินแคร์` (skincare), `เมคอัพ` (makeup), `แฟชั่น` (fashion)
- `ของใช้ในบ้าน` (household items), `อาหารเสริม` (supplements)
- `เสื้อผ้า` (clothing), `กระเป๋า` (bags)

#### Indonesia (ID)

- `tiktokshopindonesia`
- `racuntiktok` (TikTok recommendations)
- `rekomendasiproduk` (product recommendation)
- `reviewproduk` (product review)
- `produkmurah` (cheap products)
- `belanjatiktok` (TikTok shopping)
- `barangmurah` (cheap items)
- `minusdikit` (slightly flawed/discount)
- `skincareindonesia`, `makeupmurah`

#### Vietnam (VN)

- `tiktokshopvietnam`
- `reviewsanpham` (product review)
- `gợiýsảnphẩm` (product suggestion)
- `mualagi` (buy again)
- `hàngtốtgiárẻ` (good quality cheap price)
- `đồdùngtốt` (good products)
- `sanphamhay` (good products)
- `muasắmonline` (online shopping)

#### Philippines (PH)

- `tiktokshopph`
- `tiktokmademebuyitph`
- `shopeetips`
- `affordablefindsph`
- `budgetfriendlyph`
- `productreviewph`
- `mustbuyph`
- `haulsph`

#### Malaysia (MY)

- `tiktokshopmalaysia`
- `tiktokmademebuyitmy`
- `shopeefindsmy`
- `barangmurahmalaysia`
- `reviewproduct`
- `musttrymy`

### 4.2 Keyword Strategy (for Discover Scraper)

**English keywords (work across SEA):**
- "product review"
- "unboxing"
- "haul"
- "must buy"
- "best [category]"
- "[category] review"
- "affordable finds"
- "TikTok shop finds"

**Category-specific keywords:**
- "skincare routine", "makeup tutorial", "fashion haul"
- "kitchen gadgets", "home organization", "cleaning hacks"
- "phone accessories", "tech review"
- "pet products", "baby products"

### 4.3 Creator Profile Monitoring

Strategy: Build a list of known product reviewers per region and scrape their recent videos weekly.

**Identifying product reviewers:**
1. Use `tiktok-user-search-scraper` with terms like "review", "รีวิว", "haul"
2. Filter by: followers > 10K, recent posting activity, bio contains shop links
3. Maintain a `creator_watchlist` table in SQLite

---

## 5. Extracting Product Signals from Video-Only Data

### 5.1 The Core Problem

Apify gives us:
- Video descriptions, hashtags, engagement metrics, creator info
- **NO**: product names, prices, SKUs, shop links, sales data

We must **infer** product signals from video metadata alone, then **validate** through Shopee.

### 5.2 Product Signal Extraction Pipeline

```
Raw Video Data
    ↓
1. Content Classification (is this a product video?)
    ↓
2. Product Name Extraction (what product is it?)
    ↓
3. Category Detection (what category?)
    ↓
4. Engagement Scoring (how popular?)
    ↓
5. Trend Detection (rising or falling?)
    ↓
6. → Shopee Validation (does it actually sell?)
```

### 5.3 Step 1: Content Classification

**Positive signals (IS a product video):**

| Signal | Detection Method | Weight |
|--------|-----------------|--------|
| Product hashtags present | Check against product hashtag dictionary | High |
| Description contains review keywords | Regex: "review", "รีวิว", "unboxing", "haul", "must buy" | High |
| Creator has shop link in bio | `authorMeta.bioLink` is not empty | Medium |
| Original sound | `musicMeta.musicOriginal === true` (review/demo typically uses original audio) | Medium |
| Video duration 30s-180s | `videoMeta.duration` in sweet spot for reviews | Low |
| High comment:view ratio | `commentCount / playCount > 0.02` (people asking questions) | Medium |
| High save:view ratio | `collectCount / playCount > 0.01` (save for later purchase) | **High** |

**Negative signals (NOT a product video):**

| Signal | Detection Method |
|--------|-----------------|
| Pure entertainment hashtags | `fyp`, `viral`, `funny`, `dance`, `pov` without product tags |
| Very short duration | `videoMeta.duration < 10` (usually memes/clips) |
| Music is not original | Popular audio = likely entertainment/trend |
| No descriptive text | Empty or very short `text` field |

**Classification formula:**
```
productScore = (
  hasProductHashtag * 3.0 +
  hasReviewKeyword * 2.5 +
  hasBioLink * 1.5 +
  isOriginalSound * 1.0 +
  isReviewDuration * 0.5 +
  highSaveRatio * 2.0 +
  highCommentRatio * 1.5
) - (
  pureEntertainmentHashtag * 3.0 +
  tooShort * 2.0
)

isProductVideo = productScore >= 3.0
```

### 5.4 Step 2: Product Name/Keyword Extraction

**From video description (`text` field):**
```typescript
// Strategy: Extract potential product names using patterns
const patterns = [
  // Brand + Product: "Maybelline Superstay Matte"
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([\w\s]+)/,

  // "review [product]" patterns
  /(?:review|รีวิว|unboxing)\s+(.{5,50})/i,

  // Price mentions: "$15", "฿299", "15k"
  /[\$฿₫₱RM]?\s*\d+[,.]?\d*\s*(?:k|rb|ribu)?/i,

  // "this [product]" or "the [product]"
  /(?:this|the|นี่|ini)\s+(\w[\w\s]{3,30})/i,
];
```

**From hashtags:**
```typescript
// Hashtags often contain product names or categories
// Filter out generic hashtags, remaining are likely product-specific
const genericHashtags = new Set([
  'fyp', 'viral', 'foryou', 'foryoupage', 'tiktok',
  'tiktokshop', 'review', 'haul', 'musthave',
]);

const productHashtags = video.hashtags
  .map(h => h.name)
  .filter(h => !genericHashtags.has(h.toLowerCase()));
// Remaining hashtags: brand names, product names, categories
```

### 5.5 Step 3: Engagement-Based Product Scoring

**Key insight: Different engagement metrics signal different things.**

| Metric | What It Means | Product Signal |
|--------|--------------|----------------|
| High `playCount` | Video reached many people | Awareness (weak product signal) |
| High `diggCount` / `playCount` ratio | Content resonates | Interest (medium) |
| High `commentCount` / `playCount` ratio | People asking questions | **Purchase consideration (strong)** |
| High `collectCount` / `playCount` ratio | People saving for later | **Purchase intent (strongest)** |
| High `shareCount` / `playCount` ratio | Word-of-mouth | **Recommendation (strong)** |

**Product Potential Score:**

```typescript
function calculateProductPotential(video: TikTokVideo): number {
  const { playCount, diggCount, commentCount, collectCount, shareCount } = video;

  // Avoid division by zero
  if (playCount < 1000) return 0; // Too few views to be meaningful

  // Engagement ratios (normalized)
  const likeRate = diggCount / playCount;
  const commentRate = commentCount / playCount;
  const saveRate = collectCount / playCount;
  const shareRate = shareCount / playCount;

  // Weighted product potential
  const score = (
    Math.min(likeRate / 0.05, 1.0) * 15 +      // Like rate (baseline ~5%)
    Math.min(commentRate / 0.02, 1.0) * 25 +     // Comment rate (high = questions)
    Math.min(saveRate / 0.01, 1.0) * 35 +         // Save rate (highest weight)
    Math.min(shareRate / 0.01, 1.0) * 25           // Share rate (recommendations)
  );

  // Volume bonus (more views = more data confidence)
  const volumeMultiplier =
    playCount > 1_000_000 ? 1.5 :
    playCount > 100_000 ? 1.2 :
    playCount > 10_000 ? 1.0 :
    0.8;

  return Math.round(score * volumeMultiplier);
}
```

### 5.6 Step 4: Trend Detection

**Approach: Scrape the same hashtags daily, track changes over time.**

```sql
-- Track hashtag video volume over time
CREATE TABLE hashtag_trends (
    hashtag TEXT,
    region TEXT,
    date DATE,
    video_count INTEGER,
    avg_views INTEGER,
    avg_engagement_rate REAL,
    top_video_views INTEGER,
    PRIMARY KEY (hashtag, region, date)
);

-- Detect rising trends
SELECT
    hashtag,
    region,
    video_count as today_count,
    LAG(video_count, 1) OVER (PARTITION BY hashtag, region ORDER BY date) as yesterday_count,
    LAG(video_count, 7) OVER (PARTITION BY hashtag, region ORDER BY date) as week_ago_count,
    CASE
        WHEN video_count > LAG(video_count, 7) OVER (...) * 1.5 THEN 'rising_fast'
        WHEN video_count > LAG(video_count, 7) OVER (...) * 1.1 THEN 'rising'
        WHEN video_count < LAG(video_count, 7) OVER (...) * 0.8 THEN 'declining'
        ELSE 'stable'
    END as trend
FROM hashtag_trends
WHERE date = CURRENT_DATE;
```

### 5.7 Patterns That Indicate a Product Is Actually Selling

**Strong selling indicators (video-only data):**

1. **Multiple creators reviewing the same product** - If 5+ different creators mention the same product in a week, it's likely selling well
2. **High save-to-view ratio (>1%)** - People bookmarking = considering purchase
3. **Comment patterns** - Questions like "where to buy?", "how much?", "link?" indicate demand
4. **Creator has affiliate/shop link** - bio contains Shopee/Lazada/TikTok Shop link
5. **Hashtag growth acceleration** - Product-specific hashtag growing >50%/week
6. **Original sound + long format** - Genuine reviews vs. lip-sync entertainment

**Weak/misleading indicators:**
- High views alone (could be entertainment value)
- Likes alone (doesn't indicate purchase intent)
- Celebrity creator (views from fame, not product interest)

---

## 6. Practical Implementation Plan

### 6.1 Daily Scraping Volume

| Region | Hashtags to Monitor | Videos/Day Estimate | Actor Runs/Day |
|--------|--------------------:|--------------------:|---------------:|
| TH | 15-20 | ~2,000 | 2-3 |
| ID | 15-20 | ~2,000 | 2-3 |
| VN | 10-15 | ~1,500 | 2-3 |
| PH | 10-15 | ~1,500 | 2-3 |
| MY | 8-10 | ~1,000 | 1-2 |
| **Total** | **~70** | **~8,000** | **~12** |

### 6.2 Recommended Actor Usage Per Day

| Actor | Frequency | Purpose | Est. Cost |
|-------|-----------|---------|-----------|
| `tiktok-hashtag-scraper` | Daily, 5 regions | Monitor product hashtags | ~$30/mo |
| `tiktok-discover-scraper` | Daily, 3-5 seed hashtags | Find new trends/subtopics | ~$10/mo |
| `tiktok-profile-scraper` | Weekly, ~50 creators | Monitor known reviewers | ~$5/mo |
| `tiktok-comments-scraper` | On-demand, top 20 videos | Validate purchase intent | ~$5/mo |
| **Total** | | | **~$50/mo** |

This fits the $50/month Apify budget in the design doc.

### 6.3 Data Flow Integration

```
Daily Scrape Flow:
    ┌─────────────────────────────────┐
    │ Apify Hashtag Scraper (5 regions)│
    │ + Discover Scraper (trends)      │
    └──────────────┬──────────────────┘
                   ↓
    ┌─────────────────────────────────┐
    │ Content Classifier               │
    │ (is this a product video?)       │
    │ Score >= 3.0 → keep             │
    └──────────────┬──────────────────┘
                   ↓
    ┌─────────────────────────────────┐
    │ Product Extractor                │
    │ - Extract product name from text │
    │ - Extract category from hashtags │
    │ - Calculate engagement score     │
    └──────────────┬──────────────────┘
                   ↓
    ┌─────────────────────────────────┐
    │ Deduplication + Aggregation      │
    │ - Group by product name          │
    │ - Count unique creators          │
    │ - Sum engagement metrics         │
    │ - Detect trends (vs. yesterday)  │
    └──────────────┬──────────────────┘
                   ↓
    ┌─────────────────────────────────┐
    │ tiktok_products table (SQLite)   │
    └──────────────┬──────────────────┘
                   ↓
    ┌─────────────────────────────────┐
    │ → Shopee Validation              │
    │ → Google Trends                  │
    │ → CJ Pricing                     │
    │ → Score + Filter → Notion        │
    └─────────────────────────────────┘
```

### 6.4 Example: Video Data → Product Insight

**Raw video from Apify:**
```json
{
  "id": "7312345678901234567",
  "text": "รีวิว เซรั่มวิตามินซี Garnier Bright Complete 🧴 ผิวกระจ่างใสจริง! #รีวิวสินค้า #สกินแคร์ #GarnierTH #เซรั่มวิตซี",
  "playCount": 850000,
  "diggCount": 95000,
  "commentCount": 3200,
  "collectCount": 12000,
  "shareCount": 4500,
  "hashtags": [
    {"name": "รีวิวสินค้า"},
    {"name": "สกินแคร์"},
    {"name": "GarnierTH"},
    {"name": "เซรั่มวิตซี"}
  ],
  "authorMeta": {
    "nickName": "BeautyReviewTH",
    "followers": 250000,
    "bioLink": "https://s.shopee.co.th/xxxxx"
  },
  "musicMeta": {"musicOriginal": true},
  "videoMeta": {"duration": 65},
  "locationCreated": "TH"
}
```

**Extracted product insight:**
```json
{
  "product_name": "Garnier Bright Complete Vitamin C Serum",
  "category": "skincare",
  "region": "TH",
  "is_product_video": true,
  "product_confidence": 0.95,
  "engagement_score": 82,
  "signals": {
    "save_rate": 0.014,      // 1.4% - very high (>1% threshold)
    "comment_rate": 0.0038,  // Strong discussion
    "share_rate": 0.0053,    // Good word-of-mouth
    "like_rate": 0.112       // 11.2% - excellent
  },
  "purchase_intent_indicators": [
    "Creator has Shopee link in bio",
    "High save rate (1.4%)",
    "Original sound (genuine review)",
    "Review duration (65s - sweet spot)",
    "Product hashtag present (GarnierTH)"
  ],
  "shopee_search_query": "Garnier Bright Complete Vitamin C Serum"
}
```

---

## 7. Apify Client Integration (TypeScript/Bun)

### Installation

```bash
bun add apify-client
```

### Basic Usage Pattern

```typescript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// === Hashtag Scraping ===
async function scrapeHashtags(hashtags: string[], limit: number = 100) {
  const { defaultDatasetId } = await client
    .actor('clockworks/tiktok-hashtag-scraper')
    .call({
      hashtags,
      resultsPerPage: limit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
    });

  // Paginate through results
  const dataset = client.dataset(defaultDatasetId);
  const videos: TikTokVideo[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { items } = await dataset.listItems({ offset, limit: pageSize });
    videos.push(...items);
    offset += items.length;
    if (items.length < pageSize) break;
  }

  return videos;
}

// === Discover/Trend Scraping ===
async function discoverTrends(hashtags: string[]) {
  const { defaultDatasetId } = await client
    .actor('clockworks/tiktok-discover-scraper')
    .call({ hashtags });

  // Returns: related videos, tag breadcrumbs, similar trends, subtopics
  const { items } = await client.dataset(defaultDatasetId).listItems();
  return items;
}
```

### Pricing Model (Current)

- **Pay-per-event**: $0.005 per actor start + usage-based
- Previous flat rate was $45/month
- Free tier available via `clockworks/free-tiktok-scraper`
- The main `clockworks/tiktok-scraper` has 4.65M successful runs in 30 days

---

## 8. Key Decisions & Open Questions

### Decided

1. **Use multi-actor strategy** - hashtag scraper (daily) + discover scraper (daily) + profile scraper (weekly)
2. **Product classification first** - Filter out entertainment content before processing
3. **Save rate is the strongest signal** - Weight `collectCount/playCount` highest
4. **Validate through Shopee** - TikTok data is discovery; Shopee data is validation
5. **Track trends over time** - Daily snapshots enable trend detection

### Open Questions

| Question | Impact | Proposed Solution |
|----------|--------|-------------------|
| Does `locationCreated` reliably indicate SEA? | Determines if we can filter by region from TikTok alone | Test with real data; fallback to language detection |
| How accurate is hashtag-based product name extraction? | Core of the product identification pipeline | Build + iterate; consider LLM-assisted extraction later |
| What's the deduplication key for products across videos? | Aggregation accuracy | fuzzy matching on product name + category |
| Can we scrape TikTok Creative Center directly for trending data? | Supplement Apify data | Investigate as separate data source |
| How to handle TikTok's rate limits / blocking? | Data reliability | Apify handles this; monitor failure rates |

---

## 9. TikTok Trending Product Categories (Global, applicable to SEA)

Based on Shopify/TikTok data (2024-2025):

| Rank | Category | TikTok Community | SEA Relevance |
|------|----------|------------------|---------------|
| 1 | Skincare/Serums | #SkinTok | **Very High** (K-beauty popular in SEA) |
| 2 | Makeup/Lip Products | #MakeupTok | **Very High** |
| 3 | Hair Care | #HairTok | High |
| 4 | Phone Cases/Accessories | - | **Very High** (cheap, shippable) |
| 5 | Casual Dresses/Fashion | #OOTD | **Very High** |
| 6 | Beauty Supplements | - | High |
| 7 | Household/Cleaning | #CleanTok | Medium |
| 8 | Perfume/Fragrance | #PerfumeTok | Medium |
| 9 | Jewelry (affordable) | - | High |
| 10 | Kitchen Gadgets | - | High |

**SEA-specific additions:**
- Whitening products (huge in TH, ID, PH)
- Hijab/modest fashion (ID, MY)
- Instant noodle/food accessories (VN, TH)
- Motorcycle accessories (ID, VN)

---

## 10. Next Steps

1. **Implement Apify client wrapper** (`src/scrapers/tiktok.ts`)
   - Hashtag scraper with retry logic
   - Dataset pagination helper
   - Zod validation for output

2. **Build content classifier** (`src/core/classifier.ts`)
   - Product video detection
   - Product name extraction
   - Category classification

3. **Build engagement scorer** (`src/core/scorer.ts`)
   - Product potential calculation
   - Trend detection (daily comparison)

4. **Create hashtag configuration** (`config/hashtags.yaml`)
   - Per-region hashtag lists
   - Update schedule

5. **Test with real data** - Run one scrape per region, validate the pipeline
