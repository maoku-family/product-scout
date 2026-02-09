# Phase 2: Data Collection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full data collection pipeline: FastMoss scraping → rule filtering → Shopee validation → Google Trends → CJ cost → scoring → Notion sync.

**Architecture:** Layered approach — Zod schemas validate all external data at entry points, `bun:sqlite` stores data in 4 tables (products, shopee_products, cost_data, candidates), scrapers use Playwright with rate limiting, core logic (filter/scorer) is pure functions. Pipeline orchestrator ties it all together.

**Tech Stack:** Bun + TypeScript (strict), Zod v4, bun:sqlite, Playwright, Vitest, @notionhq/client, google-trends-api

**Design Doc:** `docs/plans/2026-02-08-phase2-data-collection-design.md`

---

## Context

Phase 1 (project init) is complete. We have: logger, retry utils, ESLint strict config, git hooks, Zod + YAML deps. Phase 2 implements the entire data collection pipeline from scratch — from FastMoss scraping to Notion output. The design doc specifies FastMoss as primary data source (replaces original Apify/TikTok approach).

**What exists now:**
- `src/utils/logger.ts` — info/warn/error/debug logging
- `src/utils/retry.ts` — `withRetry()` with exponential backoff
- `config/rules.yaml` — basic filtering rules
- `config/secrets.yaml.example` — API key template
- Vitest installed but no config file, no tests

**Branch:** Create `feat/phase2-data-collection` from `main`

---

## Group 0: Setup

### Task 0.1: Create Vitest config

**Files:**
- Create: `vitest.config.ts`

**Step 1:** Create vitest config with `@/*` path alias resolution (matching tsconfig)

**Step 2:** Run `bun run test` — should report "no tests found" (not crash)

**Step 3:** Commit: `chore: add vitest configuration`

---

### Task 0.2: Install new dependencies

**Step 1:** Install:
```bash
bun add playwright @notionhq/client google-trends-api
```

**Step 2:** Run `bun run lint:check` — should pass

**Step 3:** Commit: `chore: add playwright, notion-client, and google-trends-api dependencies`

---

## Group 1: Config Schemas + Loader

### Task 1.1: Region and category config schemas

**Files:**
- Test: `test/unit/schemas/config.test.ts`
- Create: `src/schemas/config.ts`

**Step 1: Write failing tests**

Test cases:
- Valid region config parses (name, currency, shopeeDomain, language, enabled)
- Missing required field rejects
- `enabled` defaults to `true`
- Valid category config parses (name, fastmossCategory, shopeeKeywords)
- Empty `shopeeKeywords` array rejects (min 1)

**Step 2:** Run `bun run test test/unit/schemas/config.test.ts` — verify FAIL

**Step 3: Implement schemas**

```typescript
// src/schemas/config.ts
import { z } from "zod";

const RegionSchema = z.object({
  name: z.string(),
  currency: z.string(),
  shopeeDomain: z.string(),
  language: z.string(),
  enabled: z.boolean().default(true),
});

const RegionsConfigSchema = z.object({
  regions: z.record(z.string(), RegionSchema),
});

const CategorySchema = z.object({
  name: z.string(),
  fastmossCategory: z.string(),
  shopeeKeywords: z.array(z.string()).min(1),
});

const CategoriesConfigSchema = z.object({
  categories: z.record(z.string(), CategorySchema),
});
```

**Step 4:** Run tests — verify PASS

**Step 5:** Commit: `feat: add region and category config schemas`

---

### Task 1.2: Rules and secrets config schemas

**Files:**
- Test: `test/unit/schemas/config.test.ts` (append)
- Modify: `src/schemas/config.ts`

**Step 1: Write failing tests**

Test cases:
- Valid rules config parses
- `price.min > price.max` rejects (refine)
- `minUnitsSold` defaults to 100
- `minGrowthRate` defaults to 0
- Valid secrets config parses (fastmossEmail, fastmossPassword, cjApiKey, notionKey, notionDbId)
- Missing `fastmossEmail` rejects

**Step 2:** Run tests — verify FAIL

**Step 3: Implement**

```typescript
const RulesConfigSchema = z.object({
  region: z.string(),
  filters: z.object({
    price: z.object({ min: z.number(), max: z.number() }),
    profitMargin: z.object({ min: z.number() }),
    minUnitsSold: z.number().default(100),
    minGrowthRate: z.number().default(0),
    excludedCategories: z.array(z.string()),
  }),
}).refine(d => d.filters.price.min <= d.filters.price.max, {
  message: "price.min must be <= price.max",
});

const SecretsConfigSchema = z.object({
  fastmossEmail: z.string(),
  fastmossPassword: z.string(),
  cjApiKey: z.string(),
  notionKey: z.string(),
  notionDbId: z.string(),
});
```

**Step 4:** Run tests — verify PASS

**Step 5:** Commit: `feat: add rules and secrets config schemas`

---

### Task 1.3: YAML config loader

**Files:**
- Test: `test/unit/config/loader.test.ts`
- Create: `src/config/loader.ts`
- Create: `test/fixtures/config/valid-regions.yaml`
- Create: `test/fixtures/config/invalid-regions.yaml`

**Step 1: Write failing tests**

Test cases:
- Load and validate valid YAML fixture
- Throw on invalid YAML content
- Throw on missing file

**Step 2:** Run tests — verify FAIL

**Step 3: Implement**

```typescript
// src/config/loader.ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { z } from "zod";

export function loadConfig<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(filePath, "utf-8");
  const parsed: unknown = parse(raw);
  return schema.parse(parsed);
}
```

**Step 4:** Run tests — verify PASS

**Step 5:** Commit: `feat: add yaml config loader with zod validation`

---

### Task 1.4: Create actual config files

**Files:**
- Create: `config/regions.yaml`
- Create: `config/categories.yaml`
- Modify: `config/rules.yaml` — add `min_units_sold`, `min_growth_rate`
- Modify: `config/secrets.yaml.example` — add fastmoss credentials, remove `apify_key`

**Step 1:** Create config files matching schema (see design doc Section 3)

**Step 2:** Write integration test: loader can parse each real config file

**Step 3:** Run tests — verify PASS

**Step 4:** Commit: `feat: add region and category config files`

---

## Group 2: Product Schemas (Zod)

### Task 2.1: FastMoss product schema

**Files:**
- Test: `test/unit/schemas/product.test.ts`
- Create: `src/schemas/product.ts`

**Test cases:**
- Valid product parses
- Missing `productName` rejects
- Negative `unitsSold` rejects
- `orderGrowthRate` accepts negative values
- `scrapedAt` validates YYYY-MM-DD format

**Schema shape:** productName, shopName, country, category (nullable), unitsSold (>=0), gmv (>=0), orderGrowthRate (any number), commissionRate (0-1), scrapedAt (YYYY-MM-DD string)

**Commit:** `feat: add fastmoss product zod schema`

---

### Task 2.2: Shopee, cost, and candidate schemas

**Files:**
- Test: `test/unit/schemas/shopee.test.ts`
- Create: `src/schemas/shopee.ts`
- Test: `test/unit/schemas/cost.test.ts`
- Create: `src/schemas/cost.ts`
- Test: `test/unit/schemas/candidate.test.ts`
- Create: `src/schemas/candidate.ts`

**Shopee schema:** productId, title, price, soldCount, rating (0-5), shopeeUrl, updatedAt

**Cost schema:** productId, cjPrice (>=0), shippingCost (>=0), profitMargin (any), cjUrl, updatedAt

**Candidate schema:** productId, score (0-100), trendStatus (rising|stable|declining), syncedToNotion (default false), createdAt

**Commit:** `feat: add shopee, cost, and candidate zod schemas`

---

## Group 3: Database

### Task 3.1: SQLite schema initialization

**Files:**
- Test: `test/unit/db/schema.test.ts`
- Create: `src/db/schema.ts`

**Test cases (use `:memory:` DB):**
- `initDb()` creates 4 tables (products, shopee_products, cost_data, candidates)
- Tables have correct columns (query `sqlite_master` + `pragma table_info`)
- Unique constraint on products (product_name + shop_name + country + scraped_at)
- Foreign keys exist on shopee_products, cost_data, candidates
- Calling `initDb()` twice is idempotent (CREATE TABLE IF NOT EXISTS)
- `getDb()` returns singleton instance

**Implementation:** Use `bun:sqlite`. Enable WAL mode + foreign keys. DDL matches design doc Section 4.

**Commit:** `feat: add sqlite schema initialization`

---

### Task 3.2: Insert queries

**Files:**
- Test: `test/unit/db/queries.test.ts`
- Create: `src/db/queries.ts`

**Test cases:**
- `insertProducts(db, products)` inserts batch, returns count
- Duplicate (name + shop + country + date) silently skips (INSERT OR IGNORE)
- `insertShopeeProduct(db, productId, data)` links to product
- `insertCostData(db, productId, data)` links to product
- `insertCandidate(db, productId, data)` inserts/replaces candidate

**Commit:** `feat: add database insert queries`

---

### Task 3.3: Read queries

**Files:**
- Test: `test/unit/db/queries.test.ts` (append)
- Modify: `src/db/queries.ts`

**Test cases:**
- `getLatestProducts(db, region)` returns only latest `scraped_at` records
- `getUnsyncedCandidates(db)` returns `synced_to_notion = 0`
- `getTopCandidates(db, limit)` returns top N by score descending
- `markSynced(db, candidateId)` sets `synced_to_notion = 1`

**Commit:** `feat: add database read queries`

---

## Group 4: Core — Filter

### Task 4.1: Rule-based product filter

**Files:**
- Test: `test/unit/core/filter.test.ts`
- Create: `src/core/filter.ts`

**Test cases:**
- Product meeting all rules passes
- Below `minUnitsSold` filtered out
- Negative growth rate filtered (when `minGrowthRate = 0`)
- Excluded category filtered out
- Empty input returns empty output
- Price below min or above max filtered (when Shopee data available)
- Products without Shopee price data pass through (not filtered by price)

**Implementation:** Pure function. `filterProducts(products, rules): Product[]`

**Commit:** `feat: add rule-based product filter`

---

## Group 5: Core — Scorer

### Task 5.1: Dimension scoring functions

**Files:**
- Test: `test/unit/core/scorer.test.ts`
- Create: `src/core/scorer.ts`

**Test cases:**
- `scoreSales(unitsSold, maxUnits)` — normalized 0-100
- `scoreGrowth(rate)` — positive = high, negative = penalty (clamped to 0)
- `scoreShopee(soldCount)` — has sales = proportional score, none = 0
- `scoreMargin(margin)` — margin * 100, capped at 100
- `scoreTrend(status)` — rising=100, stable=50, declining=0

**Commit:** `feat: add dimension scoring functions`

---

### Task 5.2: Weighted composite scorer

**Files:**
- Test: `test/unit/core/scorer.test.ts` (append)
- Modify: `src/core/scorer.ts`

**Test cases:**
- Weights: sales=0.30, growth=0.20, shopee=0.25, margin=0.15, trends=0.10 (sum = 1.0)
- Perfect data scores 100
- Zero data scores 0
- Result rounds to 1 decimal

**Implementation:** `computeScore(data): number`

**Commit:** `feat: add weighted composite scorer`

---

## Group 6: Scraper — FastMoss

### Task 6.1: FastMoss HTML parser

**Files:**
- Test: `test/unit/scrapers/fastmoss.test.ts`
- Create: `src/scrapers/fastmoss.ts`
- Create: `test/fixtures/fastmoss/ranking-page.html` (sample HTML)

**Test cases:**
- Parse HTML rows → array of `FastmossProduct`
- Handles missing optional fields (category = null)
- Validates each product with Zod schema
- Empty page returns empty array

**Note:** Pure parsing function — fully testable without Playwright.

**Commit:** `feat: add fastmoss html parser`

---

### Task 6.2: FastMoss Playwright scraper

**Files:**
- Test: `test/unit/scrapers/fastmoss.test.ts` (append)
- Modify: `src/scrapers/fastmoss.ts`
- Create: `test/mocks/playwright.ts` (mock Browser/Page factory)

**Test cases (mocked Playwright):**
- Login: navigates to login URL, fills email + password, clicks submit
- Applies region + category filters via URL params
- Calls parser on page content
- Respects >= 1s delay between page navigations
- Wraps navigation with `withRetry`
- Auto-throttle on 429 (increase delay to 5s)

**Commit:** `feat: add fastmoss playwright scraper`

---

## Group 7: Scraper — Shopee

### Task 7.1: Shopee search parser

**Files:**
- Test: `test/unit/scrapers/shopee.test.ts`
- Create: `src/scrapers/shopee.ts`
- Create: `test/fixtures/shopee/search-results.html`

**Test cases:**
- Parse search HTML → `ShopeeProduct[]`
- No results returns empty array
- Validates with Zod schema

**Commit:** `feat: add shopee search result parser`

---

### Task 7.2: Shopee Playwright scraper

**Files:**
- Test: `test/unit/scrapers/shopee.test.ts` (append)
- Modify: `src/scrapers/shopee.ts`

**Test cases (mocked Playwright):**
- Constructs correct URL: `https://{shopeeDomain}/search?keyword={query}`
- Respects 1s delay
- Returns top N results
- On block/captcha: logs warning, returns empty (graceful degradation)
- Wraps with `withRetry`

**Commit:** `feat: add shopee playwright scraper`

---

## Group 8: API — Google Trends

### Task 8.1: Google Trends wrapper

**Files:**
- Test: `test/unit/api/google-trends.test.ts`
- Create: `src/api/google-trends.ts`

**Test cases (mock `google-trends-api`):**
- `getTrendStatus(keyword, geo)` returns `rising | stable | declining`
- Rising: latest interest > average * 1.2
- Declining: latest interest < average * 0.8
- API error → returns `stable` as fallback (logged)
- Wraps with `withRetry`

**Commit:** `feat: add google trends api wrapper`

---

## Group 9: API — CJ Dropshipping

### Task 9.1: CJ API response schema + client

**Files:**
- Test: `test/unit/api/cj.test.ts`
- Create: `src/api/cj.ts`

**Test cases (mock `fetch`):**
- Valid CJ response parses (Zod validation)
- `searchCjProduct(keyword, country)` returns cost data
- Calculates profit margin: `(shopeePrice - cjPrice - shippingCost) / shopeePrice`
- API error logs + throws
- Wraps with `withRetry`

**Commit:** `feat: add cj dropshipping api client`

---

## Group 10: Core — Notion Sync

### Task 10.1: Notion page mapper + sync

**Files:**
- Test: `test/unit/core/sync.test.ts`
- Create: `src/core/sync.ts`

**Test cases (mock `@notionhq/client`):**
- `mapToNotionPage(candidate)` maps all required fields
- `syncToNotion(db, client)` creates pages for unsynced candidates
- Marks candidates as synced after success
- Handles partial failure (some succeed, some fail — logs failures)
- Reports sync count
- Wraps with `withRetry`

**Commit:** `feat: add notion sync module`

---

## Group 11: Pipeline + Scripts

### Task 11.1: Pipeline orchestrator

**Files:**
- Test: `test/unit/core/pipeline.test.ts`
- Create: `src/core/pipeline.ts`

**Test cases (mock all scrapers + APIs):**
- Runs in correct order: scrape → filter → shopee validate → trends → CJ cost → score → store → sync
- Scraper failure logs error, continues with partial data
- Returns summary: { scraped, filtered, scored, synced }

**Commit:** `feat: add pipeline orchestrator`

---

### Task 11.2: CLI scripts

**Files:**
- Create: `scripts/scout.ts` — `--region`, `--category`, `--dry-run`
- Create: `scripts/status.ts` — last scrape, counts by region, unsynced count
- Create: `scripts/top.ts` — `--limit N`, table output

**Test:** Manual execution with `--dry-run`

**Commit:** `feat: add scout, status, and top cli scripts`

---

## Group 12: Documentation

### Task 12.1: Update docs

- Modify: `docs/architecture.md` — replace TikTok/Apify model with FastMoss
- Modify: `docs/design.md` — mark Phase 2 items complete
- Sync both to Notion

**Commit:** `docs: update architecture and design for phase 2`

---

## Dependency Graph

```
Group 0 (Setup)
  └─► Group 1 (Config Schemas + Loader)
        ├─► Group 4 (Filter)
        └─► Groups 6, 7 (Scrapers — need config for regions/categories)

Group 0 (Setup)
  └─► Group 2 (Product Schemas)
        ├─► Groups 6, 7 (Scrapers — validate output with schemas)
        └─► Group 9 (CJ API — cost schema)

Group 0 (Setup)
  └─► Group 3 (Database)
        └─► Group 10 (Notion Sync — reads from DB)

Groups 4, 5 (Filter + Scorer) — independent of scrapers, pure functions

Group 11 (Pipeline) ◄── ALL above
Group 12 (Docs) ◄── ALL above
```

**Parallelizable:** Groups 1+2+3 can run concurrently. Groups 4+5 can run concurrently. Groups 6+7+8+9 can run concurrently (after schema deps).

---

## Verification

After all tasks complete:

1. **Unit tests:** `bun run test` — all pass
2. **Lint:** `bun run lint:check` — no errors
3. **Dry run:** `bun run scripts/scout.ts --region th --dry-run` — pipeline runs, skips Notion sync
4. **Status check:** `bun run scripts/status.ts` — shows data summary
5. **Top candidates:** `bun run scripts/top.ts --limit 5` — shows scored results

---

## Estimated Effort

| Group | Tasks | Estimated Commits |
|-------|-------|-------------------|
| 0. Setup | 2 | 2 |
| 1. Config Schemas + Loader | 4 | 4 |
| 2. Product Schemas | 2 | 2 |
| 3. Database | 3 | 3 |
| 4. Filter | 1 | 1 |
| 5. Scorer | 2 | 2 |
| 6. FastMoss Scraper | 2 | 2 |
| 7. Shopee Scraper | 2 | 2 |
| 8. Google Trends | 1 | 1 |
| 9. CJ API | 1 | 1 |
| 10. Notion Sync | 1 | 1 |
| 11. Pipeline + Scripts | 2 | 2 |
| 12. Docs | 1 | 1 |
| **Total** | **24** | **24** |
