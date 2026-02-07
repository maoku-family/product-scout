# Phase 2: Data Collection Design

> Design document for the data collection layer of Product Scout.
> Covers all 5 data sources, search strategy, deduplication, cost analysis, and data pipeline.

---

## 1. Overview

### Scope

Build the complete data collection layer: SQLite database, 4 data source integrations, and the processing pipeline that connects them.

### Implementation Order

```
SQLite → TikTok (Apify) → Shopee (Playwright) → Google Trends → CJ API
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TikTok data source | Apify actors | Best cost/value, TS SDK, proven reliability |
| Shopee scraping | Playwright | Flexible, handles dynamic rendering |
| Region support | Multi-country from day one | YAML config, Zod validation, no code changes to add countries |
| Search strategy | Category-first with tiered actors | More precise data, better cost efficiency |
| Future enrichment | FastMoss/Kalodata | No public API; defer until MVP validated |

---

## 2. Region Configuration

### Dynamic Region Config

All regions are configured via YAML — adding a new country requires zero code changes.

```yaml
# config/regions.yaml
regions:
  th:
    name: Thailand
    currency: THB
    shopee_domain: shopee.co.th
    language: th
    enabled: true
    tiktok_hashtags:
      - "#tiktokshopthailand"
      - "#สินค้าขายดี"
      - "#ของมันต้องมี"
      - "#รีวิวสินค้า"
  id:
    name: Indonesia
    currency: IDR
    shopee_domain: shopee.co.id
    language: id
    enabled: true
    tiktok_hashtags:
      - "#tiktokshopindonesia"
      - "#produkviralid"
      - "#racuntiktok"
      - "#barangviral"
  ph:
    name: Philippines
    currency: PHP
    shopee_domain: shopee.ph
    language: en
    enabled: true
    tiktok_hashtags:
      - "#tiktokshopph"
      - "#budolfinds"
      - "#productreviewph"
  vn:
    name: Vietnam
    currency: VND
    shopee_domain: shopee.vn
    language: vi
    enabled: true
    tiktok_hashtags:
      - "#tiktokshopvietnam"
      - "#reviewsanpham"
      - "#sanphamhot"
  my:
    name: Malaysia
    currency: MYR
    shopee_domain: shopee.com.my
    language: ms
    enabled: true
    tiktok_hashtags:
      - "#tiktokshopmalaysia"
      - "#barangviral"
      - "#productreviewmy"
```

### Category Config

Categories are configured separately, with per-region hashtags:

```yaml
# config/categories.yaml
categories:
  pets:
    name: "Pets & Pet Supplies"
    hashtags:
      th: ["#สัตว์เลี้ยง", "#อุปกรณ์สัตว์เลี้ยง", "#หมาแมว"]
      id: ["#hewanpeliharaan", "#perlengkapanhewan"]
      ph: ["#petessentials", "#petproductsph"]
    keywords:
      - "pet gadget"
      - "dog toy"
      - "cat accessories"
  # More categories added as needed
```

### Zod Validation

Region and category configs are validated at startup:

```typescript
// src/schemas/region.ts
const RegionSchema = z.object({
  name: z.string(),
  currency: z.string().length(3),
  shopee_domain: z.string(),
  language: z.string().min(2).max(5),
  enabled: z.boolean().default(true),
  tiktok_hashtags: z.array(z.string()).min(1),
});

const RegionsConfigSchema = z.object({
  regions: z.record(
    z.string().regex(/^[a-z]{2}$/),
    RegionSchema
  ).refine(
    (r) => Object.keys(r).length > 0,
    { message: "At least one region must be configured" }
  ),
});
```

Startup validates config immediately — invalid YAML = fail fast, no silent errors.

---

## 3. TikTok Data Collection (Apify)

### Data Source Evaluation

| Option | Verdict | Reason |
|--------|---------|--------|
| Apify actors | ✅ Selected | Best cost/value, TS SDK, $30-45/mo |
| TikTok Research API | ⛔ Not eligible | Commercial use excluded |
| FastMoss / Kalodata | ⏳ Deferred | Rich data but no API, reverse-engineering needed |
| Ensembledata | ⏳ Backup | Similar to Apify but 2x cost ($100+/mo) |
| Self-built scraper | ⛔ Not viable | TikTok anti-bot too aggressive for MVP |

### Tiered Actor Strategy

Two actors working together for cost efficiency:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Wide Discovery (scrapio/trending)      │
│  $14.99/month flat rate, unlimited runs          │
│  Purpose: Discover what's trending per region    │
│  Output: Trending topics, rising hashtags        │
├─────────────────────────────────────────────────┤
│  Layer 2: Precise Search (clockworks/hashtag)    │
│  $0.005 per video, pay per result               │
│  Purpose: Deep-dive specific categories/trends   │
│  Output: Product videos with engagement data     │
└─────────────────────────────────────────────────┘
```

### Cost Analysis

Actual pricing from Apify API (as of 2025-06):

| Actor | Pricing Model | Cost |
|-------|---------------|------|
| `clockworks/tiktok-hashtag-scraper` | Per video | $0.005/video (Free tier) |
| `clockworks/tiktok-discover-scraper` | Per event | $0.038/start + $0.0038/item |
| `scrapio/tiktok-trending-videos-scraper` | Monthly flat | $14.99/month |

Budget scenarios:

| Scenario | Videos/day | Monthly Cost |
|----------|-----------|--------------|
| 1-2 regions, category-focused | ~300/day | ~$45/mo ✅ |
| 3 regions, mixed | ~500/day | ~$75/mo |
| 5 regions, full coverage | ~1,500/day | ~$225/mo |

**Recommended start**: 1-2 regions + tiered strategy = ~$30-45/month.

### Conversion Funnel (Category Search)

```
1,500 videos/day (category hashtags)
  ↓ ~70-80% product-related (category hashtags are precise)
~1,100 product videos
  ↓ Deduplication (same product, multiple videos)
~200-350 unique products
  ↓ Rule filtering (price, margin, trend)
~50-80 candidates/day
```

⚠️ These ratios are estimates — calibrate after first week of real data.

### Key Engagement Signal: Save Rate

```
saves (collectCount) / views (playCount) > 1% = strong purchase intent
```

| Metric | Meaning | Product Signal |
|--------|---------|----------------|
| High views | Attention | ⭐⭐ Weak |
| High likes | Entertaining | ⭐⭐ Weak |
| High comments | Discussion | ⭐⭐⭐ Medium |
| **High saves** | **Plan to buy** | ⭐⭐⭐⭐⭐ Strongest |

### Module Design

- **Location**: `src/scrapers/tiktok.ts`
- **Data flow**: Apify Actor call → raw JSON → Zod validation → `tiktok_products` table
- **Retry**: All Apify calls wrapped in `withRetry`
- **Dirty data**: Fails Zod validation → log and discard, never write to DB

---

## 4. Shopee Scraping (Playwright)

### Purpose

Validate TikTok-discovered products against real market demand.

### Flow

```
Product name from TikTok → Shopee search → Scrape bestseller data
```

### Data Collected

| Field | Purpose |
|-------|---------|
| title | Product identification |
| price | Price validation |
| sold_count | Demand validation |
| rating | Quality signal |
| category | Classification |

### Region Switching

Domain determined by region config: `shopee.co.th`, `shopee.co.id`, `shopee.ph`, etc.

### Anti-Scraping Strategy

- Request interval ≥ 1 second
- Only scrape public listing pages
- Auto-throttle on rate limiting (exponential backoff)
- Graceful degradation: if blocked, log and skip, don't crash

### Module Design

- **Location**: `src/scrapers/shopee.ts`
- **Data flow**: Playwright search → DOM extraction → Zod validation → `shopee_products` table

---

## 5. Google Trends Integration

### Purpose

Supplementary trend signal — is the product search interest rising, stable, or declining?

### Method

`google-trends-api` npm package (free, no API key needed).

### Trigger

On-demand — only for candidates that pass TikTok + Shopee initial filtering.

### Output

```typescript
trend_status: "rising" | "stable" | "declining"
```

Scoring weight: 10% of total score.

### Module Design

- **Location**: `src/api/google-trends.ts`
- **Data flow**: Keyword + geo → google-trends-api → trend status → scoring input

---

## 6. CJ Dropshipping API

### Purpose

Get product cost and shipping cost to calculate profit margin.

### Method

CJ official REST API (requires developer account registration).

### Trigger

On-demand — only for candidates that pass initial filtering.

### Data Collected

| Field | Purpose |
|-------|---------|
| cj_price | Product cost |
| shipping_cost | Shipping to target country |
| supplier | Supplier info |
| cj_url | Direct link |

### Profit Calculation

```
profit_margin = (suggested_price - cj_price - shipping_cost) / suggested_price
```

### Module Design

- **Location**: `src/api/cj.ts`
- **Data flow**: Product search → CJ API → Zod validation → `cost_data` table

---

## 7. Deduplication Strategy

### Layer 1: Video Deduplication (at scraping time)

`video_id` UNIQUE constraint in `tiktok_products` table. Same video never stored twice.

### Layer 2: Product Deduplication (at analysis time)

Multiple videos may promote the same product. Dedup methods:

| Method | How | Reliability |
|--------|-----|-------------|
| Hashtag clustering | Videos sharing product-specific hashtags | ⭐⭐⭐⭐ High |
| Keyword extraction + fuzzy match | Extract product name, similarity > 80% = same product | ⭐⭐⭐ Medium |
| Shopee reverse lookup | Search product name on Shopee, same `item_id` = same product | ⭐⭐⭐⭐⭐ Highest |

MVP approach: **Hashtag clustering + Shopee reverse lookup**.

### Signal Aggregation

Multiple videos for the same product are merged to strengthen the signal:

```
Product "Mini Portable Fan"
  → Video A: 500K views, 2% save rate
  → Video B: 300K views, 1.5% save rate
  → Video C: 800K views, 3% save rate

Merged: Total exposure 1.6M, avg save rate 2.3% → Strong candidate ✅
```

---

## 8. Data Processing Pipeline

### End-to-End Flow

```
① Classify    → Is this a product video? (hashtag dict + keyword matching)
② Extract     → What product? (description + hashtag analysis)
③ Deduplicate → Hashtag clustering, merge signals
④ Shopee      → Search & validate demand (sales, price, rating)
⑤ Trends      → Google Trends supplementary signal
⑥ Cost        → CJ API cost + shipping lookup
⑦ Score       → Weighted composite score
⑧ Store       → Write to candidates table
⑨ Sync        → Push to Notion
```

### Scoring Weights

| Dimension | Weight | Calculation |
|-----------|--------|-------------|
| TikTok Popularity | 35% | Save rate as core signal |
| Shopee Validation | 35% | Has sales = 100, None = 0 |
| Profit Margin | 20% | profit_margin × 100 |
| Google Trends | 10% | rising=100, stable=50, declining=0 |

---

## 9. Error Handling

- All external calls (Apify, Shopee, Google Trends, CJ) wrapped with `withRetry`
- Exponential backoff on failure
- Errors logged before throwing — never swallowed silently
- Each run records status to database (success/failure/count)
- `scripts/status.ts` shows today's run status

---

## 10. Budget Summary

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Apify (tiered strategy) | ~$30-45 | trending flat + hashtag per-video |
| Shopee proxy (optional) | ~$0-20 | May not need initially |
| Google Trends | Free | npm package |
| CJ API | Free | Official API |
| **Total** | **~$30-65** | Start low, scale as needed |

---

## 11. Open Questions (to resolve during implementation)

- [ ] Specific categories to focus on (user to decide)
- [ ] Exact Apify actor run times (test during development)
- [ ] Shopee anti-scraping tolerance (test during development)
- [ ] Save rate (collectCount) availability in Apify actor output (verify with real data)
- [ ] CJ API SEA shipping coverage (verify during registration)
