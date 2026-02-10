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
├── scripts/              # CLI entry points
├── src/
│   ├── scrapers/         # Data collection (FastMoss, Shopee)
│   ├── api/              # External API clients (CJ, Google Trends)
│   ├── core/             # Business logic (filter, scorer, sync, pipeline)
│   ├── schemas/          # Zod validation schemas
│   ├── db/               # SQLite schema + queries
│   ├── config/           # YAML config loader
│   ├── types/            # Type declarations (.d.ts)
│   └── utils/            # Logger, retry, number parser
├── config/               # YAML config files (rules, regions, categories, secrets)
├── db/                   # SQLite database (.gitignore)
├── docs/                 # Design docs, plans, architecture
└── test/
    ├── unit/             # Pure function tests (mocked deps)
    ├── integration/      # Tests with real file I/O
    ├── fixtures/         # Test data (JSON, YAML)
    └── shims/            # bun:sqlite → better-sqlite3 shim
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
- Foreign key linking: products are batch-inserted, then looked up by composite unique key (name + shop + country + date) to get auto-generated IDs

**Database:**
- WAL mode for better concurrent read performance
- Singleton pattern via `getDb()` / `resetDb()`

---

## 4. Module Responsibilities

### Scrapers

| Module | Description |
|--------|-------------|
| `fastmoss.ts` | Scrapes FastMoss ranking via Playwright persistent context + system Chrome. DOM extraction via `page.evaluate()`. Parses Chinese number format (万/亿). Session preserved in `~/.product-scout-chrome`. |
| `shopee.ts` | Searches Shopee via direct API fetch (no browser). Prices divided by 100 (Shopee uses cents). Returns `[]` on error. |

### APIs

| Module | Description |
|--------|-------------|
| `cj.ts` | Searches CJ product by keyword, calculates profit margin with $3 default shipping. Wrapped with `withRetry`. |
| `google-trends.ts` | Queries 90-day trends. Returns rising/stable/declining. Falls back to "stable" on any error. |

### Core

| Module | Description |
|--------|-------------|
| `filter.ts` | Two-stage pure functions. Pre-filter: minUnitsSold, minGrowthRate, excludedCategories. Post-filter: price range, profit margin. Skips checks when data is missing. |
| `scorer.ts` | 5-dimension weighted composite (sales 30%, growth 20%, shopee 25%, margin 15%, trends 10%). Shopee uses log10 scale. |
| `sync.ts` | Creates Notion pages for unsynced candidates. Continues on individual failures. |
| `pipeline.ts` | Orchestrates the 10-step flow. Supports `dryRun` to skip Notion sync. |

### Database

| Module | Description |
|--------|-------------|
| `schema.ts` | Initializes 4 tables (products, shopee_products, cost_data, candidates) with WAL mode. |
| `queries.ts` | Insert + read queries for all tables. `INSERT OR IGNORE` for idempotency. `markSynced` for Notion tracking. |

### Config

| Module | Description |
|--------|-------------|
| `loader.ts` | Generic `loadConfig<T>(filePath, zodSchema)` — reads YAML, validates with Zod. |
| `config.ts` | Config schemas + `getFiltersForRegion()` deep-merge. Nested objects shallow-merged, arrays replaced entirely. |

---

## 5. Testing

### bun:sqlite Shim

Vitest runs outside Bun runtime, so `bun:sqlite` is unavailable. A Vitest alias shim wraps `better-sqlite3` to match the API:

- **Production** uses `bun:sqlite` (native, zero deps)
- **Tests** use `better-sqlite3` (compatible shim)
- All DB code must use `db.prepare(sql).run()` pattern — `db.run(sql)` is not available in better-sqlite3

### Conventions

- Unit tests mock all external deps (Playwright, fetch, DB)
- Integration tests use real file I/O (YAML loading)
- Test fixtures in `test/fixtures/` (shopee JSON, config YAML)

---

## 6. Data Schema

### SQLite Tables

```
products (core)          1:1    shopee_products (Shopee validation)
  ├── product_name (UK)  ────→   product_id (FK)
  ├── shop_name (UK)             price, sold_count, rating
  ├── country (UK)
  ├── scraped_at (UK)    1:1    cost_data (CJ cost)
  ├── category           ────→   product_id (FK)
  ├── units_sold                 cj_price, shipping_cost, profit_margin
  ├── gmv
  ├── order_growth_rate  1:1    candidates (scored results)
  └── commission_rate    ────→   product_id (FK)
                                 score, trend_status, synced_to_notion
```

UK = composite unique key `(product_name, shop_name, country, scraped_at)`.
Full SQL in `src/db/schema.ts`.

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

## 7. Configuration

Config files in `config/`: `rules.yaml` (filtering rules), `regions.yaml`, `categories.yaml`, `secrets.yaml` (.gitignore).

### Merge Strategy

`getFiltersForRegion(rules, region)` deep-merges defaults with per-region overrides:
- Nested objects (`price`, `profitMargin`) — shallow-merged, unspecified fields preserved
- Scalars (`minUnitsSold`) — directly overridden
- Arrays (`excludedCategories`) — fully replaced (not appended)

### Supported Regions

| Code | Country | Currency | Enabled |
|------|---------|----------|---------|
| th | Thailand | THB | Yes |
| id | Indonesia | IDR | Yes |
| ph | Philippines | PHP | No |
| vn | Vietnam | VND | No |
| my | Malaysia | MYR | No |
