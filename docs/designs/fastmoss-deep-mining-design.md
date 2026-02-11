# FastMoss Deep Mining — Design Document

> Date: 2026-02-11
> Status: Draft
> Goal: Upgrade Product Scout from a shallow data scraper into a multi-strategy product selection system with deep FastMoss data mining

---

## 1. Background

### Current State

Product Scout currently scrapes only the **FastMoss Sales List** page, extracting 7 fields per product:

- Product name, shop name, category, commission rate
- Units sold, growth rate, GMV

This data feeds a fixed 5-dimension scoring system (sales 30%, growth 20%, Shopee validation 25%, margin 15%, trends 10%) and outputs candidates to Notion.

### Problems

1. **Shallow data** — FastMoss has 12+ pages with rich data; we only use 1
2. **Single strategy** — Fixed scoring weights cannot serve different selection goals
3. **No product depth** — Never enters product detail pages (heat index, creator data, VOC, transaction channel analysis)
4. **No shop dimension** — Cannot discover products by analyzing successful shops
5. **No labeling** — Candidates have a score but no context on why they were selected
6. **No caching** — No awareness of API quota limits or data freshness
7. **Not extensible** — Adding a new data source requires structural changes

### Vision

Build a **multi-strategy, extensible product selection system** that:

- Mines FastMoss data across multiple dimensions (lists, search, detail pages, shops)
- Supports multiple selection strategies simultaneously
- Labels candidates with context (source, strategy, signals)
- Manages API quotas intelligently with caching
- Is architecturally ready for future data sources and feedback loops

---

## 2. Business Model & Selection Strategies

### Target Business Models

1. **TikTok → Independent Site** — Discover trending products on TikTok, sell on Shopify/independent sites, fulfill via CJ/1688
2. **TikTok Shop Reselling** — List similar products directly on TikTok Shop, leverage creator promotions

### Four Selection Strategies

| Strategy | Goal | Time Window | Core Signals |
|----------|------|-------------|--------------|
| **Trending** | Catch products that are exploding right now | 2-4 weeks | High sales growth + short listing age + moderate creator count |
| **Blue Ocean** | Find categories with demand but low competition | Months | Stable sales + few creators + few similar products |
| **High Margin** | Find products with large profit space | Long-term | High commission + high price + low CJ cost + high GPM |
| **Shop Copy** | Copy product selection from proven successful shops | Long-term | High shop rating + strong sales + good fulfillment metrics |

The system supports all four strategies simultaneously. Each candidate is scored against applicable strategies and labeled accordingly. Human makes the final decision.

### Initial Focus: Single Country

We start by focusing on **Thailand (TH)** to:

- Maximize data coverage — a single country's active products are finite; daily scanning of 4 lists + search can cover most products with sales within months
- Build a private historical database — product_snapshots accumulate over time, revealing full product lifecycles (launch → growth → peak → decline) that FastMoss alone doesn't show
- Validate the system end-to-end before expanding to other regions

Estimated data volume (Thailand only):

```
Daily new products (deduplicated): ~1,500-3,000
After 1 month:  ~15,000-30,000 products in database
After 3 months: ~30,000-60,000 products (most active TH products covered)
After 6 months: ~50,000-100,000 products

Snapshots growth: ~4,500 rows/day → ~800,000 rows in 6 months
```

SQLite handles this volume comfortably. When snapshots exceed 180 days, older data can be archived to weekly/monthly summaries.

---

## 3. Data Collection Architecture

### Three-Layer Collection

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Lists (Passive Discovery, Daily Batch Scan)   │
│                                                         │
│  saleslist     → rank, sales, growth, revenue            │
│  newProducts   → 3-day sales, 3-day revenue              │
│  hotlist       → sales, revenue, creator count           │
│  hotvideo      → views, likes, comments, sales           │
│                                                         │
│  → Cast a wide net, discover candidate products          │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Search (Active Exploration, Strategy-Driven)  │
│                                                         │
│  Product search × configurable filter strategies (YAML) │
│                                                         │
│  Example strategies:                                     │
│  - Blue ocean: commission>15% + conversion>30% +         │
│                creators<50                               │
│  - High margin: price>$20 + commission>10% +             │
│                 totalSales>500                            │
│                                                         │
│  → Targeted search based on selection methodology        │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Details (Deep Mining, Per Pre-filtered Item)  │
│                                                         │
│  Product detail page:                                    │
│  - Basics: heat index, popularity, listing date, stock,  │
│            price, commission                             │
│  - Sales: total sales, total GMV, creator count,         │
│           video count                                    │
│  - Transaction: channel split (video/live/other),        │
│                 content split                            │
│  - Creators: top creators, followers, GPM, sales         │
│  - Videos: top videos, views, engagement rate, sales     │
│  - VOC: positive points, negative points (text)          │
│  - Similar: similar product count                        │
│                                                         │
│  → Full decision-making data for filtered candidates     │
└─────────────────────────────────────────────────────────┘
```

### Dual Data Flows

```
Product Flow:
  Lists/Search → Pre-filter → Product Detail → Score → Candidates → Notion

Shop Flow (new):
  Shop Search/Shop Lists → Shop Detail → Shop Product List
       → Reverse-generate candidate products → merge into Product Flow
```

Both flows output to the same candidate pool with unified scoring and labeling.

### Available FastMoss Pages

| Page | URL Pattern | Status | Data Fields |
|------|-------------|--------|-------------|
| Sales List | `/e-commerce/saleslist` | ✅ Exists | rank, product, shop, category, commission, sales, growth, revenue, total sales, total revenue |
| New Products | `/e-commerce/newProducts` | ✅ New | rank, product, shop, category, commission, 3-day sales, 3-day revenue, total sales, total revenue |
| Hot Promotion | `/e-commerce/hotlist` | ✅ New | rank, product, shop, category, commission, sales, revenue, creator count, total creators |
| Video Products | `/e-commerce/hotvideo` | ✅ New | product, video content, total sales, total revenue, total views, total likes, total comments |
| Product Search | `/e-commerce/search` | ✅ New | product, shop, conversion rate, 7-day trend, 7-day sales/revenue, total sales/revenue, creators |
| Product Detail | `/e-commerce/detail/{id}` | ✅ New | heat index, popularity, price, commission, listing date, stock, creators, videos, lives, VOC, channel split, similar products |
| Shop Sales List | `/shop-marketing/tiktok` | ✅ New | rank, shop, sales, growth, revenue, active products, creator count |
| Shop Hot List | `/shop-marketing/hotTiktok` | ✅ New | rank, shop, new creators, sales, growth, revenue, active products |
| Shop Search | `/shop-marketing/search` | ✅ New | shop, 7-day trend, 7-day sales/revenue, active products, new product ratio, total sales/revenue, products, creators |
| Shop Detail | `/shop-marketing/detail/{id}` | ✅ New | total sales/revenue, products, ranking, rating, positive rate, ship rate, creators, videos, lives, similar shops |

---

## 4. Labeling System

Every candidate product receives multiple labels providing context for why it was selected.

### Label Types

**Discovery Labels** — Where the product was found:

```
discovery:sales-rank        # Found on sales ranking list
discovery:new-products      # Found on new products list
discovery:hot-promotion     # Found on hot promotion list
discovery:video-products    # Found on video products list
discovery:search            # Found via active search
discovery:shop-copy         # Found by copying from a target shop
```

**Strategy Labels** — Which selection strategy it matches:

```
strategy:trending           # Matches trending/explosive criteria
strategy:blue-ocean         # Matches blue ocean criteria
strategy:high-margin        # Matches high margin criteria
strategy:shop-copy          # Sourced from shop copy strategy
```

**Signal Labels** — Notable characteristics (rule-based, configurable):

```
signal:sales-surge          # Sales growth >100%
signal:low-competition      # Creator count <50
signal:high-commission      # Commission rate >15%
signal:high-gpm             # High GPM (revenue per 1000 views)
signal:viral-video          # Has video with >1M views
signal:good-reviews         # High VOC positive rate
signal:new-product          # Listed <30 days ago
signal:cross-border         # Cross-border shop is selling it
```

**Manual Labels** — Human judgment in Notion (feedback loop placeholder):

```
manual:selected             # Decided to list this product
manual:rejected             # Explicitly rejected
manual:watching             # Continue monitoring
manual:tested               # Already tested selling
```

### Signal Rule Configuration

Signal labels are triggered by configurable rules in YAML:

```yaml
signal_rules:
  sales-surge:
    condition: "salesGrowthRate > 1.0"
  low-competition:
    condition: "creatorCount < 50"
  high-commission:
    condition: "commissionRate > 0.15"
  high-gpm:
    condition: "gpm > 20"
  viral-video:
    condition: "maxVideoViews > 1000000"
  good-reviews:
    condition: "vocPositiveRate > 0.8"
  new-product:
    condition: "daysSinceListed < 30"
  cross-border:
    condition: "shopType == 'cross-border'"
```

Adding a new signal = adding a YAML entry, no code change required.

---

## 5. Scoring System

### Multi-Strategy Scoring

Each candidate is scored against multiple strategy profiles simultaneously. Profiles are defined in YAML with configurable dimensions and weights.

```yaml
scoring_profiles:
  default:
    name: "Composite Score"
    dimensions:
      salesVolume: 20
      salesGrowthRate: 15
      shopeeValidation: 15
      profitMargin: 15
      creatorCount: 10
      hotIndex: 10
      voc: 5
      googleTrends: 5
      recency: 5

  trending:
    name: "Trending / Explosive"
    dimensions:
      salesGrowthRate: 30
      hotIndex: 25
      videoViews: 20
      recency: 15
      creatorCount: 10          # sweet spot: moderate count

  blueOcean:
    name: "Blue Ocean"
    dimensions:
      salesVolume: 25
      competitionScore: 30       # inverse of creator + similar product count
      creatorConversionRate: 20
      categoryGrowth: 15
      voc: 10

  highMargin:
    name: "High Margin"
    dimensions:
      profitMargin: 35
      gpm: 25
      commissionRate: 15
      pricePoint: 15
      salesStability: 10

  shopCopy:
    name: "Shop Copy"
    dimensions:
      shopRating: 25
      productSalesInShop: 30
      shopSalesGrowth: 20
      creatorConversionRate: 15
      profitMargin: 10
```

### Dimension Data Sources

| Dimension | Data Source | Collection Layer |
|-----------|-----------|-----------------|
| salesVolume | Sales list / detail page | List |
| salesGrowthRate | Sales list / detail page | List |
| hotIndex | Product detail page | Detail |
| videoViews | Video products list / detail page | List + Detail |
| recency | Product detail page (listing date) | Detail |
| creatorCount | Hot promotion list / detail page | List + Detail |
| competitionScore | Detail page (similar products + creator count) | Detail |
| creatorConversionRate | Product search (conversion rate) | Search |
| profitMargin | CJ API + detail page price | Detail + External API |
| gpm | Product detail page (creator GPM) | Detail |
| commissionRate | Sales list / detail page | List |
| voc | Product detail page (VOC insights) | Detail |
| shopRating | Shop detail page | Shop flow |
| productSalesInShop | Shop detail page (product list) | Shop flow |
| shopSalesGrowth | Shop snapshots | Shop flow |
| categoryGrowth | Reserved for future (knowledge base) | — |
| salesStability | Calculated from product_snapshots over time | Derived |
| pricePoint | Product detail page / enrichments | Detail |
| shopeeValidation | Shopee API (existing) | External API |
| googleTrends | Google Trends API (existing) | External API |

### Candidate Output Example

```
Product: Bluetooth Sunglasses

Labels:
  discovery:sales-rank, discovery:search
  strategy:trending, strategy:high-margin
  signal:sales-surge, signal:high-commission, signal:viral-video

Scores:
  default:     76.5
  trending:    82.5  ← high growth + viral video
  blueOcean:   35.0  ← too many creators, high competition
  highMargin:  71.0  ← 20% commission + $44 price
  shopCopy:    N/A   ← not sourced from shop copy

Top Signals:
  "Sales growth +135%, listed 32 days ago, 180K creators.
   Commission 20%, GPM $23.74. Recommended as trending pick,
   but competition is already intense."
```

---

## 6. Caching & Quota Management

### The Problem

FastMoss Professional plan limits: 300 detail page views/day, 300 searches/day. Detail pages are the bottleneck.

### Plan Tier Reference

| Limit | Standard (¥99/mo) | Professional (¥399/mo) |
|-------|-------------------|----------------------|
| List results | Top 150 | Top 500 |
| Search results | Top 300 | Top 1000 |
| Search quota | 150/day/account | 300/day/account |
| Detail page quota | 150/day/account | 300/day/account |
| Historical data | 90 days | 180 days |

**We plan for the Professional tier.**

### Daily Volume Estimate

```
List layer:    4 lists × 1 country × up to 500 items = ~2,000 records (no quota cost)
Search layer:  3 strategies × 1 country = 3 searches (~3,000 results)
Detail layer:  Deduplicated candidates likely 1,500+
               Budget: 300/day → MUST prioritize
```

### Three-Layer Caching

**Layer 1: Local Deduplication (SQLite)**

```
Check product.detail_scraped_at:
  - Scraped today       → Skip (same-day dedup)
  - Scraped within 7d   → Skip detail, update list-level data only
  - Scraped >7 days ago → Re-scrape detail
  - Never scraped       → Scrape detail (highest priority)
```

**Layer 2: Quota-Aware Scheduling**

```
Daily detail budget: 300
  Priority 1 (60%): Never-scraped new discoveries
  Priority 2 (30%): Re-scrape products that reappeared on lists after 7+ days
  Priority 3 (10%): Manually marked "track" products
  At budget limit   → Queue remainder for next day
```

**Layer 3: Data Freshness Tiers**

| Data Type | Change Frequency | Refresh Strategy |
|-----------|-----------------|-----------------|
| Listing date, commission, category | Almost never | Scrape once |
| Total sales, total GMV | Slow accumulation | Every 7 days |
| Daily/weekly sales, growth rate | Daily | Update from lists (free) |
| Heat index, creator count | Daily | Update from detail (costs quota) |
| VOC, reviews | Slow | Every 14 days |

### Scrape Queue

A `scrape_queue` table manages prioritized scraping:

```
scrape_queue:
  target_type    (product_detail / shop_detail)
  target_id      (fastmoss_id or fastmoss_shop_id)
  priority       (0=skip, 1=low, 2=medium, 3=high)
  status         (pending / in_progress / done / failed)
  last_scraped_at
  next_scrape_after
  retry_count
```

Multiple pipeline runs per day are safe: list layer is idempotent (INSERT OR IGNORE), detail layer checks cache before consuming quota.

---

## 7. Multi-Source Extensibility

### Data Source Adapter Pattern

Every data source implements one of two adapter interfaces:

```typescript
// Product data adapter (outputs candidate products)
interface ProductSourceAdapter {
  name: string;
  fetch(options: FetchOptions): Promise<RawProduct[]>;
  normalize(raw: RawProduct): CandidateProduct;
  getTags(raw: RawProduct): Tag[];
}

// Future: Knowledge adapter (outputs rules/insights)
interface KnowledgeSourceAdapter {
  name: string;
  fetch(options: FetchOptions): Promise<RawKnowledge[]>;
  toSignalRules(raw: RawKnowledge): SignalRule[];
  toSearchStrategy(raw: RawKnowledge): SearchStrategy[];
}
```

Adding a new data source = implementing an adapter. Core engine unchanged.

### Unified Enrichment Table

All external data sources contribute to a single `product_enrichments` table instead of source-specific tables:

```
product_enrichments:
  product_id    FK → products
  source        TEXT (shopee / cj / amazon / lazada / ...)
  price         REAL (common field)
  sold_count    INT  (common field)
  rating        REAL (common field)
  profit_margin REAL (common field)
  extra         TEXT (JSON, source-specific fields)
  scraped_at    DATE
```

Example rows:

```
| product_id | source | price | sold_count | rating | profit_margin | extra |
|-----------|--------|-------|-----------|--------|--------------|-------|
| 42 | shopee | 15.99 | 3200 | 4.8 | NULL | {} |
| 42 | cj | 3.50 | NULL | NULL | 0.45 | {"shipping_cost": 3.0, "inventory": 500} |
| 42 | amazon | 24.99 | 1500 | 4.3 | NULL | {"bsr_rank": 1234} |
```

New data source = new rows with a new `source` value, no schema change.

### Product Identity Across Sources

```
products table:
  canonical_id    TEXT (cross-source unified ID, initially null)

-- Matching strategy (future):
-- Phase 1: Manual linking via Notion
-- Phase 2: Product name + image similarity matching
-- Phase 3: ML-based product matching
```

---

## 8. Database Schema

### Overview

```
Modify:  products, candidates
Remove:  shopee_products, cost_data → merged into product_enrichments
Add:     product_snapshots, product_details, product_enrichments,
         shops, shop_snapshots, shop_products,
         tags, candidate_tags, candidate_score_details,
         scrape_queue

Total: 4 → 12 tables
```

### Table Definitions

#### products (modified)

Core product identity. One row per unique product.

```sql
CREATE TABLE products (
  product_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_id     TEXT,
  fastmoss_id      TEXT,
  product_name     TEXT NOT NULL,
  shop_name        TEXT NOT NULL,
  shop_id          INTEGER REFERENCES shops(shop_id),
  country          TEXT NOT NULL,
  category         TEXT,
  subcategory      TEXT,
  first_seen_at    DATE NOT NULL,
  UNIQUE(product_name, shop_name, country)
);
```

Key change: removed `scraped_at` from unique key. Same product across different days is now one row, with daily data tracked in snapshots.

#### product_snapshots (new)

Daily snapshot of list-level data. Enables trend tracking over time.

```sql
CREATE TABLE product_snapshots (
  snapshot_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id         INTEGER NOT NULL REFERENCES products(product_id),
  scraped_at         DATE NOT NULL,
  source             TEXT NOT NULL, -- saleslist / newProducts / hotlist / hotvideo / search
  rank               INTEGER,
  units_sold         INTEGER,
  sales_amount       REAL,
  growth_rate        REAL,
  total_units_sold   INTEGER,
  total_sales_amount REAL,
  commission_rate    REAL,
  creator_count      INTEGER,
  video_views        INTEGER,
  video_likes        INTEGER,
  video_comments     INTEGER,
  creator_conversion_rate REAL,
  UNIQUE(product_id, scraped_at, source)
);
```

#### product_details (new)

Deep data from product detail page. Scraped selectively (quota-limited).

```sql
CREATE TABLE product_details (
  product_id         INTEGER PRIMARY KEY REFERENCES products(product_id),
  fastmoss_id        TEXT NOT NULL,
  hot_index          INTEGER,
  popularity_index   INTEGER,
  price              REAL,
  price_usd          REAL,
  commission_rate    REAL,
  rating             REAL,
  review_count       INTEGER,
  listed_at          DATE,
  stock_status       TEXT,
  creator_count      INTEGER,
  video_count        INTEGER,
  live_count         INTEGER,
  channel_video_pct  REAL, -- video transaction percentage
  channel_live_pct   REAL, -- live transaction percentage
  channel_other_pct  REAL, -- other transaction percentage
  voc_positive       TEXT, -- JSON array of positive points
  voc_negative       TEXT, -- JSON array of negative points
  similar_product_count INTEGER,
  scraped_at         DATE NOT NULL
);
```

#### product_enrichments (new, replaces shopee_products + cost_data)

Unified multi-source enrichment data.

```sql
CREATE TABLE product_enrichments (
  enrichment_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(product_id),
  source         TEXT NOT NULL, -- shopee / cj / amazon / lazada / ...
  price          REAL,
  sold_count     INTEGER,
  rating         REAL,
  profit_margin  REAL,
  extra          TEXT, -- JSON for source-specific fields
  scraped_at     DATE NOT NULL,
  UNIQUE(product_id, source, scraped_at)
);
```

#### shops (new)

```sql
CREATE TABLE shops (
  shop_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fastmoss_shop_id   TEXT NOT NULL UNIQUE,
  shop_name          TEXT NOT NULL,
  country            TEXT NOT NULL,
  category           TEXT,
  shop_type          TEXT, -- cross-border / local / brand
  first_seen_at      DATE NOT NULL
);
```

#### shop_snapshots (new)

```sql
CREATE TABLE shop_snapshots (
  snapshot_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id                  INTEGER NOT NULL REFERENCES shops(shop_id),
  scraped_at               DATE NOT NULL,
  source                   TEXT NOT NULL, -- tiktok / hotTiktok / search
  total_sales              INTEGER,
  total_revenue            REAL,
  active_products          INTEGER,
  listed_products          INTEGER,
  creator_count            INTEGER,
  rating                   REAL,
  positive_rate            REAL,
  ship_rate_48h            REAL,
  national_rank            INTEGER,
  category_rank            INTEGER,
  sales_growth_rate        REAL,
  new_product_sales_ratio  REAL,
  UNIQUE(shop_id, scraped_at, source)
);
```

#### shop_products (new)

```sql
CREATE TABLE shop_products (
  shop_id        INTEGER NOT NULL REFERENCES shops(shop_id),
  product_id     INTEGER NOT NULL REFERENCES products(product_id),
  sales_28d      INTEGER,
  revenue_28d    REAL,
  scraped_at     DATE NOT NULL,
  UNIQUE(shop_id, product_id, scraped_at)
);
```

#### candidates (modified)

```sql
CREATE TABLE candidates (
  candidate_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id         INTEGER NOT NULL REFERENCES products(product_id),
  default_score      REAL,
  trending_score     REAL,
  blue_ocean_score   REAL,
  high_margin_score  REAL,
  shop_copy_score    REAL,
  synced_to_notion   INTEGER NOT NULL DEFAULT 0,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id)
);
```

#### candidate_score_details (new)

```sql
CREATE TABLE candidate_score_details (
  candidate_id     INTEGER NOT NULL REFERENCES candidates(candidate_id),
  profile          TEXT NOT NULL, -- default / trending / blueOcean / highMargin / shopCopy
  dimension        TEXT NOT NULL,
  raw_value        REAL,
  normalized_value REAL, -- 0-100
  weight           REAL,
  weighted_score   REAL,
  PRIMARY KEY(candidate_id, profile, dimension)
);
```

#### tags (new)

```sql
CREATE TABLE tags (
  tag_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_type  TEXT NOT NULL, -- discovery / strategy / signal / manual
  tag_name  TEXT NOT NULL,
  UNIQUE(tag_type, tag_name)
);
```

#### candidate_tags (new)

```sql
CREATE TABLE candidate_tags (
  candidate_id  INTEGER NOT NULL REFERENCES candidates(candidate_id),
  tag_id        INTEGER NOT NULL REFERENCES tags(tag_id),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    TEXT NOT NULL DEFAULT 'system', -- system / manual
  UNIQUE(candidate_id, tag_id)
);
```

#### scrape_queue (new)

```sql
CREATE TABLE scrape_queue (
  queue_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type       TEXT NOT NULL, -- product_detail / shop_detail
  target_id         TEXT NOT NULL, -- fastmoss_id or fastmoss_shop_id
  priority          INTEGER NOT NULL DEFAULT 2, -- 0=skip, 1=low, 2=medium, 3=high
  status            TEXT NOT NULL DEFAULT 'pending', -- pending / in_progress / done / failed
  last_scraped_at   DATE,
  next_scrape_after DATE,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(target_type, target_id)
);
```

### Migration Strategy

Since this is pre-production (no live users), the migration approach is:

1. Create new schema from scratch
2. Write a one-time migration script to move existing `products` + `shopee_products` + `cost_data` + `candidates` data into the new schema
3. Old tables can be dropped after migration verification

---

## 9. Feedback Loop (Architecture Placeholder)

Not implemented in this phase, but the architecture supports it:

### How Feedback Flows

```
Notion (human judgment)
  ├── manual:selected    → This product was worth listing
  ├── manual:rejected    → This product was not worth it
  └── manual:tested      → Actual sales data available

Future: Actual Sales Data
  └── Which candidates actually sold well?

Feedback Analysis (future):
  → Which label combinations correlate with success?
  → Which scoring profile best predicts actual sales?
  → Auto-adjust scoring weights based on outcomes
```

### What's Already in Place

- `candidate_tags` with `manual` type labels — ready for human feedback
- `candidate_score_details` — can analyze which dimensions predicted success
- Multiple scoring profiles — can compare which strategy's scores best correlate with actual results

---

## 10. Configuration Files

### New/Modified Config Files

**config/scoring.yaml** (new)

Scoring profiles with dimensions and weights. See Section 5.

**config/search-strategies.yaml** (new)

```yaml
strategies:
  blue-ocean-beauty:
    name: "Blue Ocean - Beauty"
    region: th
    filters:
      category: "美妆个护"
      commissionRate: ">0.15"
      creatorConversionRate: ">0.3"
      totalSales: ">1000"
      creatorCount: "<50"
      shopType: "cross-border"

  high-margin-general:
    name: "High Margin - General"
    region: th
    filters:
      price: ">20"
      commissionRate: ">0.10"
      totalSales: ">500"
```

**config/signals.yaml** (new)

Signal label trigger rules. See Section 4.

**config/rules.yaml** (modified)

Add data freshness and quota settings:

```yaml
scraping:
  dailyDetailBudget: 300
  dailySearchBudget: 300
  freshness:
    detailRefreshDays: 7
    vocRefreshDays: 14
    shopRefreshDays: 7
```

---

## 11. Implementation Scope (This Phase)

### In Scope (This Phase)

- [ ] Database schema migration (4 → 12 tables)
- [ ] List layer scrapers (newProducts, hotlist, hotvideo)
- [ ] Search layer scraper with configurable strategies
- [ ] Product detail page scraper
- [ ] Shop flow scrapers (shop search, shop detail, shop products)
- [ ] Scrape queue with caching and quota management
- [ ] Tag system (discovery + strategy + signal labels)
- [ ] Multi-strategy scoring engine with YAML config
- [ ] Updated pipeline orchestration
- [ ] Notion sync updates (labels, multi-score display)
- [ ] Product enrichments table (migrate shopee + CJ data)

### Out of Scope (Future Phases)

- [ ] Knowledge base and community data mining (Xiaohongshu, Reddit)
- [ ] Feedback loop implementation (auto weight adjustment)
- [ ] Cross-source product matching (canonical_id)
- [ ] Scheduled execution (Phase 3)
- [ ] Multi-region parallel runs

---

## 12. End-to-End Pipeline Flow

```
Daily Run (future: scheduled, current: manual CLI)
│
├─ Phase A: Data Collection (pure scraping, no business filtering)
│  │
│  │  Product Flow:
│  │  ├─ A1. List Scan (4 lists × 1 country × up to 500 items)
│  │  │   saleslist / newProducts / hotlist / hotvideo
│  │  │   → products (new entries) + product_snapshots (daily data)
│  │  │
│  │  └─ A2. Strategy Search (M strategies × 1 country)
│  │      Per search-strategies.yaml filter configs
│  │      → products (new entries) + product_snapshots (search results)
│  │
│  │  Shop Flow:
│  │  └─ A3. Shop Scan (shop sales list / hot list / shop search)
│  │      → shops + shop_snapshots
│  │
│  │  All discovered products merged & deduplicated in products table.
│  │
│
├─ Phase B: Pre-filtering & Queue Building
│  │
│  │  B1. Basic filter (exclude banned categories, minimum sales threshold)
│  │  B2. Cache check (skip if detail scraped today or within 7 days)
│  │  B3. Budget check (remaining detail page quota for the day)
│  │  B4. Priority ranking:
│  │      P1: Never-scraped new discoveries
│  │      P2: Stale products (>7 days) that reappeared on lists
│  │      P3: Manually marked "track" products
│  │  B5. Shop copy: scrape target shop details → extract product lists
│  │      → new products enter queue as P1
│  │
│  │  → Output: scrape_queue (up to 300 items/day)
│  │
│
├─ Phase C: Deep Mining (consumes detail page quota)
│  │
│  │  C1. Product detail pages (from queue)
│  │      → product_details (heat, price, commission, creators,
│  │        videos, lives, VOC, channel split, similar products)
│  │
│  │  C2. External enrichment
│  │      → Shopee API: price + sales validation
│  │      → CJ API: cost + profit margin
│  │      → Google Trends: search trend status
│  │      → product_enrichments (unified multi-source table)
│  │
│  │  C3. Shop detail enrichment (for shop-copy strategy)
│  │      → shop details + shop_products associations
│  │
│
├─ Phase D: Post-filter + Labeling + Scoring
│  │
│  │  D1. Post-filter
│  │      - Price range filter
│  │      - Minimum profit margin
│  │      - Graceful degradation when data is missing
│  │
│  │  D2. Auto-labeling
│  │      - Discovery labels: where it was found
│  │      - Signal labels: per signals.yaml rules
│  │      - Strategy labels: based on which scoring profiles match
│  │      → candidate_tags
│  │
│  │  D3. Multi-strategy scoring
│  │      - Per scoring.yaml profiles (default/trending/blueOcean/
│  │        highMargin/shopCopy)
│  │      - Each dimension: raw value → normalize 0-100 → × weight
│  │      → candidates + candidate_score_details
│  │
│  │  Each candidate now has:
│  │  ├── Multiple scores (composite / trending / blue ocean /
│  │  │   high margin / shop copy)
│  │  ├── Multiple labels (discovery / strategy / signal)
│  │  └── Full score breakdown per dimension
│  │
│
├─ Phase E: Output
│  │
│  │  E1. Notion sync
│  │      - Product info + category + country
│  │      - All strategy scores
│  │      - Labels (as Multi-select property)
│  │      - Key signals (e.g. "sales growth +135%")
│  │      - Auto-generated recommendation summary
│  │      - Reserved fields: Image / Status / Notes (manual)
│  │
│  │  E2. CLI report
│  │      - Top N candidates, grouped by strategy
│  │
│
└─ Phase F: Human Decision (in Notion)
   │
   │  F1. Browse candidates
   │      - Filter by strategy / label / score
   │
   │  F2. Judge and label
   │      - manual:selected / manual:rejected / manual:watching
   │
   │  F3. Feedback loop (future)
   │      - Manual labels flow back to system
   │      - Analyze which label/strategy combos succeed
   │      - Auto-adjust scoring weights
```

### Current vs. New Pipeline Comparison

| Aspect | Current | New Design |
|--------|---------|-----------|
| Data sources | 1 list | 4 lists + search + shop flow |
| Product discovery | Passive (list ranking) | Passive + active (strategy search + shop copy) |
| Data depth | 7 fields from list table | List + detail page 30+ fields |
| Pre-filtering | Simple threshold | Threshold + cache check + quota management |
| Deep mining | None | Detail page + external APIs + shop details |
| Scoring | Fixed 5-dimension | 4 configurable strategy profiles |
| Labels | None | 4 label types, auto-applied |
| Output | Score + basic info | Multi-score + labels + signals + recommendation |
| Human decision | Score-only blind pick | Filter by strategy/label/signal, informed judgment |

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| FastMoss page structure changes | Scrapers break | DOM extraction functions are isolated; add integration tests with sample HTML |
| Daily quota exhaustion | Cannot scrape all candidates | Priority queue + caching ensures highest-value products are scraped first |
| Detail page data behind paywall | Some fields inaccessible on free/standard plan | Graceful degradation: score with available data, mark missing dimensions |
| Migration breaks existing pipeline | Current workflow stops working | Run migration on a copy first; keep old tables until verified |
| Over-engineering before validation | Wasted effort | Strategy configs are YAML-driven; can start with 1 strategy and add others incrementally |
