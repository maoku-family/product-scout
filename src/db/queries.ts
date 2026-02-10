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
