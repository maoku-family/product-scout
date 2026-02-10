import type { Database } from "bun:sqlite";

import type { FastmossProduct } from "@/schemas/product";

export type ShopeeInsert = {
  title: string;
  price: number;
  soldCount: number;
  rating: number;
  shopeeUrl: string;
  updatedAt: string;
};

export type CostInsert = {
  cjPrice: number;
  shippingCost: number;
  profitMargin: number;
  cjUrl: string;
  updatedAt: string;
};

export type CandidateInsert = {
  score: number;
  trendStatus: string;
  createdAt: string;
};

/**
 * Insert a batch of products. Silently skips duplicates via INSERT OR IGNORE.
 * Returns the number of newly inserted rows.
 */
export function insertProducts(
  db: Database,
  products: FastmossProduct[],
): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO products
    (product_name, shop_name, country, category, units_sold, gmv, order_growth_rate, commission_rate, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const p of products) {
    const result = stmt.run(
      p.productName,
      p.shopName,
      p.country,
      p.category,
      p.unitsSold,
      p.gmv,
      p.orderGrowthRate,
      p.commissionRate,
      p.scrapedAt,
    );
    if ((result as { changes: number }).changes > 0) {
      count += 1;
    }
  }
  return count;
}

/**
 * Insert a Shopee product linked to a product by product_id.
 */
export function insertShopeeProduct(
  db: Database,
  productId: number,
  data: ShopeeInsert,
): void {
  db.prepare(
    `
    INSERT INTO shopee_products
    (product_id, title, price, sold_count, rating, shopee_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    productId,
    data.title,
    data.price,
    data.soldCount,
    data.rating,
    data.shopeeUrl,
    data.updatedAt,
  );
}

/**
 * Insert cost data linked to a product by product_id.
 */
export function insertCostData(
  db: Database,
  productId: number,
  data: CostInsert,
): void {
  db.prepare(
    `
    INSERT INTO cost_data
    (product_id, cj_price, shipping_cost, profit_margin, cj_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    productId,
    data.cjPrice,
    data.shippingCost,
    data.profitMargin,
    data.cjUrl,
    data.updatedAt,
  );
}

/**
 * Insert a candidate linked to a product by product_id.
 * Multiple candidates per product_id are allowed (append model).
 */
export function insertCandidate(
  db: Database,
  productId: number,
  data: CandidateInsert,
): void {
  db.prepare(
    `
    INSERT INTO candidates
    (product_id, score, trend_status, created_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(productId, data.score, data.trendStatus, data.createdAt);
}

/**
 * Get products with the latest scraped_at for a given region.
 */
export function getLatestProducts(db: Database, region: string): unknown[] {
  return db
    .prepare(
      `
    SELECT * FROM products
    WHERE country = ?
    AND scraped_at = (SELECT MAX(scraped_at) FROM products WHERE country = ?)
  `,
    )
    .all(region, region);
}

/**
 * Get candidates not yet synced to Notion, joined with product info.
 */
export function getUnsyncedCandidates(db: Database): unknown[] {
  return db
    .prepare(
      `
    SELECT c.*, p.product_name, p.shop_name, p.country, p.category
    FROM candidates c
    JOIN products p ON c.product_id = p.id
    WHERE c.synced_to_notion = 0
  `,
    )
    .all();
}

/**
 * Get top N candidates by score descending, joined with product info.
 */
export function getTopCandidates(db: Database, limit: number): unknown[] {
  return db
    .prepare(
      `
    SELECT c.*, p.product_name, p.shop_name, p.country, p.category
    FROM candidates c
    JOIN products p ON c.product_id = p.id
    ORDER BY c.score DESC
    LIMIT ?
  `,
    )
    .all(limit);
}

/**
 * Mark a candidate as synced to Notion.
 */
export function markSynced(db: Database, candidateId: number): void {
  db.prepare("UPDATE candidates SET synced_to_notion = 1 WHERE id = ?").run(
    candidateId,
  );
}
