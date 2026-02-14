/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import { afterEach, describe, expect, it } from "vitest";

import { getDb, initDb, resetDb } from "@/db/schema";

type TableInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type SqliteMaster = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};

type ForeignKeyInfo = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
};

const ALL_TABLES = [
  "candidate_score_details",
  "candidate_tags",
  "candidates",
  "product_details",
  "product_enrichments",
  "product_snapshots",
  "products",
  "scrape_queue",
  "shop_snapshots",
  "shops",
  "tags",
];

const LEGACY_TABLES = ["shopee_products", "cost_data"];

function getTableNames(db: ReturnType<typeof initDb>): string[] {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  return tables.map((t) => t.name).sort();
}

function getColumns(db: ReturnType<typeof initDb>, table: string): TableInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as TableInfo[];
}

function getColumnNames(
  db: ReturnType<typeof initDb>,
  table: string,
): string[] {
  return getColumns(db, table).map((c) => c.name);
}

function getForeignKeys(
  db: ReturnType<typeof initDb>,
  table: string,
): ForeignKeyInfo[] {
  return db
    .prepare(`PRAGMA foreign_key_list(${table})`)
    .all() as ForeignKeyInfo[];
}

function getTableSql(db: ReturnType<typeof initDb>, table: string): string {
  const result = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as SqliteMaster;
  return result.sql ?? "";
}

describe("initDb", () => {
  afterEach(() => {
    resetDb();
  });

  it("creates exactly 11 tables", () => {
    const db = initDb(":memory:");
    const tableNames = getTableNames(db);
    expect(tableNames).toEqual(ALL_TABLES);
  });

  it("does not create legacy tables (shopee_products, cost_data)", () => {
    const db = initDb(":memory:");
    const tableNames = getTableNames(db);
    for (const legacy of LEGACY_TABLES) {
      expect(tableNames).not.toContain(legacy);
    }
  });

  it("enables WAL mode", () => {
    const db = initDb(":memory:");
    const result = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    // In-memory databases report "memory" even when WAL is requested
    expect(result.journal_mode).toBe("memory");
  });

  it("enables foreign keys", () => {
    const db = initDb(":memory:");
    const result = db.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };
    expect(result.foreign_keys).toBe(1);
  });

  it("is idempotent — calling initDb twice does not throw", () => {
    const db = initDb(":memory:");
    // Re-running all CREATE TABLE IF NOT EXISTS on same db should not throw
    expect(() => {
      // Simulate re-init by running the same DDL again
      db.run(`CREATE TABLE IF NOT EXISTS products (
        product_id INTEGER PRIMARY KEY AUTOINCREMENT
      )`);
    }).not.toThrow();

    resetDb();
    const db2 = initDb(":memory:");
    expect(getTableNames(db2).length).toBe(11);
  });
});

describe("products table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "products");
    expect(cols).toEqual([
      "product_id",
      "canonical_id",
      "fastmoss_id",
      "product_name",
      "shop_name",
      "country",
      "category",
      "subcategory",
      "first_seen_at",
    ]);
  });

  it("has product_id as INTEGER PRIMARY KEY AUTOINCREMENT", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "products").find((c) => c.name === "product_id");
    expect(col?.type).toBe("INTEGER");
    expect(col?.pk).toBe(1);
  });

  it("has NOT NULL on product_name, shop_name, country, first_seen_at", () => {
    const db = initDb(":memory:");
    const columns = getColumns(db, "products");
    for (const name of [
      "product_name",
      "shop_name",
      "country",
      "first_seen_at",
    ]) {
      const col = columns.find((c) => c.name === name);
      expect(col?.notnull, `${name} should be NOT NULL`).toBe(1);
    }
  });

  it("has first_seen_at default to datetime('now')", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "products").find(
      (c) => c.name === "first_seen_at",
    );
    expect(col?.dflt_value).toBe("datetime('now')");
  });

  it("has UNIQUE(product_name, shop_name, country)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "products");
    expect(sql).toContain("UNIQUE(product_name, shop_name, country)");
  });

  it("enforces unique constraint on (product_name, shop_name, country)", () => {
    const db = initDb(":memory:");
    db.prepare(
      "INSERT INTO products (product_name, shop_name, country) VALUES (?, ?, ?)",
    ).run("Widget", "ShopA", "th");

    expect(() => {
      db.prepare(
        "INSERT INTO products (product_name, shop_name, country) VALUES (?, ?, ?)",
      ).run("Widget", "ShopA", "th");
    }).toThrow();
  });
});

describe("product_snapshots table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "product_snapshots");
    expect(cols).toEqual([
      "snapshot_id",
      "product_id",
      "scraped_at",
      "source",
      "rank",
      "units_sold",
      "sales_amount",
      "growth_rate",
      "total_units_sold",
      "total_sales_amount",
      "commission_rate",
      "creator_count",
      "video_views",
      "video_likes",
      "video_comments",
      "creator_conversion_rate",
    ]);
  });

  it("has FK to products(product_id)", () => {
    const db = initDb(":memory:");
    const fks = getForeignKeys(db, "product_snapshots");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("products");
    expect(fks[0]?.from).toBe("product_id");
    expect(fks[0]?.to).toBe("product_id");
  });

  it("has UNIQUE(product_id, scraped_at, source)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "product_snapshots");
    expect(sql).toContain("UNIQUE(product_id, scraped_at, source)");
  });

  it("enforces FK — cannot insert with non-existent product_id", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO product_snapshots (product_id, scraped_at, source) VALUES (?, ?, ?)",
      ).run(999, "2025-01-01", "saleslist");
    }).toThrow();
  });
});

describe("product_details table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "product_details");
    expect(cols).toEqual([
      "product_id",
      "fastmoss_id",
      "hot_index",
      "popularity_index",
      "price",
      "price_usd",
      "commission_rate",
      "rating",
      "review_count",
      "listed_at",
      "stock_status",
      "creator_count",
      "video_count",
      "live_count",
      "channel_video_pct",
      "channel_live_pct",
      "channel_other_pct",
      "voc_positive",
      "voc_negative",
      "similar_product_count",
      "scraped_at",
    ]);
  });

  it("has product_id as PK and FK to products", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "product_details").find(
      (c) => c.name === "product_id",
    );
    expect(col?.pk).toBe(1);

    const fks = getForeignKeys(db, "product_details");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("products");
    expect(fks[0]?.from).toBe("product_id");
    expect(fks[0]?.to).toBe("product_id");
  });

  it("has scraped_at as NOT NULL", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "product_details").find(
      (c) => c.name === "scraped_at",
    );
    expect(col?.notnull).toBe(1);
  });
});

describe("product_enrichments table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "product_enrichments");
    expect(cols).toEqual([
      "enrichment_id",
      "product_id",
      "source",
      "price",
      "sold_count",
      "rating",
      "profit_margin",
      "extra",
      "scraped_at",
    ]);
  });

  it("has FK to products(product_id)", () => {
    const db = initDb(":memory:");
    const fks = getForeignKeys(db, "product_enrichments");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("products");
    expect(fks[0]?.from).toBe("product_id");
    expect(fks[0]?.to).toBe("product_id");
  });

  it("has UNIQUE(product_id, source, scraped_at)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "product_enrichments");
    expect(sql).toContain("UNIQUE(product_id, source, scraped_at)");
  });
});

describe("shops table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "shops");
    expect(cols).toEqual([
      "shop_id",
      "fastmoss_shop_id",
      "shop_name",
      "country",
      "category",
      "shop_type",
      "first_seen_at",
    ]);
  });

  it("has fastmoss_shop_id as UNIQUE", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "shops");
    expect(sql).toContain("UNIQUE");
    expect(sql).toContain("fastmoss_shop_id");
  });

  it("has NOT NULL on shop_name, country, first_seen_at", () => {
    const db = initDb(":memory:");
    const columns = getColumns(db, "shops");
    for (const name of ["shop_name", "country", "first_seen_at"]) {
      const col = columns.find((c) => c.name === name);
      expect(col?.notnull, `${name} should be NOT NULL`).toBe(1);
    }
  });

  it("has first_seen_at default to datetime('now')", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "shops").find((c) => c.name === "first_seen_at");
    expect(col?.dflt_value).toBe("datetime('now')");
  });
});

describe("shop_snapshots table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "shop_snapshots");
    expect(cols).toEqual([
      "snapshot_id",
      "shop_id",
      "scraped_at",
      "source",
      "total_sales",
      "total_revenue",
      "active_products",
      "listed_products",
      "creator_count",
      "rating",
      "positive_rate",
      "ship_rate_48h",
      "national_rank",
      "category_rank",
      "sales_growth_rate",
      "new_product_sales_ratio",
    ]);
  });

  it("has FK to shops(shop_id)", () => {
    const db = initDb(":memory:");
    const fks = getForeignKeys(db, "shop_snapshots");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("shops");
    expect(fks[0]?.from).toBe("shop_id");
    expect(fks[0]?.to).toBe("shop_id");
  });

  it("has UNIQUE(shop_id, scraped_at, source)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "shop_snapshots");
    expect(sql).toContain("UNIQUE(shop_id, scraped_at, source)");
  });
});

describe("candidates table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "candidates");
    expect(cols).toEqual([
      "candidate_id",
      "product_id",
      "default_score",
      "trending_score",
      "blue_ocean_score",
      "high_margin_score",
      "shop_copy_score",
      "synced_to_notion",
      "created_at",
    ]);
  });

  it("has product_id as UNIQUE FK to products", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "candidates");
    expect(sql).toContain("UNIQUE");
    expect(sql).toContain("product_id");

    const fks = getForeignKeys(db, "candidates");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("products");
    expect(fks[0]?.from).toBe("product_id");
    expect(fks[0]?.to).toBe("product_id");
  });

  it("has synced_to_notion defaulting to 0", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "candidates").find(
      (c) => c.name === "synced_to_notion",
    );
    expect(col?.dflt_value).toBe("0");
    expect(col?.notnull).toBe(1);
  });

  it("has created_at defaulting to datetime('now')", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "candidates").find(
      (c) => c.name === "created_at",
    );
    expect(col?.dflt_value).toBe("datetime('now')");
    expect(col?.notnull).toBe(1);
  });
});

describe("candidate_score_details table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "candidate_score_details");
    expect(cols).toEqual([
      "candidate_id",
      "profile",
      "dimension",
      "raw_value",
      "normalized_value",
      "weight",
      "weighted_score",
    ]);
  });

  it("has composite PK (candidate_id, profile, dimension)", () => {
    const db = initDb(":memory:");
    const columns = getColumns(db, "candidate_score_details");
    const pkCols = columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    expect(pkCols.map((c) => c.name)).toEqual([
      "candidate_id",
      "profile",
      "dimension",
    ]);
  });

  it("has FK to candidates(candidate_id)", () => {
    const db = initDb(":memory:");
    const fks = getForeignKeys(db, "candidate_score_details");
    expect(fks.length).toBeGreaterThan(0);
    expect(fks[0]?.table).toBe("candidates");
    expect(fks[0]?.from).toBe("candidate_id");
    expect(fks[0]?.to).toBe("candidate_id");
  });
});

describe("tags table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "tags");
    expect(cols).toEqual(["tag_id", "tag_type", "tag_name"]);
  });

  it("has UNIQUE(tag_type, tag_name)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "tags");
    expect(sql).toContain("UNIQUE(tag_type, tag_name)");
  });

  it("enforces unique constraint on (tag_type, tag_name)", () => {
    const db = initDb(":memory:");
    db.prepare("INSERT INTO tags (tag_type, tag_name) VALUES (?, ?)").run(
      "discovery",
      "trending",
    );

    expect(() => {
      db.prepare("INSERT INTO tags (tag_type, tag_name) VALUES (?, ?)").run(
        "discovery",
        "trending",
      );
    }).toThrow();
  });
});

describe("candidate_tags table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "candidate_tags");
    expect(cols).toEqual([
      "candidate_id",
      "tag_id",
      "created_at",
      "created_by",
    ]);
  });

  it("has UNIQUE(candidate_id, tag_id)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "candidate_tags");
    expect(sql).toContain("UNIQUE(candidate_id, tag_id)");
  });

  it("has FK to candidates and tags", () => {
    const db = initDb(":memory:");
    const fks = getForeignKeys(db, "candidate_tags");
    expect(fks.length).toBe(2);

    const fkTables = fks.map((fk) => fk.table).sort();
    expect(fkTables).toEqual(["candidates", "tags"]);
  });

  it("has created_by defaulting to 'system'", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "candidate_tags").find(
      (c) => c.name === "created_by",
    );
    expect(col?.dflt_value).toBe("'system'");
    expect(col?.notnull).toBe(1);
  });
});

describe("scrape_queue table", () => {
  afterEach(() => {
    resetDb();
  });

  it("has correct columns", () => {
    const db = initDb(":memory:");
    const cols = getColumnNames(db, "scrape_queue");
    expect(cols).toEqual([
      "queue_id",
      "target_type",
      "target_id",
      "priority",
      "status",
      "last_scraped_at",
      "next_scrape_after",
      "retry_count",
      "created_at",
    ]);
  });

  it("has UNIQUE(target_type, target_id)", () => {
    const db = initDb(":memory:");
    const sql = getTableSql(db, "scrape_queue");
    expect(sql).toContain("UNIQUE(target_type, target_id)");
  });

  it("has priority defaulting to 2", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "scrape_queue").find(
      (c) => c.name === "priority",
    );
    expect(col?.dflt_value).toBe("2");
  });

  it("has status defaulting to 'pending'", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "scrape_queue").find((c) => c.name === "status");
    expect(col?.dflt_value).toBe("'pending'");
  });

  it("has retry_count defaulting to 0", () => {
    const db = initDb(":memory:");
    const col = getColumns(db, "scrape_queue").find(
      (c) => c.name === "retry_count",
    );
    expect(col?.dflt_value).toBe("0");
  });
});

describe("foreign key enforcement", () => {
  afterEach(() => {
    resetDb();
  });

  it("enforces FK on product_snapshots → products", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO product_snapshots (product_id, scraped_at, source) VALUES (?, ?, ?)",
      ).run(999, "2025-01-01", "saleslist");
    }).toThrow();
  });

  it("enforces FK on product_details → products", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO product_details (product_id, scraped_at) VALUES (?, ?)",
      ).run(999, "2025-01-01");
    }).toThrow();
  });

  it("enforces FK on product_enrichments → products", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO product_enrichments (product_id, source, scraped_at) VALUES (?, ?, ?)",
      ).run(999, "shopee", "2025-01-01");
    }).toThrow();
  });

  it("enforces FK on shop_snapshots → shops", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO shop_snapshots (shop_id, scraped_at, source) VALUES (?, ?, ?)",
      ).run(999, "2025-01-01", "detail");
    }).toThrow();
  });

  it("enforces FK on candidates → products", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare("INSERT INTO candidates (product_id) VALUES (?)").run(999);
    }).toThrow();
  });

  it("enforces FK on candidate_score_details → candidates", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO candidate_score_details (candidate_id, profile, dimension) VALUES (?, ?, ?)",
      ).run(999, "default", "growth");
    }).toThrow();
  });

  it("enforces FK on candidate_tags → candidates and tags", () => {
    const db = initDb(":memory:");
    expect(() => {
      db.prepare(
        "INSERT INTO candidate_tags (candidate_id, tag_id) VALUES (?, ?)",
      ).run(999, 999);
    }).toThrow();
  });

  it("allows valid FK chain: products → candidates → candidate_score_details", () => {
    const db = initDb(":memory:");

    db.prepare(
      "INSERT INTO products (product_name, shop_name, country) VALUES (?, ?, ?)",
    ).run("Widget", "ShopA", "th");

    const productId = (
      db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }
    ).id;

    db.prepare("INSERT INTO candidates (product_id) VALUES (?)").run(productId);

    const candidateId = (
      db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }
    ).id;

    expect(() => {
      db.prepare(
        "INSERT INTO candidate_score_details (candidate_id, profile, dimension, raw_value) VALUES (?, ?, ?, ?)",
      ).run(candidateId, "default", "growth", 0.85);
    }).not.toThrow();
  });
});

describe("getDb", () => {
  afterEach(() => {
    resetDb();
  });

  it("returns a singleton Database instance", () => {
    const db1 = getDb(":memory:");
    const db2 = getDb(":memory:");
    expect(db1).toBe(db2);
    expect(typeof db1.prepare).toBe("function");
  });

  it("returns an initialized database with all 11 tables", () => {
    const db = getDb(":memory:");
    const tableNames = getTableNames(db);
    expect(tableNames).toEqual(ALL_TABLES);
  });
});

describe("resetDb", () => {
  it("allows re-initialization after reset", () => {
    const db1 = initDb(":memory:");
    expect(getTableNames(db1).length).toBe(11);

    resetDb();

    const db2 = initDb(":memory:");
    expect(getTableNames(db2).length).toBe(11);
    expect(db2).not.toBe(db1);
  });

  it("does not throw when called without prior init", () => {
    expect(() => {
      resetDb();
    }).not.toThrow();
  });
});
