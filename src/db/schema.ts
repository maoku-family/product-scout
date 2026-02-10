import { Database } from "bun:sqlite";

import { logger } from "@/utils/logger";

const DEFAULT_DB_PATH = "db/product-scout.db";

let dbInstance: Database | null = null;

export function initDb(path: string = DEFAULT_DB_PATH): Database {
  const db = new Database(path);

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shopee_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      title TEXT,
      price REAL,
      sold_count INTEGER,
      rating REAL,
      shopee_url TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cost_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      cj_price REAL,
      shipping_cost REAL,
      profit_margin REAL,
      cj_url TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      score REAL,
      trend_status TEXT,
      synced_to_notion INTEGER DEFAULT 0,
      created_at TEXT
    )
  `);

  logger.info("Database initialized", { path });

  dbInstance = db;
  return db;
}

export function getDb(path: string = DEFAULT_DB_PATH): Database {
  dbInstance ??= initDb(path);
  return dbInstance;
}

export function resetDb(): void {
  if (dbInstance !== null) {
    dbInstance.close();
    dbInstance = null;
  }
}
