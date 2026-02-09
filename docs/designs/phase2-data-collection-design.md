# Phase 2: Data Collection Design

> Product Scout's data collection strategy.
> Use proven sales data from FastMoss to find products that already sell, then validate with Shopee, Google Trends, and CJ cost data.

---

## 1. Overview

### Strategy

```
FastMoss proven sellers → Confirm profit → Ship it
```

### Data Flow

```
FastMoss Best-Selling Ranking (proven sellers)
  → Pre-filter (min sales, growth, excluded categories)
  → Shopee validation (real sales, price)
  → Google Trends (trend signal)
  → CJ cost lookup (profit margin)
  → Post-filter (price range, profit margin)
  → Score and rank
  → Push to Notion
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary data source | FastMoss (Playwright scraping) | Real TikTok Shop sales data, proven sellers |
| Data platform selection | FastMoss over Kalodata/EchoTik | No Cloudflare anti-bot, SSR with Next.js, scrapable with Playwright |
| Validation | Shopee (Playwright) | Cross-platform confirmation of real demand |
| Trend signal | Google Trends (retained) | Supplementary signal to detect rising vs declining products |
| Cost lookup | CJ Dropshipping API | Has API, includes cross-border shipping cost, zero-inventory model |
| Deduplication | product_name + shop_name + country + scraped_at | FastMoss data is product-level, simple unique constraint |
| Update strategy | Append (new record each day) | One table, keeps history, no complex relations |

---

## 2. Data Source Comparison

### Why FastMoss?

| Platform | Anti-Bot | API | SEA Coverage | Monthly Cost | Verdict |
|----------|----------|-----|-------------|-------------|---------|
| **FastMoss** | Weak (no Cloudflare) | ❌ | ✅ 19+ countries | ~$49-149 | ✅ **Selected** — scrapable with Playwright |
| Kalodata | **Strict (403 on homepage)** | ❌ | ✅ 6 countries | ~$59-199 | ❌ Anti-bot too aggressive |
| EchoTik | Unknown | ✅ API | ✅ All 5 SEA | ¥1,399/mo API | ❌ API too expensive |
| 出海匠 | Unknown | Enterprise only | ⚠️ US-focused | ¥199-466 | ❌ Wrong market focus |

> **Why Kalodata can't be scraped:** Kalodata uses Cloudflare, which detects Playwright via TLS fingerprinting (JA3/JA4) at the TCP handshake level — before the page even loads. This cannot be bypassed at the JavaScript layer. Workaround exists (fingerprint browsers like AdsPower) but adds cost and complexity. FastMoss has no Cloudflare, so Playwright works directly.

### FastMoss Data Available

Primary scraping target: `/e-commerce/saleslist` (Best-Selling Products)

| Field | Description | Value for Selection |
|-------|-------------|-------------------|
| Products | Product name | What's selling |
| Country/region | Country filter | Filter by SEA |
| Shop | Store name | Who's selling it |
| Categories | Product category | Category filter |
| Units Sold | Sales volume | ⭐ Core signal — proof it sells |
| GMV | Gross merchandise value | Market size |
| Order Growth Rate | Growth trend | ⭐ Rising or declining |
| Commission Rate | Affiliate commission | Affiliate opportunity |

### Login Requirement

FastMoss requires login to view data. Login uses **Playwright persistent context**:
1. First run: manually login in Playwright browser (phone SMS or WeChat)
2. Session saved to local directory (`db/browser-data/`)
3. Subsequent runs auto-load saved session — no login needed
4. Session expired → manually login again

No login credentials stored in `config/secrets.yaml`.

---

## 3. Region & Category Configuration

### Region Config

All regions configured via YAML — zero code changes to add a country.

```yaml
# config/regions.yaml
regions:
  th:
    name: Thailand
    currency: THB
    language: th
    enabled: true
  id:
    name: Indonesia
    currency: IDR
    language: id
    enabled: true
  # ph, vn, my...
```

### Category Config

```yaml
# config/categories.yaml
categories:
  beauty:
    name: "Beauty & Skincare"
    searchKeywords:
      - "skincare"
      - "makeup"
      - "serum"
      - "sunscreen"
      - "moisturizer"
  home:
    name: "Home & Living"
    searchKeywords:
      - "home gadget"
      - "organizer"
      - "kitchen tool"
      - "cleaning"
      - "home decor"
  sports:
    name: "Sports & Outdoor"
    searchKeywords:
      - "fitness"
      - "yoga mat"
      - "resistance band"
      - "sports bottle"
      - "outdoor gear"
```

**Design note:** Config schemas contain only generic business concepts. Platform-specific mappings (e.g. Shopee domain from region code, FastMoss category from category name) are handled inside each scraper/API module.

---

## 4. Database Design

### Tables

**`products` — Main table (append-only, one record per product per day)**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| product_name | TEXT NOT NULL | Product name |
| shop_name | TEXT NOT NULL | Shop name |
| country | TEXT NOT NULL | Country code (th/id/ph/vn/my) |
| category | TEXT | Category |
| units_sold | INTEGER | Units sold |
| gmv | REAL | GMV in USD |
| order_growth_rate | REAL | Order growth rate |
| commission_rate | REAL | Commission rate |
| scraped_at | TEXT NOT NULL | Scrape date (YYYY-MM-DD) |

Unique constraint: `product_name + shop_name + country + scraped_at`

Same product appearing on multiple days = multiple records. Scoring uses the latest `scraped_at` record.

**`shopee_products` — Validation table**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| product_id | INTEGER FK | References products.id |
| title | TEXT | Shopee product title |
| price | REAL | Price in local currency |
| sold_count | INTEGER | Shopee sales count |
| rating | REAL | Rating (0-5) |
| shopee_url | TEXT | Product URL |
| updated_at | TEXT | Last updated |

**`cost_data` — Cost table**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| product_id | INTEGER FK | References products.id |
| cj_price | REAL | CJ purchase price (USD) |
| shipping_cost | REAL | Shipping to target country (USD) |
| profit_margin | REAL | Calculated profit margin |
| cj_url | TEXT | CJ product URL |
| updated_at | TEXT | Last updated |

**`candidates` — Output table**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| product_id | INTEGER FK | References products.id |
| score | REAL | Composite score (0-100) |
| trend_status | TEXT | rising/stable/declining |
| synced_to_notion | INTEGER | 0 or 1 |
| created_at | TEXT | Created time |

### Relationships

```
products (1) ← (1) shopee_products     (by product_id, latest record)
products (1) ← (1) cost_data           (by product_id, latest record)
products (1) ← (1) candidates          (by product_id, latest record)
```

### Insert Logic

```
Every scrape run:
  → Always INSERT new records (one per product per day)
  → Unique constraint prevents duplicates within the same day
  → Scoring queries use: WHERE scraped_at = (SELECT MAX(scraped_at) FROM products)
```

---

## 5. Scoring System

| Dimension | Weight | Source | Calculation |
|-----------|--------|--------|-------------|
| FastMoss Sales | 30% | products.units_sold | Normalized ranking |
| Order Growth Rate | 20% | products.order_growth_rate | Higher growth = higher score, negative = penalty |
| Shopee Validation | 25% | shopee_products.sold_count | Has sales = 100, none = 0; more sales = higher |
| Profit Margin | 15% | cost_data.profit_margin | profit_margin × 100 |
| Google Trends | 10% | Google Trends API | rising=100, stable=50, declining=0 |

---

## 6. Processing Pipeline

### End-to-End Flow

```
① Scrape       → Playwright login FastMoss, scrape ranking by region + category
② Store        → INSERT into products table (append-only, one record per day)
③ Pre-filter   → Rule filtering (min sales, growth > 0, excluded categories)
④ Shopee       → Search product name on Shopee, validate sales and price
⑤ Trends       → Google Trends query for trend status
⑥ Cost         → CJ API lookup: purchase price + shipping cost → profit margin
⑦ Post-filter  → Rule filtering (price range, profit margin)
⑧ Score        → Weighted composite score (latest data)
⑨ Store        → Write to candidates table
⑩ Sync         → Push to Notion
```

### Two-Stage Filtering

Filter is split into two stages because some data is only available after external lookups:

**Pre-filter (③ — after FastMoss scrape, before external requests):**
- `minUnitsSold` — minimum sales on FastMoss
- `minGrowthRate` — must be growing (not declining)
- `excludedCategories` — blocked categories

Purpose: Reduce external request volume. ~300 raw → ~100 after pre-filter.

**Post-filter (⑦ — after Shopee + CJ data available):**
- `price` (min/max) — requires Shopee price data
- `profitMargin` (min) — requires CJ cost data

Purpose: Ensure final candidates meet price and margin thresholds.

### Filtering Rules

```yaml
# config/rules.yaml
defaults:
  price:
    min: 10          # USD
    max: 30
  profitMargin:
    min: 0.3         # 30%
  minUnitsSold: 100  # Minimum sales on FastMoss
  minGrowthRate: 0   # Must be growing (not declining)
  excludedCategories:
    - adult products
    - weapons
    - drugs

# Per-region overrides (optional, deep-merged with defaults)
regions:
  th:
    price:
      min: 5
      max: 25
  id:
    price:
      min: 3
      max: 15
    minUnitsSold: 50
```

Region is determined by CLI `--region` parameter, not in rules config. Each region can override any default filter value. Unspecified fields fall back to defaults.

### Daily Volume Estimate

```
FastMoss ranking: ~50-100 products per region + category
  × 3 categories (beauty, home, sports)
  × 2 regions (starting)
= ~300-600 raw records/day
  → After pre-filter: ~100-200 candidates
  → Shopee validation: ~100-200 requests (1s interval, ~3 min)
  → CJ queries: ~100-200 requests
  → After post-filter: ~50-100 candidates
  → Final to Notion: ~20-50 candidates
```

---

## 7. Module Design

### File Structure

```
src/
  scrapers/
    fastmoss.ts      # Playwright login + scrape ranking
    shopee.ts         # Playwright search validation
  api/
    google-trends.ts  # Trend signal
    cj.ts             # Cost + shipping lookup
  core/
    filter.ts         # Rule-based filtering
    scorer.ts         # Weighted scoring
    sync.ts           # Notion sync
  schemas/
    product.ts        # FastMoss product schema (Zod)
    shopee.ts         # Shopee product schema (Zod)
    config.ts         # Region/category/rules validation
  db/
    schema.ts         # SQLite table creation
    queries.ts        # Insert + query logic
  utils/
    logger.ts         # Logging
    retry.ts          # Retry wrapper
```

---

## 8. Error Handling

- All external calls (FastMoss, Shopee, Google Trends, CJ) wrapped with `withRetry`
- Exponential backoff on failure
- Errors logged before throwing — never swallowed silently
- FastMoss login failure → abort run, alert
- Shopee blocked → log and skip product, don't crash
- Each run records status to database (success/failure/count)

---

## 9. Cost Estimate

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| FastMoss membership | ~$49-149 | Required for data access |
| Shopee proxy (optional) | ~$0-20 | May not need initially |
| Google Trends | Free | npm package |
| CJ API | Free | Official API |
| **Total** | **~$49-169** | Start with cheapest FastMoss plan |

---

## 10. Open Questions

- [x] Categories to focus on → Beauty, Home & Living, Sports & Outdoor
- [ ] FastMoss exact plan pricing (need to check current tiers)
- [ ] FastMoss login anti-bot during Playwright automation (test during dev)
- [ ] Shopee anti-scraping tolerance (test during dev)
- [ ] CJ API SEA shipping coverage (verify during registration)
- [ ] FastMoss category filter values (map to our categories during dev)
