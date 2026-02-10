# Architecture

> Engineering standards and technical reference for the product selection automation project

---

## 1. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | TypeScript execution, package management |
| Language | TypeScript 5.x | Strict mode, `noUncheckedIndexedAccess` |
| Validation | Zod 4 | Runtime validation + type inference |
| Database | bun:sqlite | Bun native SQLite, zero deps, WAL mode |
| Web Scraping | Playwright | FastMoss scraping (persistent context with system Chrome) |
| HTTP Client | Native `fetch` | Shopee API, CJ API (no extra deps) |
| Config | yaml + Zod | YAML config files with schema validation |
| Testing | Vitest + better-sqlite3 | Unit tests (see Testing section for shim details) |
| CLI | Node.js `parseArgs` | CLI argument parsing (no external CLI library) |
| Git Hooks | simple-git-hooks + lint-staged | Pre-commit: ESLint fix; Pre-push: block direct push to main |

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
│   │   ├── fastmoss.ts   # FastMoss ranking scraper (persistent context + system Chrome + DOM extraction)
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
│       ├── parse-chinese-number.ts  # Chinese number format parser (万/亿)
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
- `withRetry` used on critical external calls:
  - CJ API: 3 retries, 1s base delay, linear backoff (1s, 2s, 3s)
  - FastMoss: 3 retries, 2s base delay, linear backoff (2s, 4s, 6s)
- Graceful degradation (no retry) for non-critical sources:
  - Shopee: returns `[]` on block/error (pipeline continues without price validation)
  - Google Trends: returns `"stable"` on any error (10% weight, non-critical)
  - Notion sync: continues on individual page creation failure (logs error, processes remaining)
- FastMoss: throws on session expired (requires manual re-login, cannot degrade)
- Clear error logging before throwing

**Pipeline Design:**
- Products are processed **sequentially** (not in parallel) to respect rate limits on external APIs
- Pre-filter runs **before** any external API calls to minimize unnecessary requests
- Post-filter runs **after** enrichment to filter on data that requires external lookups (price, margin)
- Pipeline is **idempotent**: `INSERT OR IGNORE` on products table prevents duplicate entries across runs

---

## 4. Module Responsibilities

### Scrapers

| Module | Method | Description |
|--------|--------|-------------|
| `fastmoss.ts` | Persistent context (`launchPersistentContext`) + `page.evaluate()` DOM extraction | Uses system Chrome via `channel: "chrome"` with a persistent profile (`~/.product-scout-chrome`) to preserve login sessions. Playwright manages Chrome lifecycle automatically — no manual launch needed. Uses `page.evaluate()` to extract data from Ant Design table DOM (`tr.ant-table-row`). Includes `transformRawRows()` pure function for testable data transformation. Parses Chinese number format (万/亿) via `parseChineseNumber` utility. |
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
| `config.ts` (schemas) | Defines all config schemas. Includes `getFiltersForRegion()` which deep-merges default rules with per-region overrides. Merge strategy: nested objects (price, profitMargin) are shallow-merged preserving unspecified fields; scalars are directly overridden; arrays (excludedCategories) are fully replaced. |

---

## 5. Testing Architecture

### bun:sqlite Test Shim

Vitest runs outside of Bun runtime, so `bun:sqlite` is not available. The project uses an **alias shim** to make tests work:

```
# vitest.config.ts
resolve.alias: [
  { find: "bun:sqlite", replacement: "./test/shims/bun-sqlite.ts" }
]
```

The shim wraps `better-sqlite3` (dev dependency) to match `bun:sqlite`'s API surface. This means:
- **Production** uses `bun:sqlite` (native, zero deps)
- **Tests** use `better-sqlite3` (compatible shim via Vitest alias)
- All DB code uses `db.prepare(sql).run(...params)` pattern (works in both)
- Avoid `db.run(sql)` — not available in better-sqlite3

### Test Structure

```
test/
├── unit/                    # Pure function tests (no external deps)
│   ├── schemas/             # Zod schema validation tests
│   ├── core/                # Filter, scorer, sync, pipeline tests
│   ├── scrapers/            # Scraper tests (mocked Playwright/fetch)
│   ├── api/                 # API client tests (mocked fetch)
│   ├── db/                  # Schema + query tests (in-memory SQLite)
│   ├── config/              # Config loader tests
│   └── utils/               # Utility function tests
├── integration/             # Tests with real file I/O
│   └── config/              # YAML loading with real files
├── fixtures/                # Test data files
│   ├── shopee/              # JSON fixtures
│   └── config/              # YAML fixtures
└── shims/
    └── bun-sqlite.ts        # better-sqlite3 → bun:sqlite shim
```

### Test Coverage: 172 tests across 18 files

| Module | Test Count | Key Patterns |
|--------|-----------|--------------|
| Schemas (5 files) | 50 | Valid/invalid inputs, boundary values, defaults |
| Core (4 files) | ~45 | Pure function testing, mock DB for pipeline |
| Scrapers (2 files) | ~20 | Mocked Playwright/fetch, edge cases |
| APIs (2 files) | ~15 | Mocked `globalThis.fetch`, error handling |
| DB (2 files) | ~15 | In-memory SQLite, schema init, CRUD operations |
| Config (2 files) | ~10 | Valid/invalid YAML, deep merge logic |
| Utils (1 file) | ~8 | Chinese number parsing (万/亿) |

---

## 6. Data Schema

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

## 7. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| FastMoss uses persistent context with system Chrome | FastMoss WAF (Tencent EdgeOne) blocks Playwright's bundled Chromium in headless mode. `launchPersistentContext({ channel: "chrome" })` uses the system Chrome browser, making scraping undetectable. Login sessions persist in `~/.product-scout-chrome` profile directory. CDP bridge (`connectOverCDP`) was initially planned but fails under Bun due to WebSocket incompatibility. |
| FastMoss uses DOM extraction via `page.evaluate()` | Page uses React + Ant Design components (`tr.ant-table-row.ant-table-row-level-0`). DOM API via `page.evaluate()` is more reliable than regex on dynamically-rendered HTML. Pure function `transformRawRows()` handles data transformation and is fully testable. |
| Chinese number parser for FastMoss data | FastMoss displays sales data in Chinese format ("2.28万" = 22,800, "7.63亿" = 763,000,000). Dedicated `parseChineseNumber()` utility handles 万/亿 suffixes, currency prefixes, and comma separators. |
| Shopee uses direct API fetch (not Playwright) | Shopee has a public search API endpoint. Direct fetch is faster, more reliable, and avoids browser overhead. |
| Google Trends falls back to "stable" on error | Trends is a supplementary signal (10% weight). Failing silently avoids blocking the entire pipeline for a non-critical data source. |
| CJ uses $3 USD default shipping estimate | Actual shipping varies by product and destination. $3 is a reasonable SEA average for lightweight dropship items. Can be refined per-region later. |
| Scorer uses log scale for Shopee sold count | Linear scale would make low-sales products score near zero. Log10 normalization (against 1000 threshold) provides a fairer distribution: 10 sales ~ 33, 100 sales ~ 67, 1000+ = 100. |
| Pipeline queries DB for product IDs after insert | Products are batch-inserted, then looked up by composite unique key (name + shop + country + date) to get auto-generated IDs for foreign key linking in shopee_products, cost_data, and candidates. |
| WAL mode for SQLite | Better concurrent read performance. Appropriate for a pipeline that writes once and reads from Notion sync. |
| `INSERT OR IGNORE` for products | Same product may appear across runs. Silently skipping duplicates keeps the pipeline idempotent. |
| Vitest + better-sqlite3 shim for testing | Vitest runs outside Bun runtime, so `bun:sqlite` is unavailable. Alias shim wraps better-sqlite3 to match the API surface. All DB code must use `db.prepare().run()` pattern (not `db.run()`). |
| Node.js `parseArgs` for CLI | No external CLI library needed. Bun supports Node.js `parseArgs` natively. Keeps dependency count low. |
| Sequential product processing in pipeline | Products are processed one-by-one (not in parallel) to respect rate limits on Shopee, Google Trends, and CJ APIs. Parallelism would risk IP blocks. |
| Config deep merge with array replacement | Region overrides merge nested objects (price, profitMargin) at field level but replace arrays entirely. This avoids merging `excludedCategories` lists which would make it impossible to remove a default exclusion at region level. |
| FastMoss uses persistent context for session management | Playwright's `launchPersistentContext()` with a dedicated profile directory (`~/.product-scout-chrome`) preserves cookies and login state across runs. First run requires manual login; subsequent runs reuse the session automatically. Session expiry detected by login page redirect. |
| Shopee prices divided by 100 | Shopee API returns prices in the smallest currency unit (cents). All internal representations use standard currency units (dollars/baht). |

---

## 8. Configuration System

### Config File Structure

```yaml
# config/rules.yaml — defaults + per-region overrides
defaults:
  price: { min: 10, max: 30 }       # USD
  profitMargin: { min: 0.3 }        # 30%
  minUnitsSold: 100
  minGrowthRate: 0
  excludedCategories: [adult products, weapons, drugs]
regions:
  th:
    price: { min: 5, max: 25 }      # overrides defaults.price
  id:
    price: { min: 3, max: 15 }
    minUnitsSold: 50                  # overrides defaults.minUnitsSold
```

### Config Loading Flow

```
scripts/scout.ts
  → loadConfig("config/rules.yaml", RulesConfigSchema)
  → getFiltersForRegion(rules, "th")
  → { price: {min:5, max:25}, profitMargin: {min:0.3}, minUnitsSold:100, ... }
```

### Supported Regions

| Code | Country | Currency | Enabled |
|------|---------|----------|---------|
| th | Thailand | THB | Yes |
| id | Indonesia | IDR | Yes |
| ph | Philippines | PHP | No |
| vn | Vietnam | VND | No |
| my | Malaysia | MYR | No |

---

## 9. Code Quality Checklist

- [x] All external data validated with Zod
- [x] Critical network requests have retry mechanism (CJ, FastMoss); others use graceful degradation
- [x] Errors have clear logs
- [x] Core logic has unit tests
- [x] TypeScript strict mode passes
- [x] Sensitive info not committed to Git
- [x] ESLint checks pass

---

## 10. References

- **Design Doc:** [docs/design.md](./design.md)
- **GitHub:** [maoku-family/product-scout](https://github.com/maoku-family/product-scout)
