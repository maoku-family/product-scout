# Architecture

> Engineering standards and best practices for the product selection automation project

---

## 1. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | TypeScript execution, package management |
| Language | TypeScript 5.x | Strict mode |
| Validation | Zod | Runtime validation + type inference |
| Database | bun:sqlite | Bun native SQLite, zero deps, 3-6x faster |
| Web Scraping | Playwright | Shopee scraping |
| API Scraping | Apify SDK | TikTok data |
| Testing | Vitest | Unit tests |

---

## 2. Directory Structure

```
product-scout/
├── SKILL.md              # OpenClaw skill entry
├── scripts/              # Executable scripts
│   ├── scout.ts          # Main flow: scrape → filter → sync
│   ├── status.ts         # Check run status
│   └── top.ts            # View top N candidates
│
├── src/                  # Source code
│   ├── scrapers/         # Data collection layer
│   ├── api/              # External API layer
│   ├── core/             # Core business layer
│   ├── schemas/          # Zod validation
│   └── utils/            # Utility functions
│
├── references/           # Reference docs (AI loads on demand)
│
├── config/
│   ├── rules.yaml        # Filtering rules
│   └── secrets.yaml      # API keys (.gitignore)
│
├── db/
│   └── products.db       # SQLite (.gitignore)
│
├── .claude/
│   └── rules/            # Claude rules
│
└── test/
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

---

## 4. Data Schema

### SQLite Tables

**tiktok_products** - Raw TikTok video data
```sql
CREATE TABLE tiktok_products (
    id INTEGER PRIMARY KEY,
    video_id TEXT UNIQUE,
    title TEXT,
    views INTEGER,
    likes INTEGER,
    comments INTEGER,
    hashtags TEXT,
    product_name TEXT,
    category TEXT,
    region TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**shopee_products** - Raw Shopee product data
```sql
CREATE TABLE shopee_products (
    id INTEGER PRIMARY KEY,
    item_id TEXT UNIQUE,
    title TEXT,
    price REAL,
    sold_count INTEGER,
    rating REAL,
    category TEXT,
    region TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**cost_data** - CJ Dropshipping cost data
```sql
CREATE TABLE cost_data (
    id INTEGER PRIMARY KEY,
    product_name TEXT,
    cj_price REAL,
    shipping_cost REAL,
    supplier TEXT,
    cj_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**candidates** - Filtered results, synced to Notion
```sql
CREATE TABLE candidates (
    id INTEGER PRIMARY KEY,
    product_name TEXT,
    category TEXT,
    suggested_price REAL,
    cost REAL,
    profit_margin REAL,
    tiktok_score INTEGER,
    shopee_verified BOOLEAN,
    shopee_sales INTEGER,
    trend TEXT,
    total_score INTEGER,
    cj_url TEXT,
    source TEXT,
    synced_to_notion BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Data Flow

```
tiktok_products ─┐
shopee_products ─┼─→ candidates ─→ Notion Database
cost_data ───────┘                 + Image (manual)
                                   + Status (manual)
                                   + Notes (manual)
```

### Notion Database Fields

`candidates` table syncs to Notion, plus manual input fields:

| Field | Source | Type |
|-------|--------|------|
| Product Name | candidates.product_name | Title |
| Category | candidates.category | Select |
| Suggested Price | candidates.suggested_price | Number |
| Cost | candidates.cost | Number |
| Profit Margin | candidates.profit_margin | Formula |
| TikTok Score | candidates.tiktok_score | Number |
| Shopee Sales | candidates.shopee_sales | Number |
| Trend | candidates.trend | Select |
| Total Score | candidates.total_score | Number |
| CJ Link | candidates.cj_url | URL |
| Source | candidates.source | Multi-select |
| Discovery Date | candidates.created_at | Date |
| **Image** | **Manual input** | Files |
| **Status** | **Manual input** | Select |
| **Notes** | **Manual input** | Text |

---

## 5. Code Quality Checklist

- [ ] All external data validated with Zod
- [ ] All network requests have retry mechanism
- [ ] Errors have clear logs
- [ ] Core logic has unit tests
- [ ] TypeScript strict mode passes
- [ ] Sensitive info not committed to Git
- [ ] ESLint checks pass

---

## 6. References

- **Design Doc:** [docs/design.md](./design.md)
- **GitHub:** [maoku-family/product-scout](https://github.com/maoku-family/product-scout)
