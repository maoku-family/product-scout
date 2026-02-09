# Product Scout

Southeast Asia TikTok product selection automation tool. Scrape TikTok trending videos → Match Shopee products → Filter and score → Sync to Notion.

## Tech Stack

Bun + TypeScript + Zod + SQLite + Playwright + Apify

## Common Commands

```
bun install          # Install dependencies
bun run lint         # Lint + fix
bun test             # Run tests
bun run scripts/scout.ts --region th --limit 10  # Run product selection (limit 10 products)
bun run scripts/status.ts              # Check status
bun run scripts/top.ts --limit 10      # Top N candidates
```

## Directory Structure

- `scripts/` - Executable scripts
- `src/scrapers/` - Data collection
- `src/api/` - External APIs
- `src/core/` - Core business logic
- `src/schemas/` - Zod validation
- `src/utils/` - Utility functions
- `config/` - Configuration files

## Sensitive Files

Do not read or modify:
- `config/secrets.yaml` - API keys
- `db/*.db` - Database files
