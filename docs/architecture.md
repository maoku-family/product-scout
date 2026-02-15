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
├── scripts/              # CLI entry points (scout.ts, status.ts, top.ts)
├── src/
│   ├── scrapers/
│   │   ├── shopee.ts     # Shopee API search (direct fetch)
│   │   └── fastmoss/     # FastMoss scraper suite (10 files)
│   │       ├── index.ts          # Re-exports all scrapers
│   │       ├── saleslist.ts      # Top-selling product rankings
│   │       ├── hotlist.ts        # Trending products
│   │       ├── hotvideo.ts       # Viral video products
│   │       ├── new-products.ts   # Recently listed products
│   │       ├── search.ts         # Strategy-driven search
│   │       ├── detail.ts         # Product detail page
│   │       ├── shop-detail.ts    # Shop detail + product list
│   │       ├── shop-list.ts      # Shop sales/hot rankings
│   │       └── shared.ts         # Login check, context launch, URL constants
│   ├── api/              # External API clients (CJ, Google Trends)
│   ├── core/             # Business logic
│   │   ├── pipeline.ts           # 5-phase orchestrator (A→E)
│   │   ├── filter.ts             # Two-stage filtering (pre + post)
│   │   ├── scorer.ts             # Multi-strategy scoring (5 profiles)
│   │   ├── tagger.ts             # Auto-tagging (discovery, signal, strategy)
│   │   ├── scrape-queue.ts       # Priority queue + quota management
│   │   ├── enrichment-converters.ts  # Shopee/CJ/Trends data normalization
│   │   └── sync.ts               # Notion sync
│   ├── schemas/          # Zod validation schemas
│   ├── db/               # SQLite schema (11 tables) + queries
│   ├── config/           # YAML config loader
│   ├── types/            # Type declarations (.d.ts)
│   └── utils/            # Logger, retry, number parser
├── config/               # YAML config files
│   ├── rules.yaml        # Filter thresholds, region overrides, scraping budget
│   ├── scoring.yaml      # 5 scoring profiles with dimension weights
│   ├── signals.yaml      # 8 signal rules for auto-tagging
│   ├── search-strategies.yaml  # Region-specific search strategies
│   ├── regions.yaml      # Supported regions and currencies
│   ├── categories.yaml   # Product categories with search keywords
│   └── secrets.yaml      # API keys (.gitignore)
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
  - Google Trends: returns `"stable"` on any error (5% weight, non-critical)
  - Notion sync: continues on individual page creation failure (logs error, processes remaining)
- FastMoss: throws on session expired (requires manual re-login, cannot degrade)
- Clear error logging before throwing

**Pipeline Design:**
- 5-phase pipeline (A→E) with clear separation of concerns
- Products are processed **sequentially** to respect rate limits on external APIs
- Pre-filter (Phase B) runs **before** deep mining to minimize unnecessary requests
- Post-filter (Phase D) runs **after** enrichment to filter on data that requires external lookups
- Pipeline is **idempotent**: `UNIQUE` constraints on products table prevent duplicate entries across runs
- Scrape queue with priority and daily budget controls deep mining volume

**Database:**
- WAL mode for better concurrent read performance
- Singleton pattern via `getDb()` / `resetDb()`
- 11 tables with normalized schema (see §6)

---

## 4. Module Responsibilities

### Scrapers

| Module | Description |
|--------|-------------|
| `scrapers/fastmoss/saleslist.ts` | Top-selling product rankings. DOM extraction via `page.evaluate()`. Parses Chinese number format (万/亿). |
| `scrapers/fastmoss/hotlist.ts` | Trending products by hot index. Extracts creator count, video views, likes, comments. |
| `scrapers/fastmoss/hotvideo.ts` | Products with viral videos. Shop name defaults to "unknown". |
| `scrapers/fastmoss/new-products.ts` | Products listed in last 3 days. Captures listing date and early sales metrics. |
| `scrapers/fastmoss/search.ts` | Strategy-driven search with configurable filters (commission, conversion, sales, creator count). |
| `scrapers/fastmoss/detail.ts` | Product detail page. Extracts hot index, price, VOC (positive/negative), channel distribution, similar product count. |
| `scrapers/fastmoss/shop-detail.ts` | Shop detail page + product list. Extracts shop metrics and per-product sales data. |
| `scrapers/fastmoss/shop-list.ts` | Shop sales/hot rankings. Two modes: sales list and hot list. |
| `scrapers/fastmoss/shared.ts` | Login status check, persistent Chrome context launch, URL constants, common utilities. |
| `scrapers/shopee.ts` | Searches Shopee via direct API fetch (no browser). Prices divided by 100 (Shopee uses cents). Returns `[]` on error. |

### APIs

| Module | Description |
|--------|-------------|
| `api/cj.ts` | Searches CJ product by keyword, calculates profit margin with $3 default shipping. Wrapped with `withRetry`. |
| `api/google-trends.ts` | Queries 90-day trends. Returns rising/stable/declining. Falls back to "stable" on any error. |

### Core

| Module | Description |
|--------|-------------|
| `core/pipeline.ts` | 5-phase orchestrator (A→E): collect → pre-filter/queue → deep mine → post-filter/score/tag → Notion sync. Supports `dryRun`, `skipScrape`, `strategyThreshold`, `shopDetailLimit`. |
| `core/filter.ts` | Two-stage pure functions. Pre-filter: minUnitsSold, minGrowthRate, excludedCategories. Post-filter: price range, profit margin. Skips checks when data is missing. |
| `core/scorer.ts` | Multi-strategy scoring with 5 profiles (default, trending, blueOcean, highMargin, shopCopy). Each profile defines weighted dimensions with specific normalization formulas (log scale, inverse, linear, sweet-spot). Stores per-dimension breakdown in `candidate_score_details`. |
| `core/tagger.ts` | Auto-tagging with 3 system tag types: discovery (source-based), signal (rule-based from signals.yaml), strategy (score-threshold-based). Tags stored in `tags` + `candidate_tags` tables. |
| `core/scrape-queue.ts` | Priority queue for deep mining. P1: never scraped, P2: stale + reappeared, P3: manually tracked. Enforces daily budget (default 300). Retry with 3-attempt limit. |
| `core/enrichment-converters.ts` | Normalizes external data into `product_enrichments` format. Shopee → price/sold/rating + metadata. CJ → cost price/margin + shipping details. |
| `core/sync.ts` | Creates Notion pages for unsynced candidates. Maps 5 strategy scores, labels (multi-select), and signals (rich text). Continues on individual failures. |

### Database

| Module | Description |
|--------|-------------|
| `db/schema.ts` | Initializes 11 tables (products, product_snapshots, product_details, product_enrichments, shops, shop_snapshots, candidates, candidate_score_details, tags, candidate_tags, scrape_queue) with WAL mode. |
| `db/queries.ts` | Insert + read + update queries for all tables. `INSERT OR IGNORE` for idempotency. Upsert functions for products, candidates, tags. `markSynced` for Notion tracking. |

### Config

| Module | Description |
|--------|-------------|
| `config/loader.ts` | Generic `loadConfig<T>(filePath, zodSchema)` — reads YAML, validates with Zod. |

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
- Use `bun run test` (vitest) not `bun test` (Bun native runner) — Bun's native runner does not isolate module mocks between files

### Mock Patterns

- **Module mocks** (`vi.mock()`): Used for Playwright, Notion client, and module-level function mocks. Avoid `vi.restoreAllMocks()` in `afterEach` — use `vi.clearAllMocks()` instead to prevent cross-file mock leakage.
- **Global mocks** (`globalThis.fetch = vi.fn()`): Used for fetch-based tests (Shopee, CJ). Assign once at module level, `mockReset()` in `beforeEach`.
- **DB tests**: Use `initDb(":memory:")` + `resetDb()` per test for clean state.

---

## 6. Data Schema

### SQLite Tables (11 tables)

```
products ─────────┬──→ product_snapshots (1:N, per scrape per source)
  ├── product_id  │     ├── source: saleslist|newProducts|hotlist|hotvideo|search|shop-detail
  ├── product_name│     ├── units_sold, sales_amount, growth_rate
  ├── shop_name   │     ├── commission_rate, creator_count
  ├── country     │     └── video_views, video_likes, video_comments
  ├── category    │
  └── subcategory ├──→ product_details (1:1, from detail page)
                  │     ├── hot_index, popularity_index, price_usd
                  │     ├── rating, review_count, creator_count
                  │     ├── channel_video_pct, channel_live_pct
                  │     ├── voc_positive, voc_negative (JSON arrays)
                  │     └── similar_product_count
                  │
                  ├──→ product_enrichments (1:N, per source)
                  │     ├── source: shopee|cj|google-trends
                  │     ├── price, sold_count, rating, profit_margin
                  │     └── extra (JSON: source-specific metadata)
                  │
                  └──→ candidates (1:1, scored)
                        ├── default_score, trending_score
                        ├── blue_ocean_score, high_margin_score, shop_copy_score
                        ├── synced_to_notion
                        ├──→ candidate_score_details (1:N, per profile per dimension)
                        └──→ candidate_tags (N:M via tags)

shops ──────────→ shop_snapshots (1:N, per scrape)
  ├── fastmoss_shop_id    ├── total_sales, total_revenue
  ├── shop_name           ├── active_products, creator_count
  ├── country             ├── rating, positive_rate, ship_rate_48h
  └── shop_type           └── national_rank, category_rank

tags ──────────→ candidate_tags (N:M junction)
  ├── tag_type: discovery|signal|strategy|manual
  └── tag_name

scrape_queue
  ├── target_type: product_detail
  ├── priority: 1(P3) | 2(P2) | 3(P1)
  ├── status: pending|done|failed
  └── retry_count (max 3)
```

Unique keys:
- `products`: `(product_name, shop_name, country)`
- `product_snapshots`: `(product_id, scraped_at, source)`
- `product_enrichments`: `(product_id, source, scraped_at)`
- `shops`: `(fastmoss_shop_id)`
- `tags`: `(tag_type, tag_name)`

Full SQL in `src/db/schema.ts`.

### Notion Database Fields

Synced from `candidates` joined with `products`:

| Field | Source | Type |
|-------|--------|------|
| Product Name | products.product_name | Title |
| Default Score | candidates.default_score | Number |
| Trending Score | candidates.trending_score | Number |
| Blue Ocean Score | candidates.blue_ocean_score | Number |
| High Margin Score | candidates.high_margin_score | Number |
| Shop Copy Score | candidates.shop_copy_score | Number |
| Labels | candidate_tags (tag_type != signal) | Multi-select |
| Signals | candidate_tags (tag_type = signal) | Rich text |
| Category | products.category | Select |
| Source | products.country | Select |
| Discovery Date | candidates.created_at | Date |
| **Image** | **Manual input** | Files |
| **Status** | **Manual input** | Select |
| **Notes** | **Manual input** | Text |

---

## 7. Configuration

Config files in `config/`:

| File | Purpose |
|------|---------|
| `rules.yaml` | Filter thresholds (pre/post), region overrides, scraping budget and freshness |
| `scoring.yaml` | 5 scoring profiles with dimension weights |
| `signals.yaml` | 8 signal rules for auto-tagging |
| `search-strategies.yaml` | Region-specific FastMoss search strategies |
| `regions.yaml` | Supported regions and currencies |
| `categories.yaml` | Product categories with search keywords |
| `secrets.yaml` | API keys (.gitignore) |

### Filter Merge Strategy

`getFiltersForRegion(rules, region)` deep-merges defaults with per-region overrides:
- Nested objects (`price`, `profitMargin`) — shallow-merged, unspecified fields preserved
- Scalars (`minUnitsSold`) — directly overridden
- Arrays (`excludedCategories`) — fully replaced (not appended)

### Scraping Budget

```yaml
scraping:
  dailyDetailBudget: 300    # Max product details per day
  dailySearchBudget: 300    # Max search results per day
  freshness:
    detailRefreshDays: 7    # Re-scrape product details
    vocRefreshDays: 14      # Re-scrape VOC data
    shopRefreshDays: 7      # Re-scrape shop data
```

### Supported Regions

| Code | Country | Currency | Enabled |
|------|---------|----------|---------|
| th | Thailand | THB | Yes |
| id | Indonesia | IDR | Yes |
| ph | Philippines | PHP | No |
| vn | Vietnam | VND | No |
| my | Malaysia | MYR | No |
