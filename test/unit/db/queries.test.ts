/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-non-null-assertion */
import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addCandidateTag,
  dequeueNextTargets,
  enqueueScrapeTarget,
  getTopCandidates,
  getUnsyncedCandidates,
  insertCandidateScoreDetail,
  insertProductEnrichment,
  insertProducts,
  insertProductSnapshot,
  insertShopSnapshot,
  markScrapeStatus,
  markSynced,
  upsertCandidate,
  upsertProduct,
  upsertProductDetail,
  upsertShop,
  upsertTag,
} from "@/db/queries";
import { initDb, resetDb } from "@/db/schema";

// ── Row types for raw SQL verification ──────────────────────────────

type ProductRow = {
  product_id: number;
  canonical_id: string | null;
  fastmoss_id: string | null;
  product_name: string;
  shop_name: string;
  country: string;
  category: string | null;
  subcategory: string | null;
  first_seen_at: string;
};

type SnapshotRow = {
  snapshot_id: number;
  product_id: number;
  scraped_at: string;
  source: string;
  rank: number | null;
  units_sold: number | null;
  sales_amount: number | null;
  growth_rate: number | null;
  total_units_sold: number | null;
  total_sales_amount: number | null;
  commission_rate: number | null;
  creator_count: number | null;
  video_views: number | null;
  video_likes: number | null;
  video_comments: number | null;
  creator_conversion_rate: number | null;
};

type ProductDetailRow = {
  product_id: number;
  fastmoss_id: string;
  hot_index: number | null;
  popularity_index: number | null;
  price: number | null;
  price_usd: number | null;
  commission_rate: number | null;
  rating: number | null;
  review_count: number | null;
  listed_at: string | null;
  stock_status: string | null;
  creator_count: number | null;
  video_count: number | null;
  live_count: number | null;
  channel_video_pct: number | null;
  channel_live_pct: number | null;
  channel_other_pct: number | null;
  voc_positive: string | null;
  voc_negative: string | null;
  similar_product_count: number | null;
  scraped_at: string;
};

type EnrichmentRow = {
  enrichment_id: number;
  product_id: number;
  source: string;
  price: number | null;
  sold_count: number | null;
  rating: number | null;
  profit_margin: number | null;
  extra: string | null;
  scraped_at: string;
};

type ShopRow = {
  shop_id: number;
  fastmoss_shop_id: string;
  shop_name: string;
  country: string;
  category: string | null;
  shop_type: string | null;
  first_seen_at: string;
};

type ShopSnapshotRow = {
  snapshot_id: number;
  shop_id: number;
  scraped_at: string;
  source: string;
  total_sales: number | null;
  total_revenue: number | null;
  active_products: number | null;
  listed_products: number | null;
  creator_count: number | null;
  rating: number | null;
  positive_rate: number | null;
  ship_rate_48h: number | null;
  national_rank: number | null;
  category_rank: number | null;
  sales_growth_rate: number | null;
  new_product_sales_ratio: number | null;
};

type CandidateRow = {
  candidate_id: number;
  product_id: number;
  default_score: number | null;
  trending_score: number | null;
  blue_ocean_score: number | null;
  high_margin_score: number | null;
  shop_copy_score: number | null;
  synced_to_notion: number;
  created_at: string;
};

type ScoreDetailRow = {
  candidate_id: number;
  profile: string;
  dimension: string;
  raw_value: number | null;
  normalized_value: number | null;
  weight: number | null;
  weighted_score: number | null;
};

type TagRow = {
  tag_id: number;
  tag_type: string;
  tag_name: string;
};

type CandidateTagRow = {
  candidate_id: number;
  tag_id: number;
  created_at: string;
  created_by: string;
};

type ScrapeQueueRow = {
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

// ── Helper: seed a product for FK relationships ─────────────────────

function seedProduct(db: Database): number {
  db.prepare(
    `INSERT INTO products (product_name, shop_name, country) VALUES (?, ?, ?)`,
  ).run("Test Product", "Test Shop", "th");
  const row = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };
  return row.id;
}

function seedShop(db: Database): number {
  db.prepare(
    `INSERT INTO shops (fastmoss_shop_id, shop_name, country) VALUES (?, ?, ?)`,
  ).run("shop-fm-001", "Test Shop", "th");
  const row = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };
  return row.id;
}

function seedCandidate(db: Database, productId: number): number {
  db.prepare(
    `INSERT INTO candidates (product_id, default_score) VALUES (?, ?)`,
  ).run(productId, 80);
  const row = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };
  return row.id;
}

function seedTag(db: Database): number {
  db.prepare(`INSERT INTO tags (tag_type, tag_name) VALUES (?, ?)`).run(
    "discovery",
    "trending",
  );
  const row = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };
  return row.id;
}

// =====================================================================
// 1. upsertProduct
// =====================================================================

describe("upsertProduct", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("inserts a new product and returns its product_id", () => {
    const id = upsertProduct(db, {
      canonicalId: "canon-001",
      fastmossId: "fm-001",
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: "beauty",
      subcategory: "skincare",
    });

    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT * FROM products WHERE product_id = ?")
      .get(id) as ProductRow;
    expect(row.product_name).toBe("Widget A");
    expect(row.shop_name).toBe("Shop Alpha");
    expect(row.country).toBe("th");
    expect(row.canonical_id).toBe("canon-001");
    expect(row.fastmoss_id).toBe("fm-001");
    expect(row.category).toBe("beauty");
    expect(row.subcategory).toBe("skincare");
  });

  it("returns existing product_id for duplicate (product_name, shop_name, country)", () => {
    const id1 = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: "beauty",
      subcategory: null,
    });

    const id2 = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: "home",
      subcategory: "kitchen",
    });

    expect(id1).toBe(id2);

    // Should still be only 1 row
    const count = db.prepare("SELECT COUNT(*) as cnt FROM products").get() as {
      cnt: number;
    };
    expect(count.cnt).toBe(1);
  });

  it("allows same product_name + shop_name in different countries", () => {
    const id1 = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: null,
      subcategory: null,
    });

    const id2 = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "id",
      category: null,
      subcategory: null,
    });

    expect(id1).not.toBe(id2);
  });

  it("handles null optional fields", () => {
    const id = upsertProduct(db, {
      productName: "Minimal Product",
      shopName: "Shop",
      country: "vn",
      category: null,
      subcategory: null,
    });

    const row = db
      .prepare("SELECT * FROM products WHERE product_id = ?")
      .get(id) as ProductRow;
    expect(row.canonical_id).toBeNull();
    expect(row.category).toBeNull();
    expect(row.subcategory).toBeNull();
  });
});

// =====================================================================
// 2. insertProductSnapshot
// =====================================================================

describe("insertProductSnapshot", () => {
  let db: Database;
  let productId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    productId = seedProduct(db);
  });

  it("inserts a product snapshot with all fields", () => {
    insertProductSnapshot(db, {
      productId,
      scrapedAt: "2025-01-15",
      source: "saleslist",
      rank: 5,
      unitsSold: 1000,
      salesAmount: 5000.5,
      growthRate: 0.25,
      totalUnitsSold: 10000,
      totalSalesAmount: 50000,
      commissionRate: 0.1,
      creatorCount: 50,
      videoViews: 100000,
      videoLikes: 5000,
      videoComments: 200,
      creatorConversionRate: 0.05,
    });

    const row = db
      .prepare("SELECT * FROM product_snapshots WHERE product_id = ?")
      .get(productId) as SnapshotRow;
    expect(row.source).toBe("saleslist");
    expect(row.rank).toBe(5);
    expect(row.units_sold).toBe(1000);
    expect(row.sales_amount).toBe(5000.5);
    expect(row.growth_rate).toBe(0.25);
    expect(row.creator_count).toBe(50);
  });

  it("skips duplicate (product_id, scraped_at, source)", () => {
    const snapshotData = {
      productId,
      scrapedAt: "2025-01-15",
      source: "saleslist" as const,
      rank: 5,
      unitsSold: 1000,
      salesAmount: 5000,
      growthRate: 0.25,
      totalUnitsSold: null,
      totalSalesAmount: null,
      commissionRate: null,
      creatorCount: null,
      videoViews: null,
      videoLikes: null,
      videoComments: null,
      creatorConversionRate: null,
    };

    insertProductSnapshot(db, snapshotData);
    insertProductSnapshot(db, { ...snapshotData, rank: 99 }); // duplicate, different rank

    const rows = db
      .prepare("SELECT * FROM product_snapshots WHERE product_id = ?")
      .all(productId) as SnapshotRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rank).toBe(5); // original value kept
  });

  it("allows same product with different source or date", () => {
    insertProductSnapshot(db, {
      productId,
      scrapedAt: "2025-01-15",
      source: "saleslist",
      rank: 5,
      unitsSold: 1000,
      salesAmount: 5000,
      growthRate: null,
      totalUnitsSold: null,
      totalSalesAmount: null,
      commissionRate: null,
      creatorCount: null,
      videoViews: null,
      videoLikes: null,
      videoComments: null,
      creatorConversionRate: null,
    });

    insertProductSnapshot(db, {
      productId,
      scrapedAt: "2025-01-15",
      source: "hotlist",
      rank: 3,
      unitsSold: 1200,
      salesAmount: 6000,
      growthRate: null,
      totalUnitsSold: null,
      totalSalesAmount: null,
      commissionRate: null,
      creatorCount: null,
      videoViews: null,
      videoLikes: null,
      videoComments: null,
      creatorConversionRate: null,
    });

    const rows = db
      .prepare("SELECT * FROM product_snapshots WHERE product_id = ?")
      .all(productId) as SnapshotRow[];
    expect(rows).toHaveLength(2);
  });
});

// =====================================================================
// 3. upsertProductDetail
// =====================================================================

describe("upsertProductDetail", () => {
  let db: Database;
  let productId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    productId = seedProduct(db);
  });

  it("inserts product detail for a product", () => {
    upsertProductDetail(db, {
      productId,
      fastmossId: "fm-001",
      hotIndex: 85,
      popularityIndex: 90,
      price: 29.99,
      priceUsd: 0.85,
      commissionRate: 0.1,
      rating: 4.5,
      reviewCount: 200,
      listedAt: "2024-06-01",
      stockStatus: "in_stock",
      creatorCount: 50,
      videoCount: 100,
      liveCount: 10,
      channelVideoPct: 0.7,
      channelLivePct: 0.2,
      channelOtherPct: 0.1,
      vocPositive: "good quality",
      vocNegative: "slow shipping",
      similarProductCount: 15,
      scrapedAt: "2025-01-15",
    });

    const row = db
      .prepare("SELECT * FROM product_details WHERE product_id = ?")
      .get(productId) as ProductDetailRow;
    expect(row.fastmoss_id).toBe("fm-001");
    expect(row.hot_index).toBe(85);
    expect(row.price).toBe(29.99);
    expect(row.rating).toBe(4.5);
    expect(row.voc_positive).toBe("good quality");
  });

  it("replaces existing detail when called again for the same product_id", () => {
    upsertProductDetail(db, {
      productId,
      fastmossId: "fm-001",
      hotIndex: 85,
      popularityIndex: 90,
      price: 29.99,
      priceUsd: null,
      commissionRate: null,
      rating: null,
      reviewCount: null,
      listedAt: null,
      stockStatus: null,
      creatorCount: null,
      videoCount: null,
      liveCount: null,
      channelVideoPct: null,
      channelLivePct: null,
      channelOtherPct: null,
      vocPositive: null,
      vocNegative: null,
      similarProductCount: null,
      scrapedAt: "2025-01-15",
    });

    upsertProductDetail(db, {
      productId,
      fastmossId: "fm-001",
      hotIndex: 95,
      popularityIndex: 92,
      price: 24.99,
      priceUsd: null,
      commissionRate: null,
      rating: null,
      reviewCount: null,
      listedAt: null,
      stockStatus: null,
      creatorCount: null,
      videoCount: null,
      liveCount: null,
      channelVideoPct: null,
      channelLivePct: null,
      channelOtherPct: null,
      vocPositive: null,
      vocNegative: null,
      similarProductCount: null,
      scrapedAt: "2025-01-16",
    });

    const rows = db
      .prepare("SELECT * FROM product_details WHERE product_id = ?")
      .all(productId) as ProductDetailRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hot_index).toBe(95);
    expect(rows[0]?.price).toBe(24.99);
  });
});

// =====================================================================
// 4. insertProductEnrichment
// =====================================================================

describe("insertProductEnrichment", () => {
  let db: Database;
  let productId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    productId = seedProduct(db);
  });

  it("inserts an enrichment record", () => {
    insertProductEnrichment(db, {
      productId,
      source: "shopee",
      price: 15.99,
      soldCount: 500,
      rating: 4.2,
      profitMargin: 0.35,
      extra: '{"url":"https://shopee.co.th/item/123"}',
      scrapedAt: "2025-01-15",
    });

    const row = db
      .prepare("SELECT * FROM product_enrichments WHERE product_id = ?")
      .get(productId) as EnrichmentRow;
    expect(row.source).toBe("shopee");
    expect(row.price).toBe(15.99);
    expect(row.sold_count).toBe(500);
    expect(row.profit_margin).toBe(0.35);
    expect(row.extra).toBe('{"url":"https://shopee.co.th/item/123"}');
  });

  it("skips duplicate (product_id, source, scraped_at)", () => {
    const data = {
      productId,
      source: "shopee" as const,
      price: 15.99,
      soldCount: 500,
      rating: 4.2,
      profitMargin: 0.35,
      extra: null,
      scrapedAt: "2025-01-15",
    };

    insertProductEnrichment(db, data);
    insertProductEnrichment(db, { ...data, price: 12.99 }); // duplicate

    const rows = db
      .prepare("SELECT * FROM product_enrichments WHERE product_id = ?")
      .all(productId) as EnrichmentRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.price).toBe(15.99); // original kept
  });

  it("allows same product with different source or date", () => {
    insertProductEnrichment(db, {
      productId,
      source: "shopee",
      price: 15.99,
      soldCount: null,
      rating: null,
      profitMargin: null,
      extra: null,
      scrapedAt: "2025-01-15",
    });

    insertProductEnrichment(db, {
      productId,
      source: "cj",
      price: 5.0,
      soldCount: null,
      rating: null,
      profitMargin: null,
      extra: null,
      scrapedAt: "2025-01-15",
    });

    const rows = db
      .prepare("SELECT * FROM product_enrichments WHERE product_id = ?")
      .all(productId) as EnrichmentRow[];
    expect(rows).toHaveLength(2);
  });
});

// =====================================================================
// 5. upsertShop
// =====================================================================

describe("upsertShop", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("inserts a new shop and returns its shop_id", () => {
    const id = upsertShop(db, {
      fastmossShopId: "shop-fm-001",
      shopName: "Best Shop",
      country: "th",
      category: "beauty",
      shopType: "local",
    });

    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT * FROM shops WHERE shop_id = ?")
      .get(id) as ShopRow;
    expect(row.fastmoss_shop_id).toBe("shop-fm-001");
    expect(row.shop_name).toBe("Best Shop");
    expect(row.country).toBe("th");
    expect(row.shop_type).toBe("local");
  });

  it("returns existing shop_id for duplicate fastmoss_shop_id", () => {
    const id1 = upsertShop(db, {
      fastmossShopId: "shop-fm-001",
      shopName: "Best Shop",
      country: "th",
      category: "beauty",
      shopType: "local",
    });

    const id2 = upsertShop(db, {
      fastmossShopId: "shop-fm-001",
      shopName: "Different Name",
      country: "id",
      category: "home",
      shopType: "cross-border",
    });

    expect(id1).toBe(id2);

    const count = db.prepare("SELECT COUNT(*) as cnt FROM shops").get() as {
      cnt: number;
    };
    expect(count.cnt).toBe(1);
  });

  it("handles null optional fields", () => {
    const id = upsertShop(db, {
      fastmossShopId: "shop-fm-002",
      shopName: "Minimal Shop",
      country: "vn",
      category: null,
      shopType: null,
    });

    const row = db
      .prepare("SELECT * FROM shops WHERE shop_id = ?")
      .get(id) as ShopRow;
    expect(row.category).toBeNull();
    expect(row.shop_type).toBeNull();
  });
});

// =====================================================================
// 6. insertShopSnapshot
// =====================================================================

describe("insertShopSnapshot", () => {
  let db: Database;
  let shopId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    shopId = seedShop(db);
  });

  it("inserts a shop snapshot with all fields", () => {
    insertShopSnapshot(db, {
      shopId,
      scrapedAt: "2025-01-15",
      source: "tiktok",
      totalSales: 50000,
      totalRevenue: 250000,
      activeProducts: 100,
      listedProducts: 150,
      creatorCount: 30,
      rating: 4.8,
      positiveRate: 0.95,
      shipRate48h: 0.88,
      nationalRank: 50,
      categoryRank: 10,
      salesGrowthRate: 0.3,
      newProductSalesRatio: 0.15,
    });

    const row = db
      .prepare("SELECT * FROM shop_snapshots WHERE shop_id = ?")
      .get(shopId) as ShopSnapshotRow;
    expect(row.source).toBe("tiktok");
    expect(row.total_sales).toBe(50000);
    expect(row.rating).toBe(4.8);
    expect(row.national_rank).toBe(50);
  });

  it("skips duplicate (shop_id, scraped_at, source)", () => {
    const data = {
      shopId,
      scrapedAt: "2025-01-15",
      source: "tiktok" as const,
      totalSales: 50000,
      totalRevenue: 250000,
      activeProducts: null,
      listedProducts: null,
      creatorCount: null,
      rating: null,
      positiveRate: null,
      shipRate48h: null,
      nationalRank: null,
      categoryRank: null,
      salesGrowthRate: null,
      newProductSalesRatio: null,
    };

    insertShopSnapshot(db, data);
    insertShopSnapshot(db, { ...data, totalSales: 99999 }); // duplicate

    const rows = db
      .prepare("SELECT * FROM shop_snapshots WHERE shop_id = ?")
      .all(shopId) as ShopSnapshotRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total_sales).toBe(50000); // original kept
  });
});

// =====================================================================
// 7. upsertCandidate
// =====================================================================

describe("upsertCandidate", () => {
  let db: Database;
  let productId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    productId = seedProduct(db);
  });

  it("inserts a new candidate and returns its candidate_id", () => {
    const id = upsertCandidate(db, {
      productId,
      defaultScore: 85.5,
      trendingScore: 70,
      blueOceanScore: 60,
      highMarginScore: 90,
      shopCopyScore: 40,
    });

    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT * FROM candidates WHERE candidate_id = ?")
      .get(id) as CandidateRow;
    expect(row.product_id).toBe(productId);
    expect(row.default_score).toBe(85.5);
    expect(row.trending_score).toBe(70);
    expect(row.blue_ocean_score).toBe(60);
    expect(row.high_margin_score).toBe(90);
    expect(row.shop_copy_score).toBe(40);
    expect(row.synced_to_notion).toBe(0);
  });

  it("replaces existing candidate for the same product_id (upsert)", () => {
    upsertCandidate(db, {
      productId,
      defaultScore: 70,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });

    const id2 = upsertCandidate(db, {
      productId,
      defaultScore: 95,
      trendingScore: 80,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });

    // Should still be only 1 row (unique on product_id)
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM candidates")
      .get() as { cnt: number };
    expect(count.cnt).toBe(1);

    const row = db
      .prepare("SELECT * FROM candidates WHERE product_id = ?")
      .get(productId) as CandidateRow;
    expect(row.default_score).toBe(95);
    expect(row.trending_score).toBe(80);
    // id2 may differ from id1 due to REPLACE (new AUTOINCREMENT)
    expect(id2).toBeGreaterThan(0);
  });

  it("handles all null scores", () => {
    const id = upsertCandidate(db, {
      productId,
      defaultScore: null,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });

    const row = db
      .prepare("SELECT * FROM candidates WHERE candidate_id = ?")
      .get(id) as CandidateRow;
    expect(row.default_score).toBeNull();
    expect(row.trending_score).toBeNull();
  });
});

// =====================================================================
// 8. insertCandidateScoreDetail
// =====================================================================

describe("insertCandidateScoreDetail", () => {
  let db: Database;
  let candidateId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    const productId = seedProduct(db);
    candidateId = seedCandidate(db, productId);
  });

  it("inserts a score detail row", () => {
    insertCandidateScoreDetail(db, {
      candidateId,
      profile: "default",
      dimension: "growth",
      rawValue: 0.85,
      normalizedValue: 0.9,
      weight: 0.3,
      weightedScore: 0.27,
    });

    const row = db
      .prepare(
        "SELECT * FROM candidate_score_details WHERE candidate_id = ? AND profile = ? AND dimension = ?",
      )
      .get(candidateId, "default", "growth") as ScoreDetailRow;
    expect(row.raw_value).toBe(0.85);
    expect(row.normalized_value).toBe(0.9);
    expect(row.weight).toBe(0.3);
    expect(row.weighted_score).toBe(0.27);
  });

  it("replaces existing row for same (candidate_id, profile, dimension)", () => {
    insertCandidateScoreDetail(db, {
      candidateId,
      profile: "default",
      dimension: "growth",
      rawValue: 0.5,
      normalizedValue: 0.6,
      weight: 0.3,
      weightedScore: 0.18,
    });

    insertCandidateScoreDetail(db, {
      candidateId,
      profile: "default",
      dimension: "growth",
      rawValue: 0.9,
      normalizedValue: 0.95,
      weight: 0.3,
      weightedScore: 0.285,
    });

    const rows = db
      .prepare(
        "SELECT * FROM candidate_score_details WHERE candidate_id = ? AND profile = ? AND dimension = ?",
      )
      .all(candidateId, "default", "growth") as ScoreDetailRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.raw_value).toBe(0.9);
  });

  it("allows different dimensions for the same profile", () => {
    insertCandidateScoreDetail(db, {
      candidateId,
      profile: "default",
      dimension: "growth",
      rawValue: 0.85,
      normalizedValue: 0.9,
      weight: 0.3,
      weightedScore: 0.27,
    });

    insertCandidateScoreDetail(db, {
      candidateId,
      profile: "default",
      dimension: "competition",
      rawValue: 0.6,
      normalizedValue: 0.7,
      weight: 0.2,
      weightedScore: 0.14,
    });

    const rows = db
      .prepare("SELECT * FROM candidate_score_details WHERE candidate_id = ?")
      .all(candidateId) as ScoreDetailRow[];
    expect(rows).toHaveLength(2);
  });
});

// =====================================================================
// 9. upsertTag
// =====================================================================

describe("upsertTag", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("inserts a new tag and returns its tag_id", () => {
    const id = upsertTag(db, {
      tagType: "discovery",
      tagName: "trending",
    });

    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare("SELECT * FROM tags WHERE tag_id = ?")
      .get(id) as TagRow;
    expect(row.tag_type).toBe("discovery");
    expect(row.tag_name).toBe("trending");
  });

  it("returns existing tag_id for duplicate (tag_type, tag_name)", () => {
    const id1 = upsertTag(db, {
      tagType: "discovery",
      tagName: "trending",
    });

    const id2 = upsertTag(db, {
      tagType: "discovery",
      tagName: "trending",
    });

    expect(id1).toBe(id2);

    const count = db.prepare("SELECT COUNT(*) as cnt FROM tags").get() as {
      cnt: number;
    };
    expect(count.cnt).toBe(1);
  });

  it("allows same tag_name with different tag_type", () => {
    const id1 = upsertTag(db, {
      tagType: "discovery",
      tagName: "popular",
    });

    const id2 = upsertTag(db, {
      tagType: "signal",
      tagName: "popular",
    });

    expect(id1).not.toBe(id2);
  });
});

// =====================================================================
// 10. addCandidateTag
// =====================================================================

describe("addCandidateTag", () => {
  let db: Database;
  let candidateId: number;
  let tagId: number;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    const productId = seedProduct(db);
    candidateId = seedCandidate(db, productId);
    tagId = seedTag(db);
  });

  it("links a candidate to a tag", () => {
    addCandidateTag(db, candidateId, tagId);

    const row = db
      .prepare(
        "SELECT * FROM candidate_tags WHERE candidate_id = ? AND tag_id = ?",
      )
      .get(candidateId, tagId) as CandidateTagRow;
    expect(row).toBeDefined();
    expect(row.candidate_id).toBe(candidateId);
    expect(row.tag_id).toBe(tagId);
  });

  it("skips duplicate (candidate_id, tag_id)", () => {
    addCandidateTag(db, candidateId, tagId);
    addCandidateTag(db, candidateId, tagId); // duplicate

    const rows = db
      .prepare(
        "SELECT * FROM candidate_tags WHERE candidate_id = ? AND tag_id = ?",
      )
      .all(candidateId, tagId) as CandidateTagRow[];
    expect(rows).toHaveLength(1);
  });
});

// =====================================================================
// 11. enqueueScrapeTarget
// =====================================================================

describe("enqueueScrapeTarget", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("enqueues a new scrape target", () => {
    enqueueScrapeTarget(db, {
      targetType: "product_detail",
      targetId: "fm-001",
      priority: 3,
    });

    const row = db
      .prepare("SELECT * FROM scrape_queue WHERE target_id = ?")
      .get("fm-001") as ScrapeQueueRow;
    expect(row.target_type).toBe("product_detail");
    expect(row.priority).toBe(3);
    expect(row.status).toBe("pending");
    expect(row.retry_count).toBe(0);
  });

  it("skips duplicate (target_type, target_id)", () => {
    enqueueScrapeTarget(db, {
      targetType: "product_detail",
      targetId: "fm-001",
      priority: 3,
    });

    enqueueScrapeTarget(db, {
      targetType: "product_detail",
      targetId: "fm-001",
      priority: 5,
    });

    const rows = db
      .prepare("SELECT * FROM scrape_queue WHERE target_id = ?")
      .all("fm-001") as ScrapeQueueRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priority).toBe(3); // original kept
  });

  it("allows same target_id with different target_type", () => {
    enqueueScrapeTarget(db, {
      targetType: "product_detail",
      targetId: "fm-001",
      priority: 3,
    });

    enqueueScrapeTarget(db, {
      targetType: "shop_detail",
      targetId: "fm-001",
      priority: 2,
    });

    const rows = db
      .prepare("SELECT * FROM scrape_queue WHERE target_id = ?")
      .all("fm-001") as ScrapeQueueRow[];
    expect(rows).toHaveLength(2);
  });
});

// =====================================================================
// 12. dequeueNextTargets
// =====================================================================

describe("dequeueNextTargets", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("returns top N pending targets ordered by priority DESC, created_at ASC", () => {
    // Insert targets with different priorities
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("product_detail", "fm-001", 1, "pending", "2025-01-15T10:00:00");

    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("product_detail", "fm-002", 3, "pending", "2025-01-15T10:01:00");

    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("product_detail", "fm-003", 3, "pending", "2025-01-15T09:00:00");

    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("product_detail", "fm-004", 2, "pending", "2025-01-15T10:00:00");

    const results = dequeueNextTargets(db, 3);
    expect(results).toHaveLength(3);
    // Priority 3 first, then by created_at ASC
    expect(results[0]?.target_id).toBe("fm-003"); // priority 3, earlier
    expect(results[1]?.target_id).toBe("fm-002"); // priority 3, later
    expect(results[2]?.target_id).toBe("fm-004"); // priority 2
  });

  it("excludes non-pending targets", () => {
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status)
       VALUES (?, ?, ?, ?)`,
    ).run("product_detail", "fm-001", 3, "done");

    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status)
       VALUES (?, ?, ?, ?)`,
    ).run("product_detail", "fm-002", 2, "pending");

    const results = dequeueNextTargets(db, 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.target_id).toBe("fm-002");
  });

  it("returns empty array when no pending targets", () => {
    const results = dequeueNextTargets(db, 10);
    expect(results).toHaveLength(0);
  });
});

// =====================================================================
// 13. markScrapeStatus
// =====================================================================

describe("markScrapeStatus", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    db.prepare(
      `INSERT INTO scrape_queue (target_type, target_id, priority, status)
       VALUES (?, ?, ?, ?)`,
    ).run("product_detail", "fm-001", 3, "pending");
  });

  it("updates status to 'in_progress'", () => {
    markScrapeStatus(db, 1, "in_progress");

    const row = db
      .prepare("SELECT * FROM scrape_queue WHERE queue_id = ?")
      .get(1) as ScrapeQueueRow;
    expect(row.status).toBe("in_progress");
    expect(row.last_scraped_at).toBeNull(); // not done yet
  });

  it("updates status to 'done' and sets last_scraped_at", () => {
    markScrapeStatus(db, 1, "done");

    const row = db
      .prepare("SELECT * FROM scrape_queue WHERE queue_id = ?")
      .get(1) as ScrapeQueueRow;
    expect(row.status).toBe("done");
    expect(row.last_scraped_at).not.toBeNull();
  });

  it("updates status to 'failed'", () => {
    markScrapeStatus(db, 1, "failed");

    const row = db
      .prepare("SELECT * FROM scrape_queue WHERE queue_id = ?")
      .get(1) as ScrapeQueueRow;
    expect(row.status).toBe("failed");
    expect(row.last_scraped_at).toBeNull();
  });
});

// =====================================================================
// 14. getUnsyncedCandidates
// =====================================================================

describe("getUnsyncedCandidates", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("returns candidates where synced_to_notion = 0 with product info", () => {
    const productId = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: "beauty",
      subcategory: null,
    });
    upsertCandidate(db, {
      productId,
      defaultScore: 85,
      trendingScore: 70,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });

    const results = getUnsyncedCandidates(db);
    expect(results).toHaveLength(1);
    expect(results[0]?.product_name).toBe("Widget A");
    expect(results[0]?.default_score).toBe(85);
    expect(results[0]?.trending_score).toBe(70);
  });

  it("excludes already synced candidates", () => {
    const productId = upsertProduct(db, {
      productName: "Widget A",
      shopName: "Shop Alpha",
      country: "th",
      category: null,
      subcategory: null,
    });
    const candidateId = upsertCandidate(db, {
      productId,
      defaultScore: 85,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });
    markSynced(db, candidateId);

    const results = getUnsyncedCandidates(db);
    expect(results).toHaveLength(0);
  });

  it("returns empty array when no candidates exist", () => {
    const results = getUnsyncedCandidates(db);
    expect(results).toHaveLength(0);
  });
});

// =====================================================================
// 15. getTopCandidates
// =====================================================================

describe("getTopCandidates", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");

    // Seed 3 products with candidates of different scores
    const pIds = ["Widget A", "Widget B", "Widget C"].map((name, idx) =>
      upsertProduct(db, {
        productName: name,
        shopName: `Shop ${String(idx)}`,
        country: "th",
        category: "beauty",
        subcategory: null,
      }),
    );

    upsertCandidate(db, {
      productId: pIds[0]!,
      defaultScore: 70,
      trendingScore: 90,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });
    upsertCandidate(db, {
      productId: pIds[1]!,
      defaultScore: 85,
      trendingScore: 60,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });
    upsertCandidate(db, {
      productId: pIds[2]!,
      defaultScore: 55,
      trendingScore: 95,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });
  });

  it("returns top N candidates by default_score DESC (default)", () => {
    const results = getTopCandidates(db, 2);
    expect(results).toHaveLength(2);
    expect(results[0]?.default_score).toBe(85);
    expect(results[1]?.default_score).toBe(70);
  });

  it("returns top N candidates by a specified score column", () => {
    const results = getTopCandidates(db, 2, "trending_score");
    expect(results).toHaveLength(2);
    expect(results[0]?.trending_score).toBe(95);
    expect(results[1]?.trending_score).toBe(90);
  });

  it("includes product info (product_name, shop_name, country)", () => {
    const results = getTopCandidates(db, 1);
    expect(results[0]?.product_name).toBe("Widget B"); // highest default_score
    expect(results[0]?.shop_name).toBe("Shop 1");
    expect(results[0]?.country).toBe("th");
  });

  it("returns empty array when no candidates exist", () => {
    resetDb();
    db = initDb(":memory:");
    const results = getTopCandidates(db, 10);
    expect(results).toHaveLength(0);
  });
});

// =====================================================================
// 16. markSynced
// =====================================================================

describe("markSynced", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("sets synced_to_notion to 1 for the given candidate_id", () => {
    const productId = seedProduct(db);
    const candidateId = seedCandidate(db, productId);

    markSynced(db, candidateId);

    const row = db
      .prepare("SELECT synced_to_notion FROM candidates WHERE candidate_id = ?")
      .get(candidateId) as { synced_to_notion: number };
    expect(row.synced_to_notion).toBe(1);
  });

  it("does not affect other candidates", () => {
    // Create two products and candidates
    const p1 = upsertProduct(db, {
      productName: "P1",
      shopName: "S1",
      country: "th",
      category: null,
      subcategory: null,
    });
    const p2 = upsertProduct(db, {
      productName: "P2",
      shopName: "S2",
      country: "th",
      category: null,
      subcategory: null,
    });

    const c1 = upsertCandidate(db, {
      productId: p1,
      defaultScore: 80,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });
    const c2 = upsertCandidate(db, {
      productId: p2,
      defaultScore: 70,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
    });

    markSynced(db, c1);

    const row = db
      .prepare("SELECT synced_to_notion FROM candidates WHERE candidate_id = ?")
      .get(c2) as { synced_to_notion: number };
    expect(row.synced_to_notion).toBe(0);
  });
});

// =====================================================================
// 17. insertProducts (backward compatibility)
// =====================================================================

describe("insertProducts (backward compatibility)", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("inserts a batch of FastmossProduct and returns count of new products", () => {
    const products = [
      {
        productName: "Product A",
        shopName: "Shop 1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
      {
        productName: "Product B",
        shopName: "Shop 2",
        country: "th",
        category: "home",
        unitsSold: 300,
        gmv: 600,
        orderGrowthRate: 0.3,
        commissionRate: 0.08,
        scrapedAt: "2025-01-01",
      },
    ];

    const count = insertProducts(db, products);
    expect(count).toBe(2);

    // Verify products table
    const rows = db.prepare("SELECT * FROM products").all() as ProductRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.product_name).toBe("Product A");
    expect(rows[1]?.product_name).toBe("Product B");
  });

  it("creates product_snapshots for each product", () => {
    insertProducts(db, [
      {
        productName: "Product A",
        shopName: "Shop 1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
    ]);

    const snapshots = db
      .prepare("SELECT * FROM product_snapshots")
      .all() as SnapshotRow[];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.units_sold).toBe(500);
    expect(snapshots[0]?.sales_amount).toBe(1000);
    expect(snapshots[0]?.growth_rate).toBe(0.5);
    expect(snapshots[0]?.commission_rate).toBe(0.1);
    expect(snapshots[0]?.source).toBe("saleslist");
    expect(snapshots[0]?.scraped_at).toBe("2025-01-01");
  });

  it("silently skips duplicates (same product_name + shop_name + country)", () => {
    const product = {
      productName: "Product A",
      shopName: "Shop 1",
      country: "th",
      category: "beauty",
      unitsSold: 500,
      gmv: 1000,
      orderGrowthRate: 0.5,
      commissionRate: 0.1,
      scrapedAt: "2025-01-01",
    };

    insertProducts(db, [product]);
    const count = insertProducts(db, [product]); // same product, same date

    expect(count).toBe(0);

    // Still only 1 product and 1 snapshot
    const products = db.prepare("SELECT * FROM products").all() as ProductRow[];
    expect(products).toHaveLength(1);
    const snapshots = db
      .prepare("SELECT * FROM product_snapshots")
      .all() as SnapshotRow[];
    expect(snapshots).toHaveLength(1);
  });

  it("adds new snapshot when same product appears on different date", () => {
    insertProducts(db, [
      {
        productName: "Product A",
        shopName: "Shop 1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
    ]);

    const count = insertProducts(db, [
      {
        productName: "Product A",
        shopName: "Shop 1",
        country: "th",
        category: "beauty",
        unitsSold: 600,
        gmv: 1200,
        orderGrowthRate: 0.6,
        commissionRate: 0.1,
        scrapedAt: "2025-01-02",
      },
    ]);

    // Product is not "new" but snapshot is new
    expect(count).toBe(0); // product already existed

    // 1 product, 2 snapshots
    const products = db.prepare("SELECT * FROM products").all() as ProductRow[];
    expect(products).toHaveLength(1);
    const snapshots = db
      .prepare("SELECT * FROM product_snapshots")
      .all() as SnapshotRow[];
    expect(snapshots).toHaveLength(2);
  });
});
