# Architecture

> Engineering standards and technical reference for the product selection automation project

---

## 1. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | TypeScript execution, package management |
| Language | TypeScript 5.x | Strict mode |
| Validation | Zod | Runtime validation + type inference |
| Database | bun:sqlite | Bun native SQLite, zero deps, 3-6x faster |
| Web Scraping | Playwright | FastMoss scraping (persistent browser context) |
| Testing | Vitest | Unit tests |

---

## 2. Directory Structure

```
product-scout/
├── scripts/              # Executable scripts
│   ├── scout.ts          # Main flow: scrape → filter → sync
│   ├── status.ts         # Check run status
│   └── top.ts            # View top N candidates
│
├── src/                  # Source code
│   ├── scrapers/         # Data collection layer
│   │   ├── fastmoss.ts   # FastMoss ranking scraper (Playwright + regex HTML parser)
│   │   └── shopee.ts     # Shopee search (direct API fetch + JSON parser)
│   │
│   ├── api/              # External API layer
│   │   ├── cj.ts         # CJ Dropshipping REST client (Zod-validated responses)
│   │   └── google-trends.ts  # Google Trends wrapper (90-day window, fallback to "stable")
│   │
│   ├── core/             # Core business layer
│   │   ├── filter.ts     # Two-stage filter (pre-filter + post-filter, pure functions)
│   │   ├── scorer.ts     # 5-dimension scoring (sales, growth, shopee, margin, trends)
│   │   ├── sync.ts       # Notion sync (create pages for unsynced candidates)
│   │   └── pipeline.ts   # Pipeline orchestrator (10-step flow)
│   │
│   ├── schemas/          # Zod validation schemas
│   │   ├── product.ts    # FastMoss product schema
│   │   ├── shopee.ts     # Shopee product schema
│   │   ├── cost.ts       # CJ cost data schema
│   │   ├── candidate.ts  # Candidate schema
│   │   └── config.ts     # Region, category, rules, secrets schemas + filter merge
│   │
│   ├── db/               # Database layer
│   │   ├── schema.ts     # SQLite schema initialization (4 tables + WAL mode)
│   │   └── queries.ts    # Insert + read queries (products, shopee, cost, candidates)
│   │
│   ├── config/           # Configuration loading
│   │   └── loader.ts     # Generic YAML + Zod config loader
│   │
│   ├── types/            # Type declarations
│   │   └── google-trends-api.d.ts  # Type definitions for google-trends-api
│   │
│   └── utils/            # Utility functions
│       ├── logger.ts     # Structured logger
│       └── retry.ts      # withRetry wrapper with exponential backoff
│
├── config/
│   ├── regions.yaml      # Supported regions (TH, ID, PH, VN, MY)
│   ├── categories.yaml   # Product categories + search keywords
│   ├── rules.yaml        # Filtering rules (defaults + per-region overrides)
│   └── secrets.yaml      # API keys (.gitignore)
│
├── db/
│   └── product-scout.db  # SQLite (.gitignore)
│
├── docs/
│   ├── architecture.md   # This file
│   ├── design.md         # Product design document
│   ├── designs/          # Feature design docs
│   └── plans/            # Execution plans + progress
│
├── .claude/
│   └── rules/            # Claude rules
│
└── test/                 # Test files
```

---

## 3. Design Principles

**Layered Architecture:**
- `scripts/` calls modules in `src/`
- Dependency direction: scripts → core → schemas
- `scrapers/` and `api/` are parallel external interaction layers

**Data Validation:**
- All external data validated with Zod at entry point
- Types inferred from schemas, no manual maintenance
- Prevents dirty data from entering database

**Error Handling:**
- All network requests wrapped with `withRetry`
- Exponential backoff on failure
- Clear error logging before throwing
- Graceful degradation where appropriate (Shopee returns `[]`, Trends returns `"stable"`)

---

## 4. Module Responsibilities

### Scrapers

| Module | Method | Description |
|--------|--------|-------------|
| `fastmoss.ts` | Playwright + regex HTML parsing | Scrapes FastMoss ranking page using persistent browser context. Uses regex to extract table rows (no DOM available in Bun). Detects expired session by checking for login redirect. Validates each product with Zod before returning. |
| `shopee.ts` | Direct API fetch + Zod JSON parsing | Calls Shopee's public search API (`/api/v4/search/search_items`) directly via `fetch`. No Playwright needed — more reliable and faster. Parses Shopee's snake_case response into camelCase domain objects. Prices divided by 100 (Shopee uses cents). |

### APIs

| Module | Method | Description |
|--------|--------|-------------|
| `cj.ts` | REST POST + Zod validation | Searches CJ product list by keyword. Uses `$3 USD default shipping estimate` for SEA. Calculates profit margin as `(shopeePrice - cjPrice - shipping) / shopeePrice`. Wrapped with `withRetry`. |
| `google-trends.ts` | google-trends-api wrapper | Queries 90-day interest-over-time data. Compares latest value to average: >120% = rising, <80% = declining, else stable. **Falls back to "stable" on any error** (supplementary signal, not critical). |

### Core

| Module | Description |
|--------|-------------|
| `filter.ts` | Two-stage pure functions. **Pre-filter** (after scrape): minUnitsSold, minGrowthRate, excludedCategories. **Post-filter** (after enrichment): price range, profit margin. Only applies filters when data is present. |
| `scorer.ts` | 5 dimensions with weighted composite. Sales (30%), Growth (20%), Shopee (25%), Margin (15%), Trends (10%). Each dimension returns 0-100, composite is weighted sum rounded to 1 decimal. **Shopee uses log scale** for fairness (log10 normalization against 1000). |
| `sync.ts` | Creates Notion pages for unsynced candidates. Maps candidate + product data to Notion properties. Marks candidates as synced after successful creation. Continues on individual failures. |
| `pipeline.ts` | Orchestrates the 10-step flow. Manages DB lookups for foreign key linking. Coordinates all modules in sequence. Supports `dryRun` option to skip Notion sync. |

### Database

| Module | Description |
|--------|-------------|
| `schema.ts` | Initializes 4 tables with WAL mode + foreign keys. Singleton pattern with `getDb()` / `resetDb()`. |
| `queries.ts` | Insert functions for all 4 tables. Read queries: `getLatestProducts`, `getUnsyncedCandidates`, `getTopCandidates`. `markSynced` for Notion sync tracking. Uses `INSERT OR IGNORE` for duplicate safety. |

### Config

| Module | Description |
|--------|-------------|
| `loader.ts` | Generic `loadConfig<T>(filePath, zodSchema)` function. Reads YAML, parses, validates with Zod. Used for regions, categories, rules, secrets. |
| `config.ts` (schemas) | Defines all config schemas. Includes `getFiltersForRegion()` which deep-merges default rules with per-region overrides. |

---

## 5. Data Schema

### SQLite Tables

**products** — Raw FastMoss product data
```sql
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    shop_name TEXT NOT NULL,
    country TEXT NOT NULL,
    category TEXT,
    units_sold INTEGER,
    gmv REAL,
    order_growth_rate REAL,
    commission_rate REAL,
    scraped_at TEXT NOT NULL,
    UNIQUE(product_name, shop_name, country, scraped_at)
);
```

**shopee_products** — Shopee validation data (linked to products)
```sql
CREATE TABLE IF NOT EXISTS shopee_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    title TEXT,
    price REAL,
    sold_count INTEGER,
    rating REAL,
    shopee_url TEXT,
    updated_at TEXT
);
```

**cost_data** — CJ Dropshipping cost data (linked to products)
```sql
CREATE TABLE IF NOT EXISTS cost_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    cj_price REAL,
    shipping_cost REAL,
    profit_margin REAL,
    cj_url TEXT,
    updated_at TEXT
);
```

**candidates** — Scored and filtered results, synced to Notion (linked to products)
```sql
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    score REAL,
    trend_status TEXT,
    synced_to_notion INTEGER DEFAULT 0,
    created_at TEXT
);
```

### Data Flow

```
① FastMoss scrape → ② Store products → ③ Pre-filter →
④ Shopee validate → ⑤ Google Trends → ⑥ CJ cost →
⑦ Post-filter → ⑧ Score → ⑨ Store candidates → ⑩ Notion sync
```

### Notion Database Fields

Synced from `candidates` joined with `products`:

| Field | Source | Type |
|-------|--------|------|
| Product Name | products.product_name | Title |
| Total Score | candidates.score | Number |
| Trend | candidates.trend_status | Select |
| Category | products.category | Select |
| Source | products.country | Select |
| Discovery Date | candidates.created_at | Date |
| **Image** | **Manual input** | Files |
| **Status** | **Manual input** | Select |
| **Notes** | **Manual input** | Text |

---

## 6. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| FastMoss uses regex HTML parsing | Bun has no built-in DOM. Regex on `<tr class="product-row">` rows is sufficient for table data. Pure function `parseFastmossRanking()` is fully testable. |
| Shopee uses direct API fetch (not Playwright) | Shopee has a public search API endpoint. Direct fetch is faster, more reliable, and avoids browser overhead. |
| Google Trends falls back to "stable" on error | Trends is a supplementary signal (10% weight). Failing silently avoids blocking the entire pipeline for a non-critical data source. |
| CJ uses $3 USD default shipping estimate | Actual shipping varies by product and destination. $3 is a reasonable SEA average for lightweight dropship items. Can be refined per-region later. |
| Scorer uses log scale for Shopee sold count | Linear scale would make low-sales products score near zero. Log10 normalization (against 1000 threshold) provides a fairer distribution: 10 sales ≈ 33, 100 sales ≈ 67, 1000+ = 100. |
| Pipeline queries DB for product IDs after insert | Products are batch-inserted, then looked up by composite unique key (name + shop + country + date) to get auto-generated IDs for foreign key linking in shopee_products, cost_data, and candidates. |
| WAL mode for SQLite | Better concurrent read performance. Appropriate for a pipeline that writes once and reads from Notion sync. |
| `INSERT OR IGNORE` for products | Same product may appear across runs. Silently skipping duplicates keeps the pipeline idempotent. |

---

## 7. Code Quality Checklist

- [x] All external data validated with Zod
- [x] All network requests have retry mechanism
- [x] Errors have clear logs
- [x] Core logic has unit tests
- [x] TypeScript strict mode passes
- [x] Sensitive info not committed to Git
- [x] ESLint checks pass

---

## 8. References

- **Design Doc:** [docs/design.md](./design.md)
- **GitHub:** [maoku-family/product-scout](https://github.com/maoku-family/product-scout)
