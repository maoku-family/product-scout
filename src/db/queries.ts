/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-non-null-assertion */
import type { Database } from "bun:sqlite";

import type { FastmossProduct } from "@/schemas/product";

// ── Input types ─────────────────────────────────────────────────────

export type UpsertProductInput = {
  canonicalId?: string | null;
  fastmossId?: string | null;
  productName: string;
  shopName: string;
  country: string;
  category: string | null;
  subcategory: string | null;
};

export type InsertProductSnapshotInput = {
  productId: number;
  scrapedAt: string;
  source: string;
  rank: number | null;
  unitsSold: number | null;
  salesAmount: number | null;
  growthRate: number | null;
  totalUnitsSold: number | null;
  totalSalesAmount: number | null;
  commissionRate: number | null;
  creatorCount: number | null;
  videoViews: number | null;
  videoLikes: number | null;
  videoComments: number | null;
  creatorConversionRate: number | null;
};

export type UpsertProductDetailInput = {
  productId: number;
  fastmossId: string;
  hotIndex: number | null;
  popularityIndex: number | null;
  price: number | null;
  priceUsd: number | null;
  commissionRate: number | null;
  rating: number | null;
  reviewCount: number | null;
  listedAt: string | null;
  stockStatus: string | null;
  creatorCount: number | null;
  videoCount: number | null;
  liveCount: number | null;
  channelVideoPct: number | null;
  channelLivePct: number | null;
  channelOtherPct: number | null;
  vocPositive: string | null;
  vocNegative: string | null;
  similarProductCount: number | null;
  scrapedAt: string;
};

export type InsertProductEnrichmentInput = {
  productId: number;
  source: string;
  price: number | null;
  soldCount: number | null;
  rating: number | null;
  profitMargin: number | null;
  extra: string | null;
  scrapedAt: string;
};

export type UpsertShopInput = {
  fastmossShopId: string;
  shopName: string;
  country: string;
  category: string | null;
  shopType: string | null;
};

export type InsertShopSnapshotInput = {
  shopId: number;
  scrapedAt: string;
  source: string;
  totalSales: number | null;
  totalRevenue: number | null;
  activeProducts: number | null;
  listedProducts: number | null;
  creatorCount: number | null;
  rating: number | null;
  positiveRate: number | null;
  shipRate48h: number | null;
  nationalRank: number | null;
  categoryRank: number | null;
  salesGrowthRate: number | null;
  newProductSalesRatio: number | null;
};

export type UpsertCandidateInput = {
  productId: number;
  defaultScore: number | null;
  trendingScore: number | null;
  blueOceanScore: number | null;
  highMarginScore: number | null;
  shopCopyScore: number | null;
};

export type InsertCandidateScoreDetailInput = {
  candidateId: number;
  profile: string;
  dimension: string;
  rawValue: number | null;
  normalizedValue: number | null;
  weight: number | null;
  weightedScore: number | null;
};

export type UpsertTagInput = {
  tagType: string;
  tagName: string;
};

export type EnqueueScrapeTargetInput = {
  targetType: string;
  targetId: string;
  priority: number;
};

// ── Result types for read queries (snake_case to match DB columns) ──

export type CandidateWithProduct = {
  candidate_id: number;
  product_id: number;
  default_score: number | null;
  trending_score: number | null;
  blue_ocean_score: number | null;
  high_margin_score: number | null;
  shop_copy_score: number | null;
  synced_to_notion: number;
  created_at: string;
  product_name: string;
  shop_name: string;
  country: string;
  category: string | null;
};

export type ScrapeQueueRow = {
  queue_id: number;
  target_type: string;
  target_id: string;
  priority: number;
  status: string;
  last_scraped_at: string | null;
  next_scrape_after: string | null;
  retry_count: number;
  created_at: string;
};

// ── Internal row types for SELECT queries ───────────────────────────

type ProductIdRow = { product_id: number };
type ShopIdRow = { shop_id: number };
type CandidateIdRow = { candidate_id: number };
type TagIdRow = { tag_id: number };
type CountRow = { cnt: number };

// ── Allowed sort columns for getTopCandidates ───────────────────────

const ALLOWED_SORT_COLUMNS = new Set([
  "default_score",
  "trending_score",
  "blue_ocean_score",
  "high_margin_score",
  "shop_copy_score",
]);

// =====================================================================
// 1. upsertProduct
// =====================================================================

/**
 * INSERT OR IGNORE into products. Returns product_id (existing or new).
 * UNIQUE constraint: (product_name, shop_name, country)
 */
export function upsertProduct(db: Database, data: UpsertProductInput): number {
  db.prepare(
    `INSERT OR IGNORE INTO products
     (canonical_id, fastmoss_id, product_name, shop_name, country, category, subcategory)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.canonicalId ?? null,
    data.fastmossId ?? null,
    data.productName,
    data.shopName,
    data.country,
    data.category,
    data.subcategory,
  );

  // Retrieve existing or newly inserted product_id
  const row = db
    .prepare(
      `SELECT product_id FROM products
       WHERE product_name = ? AND shop_name = ? AND country = ?`,
    )
    .get(data.productName, data.shopName, data.country) as
    | ProductIdRow
    | undefined;

  return row!.product_id;
}

// =====================================================================
// 2. insertProductSnapshot
// =====================================================================

/**
 * INSERT OR IGNORE into product_snapshots. Skips duplicates on
 * (product_id, scraped_at, source).
 */
export function insertProductSnapshot(
  db: Database,
  data: InsertProductSnapshotInput,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO product_snapshots
     (product_id, scraped_at, source, rank, units_sold, sales_amount,
      growth_rate, total_units_sold, total_sales_amount, commission_rate,
      creator_count, video_views, video_likes, video_comments, creator_conversion_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.productId,
    data.scrapedAt,
    data.source,
    data.rank,
    data.unitsSold,
    data.salesAmount,
    data.growthRate,
    data.totalUnitsSold,
    data.totalSalesAmount,
    data.commissionRate,
    data.creatorCount,
    data.videoViews,
    data.videoLikes,
    data.videoComments,
    data.creatorConversionRate,
  );
}

// =====================================================================
// 3. upsertProductDetail
// =====================================================================

/**
 * INSERT OR REPLACE into product_details. One row per product_id.
 */
export function upsertProductDetail(
  db: Database,
  data: UpsertProductDetailInput,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO product_details
     (product_id, fastmoss_id, hot_index, popularity_index, price, price_usd,
      commission_rate, rating, review_count, listed_at, stock_status,
      creator_count, video_count, live_count, channel_video_pct,
      channel_live_pct, channel_other_pct, voc_positive, voc_negative,
      similar_product_count, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.productId,
    data.fastmossId,
    data.hotIndex,
    data.popularityIndex,
    data.price,
    data.priceUsd,
    data.commissionRate,
    data.rating,
    data.reviewCount,
    data.listedAt,
    data.stockStatus,
    data.creatorCount,
    data.videoCount,
    data.liveCount,
    data.channelVideoPct,
    data.channelLivePct,
    data.channelOtherPct,
    data.vocPositive,
    data.vocNegative,
    data.similarProductCount,
    data.scrapedAt,
  );
}

// =====================================================================
// 4. insertProductEnrichment
// =====================================================================

/**
 * INSERT OR IGNORE into product_enrichments. Skips duplicates on
 * (product_id, source, scraped_at).
 */
export function insertProductEnrichment(
  db: Database,
  data: InsertProductEnrichmentInput,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO product_enrichments
     (product_id, source, price, sold_count, rating, profit_margin, extra, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.productId,
    data.source,
    data.price,
    data.soldCount,
    data.rating,
    data.profitMargin,
    data.extra,
    data.scrapedAt,
  );
}

// =====================================================================
// 5. upsertShop
// =====================================================================

/**
 * INSERT OR IGNORE into shops. Returns shop_id (existing or new).
 * UNIQUE constraint: fastmoss_shop_id
 */
export function upsertShop(db: Database, data: UpsertShopInput): number {
  db.prepare(
    `INSERT OR IGNORE INTO shops
     (fastmoss_shop_id, shop_name, country, category, shop_type)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    data.fastmossShopId,
    data.shopName,
    data.country,
    data.category,
    data.shopType,
  );

  const row = db
    .prepare(`SELECT shop_id FROM shops WHERE fastmoss_shop_id = ?`)
    .get(data.fastmossShopId) as ShopIdRow | undefined;

  return row!.shop_id;
}

// =====================================================================
// 6. insertShopSnapshot
// =====================================================================

/**
 * INSERT OR IGNORE into shop_snapshots. Skips duplicates on
 * (shop_id, scraped_at, source).
 */
export function insertShopSnapshot(
  db: Database,
  data: InsertShopSnapshotInput,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO shop_snapshots
     (shop_id, scraped_at, source, total_sales, total_revenue, active_products,
      listed_products, creator_count, rating, positive_rate, ship_rate_48h,
      national_rank, category_rank, sales_growth_rate, new_product_sales_ratio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.shopId,
    data.scrapedAt,
    data.source,
    data.totalSales,
    data.totalRevenue,
    data.activeProducts,
    data.listedProducts,
    data.creatorCount,
    data.rating,
    data.positiveRate,
    data.shipRate48h,
    data.nationalRank,
    data.categoryRank,
    data.salesGrowthRate,
    data.newProductSalesRatio,
  );
}

// =====================================================================
// 7. upsertCandidate
// =====================================================================

/**
 * INSERT OR REPLACE into candidates. One row per product_id.
 * Returns candidate_id.
 */
export function upsertCandidate(
  db: Database,
  data: UpsertCandidateInput,
): number {
  db.prepare(
    `INSERT OR REPLACE INTO candidates
     (product_id, default_score, trending_score, blue_ocean_score,
      high_margin_score, shop_copy_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    data.productId,
    data.defaultScore,
    data.trendingScore,
    data.blueOceanScore,
    data.highMarginScore,
    data.shopCopyScore,
  );

  const row = db
    .prepare(`SELECT candidate_id FROM candidates WHERE product_id = ?`)
    .get(data.productId) as CandidateIdRow | undefined;

  return row!.candidate_id;
}

// =====================================================================
// 8. insertCandidateScoreDetail
// =====================================================================

/**
 * INSERT OR REPLACE into candidate_score_details. Primary key is
 * (candidate_id, profile, dimension).
 */
export function insertCandidateScoreDetail(
  db: Database,
  data: InsertCandidateScoreDetailInput,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO candidate_score_details
     (candidate_id, profile, dimension, raw_value, normalized_value, weight, weighted_score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.candidateId,
    data.profile,
    data.dimension,
    data.rawValue,
    data.normalizedValue,
    data.weight,
    data.weightedScore,
  );
}

// =====================================================================
// 9. upsertTag
// =====================================================================

/**
 * INSERT OR IGNORE into tags. Returns tag_id (existing or new).
 * UNIQUE constraint: (tag_type, tag_name)
 */
export function upsertTag(db: Database, data: UpsertTagInput): number {
  db.prepare(
    `INSERT OR IGNORE INTO tags (tag_type, tag_name) VALUES (?, ?)`,
  ).run(data.tagType, data.tagName);

  const row = db
    .prepare(`SELECT tag_id FROM tags WHERE tag_type = ? AND tag_name = ?`)
    .get(data.tagType, data.tagName) as TagIdRow | undefined;

  return row!.tag_id;
}

// =====================================================================
// 10. addCandidateTag
// =====================================================================

/**
 * INSERT OR IGNORE into candidate_tags. Links a candidate to a tag.
 */
export function addCandidateTag(
  db: Database,
  candidateId: number,
  tagId: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO candidate_tags (candidate_id, tag_id) VALUES (?, ?)`,
  ).run(candidateId, tagId);
}

// =====================================================================
// 11. enqueueScrapeTarget
// =====================================================================

/**
 * INSERT OR IGNORE into scrape_queue. Skips duplicates on
 * (target_type, target_id).
 */
export function enqueueScrapeTarget(
  db: Database,
  data: EnqueueScrapeTargetInput,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO scrape_queue (target_type, target_id, priority)
     VALUES (?, ?, ?)`,
  ).run(data.targetType, data.targetId, data.priority);
}

// =====================================================================
// 12. dequeueNextTargets
// =====================================================================

/**
 * SELECT top N pending targets ordered by priority DESC, created_at ASC.
 */
export function dequeueNextTargets(
  db: Database,
  limit: number,
): ScrapeQueueRow[] {
  return db
    .prepare(
      `SELECT * FROM scrape_queue
       WHERE status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT ?`,
    )
    .all(limit) as ScrapeQueueRow[];
}

// =====================================================================
// 13. markScrapeStatus
// =====================================================================

/**
 * UPDATE scrape_queue SET status. Sets last_scraped_at when status is 'done'.
 */
export function markScrapeStatus(
  db: Database,
  queueId: number,
  status: string,
): void {
  if (status === "done") {
    db.prepare(
      `UPDATE scrape_queue
       SET status = ?, last_scraped_at = datetime('now')
       WHERE queue_id = ?`,
    ).run(status, queueId);
  } else {
    db.prepare(`UPDATE scrape_queue SET status = ? WHERE queue_id = ?`).run(
      status,
      queueId,
    );
  }
}

// =====================================================================
// 14. getUnsyncedCandidates
// =====================================================================

/**
 * SELECT candidates where synced_to_notion = 0, JOIN products for product info.
 * Includes all multi-strategy scores.
 */
export function getUnsyncedCandidates(db: Database): CandidateWithProduct[] {
  return db
    .prepare(
      `SELECT c.candidate_id, c.product_id, c.default_score, c.trending_score,
              c.blue_ocean_score, c.high_margin_score, c.shop_copy_score,
              c.synced_to_notion, c.created_at,
              p.product_name, p.shop_name, p.country, p.category
       FROM candidates c
       JOIN products p ON c.product_id = p.product_id
       WHERE c.synced_to_notion = 0`,
    )
    .all() as CandidateWithProduct[];
}

// =====================================================================
// 15. getTopCandidates
// =====================================================================

/**
 * SELECT top N candidates ordered by a specific score column
 * (default: default_score DESC), JOIN products.
 */
export function getTopCandidates(
  db: Database,
  limit: number,
  sortBy: string = "default_score",
): CandidateWithProduct[] {
  // Validate sortBy to prevent SQL injection
  const column = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : "default_score";

  return db
    .prepare(
      `SELECT c.candidate_id, c.product_id, c.default_score, c.trending_score,
              c.blue_ocean_score, c.high_margin_score, c.shop_copy_score,
              c.synced_to_notion, c.created_at,
              p.product_name, p.shop_name, p.country, p.category
       FROM candidates c
       JOIN products p ON c.product_id = p.product_id
       ORDER BY c.${column} DESC
       LIMIT ?`,
    )
    .all(limit) as CandidateWithProduct[];
}

// =====================================================================
// 16. markSynced
// =====================================================================

/**
 * UPDATE candidates SET synced_to_notion = 1 WHERE candidate_id = ?
 */
export function markSynced(db: Database, candidateId: number): void {
  db.prepare(
    `UPDATE candidates SET synced_to_notion = 1 WHERE candidate_id = ?`,
  ).run(candidateId);
}

// =====================================================================
// 17. insertProducts (backward compatibility)
// =====================================================================

/**
 * Backward-compatible batch insert. Each FastmossProduct calls
 * upsertProduct + insertProductSnapshot. Returns the count of
 * newly inserted products (not snapshots).
 */
export function insertProducts(
  db: Database,
  products: FastmossProduct[],
): number {
  const countBefore = (db
    .prepare("SELECT COUNT(*) as cnt FROM products")
    .get() as CountRow | undefined)!.cnt;

  for (const p of products) {
    const productId = upsertProduct(db, {
      productName: p.productName,
      shopName: p.shopName,
      country: p.country,
      category: p.category,
      subcategory: null,
    });

    insertProductSnapshot(db, {
      productId,
      scrapedAt: p.scrapedAt,
      source: "saleslist",
      rank: null,
      unitsSold: p.unitsSold,
      salesAmount: p.gmv,
      growthRate: p.orderGrowthRate,
      totalUnitsSold: null,
      totalSalesAmount: null,
      commissionRate: p.commissionRate,
      creatorCount: null,
      videoViews: null,
      videoLikes: null,
      videoComments: null,
      creatorConversionRate: null,
    });
  }

  const countAfter = (db
    .prepare("SELECT COUNT(*) as cnt FROM products")
    .get() as CountRow | undefined)!.cnt;

  return countAfter - countBefore;
}
