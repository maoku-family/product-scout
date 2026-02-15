# Product Scout

Southeast Asia TikTok product selection automation tool. Scrape TikTok trending videos → Match Shopee products → Filter and score → Sync to Notion.

## Tech Stack

Bun + TypeScript + Zod + SQLite + Playwright + Apify

## Common Commands

```
bun install          # Install dependencies
bun run lint         # Lint + fix
bun run test         # Run tests (vitest, not `bun test`)
bun run scripts/scout.ts --region th --limit 10  # Run product selection (limit 10 products)
bun run scripts/status.ts              # Check status
bun run scripts/top.ts --limit 10      # Top N candidates
```

## Directory Structure

- `scripts/` - Executable scripts (scout.ts, status.ts, top.ts)
- `src/scrapers/` - Data collection (FastMoss suite + Shopee)
- `src/scrapers/fastmoss/` - 10 FastMoss scrapers (saleslist, hotlist, hotvideo, new-products, search, detail, shop-detail, shop-list, shared, index)
- `src/api/` - External APIs (CJ, Google Trends)
- `src/core/` - Core business logic (pipeline, filter, scorer, tagger, scrape-queue, enrichment-converters, sync)
- `src/schemas/` - Zod validation schemas
- `src/db/` - Database schema (11 tables) and queries
- `src/config/` - YAML config loader
- `src/types/` - TypeScript type declarations
- `src/utils/` - Utility functions (logger, retry, number parser)
- `config/` - YAML configuration files (rules, scoring, signals, search-strategies, regions, categories)
- `test/` - Test suite (unit, integration, fixtures, shims)

## Sensitive Files

Do not read or modify:
- `config/secrets.yaml` - API keys
- `db/*.db` - Database files
