import { Database } from "bun:sqlite";

import { logger } from "@/utils/logger";

const DEFAULT_DB_PATH = "db/product-scout.db";

let dbInstance: Database | null = null;

export function initDb(path: string = DEFAULT_DB_PATH): Database {
  const db = new Database(path);

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // 1. products (modified)
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      product_id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT,
      fastmoss_id TEXT,
      product_name TEXT NOT NULL,
      shop_name TEXT NOT NULL,
      country TEXT NOT NULL,
      category TEXT,
      subcategory TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_name, shop_name, country)
    )
  `);

  // 2. product_snapshots (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS product_snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      scraped_at TEXT NOT NULL,
      source TEXT NOT NULL,
      rank INTEGER,
      units_sold INTEGER,
      sales_amount REAL,
      growth_rate REAL,
      total_units_sold INTEGER,
      total_sales_amount REAL,
      commission_rate REAL,
      creator_count INTEGER,
      video_views INTEGER,
      video_likes INTEGER,
      video_comments INTEGER,
      creator_conversion_rate REAL,
      UNIQUE(product_id, scraped_at, source)
    )
  `);

  // 3. product_details (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS product_details (
      product_id INTEGER PRIMARY KEY REFERENCES products(product_id),
      fastmoss_id TEXT NOT NULL,
      hot_index INTEGER,
      popularity_index INTEGER,
      price REAL,
      price_usd REAL,
      commission_rate REAL,
      rating REAL,
      review_count INTEGER,
      listed_at TEXT,
      stock_status TEXT,
      creator_count INTEGER,
      video_count INTEGER,
      live_count INTEGER,
      channel_video_pct REAL,
      channel_live_pct REAL,
      channel_other_pct REAL,
      voc_positive TEXT,
      voc_negative TEXT,
      similar_product_count INTEGER,
      scraped_at TEXT NOT NULL
    )
  `);

  // 4. product_enrichments (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS product_enrichments (
      enrichment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(product_id),
      source TEXT NOT NULL,
      price REAL,
      sold_count INTEGER,
      rating REAL,
      profit_margin REAL,
      extra TEXT,
      scraped_at TEXT NOT NULL,
      UNIQUE(product_id, source, scraped_at)
    )
  `);

  // 5. shops (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS shops (
      shop_id INTEGER PRIMARY KEY AUTOINCREMENT,
      fastmoss_shop_id TEXT NOT NULL UNIQUE,
      shop_name TEXT NOT NULL,
      country TEXT NOT NULL,
      category TEXT,
      shop_type TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 6. shop_snapshots (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS shop_snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(shop_id),
      scraped_at TEXT NOT NULL,
      source TEXT NOT NULL,
      total_sales INTEGER,
      total_revenue REAL,
      active_products INTEGER,
      listed_products INTEGER,
      creator_count INTEGER,
      rating REAL,
      positive_rate REAL,
      ship_rate_48h REAL,
      national_rank INTEGER,
      category_rank INTEGER,
      sales_growth_rate REAL,
      new_product_sales_ratio REAL,
      UNIQUE(shop_id, scraped_at, source)
    )
  `);

  // 7. candidates (modified)
  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE REFERENCES products(product_id),
      default_score REAL,
      trending_score REAL,
      blue_ocean_score REAL,
      high_margin_score REAL,
      shop_copy_score REAL,
      synced_to_notion INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 8. candidate_score_details (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS candidate_score_details (
      candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id),
      profile TEXT NOT NULL,
      dimension TEXT NOT NULL,
      raw_value REAL,
      normalized_value REAL,
      weight REAL,
      weighted_score REAL,
      PRIMARY KEY (candidate_id, profile, dimension)
    )
  `);

  // 9. tags (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag_type TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      UNIQUE(tag_type, tag_name)
    )
  `);

  // 10. candidate_tags (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS candidate_tags (
      candidate_id INTEGER NOT NULL REFERENCES candidates(candidate_id),
      tag_id INTEGER NOT NULL REFERENCES tags(tag_id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT 'system',
      UNIQUE(candidate_id, tag_id)
    )
  `);

  // 11. scrape_queue (new)
  db.run(`
    CREATE TABLE IF NOT EXISTS scrape_queue (
      queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'pending',
      last_scraped_at TEXT,
      next_scrape_after TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_type, target_id)
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
