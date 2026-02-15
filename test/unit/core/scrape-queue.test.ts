/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-non-null-assertion */
import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { buildScrapeQueue, consumeQuota } from "@/core/scrape-queue";
import { initDb, resetDb } from "@/db/schema";

type ScrapeQueueRow = {
  queue_id: number;
  target_type: string;
  target_id: string;
  priority: number;
  status: string;
  last_scraped_at: string | null;
  retry_count: number;
};

const defaultFreshness = { detailRefreshDays: 7, searchRefreshDays: 30 };

/**
 * Helper: insert a product row, returns product_id.
 */
function insertProduct(
  db: Database,
  overrides: {
    productName?: string;
    shopName?: string;
    country?: string;
    fastmossId?: string;
  } = {},
): number {
  const name = overrides.productName ?? "Test Product";
  const shop = overrides.shopName ?? "Test Shop";
  const country = overrides.country ?? "th";
  const fmId = overrides.fastmossId ?? "fm_001";

  db.prepare(
    `INSERT INTO products (fastmoss_id, product_name, shop_name, country)
     VALUES (?, ?, ?, ?)`,
  ).run(fmId, name, shop, country);

  const row = db
    .prepare(
      `SELECT product_id FROM products
       WHERE product_name = ? AND shop_name = ? AND country = ?`,
    )
    .get(name, shop, country) as { product_id: number };

  return row.product_id;
}

/**
 * Helper: insert a product_details row for a given product.
 */
function insertProductDetail(
  db: Database,
  productId: number,
  scrapedAt: string,
): void {
  db.prepare(
    `INSERT INTO product_details (product_id, fastmoss_id, scraped_at)
     VALUES (?, ?, ?)`,
  ).run(productId, `fm_${String(productId)}`, scrapedAt);
}

/**
 * Helper: insert a product_snapshot with today's date (simulates "appeared today").
 */
function insertTodaySnapshot(db: Database, productId: number): void {
  db.prepare(
    `INSERT INTO product_snapshots (product_id, scraped_at, source)
     VALUES (?, datetime('now'), 'saleslist')`,
  ).run(productId);
}

/**
 * Helper: tag a product as "track" via candidate_tags.
 */
function tagAsTrack(db: Database, productId: number): void {
  // Ensure candidate exists
  db.prepare(`INSERT OR IGNORE INTO candidates (product_id) VALUES (?)`).run(
    productId,
  );

  const candidate = db
    .prepare(`SELECT candidate_id FROM candidates WHERE product_id = ?`)
    .get(productId) as { candidate_id: number };

  // Ensure "track" tag exists
  db.prepare(
    `INSERT OR IGNORE INTO tags (tag_type, tag_name) VALUES ('manual', 'track')`,
  ).run();

  const tag = db
    .prepare(
      `SELECT tag_id FROM tags WHERE tag_type = 'manual' AND tag_name = 'track'`,
    )
    .get() as { tag_id: number };

  db.prepare(
    `INSERT OR IGNORE INTO candidate_tags (candidate_id, tag_id) VALUES (?, ?)`,
  ).run(candidate.candidate_id, tag.tag_id);
}

/**
 * Helper: get all scrape_queue rows.
 */
function getAllQueueRows(db: Database): ScrapeQueueRow[] {
  return db
    .prepare(`SELECT * FROM scrape_queue ORDER BY priority DESC, queue_id ASC`)
    .all() as ScrapeQueueRow[];
}

/**
 * Helper: get a single scrape_queue row by queue_id.
 */
function getQueueRow(db: Database, queueId: number): ScrapeQueueRow {
  return db
    .prepare(`SELECT * FROM scrape_queue WHERE queue_id = ?`)
    .get(queueId) as ScrapeQueueRow;
}

describe("buildScrapeQueue", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    // Clear scrape_queue before each test
    db.prepare("DELETE FROM scrape_queue").run();
  });

  it("P1: enqueues products with no product_details at priority 3", () => {
    // Product exists in `products` but has NO `product_details` row
    const pid = insertProduct(db, {
      productName: "No Detail Product",
      fastmossId: "fm_p1",
    });

    const count = buildScrapeQueue(db, 10, defaultFreshness);

    expect(count).toBe(1);
    const rows = getAllQueueRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].target_id).toBe(String(pid));
    expect(rows[0].priority).toBe(3);
    expect(rows[0].status).toBe("pending");
  });

  it("P2: enqueues products with stale product_details that reappeared today at priority 2", () => {
    const pid = insertProduct(db, {
      productName: "Stale Product",
      fastmossId: "fm_p2",
    });
    // scraped_at is 30 days ago → stale (freshness = 7 days)
    insertProductDetail(db, pid, "2020-01-01T00:00:00");
    // Product reappeared today
    insertTodaySnapshot(db, pid);

    const count = buildScrapeQueue(db, 10, defaultFreshness);

    expect(count).toBeGreaterThanOrEqual(1);
    const rows = getAllQueueRows(db);
    const p2Row = rows.find((r) => r.target_id === String(pid));
    expect(p2Row).toBeDefined();
    expect(p2Row!.priority).toBe(2);
  });

  it("does NOT enqueue products with fresh product_details", () => {
    const pid = insertProduct(db, {
      productName: "Fresh Product",
      fastmossId: "fm_fresh",
    });
    // scraped_at is now → fresh
    insertProductDetail(db, pid, new Date().toISOString());
    insertTodaySnapshot(db, pid);

    const count = buildScrapeQueue(db, 10, defaultFreshness);

    // Should NOT include this product (it's fresh)
    const rows = getAllQueueRows(db);
    const freshRow = rows.find((r) => r.target_id === String(pid));
    expect(freshRow).toBeUndefined();
    expect(count).toBe(0);
  });

  it("respects budget limit", () => {
    // Create 5 products with no details
    for (let i = 0; i < 5; i++) {
      insertProduct(db, {
        productName: `Product ${String(i)}`,
        shopName: `Shop ${String(i)}`,
        fastmossId: `fm_budget_${String(i)}`,
      });
    }

    const count = buildScrapeQueue(db, 3, defaultFreshness);

    expect(count).toBe(3);
    const rows = getAllQueueRows(db);
    expect(rows).toHaveLength(3);
  });

  it("P3: enqueues manually tracked products at priority 1", () => {
    const pid = insertProduct(db, {
      productName: "Tracked Product",
      fastmossId: "fm_tracked",
    });
    // Has fresh detail → would not be P1 or P2
    insertProductDetail(db, pid, new Date().toISOString());
    // Tagged as "track"
    tagAsTrack(db, pid);

    const count = buildScrapeQueue(db, 10, defaultFreshness);

    expect(count).toBeGreaterThanOrEqual(1);
    const rows = getAllQueueRows(db);
    const trackedRow = rows.find((r) => r.target_id === String(pid));
    expect(trackedRow).toBeDefined();
    expect(trackedRow!.priority).toBe(1);
  });

  it("orders queue by priority: P1 > P2 > P3", () => {
    // P1: no detail
    const p1 = insertProduct(db, {
      productName: "P1 Product",
      shopName: "Shop A",
      fastmossId: "fm_order_p1",
    });

    // P2: stale detail + appeared today
    const p2 = insertProduct(db, {
      productName: "P2 Product",
      shopName: "Shop B",
      fastmossId: "fm_order_p2",
    });
    insertProductDetail(db, p2, "2020-01-01T00:00:00");
    insertTodaySnapshot(db, p2);

    // P3: tracked with fresh detail
    const p3 = insertProduct(db, {
      productName: "P3 Product",
      shopName: "Shop C",
      fastmossId: "fm_order_p3",
    });
    insertProductDetail(db, p3, new Date().toISOString());
    tagAsTrack(db, p3);

    buildScrapeQueue(db, 10, defaultFreshness);

    const rows = getAllQueueRows(db);
    expect(rows.length).toBe(3);
    // P1 (priority 3) should be first
    expect(rows[0].target_id).toBe(String(p1));
    expect(rows[0].priority).toBe(3);
    // P2 (priority 2) should be second
    expect(rows[1].target_id).toBe(String(p2));
    expect(rows[1].priority).toBe(2);
    // P3 (priority 1) should be last
    expect(rows[2].target_id).toBe(String(p3));
    expect(rows[2].priority).toBe(1);
  });
});

describe("consumeQuota", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    db.prepare("DELETE FROM scrape_queue").run();
  });

  it("marks queue item as done and sets last_scraped_at", () => {
    // Insert a pending queue item directly
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, retry_count)
       VALUES ('product_detail', '1', 3, 'pending', 0)`,
    ).run();
    const row = db
      .prepare("SELECT queue_id FROM scrape_queue WHERE target_id = '1'")
      .get() as { queue_id: number };

    consumeQuota(db, row.queue_id, "done");

    const updated = getQueueRow(db, row.queue_id);
    expect(updated.status).toBe("done");
    expect(updated.last_scraped_at).not.toBeNull();
  });

  it("increments retry_count on failure and keeps pending when retry < 3", () => {
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, retry_count)
       VALUES ('product_detail', '2', 3, 'pending', 0)`,
    ).run();
    const row = db
      .prepare("SELECT queue_id FROM scrape_queue WHERE target_id = '2'")
      .get() as { queue_id: number };

    consumeQuota(db, row.queue_id, "failed");

    const updated = getQueueRow(db, row.queue_id);
    expect(updated.retry_count).toBe(1);
    expect(updated.status).toBe("pending");
  });

  it("sets status to failed when retry_count reaches 3", () => {
    // Insert with retry_count already at 2
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, retry_count)
       VALUES ('product_detail', '3', 3, 'pending', 2)`,
    ).run();
    const row = db
      .prepare("SELECT queue_id FROM scrape_queue WHERE target_id = '3'")
      .get() as { queue_id: number };

    consumeQuota(db, row.queue_id, "failed");

    const updated = getQueueRow(db, row.queue_id);
    expect(updated.retry_count).toBe(3);
    expect(updated.status).toBe("failed");
  });
});
