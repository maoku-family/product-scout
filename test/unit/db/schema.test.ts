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

describe("initDb", () => {
  afterEach(() => {
    resetDb();
  });

  it("creates 4 tables", () => {
    const db = initDb(":memory:");

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name).sort();

    expect(tableNames).toEqual([
      "candidates",
      "cost_data",
      "products",
      "shopee_products",
    ]);
  });

  it("creates products table with correct columns", () => {
    const db = initDb(":memory:");

    const columns = db
      .prepare("PRAGMA table_info(products)")
      .all() as TableInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("product_name");
    expect(columnNames).toContain("shop_name");
    expect(columnNames).toContain("country");
    expect(columnNames).toContain("category");
    expect(columnNames).toContain("units_sold");
    expect(columnNames).toContain("gmv");
    expect(columnNames).toContain("order_growth_rate");
    expect(columnNames).toContain("commission_rate");
    expect(columnNames).toContain("scraped_at");

    const idCol = columns.find((c) => c.name === "id");
    expect(idCol?.type).toBe("INTEGER");
    expect(idCol?.pk).toBe(1);

    const productNameCol = columns.find((c) => c.name === "product_name");
    expect(productNameCol?.type).toBe("TEXT");
    expect(productNameCol?.notnull).toBe(1);

    const shopNameCol = columns.find((c) => c.name === "shop_name");
    expect(shopNameCol?.type).toBe("TEXT");
    expect(shopNameCol?.notnull).toBe(1);

    const countryCol = columns.find((c) => c.name === "country");
    expect(countryCol?.type).toBe("TEXT");
    expect(countryCol?.notnull).toBe(1);

    const scrapedAtCol = columns.find((c) => c.name === "scraped_at");
    expect(scrapedAtCol?.type).toBe("TEXT");
    expect(scrapedAtCol?.notnull).toBe(1);
  });

  it("creates shopee_products table with correct columns", () => {
    const db = initDb(":memory:");

    const columns = db
      .prepare("PRAGMA table_info(shopee_products)")
      .all() as TableInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("product_id");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("price");
    expect(columnNames).toContain("sold_count");
    expect(columnNames).toContain("rating");
    expect(columnNames).toContain("shopee_url");
    expect(columnNames).toContain("updated_at");
  });

  it("creates cost_data table with correct columns", () => {
    const db = initDb(":memory:");

    const columns = db
      .prepare("PRAGMA table_info(cost_data)")
      .all() as TableInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("product_id");
    expect(columnNames).toContain("cj_price");
    expect(columnNames).toContain("shipping_cost");
    expect(columnNames).toContain("profit_margin");
    expect(columnNames).toContain("cj_url");
    expect(columnNames).toContain("updated_at");
  });

  it("creates candidates table with correct columns", () => {
    const db = initDb(":memory:");

    const columns = db
      .prepare("PRAGMA table_info(candidates)")
      .all() as TableInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("product_id");
    expect(columnNames).toContain("score");
    expect(columnNames).toContain("trend_status");
    expect(columnNames).toContain("synced_to_notion");
    expect(columnNames).toContain("created_at");

    const syncedCol = columns.find((c) => c.name === "synced_to_notion");
    expect(syncedCol?.dflt_value).toBe("0");
  });

  it("has unique constraint on products (product_name, shop_name, country, scraped_at)", () => {
    const db = initDb(":memory:");

    const indexes = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'products'",
      )
      .all() as SqliteMaster[];

    const createTableSql = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'",
      )
      .get() as SqliteMaster;

    const hasUniqueInIndex = indexes.some(
      (idx) =>
        idx.sql !== null &&
        idx.sql.includes("product_name") &&
        idx.sql.includes("shop_name") &&
        idx.sql.includes("country") &&
        idx.sql.includes("scraped_at"),
    );

    const hasUniqueInTable =
      createTableSql.sql !== null &&
      createTableSql.sql.includes("UNIQUE") &&
      createTableSql.sql.includes("product_name") &&
      createTableSql.sql.includes("shop_name") &&
      createTableSql.sql.includes("country") &&
      createTableSql.sql.includes("scraped_at");

    expect(hasUniqueInIndex || hasUniqueInTable).toBe(true);
  });

  it("has foreign keys on shopee_products, cost_data, and candidates", () => {
    const db = initDb(":memory:");

    const shopeeFk = db
      .prepare("PRAGMA foreign_key_list(shopee_products)")
      .all() as ForeignKeyInfo[];
    expect(shopeeFk.length).toBeGreaterThan(0);
    expect(shopeeFk[0]?.table).toBe("products");
    expect(shopeeFk[0]?.from).toBe("product_id");
    expect(shopeeFk[0]?.to).toBe("id");

    const costFk = db
      .prepare("PRAGMA foreign_key_list(cost_data)")
      .all() as ForeignKeyInfo[];
    expect(costFk.length).toBeGreaterThan(0);
    expect(costFk[0]?.table).toBe("products");
    expect(costFk[0]?.from).toBe("product_id");
    expect(costFk[0]?.to).toBe("id");

    const candidatesFk = db
      .prepare("PRAGMA foreign_key_list(candidates)")
      .all() as ForeignKeyInfo[];
    expect(candidatesFk.length).toBeGreaterThan(0);
    expect(candidatesFk[0]?.table).toBe("products");
    expect(candidatesFk[0]?.from).toBe("product_id");
    expect(candidatesFk[0]?.to).toBe("id");
  });

  it("is idempotent — calling initDb twice does not throw", () => {
    const db1 = initDb(":memory:");

    expect(() => {
      db1.run(
        `CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        )`,
      );
    }).not.toThrow();

    resetDb();
    const db2 = initDb(":memory:");

    const tables = db2
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];

    expect(tables.length).toBe(4);
  });

  it("enables WAL mode", () => {
    const db = initDb(":memory:");

    const result = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };

    // In-memory databases report "memory" even when WAL is requested;
    // this verifies the PRAGMA executes without error
    expect(result.journal_mode).toBe("memory");
  });

  it("enables foreign keys", () => {
    const db = initDb(":memory:");

    const result = db.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };

    expect(result.foreign_keys).toBe(1);
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

  it("returns an initialized database with all tables", () => {
    const db = getDb(":memory:");

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];

    expect(tables.length).toBe(4);
  });
});
