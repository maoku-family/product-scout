# FastMoss Deep Mining Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Product Scout from a single-list scraper with fixed scoring into a multi-strategy product selection system with deep FastMoss data mining, labeling, quota management, and configurable scoring.

**Architecture:** Bottom-up implementation. Start with the new database schema and config files (foundation), then build scrapers layer by layer (lists → search → details → shops), then core logic (queue → labels → scoring → pipeline), and finally output (Notion sync + CLI). Each task is independently testable and committable.

**Tech Stack:** Bun + TypeScript + Zod + SQLite (bun:sqlite) + Playwright + Vitest

---

## Task Dependency Overview

```
Task 1: DB Schema Migration
    ↓
Task 2: Config Files (scoring.yaml, signals.yaml, search-strategies.yaml)
    ↓
Task 3: Zod Schemas (new product/shop/enrichment types)
    ↓
Task 4: DB Queries (new CRUD for all 11 tables)
    ↓
Task 5: Refactor FastMoss scraper into src/scrapers/fastmoss/ directory
    ↓
Task 6: List Layer Scrapers (newProducts, hotlist, hotvideo)
    ↓
Task 7: Search Layer Scraper
    ↓
Task 8: Product Detail Page Scraper
    ↓
Task 9: Shop Flow Scrapers (shop lists + product extraction)
    ↓
Task 10: Scrape Queue & Quota Management
    ↓
Task 11: Product Enrichments (migrate Shopee + CJ to unified table)
    ↓
Task 12: Tag System (discovery + signal + strategy labels)
    ↓
Task 13: Multi-Strategy Scoring Engine
    ↓
Task 14: Pipeline Orchestration (Phase A→E)
    ↓
Task 15: Notion Sync Updates (labels, multi-score)
    ↓
Task 16: CLI Updates (scout.ts, top.ts, status.ts)
```

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `src/db/schema.ts`
- Test: `test/unit/db/schema.test.ts`

**Context:** Current schema has 4 tables (products, shopee_products, cost_data, candidates). New schema has 11 tables. Since this is pre-production, we rebuild from scratch — no data migration needed.

**Step 1: Write failing tests for the new schema**

Add tests to `test/unit/db/schema.test.ts` verifying all 11 tables exist after `initDb()`:

```typescript
// test/unit/db/schema.test.ts
import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { initDb, resetDb } from "@/db/schema";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

describe("initDb", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("creates all 11 tables", () => {
    const tables = [
      "products", "product_snapshots", "product_details",
      "product_enrichments", "shops", "shop_snapshots",
      "candidates", "candidate_score_details",
      "tags", "candidate_tags", "scrape_queue",
    ];
    for (const table of tables) {
      expect(tableExists(db, table)).toBe(true);
    }
  });

  it("does not create legacy tables", () => {
    expect(tableExists(db, "shopee_products")).toBe(false);
    expect(tableExists(db, "cost_data")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/unit/db/schema.test.ts`
Expected: FAIL — new tables don't exist, legacy tables still exist

**Step 3: Implement the new schema**

Rewrite `src/db/schema.ts` with all 11 CREATE TABLE statements from the design document (Section 8). Remove `shopee_products` and `cost_data`. Update `products` table to use new structure (product_id, canonical_id, fastmoss_id, product_name, shop_name, country, category, subcategory, first_seen_at, UNIQUE on product_name+shop_name+country). Update `candidates` table to store multi-strategy scores.

**Step 4: Run tests to verify they pass**

Run: `bun test test/unit/db/schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/schema.ts test/unit/db/schema.test.ts
git commit -m "feat: migrate database schema from 4 to 11 tables"
```

---

## Task 2: Configuration Files

**Files:**
- Create: `config/scoring.yaml`
- Create: `config/signals.yaml`
- Create: `config/search-strategies.yaml`
- Modify: `config/rules.yaml`
- Modify: `src/schemas/config.ts`
- Modify: `src/config/loader.ts` (if needed)
- Test: `test/unit/schemas/config.test.ts`

**Context:** The new system uses YAML-driven scoring profiles, signal rules, and search strategies. All config loaded and validated with Zod.

**Step 1: Create the YAML config files**

`config/scoring.yaml` — 5 scoring profiles (default, trending, blueOcean, highMargin, shopCopy) with dimensions and weights as defined in design Section 5.

`config/signals.yaml` — 8 signal rules with conditions as defined in design Section 4.

`config/search-strategies.yaml` — 2 example strategies (blue-ocean-beauty, high-margin-general) as defined in design Section 10.

Add scraping quota settings to `config/rules.yaml`:

```yaml
scraping:
  dailyDetailBudget: 300
  dailySearchBudget: 300
  freshness:
    detailRefreshDays: 7
    vocRefreshDays: 14
    shopRefreshDays: 7
```

**Step 2: Write Zod schemas for the new configs**

Add to `src/schemas/config.ts`:

```typescript
export const ScoringDimensionSchema = z.record(z.string(), z.number());

export const ScoringProfileSchema = z.object({
  name: z.string(),
  dimensions: ScoringDimensionSchema,
});

export const ScoringConfigSchema = z.object({
  scoring_profiles: z.record(z.string(), ScoringProfileSchema),
});

export const SignalRuleSchema = z.object({
  condition: z.string(),
});

export const SignalsConfigSchema = z.object({
  signal_rules: z.record(z.string(), SignalRuleSchema),
});

export const SearchStrategyFilterSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const SearchStrategySchema = z.object({
  name: z.string(),
  region: z.string(),
  filters: SearchStrategyFilterSchema,
});

export const SearchStrategiesConfigSchema = z.object({
  strategies: z.record(z.string(), SearchStrategySchema),
});

export const ScrapingFreshnessSchema = z.object({
  detailRefreshDays: z.number().default(7),
  vocRefreshDays: z.number().default(14),
  shopRefreshDays: z.number().default(7),
});

export const ScrapingConfigSchema = z.object({
  dailyDetailBudget: z.number().default(300),
  dailySearchBudget: z.number().default(300),
  freshness: ScrapingFreshnessSchema,
});
```

Update `RulesConfigSchema` to include optional `scraping` field.

**Step 3: Write tests for the new config schemas**

In `test/unit/schemas/config.test.ts`, add tests for:
- ScoringConfigSchema validates the scoring.yaml content
- SignalsConfigSchema validates the signals.yaml content
- SearchStrategiesConfigSchema validates the search-strategies.yaml content
- Updated RulesConfigSchema still validates existing rules.yaml + new scraping section

**Step 4: Write integration test for loading new configs**

In `test/integration/config/loader.test.ts`, add tests loading each new YAML file and validating with its schema.

**Step 5: Run all tests**

Run: `bun test`
Expected: PASS

**Step 6: Commit**

```bash
git add config/scoring.yaml config/signals.yaml config/search-strategies.yaml config/rules.yaml src/schemas/config.ts test/
git commit -m "feat: add scoring, signals, and search strategy configs"
```

---

## Task 3: Zod Schemas for New Data Types

**Files:**
- Modify: `src/schemas/product.ts`
- Create: `src/schemas/shop.ts`
- Create: `src/schemas/enrichment.ts`
- Create: `src/schemas/tag.ts`
- Create: `src/schemas/scrape-queue.ts`
- Remove: `src/schemas/shopee.ts`
- Remove: `src/schemas/cost.ts`
- Test: `test/unit/schemas/product.test.ts` (update)
- Test: `test/unit/schemas/shop.test.ts` (new)
- Test: `test/unit/schemas/enrichment.test.ts` (new)

**Context:** New schema types must be validated with Zod before database writes. Replace shopee/cost schemas with unified enrichment schema.

**Step 1: Write failing tests for new schemas**

Test each new schema validates correct data and rejects invalid data.

**Step 2: Implement schemas**

`src/schemas/product.ts` — Update `FastmossProductSchema` to match new products table (add fastmoss_id, subcategory, remove gmv and scrapedAt from the product identity). Add `ProductSnapshotSchema` and `ProductDetailSchema`.

`src/schemas/shop.ts` — `ShopSchema` and `ShopSnapshotSchema`.

`src/schemas/enrichment.ts` — `ProductEnrichmentSchema` (replaces ShopeeProductSchema and CostDataSchema).

`src/schemas/tag.ts` — `TagSchema` with tag_type and tag_name.

`src/schemas/scrape-queue.ts` — `ScrapeQueueItemSchema`.

**Step 3: Run tests**

Run: `bun test`
Expected: PASS

**Step 4: Remove old schemas and update imports**

Delete `src/schemas/shopee.ts` and `src/schemas/cost.ts`. Update any imports.

**Step 5: Commit**

```bash
git add src/schemas/ test/unit/schemas/
git commit -m "feat: add Zod schemas for snapshots, details, shops, enrichments, tags, queue"
```

---

## Task 4: Database Queries for All Tables

**Files:**
- Rewrite: `src/db/queries.ts`
- Test: `test/unit/db/queries.test.ts`

**Context:** Need CRUD operations for all 11 tables. Old queries for shopee_products and cost_data are removed.

**Step 1: Write failing tests**

Test each query function:
- `upsertProduct` — INSERT OR IGNORE, return product_id
- `insertProductSnapshot` — insert daily snapshot, skip duplicates
- `upsertProductDetail` — INSERT OR REPLACE (one row per product)
- `insertProductEnrichment` — insert enrichment row
- `upsertShop` — INSERT OR IGNORE, return shop_id
- `insertShopSnapshot` — insert shop daily data
- `upsertCandidate` — INSERT OR REPLACE (one row per product_id)
- `insertCandidateScoreDetail` — insert score breakdown
- `upsertTag` — INSERT OR IGNORE, return tag_id
- `addCandidateTag` — link candidate to tag
- `enqueueScrapeTarget` — add to scrape queue
- `dequeueNextTargets` — get top N pending by priority
- `markScrapeStatus` — update queue item status
- `getUnsyncedCandidates` — updated to include multi-strategy scores and tags
- `getTopCandidates` — updated for new schema
- `markSynced` — updated for new candidates table

**Step 2: Implement queries**

Follow existing patterns: `db.prepare(sql).run(...)` for inserts, `.get(...)` for single row, `.all(...)` for multiple rows. Use `INSERT OR IGNORE` for deduplication, `INSERT OR REPLACE` for upserts.

**Step 3: Run tests**

Run: `bun test test/unit/db/queries.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/db/queries.ts test/unit/db/queries.test.ts
git commit -m "feat: implement CRUD queries for all 11 tables"
```

---

## Task 5: Refactor FastMoss Scraper Directory Structure

**Files:**
- Move: `src/scrapers/fastmoss.ts` → `src/scrapers/fastmoss/saleslist.ts`
- Create: `src/scrapers/fastmoss/index.ts` (re-exports)
- Create: `src/scrapers/fastmoss/shared.ts` (shared browser/navigation utilities)
- Modify: all imports of `@/scrapers/fastmoss`
- Test: `test/unit/scrapers/fastmoss.test.ts` → `test/unit/scrapers/fastmoss/saleslist.test.ts`

**Context:** Design document Section 7 says FastMoss-specific logic should live under `src/scrapers/fastmoss/` for future extensibility. This is a pure refactor — no behavior changes.

**Step 1: Create directory structure**

Extract shared utilities into `src/scrapers/fastmoss/shared.ts`:
- `launchFastmossContext()` — persistent Chrome context launch
- `checkLoginStatus()` — detect session expiry
- `FASTMOSS_BASE_URL` constant
- `DEFAULT_PROFILE_DIR` constant
- `parsePercentage()` helper

Keep saleslist-specific logic (extractTableDataScript, transformRawRows, scrapeFastmoss) in `src/scrapers/fastmoss/saleslist.ts`.

Create `src/scrapers/fastmoss/index.ts` that re-exports everything.

**Step 2: Update all imports**

Search for `@/scrapers/fastmoss` and update to `@/scrapers/fastmoss` (barrel import from index.ts should be compatible).

**Step 3: Move and update test file**

**Step 4: Run all tests to verify no regressions**

Run: `bun test`
Expected: PASS — behavior unchanged

**Step 5: Commit**

```bash
git add src/scrapers/fastmoss/ test/unit/scrapers/fastmoss/
git commit -m "refactor: reorganize FastMoss scraper into directory structure"
```

---

## Task 6: List Layer Scrapers (newProducts, hotlist, hotvideo)

**Files:**
- Create: `src/scrapers/fastmoss/new-products.ts`
- Create: `src/scrapers/fastmoss/hotlist.ts`
- Create: `src/scrapers/fastmoss/hotvideo.ts`
- Modify: `src/scrapers/fastmoss/index.ts`
- Test: `test/unit/scrapers/fastmoss/new-products.test.ts`
- Test: `test/unit/scrapers/fastmoss/hotlist.test.ts`
- Test: `test/unit/scrapers/fastmoss/hotvideo.test.ts`

**Context:** Each list page has a different URL, different Ant Design table column layout, and different fields. But the overall pattern is the same: launch Chrome → navigate → wait for table → extract rows → validate with Zod → return typed data.

Reference the FastMoss data research documents (`docs/research/fastmoss-data-map.md` and `docs/research/fastmoss-data-map-nav.md`) for exact URL patterns and DOM structure.

**Step 1: Write failing tests for each scraper**

Test the pure `transformRawRows*()` function for each page type. Mock Playwright for the full scrape function.

**Step 2: Implement each scraper**

Follow the same pattern as `saleslist.ts`:
- Page-specific `extractTableDataScript()` for DOM extraction
- Page-specific `transformRawRows()` for parsing + Zod validation
- Page-specific `scrape*()` function using shared browser utilities

URL patterns:
- newProducts: `/e-commerce/newProducts`
- hotlist: `/e-commerce/hotlist`
- hotvideo: `/e-commerce/hotvideo`

**Step 3: Run tests**

Run: `bun test test/unit/scrapers/fastmoss/`
Expected: PASS

**Step 4: Commit**

```bash
git add src/scrapers/fastmoss/ test/unit/scrapers/fastmoss/
git commit -m "feat: add list layer scrapers for newProducts, hotlist, hotvideo"
```

---

## Task 7: Search Layer Scraper

**Files:**
- Create: `src/scrapers/fastmoss/search.ts`
- Modify: `src/scrapers/fastmoss/index.ts`
- Test: `test/unit/scrapers/fastmoss/search.test.ts`

**Context:** Product search page at `/e-commerce/search` accepts filter parameters. Strategies are driven by `config/search-strategies.yaml`.

**Step 1: Write failing tests**

Test `transformSearchRows()` pure function. Test that search scraper accepts strategy config and builds correct URL parameters.

**Step 2: Implement search scraper**

- Read filter values from search strategy config
- Navigate to search URL with query parameters
- Extract search result table rows
- Validate with Zod, return typed data
- Handle pagination if needed (search results can span multiple pages, up to 1000 items on Professional plan)

**Step 3: Run tests**

Run: `bun test test/unit/scrapers/fastmoss/search.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/scrapers/fastmoss/search.ts test/unit/scrapers/fastmoss/search.test.ts
git commit -m "feat: add search layer scraper with configurable strategies"
```

---

## Task 8: Product Detail Page Scraper

**Files:**
- Create: `src/scrapers/fastmoss/detail.ts`
- Modify: `src/scrapers/fastmoss/index.ts`
- Test: `test/unit/scrapers/fastmoss/detail.test.ts`

**Context:** Product detail page at `/e-commerce/detail/{fastmoss_id}` contains deep data: heat index, popularity, price, commission, listing date, stock, creators, videos, lives, VOC, channel split, similar products. This page consumes quota (300/day limit).

**Step 1: Write failing tests**

Test `transformDetailPageData()` pure function that takes raw DOM data and returns a validated `ProductDetail` object.

**Step 2: Implement detail scraper**

- Navigate to detail page URL using fastmoss_id
- Extract structured data from the detail page DOM (not a table — different layout than list pages)
- Parse all sections: basics, sales, transaction channels, creators, videos, VOC, similar products
- Validate with `ProductDetailSchema`
- Return typed `ProductDetail` object

**Step 3: Run tests**

Run: `bun test test/unit/scrapers/fastmoss/detail.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/scrapers/fastmoss/detail.ts test/unit/scrapers/fastmoss/detail.test.ts
git commit -m "feat: add product detail page scraper"
```

---

## Task 9: Shop Flow Scrapers

**Files:**
- Create: `src/scrapers/fastmoss/shop-list.ts`
- Create: `src/scrapers/fastmoss/shop-detail.ts`
- Modify: `src/scrapers/fastmoss/index.ts`
- Test: `test/unit/scrapers/fastmoss/shop-list.test.ts`
- Test: `test/unit/scrapers/fastmoss/shop-detail.test.ts`

**Context:** Shop flow has two steps: (A3) scan shop lists to discover shops, (A4) enter shop detail to extract product lists. Shop-to-product association is tracked via `discovery:shop-copy` tags, not a join table.

**Step 1: Write failing tests**

Test pure transform functions for shop list rows and shop detail product extraction.

**Step 2: Implement shop list scraper**

Scrape two shop list pages:
- `/shop-marketing/tiktok` (shop sales list)
- `/shop-marketing/hotTiktok` (shop hot list)

Extract: shop name, sales, growth, revenue, active products, creator count.

**Step 3: Implement shop detail scraper**

Navigate to `/shop-marketing/detail/{fastmoss_shop_id}`:
- Extract shop metrics (rating, positive rate, ship rate, ranking)
- Extract product list from the shop's product tab
- Return products ready to insert into `products` table

**Step 4: Run tests**

Run: `bun test test/unit/scrapers/fastmoss/shop-list.test.ts test/unit/scrapers/fastmoss/shop-detail.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/scrapers/fastmoss/shop-list.ts src/scrapers/fastmoss/shop-detail.ts test/unit/scrapers/fastmoss/
git commit -m "feat: add shop flow scrapers (shop lists + product extraction)"
```

---

## Task 10: Scrape Queue & Quota Management

**Files:**
- Create: `src/core/scrape-queue.ts`
- Test: `test/unit/core/scrape-queue.test.ts`

**Context:** Detail pages are limited to 300/day. The scrape queue manages which products to deep-mine based on priority and freshness.

**Step 1: Write failing tests**

Test queue building logic:
- `buildScrapeQueue(db, budget)` — returns prioritized list of targets
  - P1: products with no `product_details` row (never scraped)
  - P2: products whose detail was scraped >7 days ago and reappeared on today's lists
  - P3: manually marked "track" products
- Queue respects budget limit (returns at most `budget` items)
- Cache check: skips products scraped today or within freshness window
- `consumeQuota(db, targetId, status)` — marks queue item as done/failed

**Step 2: Implement scrape queue**

```typescript
export function buildScrapeQueue(
  db: Database,
  budget: number,
  freshnessConfig: ScrapingFreshness,
): ScrapeQueueItem[] {
  // Query products needing detail scrape, ordered by priority
  // P1 (priority 3): no product_details row
  // P2 (priority 2): detail scraped_at older than freshnessConfig.detailRefreshDays
  // P3 (priority 1): manually tracked
  // Limit to budget
}
```

**Step 3: Run tests**

Run: `bun test test/unit/core/scrape-queue.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/scrape-queue.ts test/unit/core/scrape-queue.test.ts
git commit -m "feat: add scrape queue with priority ranking and quota management"
```

---

## Task 11: Product Enrichments (Migrate Shopee + CJ)

**Files:**
- Modify: `src/scrapers/shopee.ts`
- Modify: `src/api/cj.ts`
- Test: `test/unit/scrapers/shopee.test.ts`
- Test: `test/unit/api/cj.test.ts`

**Context:** Shopee and CJ data now write to the unified `product_enrichments` table instead of `shopee_products` and `cost_data`. The scraper/API functions themselves don't change — only the database write layer.

**Step 1: Write failing tests**

Test that enrichment data is written to `product_enrichments` with correct `source` values ("shopee" and "cj").

**Step 2: Update Shopee integration**

After fetching Shopee data, write to `product_enrichments` with `source: "shopee"`. Store shopee-specific fields (shopee_url) in the `extra` JSON column.

**Step 3: Update CJ integration**

After fetching CJ data, write to `product_enrichments` with `source: "cj"`. Store CJ-specific fields (cj_url, shipping_cost, inventory) in the `extra` JSON column.

**Step 4: Run tests**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/scrapers/shopee.ts src/api/cj.ts test/
git commit -m "feat: migrate Shopee and CJ data to unified product_enrichments table"
```

---

## Task 12: Tag System

**Files:**
- Create: `src/core/tagger.ts`
- Test: `test/unit/core/tagger.test.ts`

**Context:** Every candidate receives auto-generated labels: discovery (where found), signal (data-driven rules from signals.yaml), and strategy (which scoring profiles match).

**Step 1: Write failing tests**

Test each labeling function:

```typescript
// Discovery labels — based on which scraper found the product
applyDiscoveryTags(sources: string[]): Tag[]
// Input: ["saleslist", "search"] → Output: ["discovery:sales-rank", "discovery:search"]

// Signal labels — based on signals.yaml rules evaluated against product data
applySignalTags(productData: ProductDataForTagging, signalRules: SignalRulesConfig): Tag[]
// Input: {salesGrowthRate: 1.5, creatorCount: 30} → Output: ["signal:sales-surge", "signal:low-competition"]

// Strategy labels — based on which scoring profiles scored above threshold
applyStrategyTags(scores: Record<string, number>, threshold: number): Tag[]
// Input: {trending: 82, blueOcean: 35, highMargin: 71} threshold: 60 → Output: ["strategy:trending", "strategy:high-margin"]
```

**Step 2: Implement tagger**

- `applyDiscoveryTags` — map source names to discovery tag names
- `applySignalTags` — evaluate each signal rule condition against product data. Parse simple conditions like `"salesGrowthRate > 1.0"` using a minimal expression evaluator (field, operator, value).
- `applyStrategyTags` — check each profile score against threshold

**Step 3: Run tests**

Run: `bun test test/unit/core/tagger.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/tagger.ts test/unit/core/tagger.test.ts
git commit -m "feat: add auto-labeling system (discovery, signal, strategy tags)"
```

---

## Task 13: Multi-Strategy Scoring Engine

**Files:**
- Rewrite: `src/core/scorer.ts`
- Test: `test/unit/core/scorer.test.ts`

**Context:** Replace fixed 5-dimension scorer with a configurable multi-profile scoring engine driven by `config/scoring.yaml`. Each profile has different dimensions and weights. Normalization functions map raw values to 0-100.

**Step 1: Write failing tests**

Test the new scorer:

```typescript
// Test individual normalizers
normalizeValue("salesVolume", rawValue, context): number  // 0-100
normalizeValue("hotIndex", rawValue, context): number
normalizeValue("competitionScore", rawValue, context): number  // inverse

// Test multi-profile scoring
computeMultiScore(productData, scoringConfig): MultiScoreResult
// Returns: { default: 76.5, trending: 82.5, blueOcean: 35.0, highMargin: 71.0, shopCopy: null }
// Plus score details per dimension

// Test graceful degradation — missing data dimensions scored as 0
```

**Step 2: Implement scorer**

```typescript
export type MultiScoreResult = {
  scores: Record<string, number | null>;  // profile name → score (null if insufficient data)
  details: CandidateScoreDetail[];        // per-dimension breakdown
};

// Normalizer registry — maps dimension names to normalization functions
const normalizers: Record<string, (raw: number, ctx: NormContext) => number> = {
  salesVolume: (raw, ctx) => clamp(raw / ctx.maxSalesVolume * 100),
  salesGrowthRate: (raw) => clamp(raw * 100),
  hotIndex: (raw) => clamp(raw),  // already 0-100
  competitionScore: (raw) => clamp(100 - raw),  // inverse
  // ... etc for all dimensions
};

export function computeMultiScore(
  data: ScoringInput,
  profiles: ScoringConfig,
): MultiScoreResult { ... }
```

**Step 3: Ensure backward compatibility**

The `default` profile should produce similar results to the old `computeScore()` for the same inputs (not identical due to different dimensions, but roughly comparable).

**Step 4: Run tests**

Run: `bun test test/unit/core/scorer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/scorer.ts test/unit/core/scorer.test.ts
git commit -m "feat: replace fixed scorer with multi-strategy scoring engine"
```

---

## Task 14: Pipeline Orchestration

**Files:**
- Rewrite: `src/core/pipeline.ts`
- Modify: `src/core/filter.ts`
- Test: `test/unit/core/pipeline.test.ts`
- Test: `test/unit/core/filter.test.ts`

**Context:** The pipeline changes from a 10-step linear flow to a 6-phase flow (A→F, where F is human-only). This is the largest task — it wires everything together.

**Step 1: Update filter.ts**

Update `preFilter` and `postFilter` to work with the new data types. Pre-filter now operates on products from any source (not just FastmossProduct). Post-filter uses enrichment data from `product_enrichments`.

**Step 2: Write failing tests for the new pipeline**

Mock all scrapers and external APIs. Test each phase:

```typescript
describe("Phase A: Data Collection", () => {
  it("scans all 4 list pages and stores products + snapshots", ...);
  it("runs strategy searches and stores results", ...);
  it("scans shops and extracts products", ...);
  it("deduplicates products across sources", ...);
});

describe("Phase B: Queue Building", () => {
  it("filters and prioritizes products for detail scraping", ...);
  it("respects daily quota budget", ...);
});

describe("Phase C: Deep Mining", () => {
  it("scrapes product details from queue", ...);
  it("enriches with Shopee, CJ, Google Trends", ...);
});

describe("Phase D: Post-filter + Label + Score", () => {
  it("applies post-filters on enriched data", ...);
  it("applies discovery, signal, and strategy tags", ...);
  it("computes multi-strategy scores", ...);
});

describe("Phase E: Output", () => {
  it("syncs candidates to Notion with labels and scores", ...);
});
```

**Step 3: Implement pipeline**

```typescript
export async function runPipeline(
  db: Database,
  options: PipelineOptions,
  secrets: Secrets,
  config: FullConfig,  // rules + scoring + signals + search strategies + scraping
): Promise<PipelineResult> {
  // Phase A: Data Collection
  const products = await phaseA_collect(db, options, config);

  // Phase B: Pre-filter & Queue Building
  const queue = phaseB_buildQueue(db, products, config);

  // Phase C: Deep Mining
  await phaseC_deepMine(db, queue, secrets, config);

  // Phase D: Post-filter + Label + Score
  const candidates = phaseD_labelAndScore(db, config);

  // Phase E: Output
  if (!options.dryRun) {
    await phaseE_output(db, secrets);
  }

  return result;
}
```

**Step 4: Run tests**

Run: `bun test test/unit/core/`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/pipeline.ts src/core/filter.ts test/unit/core/
git commit -m "feat: rewrite pipeline with 6-phase orchestration (A→E)"
```

---

## Task 15: Notion Sync Updates

**Files:**
- Modify: `src/core/sync.ts`
- Test: `test/unit/core/sync.test.ts`

**Context:** Notion pages now include multiple strategy scores, labels (as Multi-select), and key signals. The page property mapping needs to be updated.

**Step 1: Write failing tests**

Test updated `mapToNotionProperties()`:
- All 5 strategy scores mapped as number properties
- Labels mapped as Multi-select property
- Key signals mapped as rich text
- Backward-compatible: still includes Product Name, Category, Source, Discovery Date

**Step 2: Implement updated sync**

Update `mapToNotionProperties()` to include:
- `Default Score`, `Trending Score`, `Blue Ocean Score`, `High Margin Score`, `Shop Copy Score` — number properties
- `Labels` — Multi-select with tag names
- `Signals` — rich text summary (e.g., "Sales growth +135%, high commission 20%")
- Remove old `Total Score` and `Trend` properties

Update `getUnsyncedCandidates()` JOIN query to include tags and score details.

**Step 3: Run tests**

Run: `bun test test/unit/core/sync.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/sync.ts test/unit/core/sync.test.ts
git commit -m "feat: update Notion sync with multi-score, labels, and signals"
```

---

## Task 16: CLI Updates

**Files:**
- Modify: `scripts/scout.ts`
- Modify: `scripts/status.ts`
- Modify: `scripts/top.ts`

**Context:** CLI scripts need to load new config files, pass them to the updated pipeline, and display new output formats.

**Step 1: Update scout.ts**

- Load all config files: rules.yaml, scoring.yaml, signals.yaml, search-strategies.yaml, secrets.yaml
- Pass full config to `runPipeline()`
- Update result display to show Phase A→E metrics

**Step 2: Update status.ts**

- Show counts for all 11 tables
- Show scrape queue status (pending/done/failed)
- Show quota usage for today

**Step 3: Update top.ts**

- Display candidates grouped by strategy
- Show labels and signals for each candidate
- Accept `--strategy` flag to filter by scoring profile

**Step 4: Manual testing**

Run: `bun run scripts/status.ts`
Expected: Shows table counts for new schema

**Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: update CLI scripts for multi-strategy pipeline"
```

---

## Final Verification

After all tasks are complete:

1. Run full test suite: `bun test`
2. Run lint: `bun run lint`
3. Run a dry-run: `bun run scripts/scout.ts --region th --limit 5 --dry-run`
4. Check status: `bun run scripts/status.ts`
5. Review top candidates: `bun run scripts/top.ts --limit 5`
