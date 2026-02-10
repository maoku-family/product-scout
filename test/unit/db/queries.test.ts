/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getLatestProducts,
  getTopCandidates,
  getUnsyncedCandidates,
  insertCandidate,
  insertCostData,
  insertProducts,
  insertShopeeProduct,
  markSynced,
} from "@/db/queries";
import { initDb, resetDb } from "@/db/schema";

type ShopeeRow = {
  id: number;
  product_id: number;
  title: string;
  price: number;
  sold_count: number;
  rating: number;
  shopee_url: string;
  updated_at: string;
};

type CostRow = {
  id: number;
  product_id: number;
  cj_price: number;
  shipping_cost: number;
  profit_margin: number;
  cj_url: string;
  updated_at: string;
};

type CandidateRow = {
  id: number;
  product_id: number;
  score: number;
  trend_status: string;
  synced_to_notion: number;
  created_at: string;
};

describe("insertProducts", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
  });

  it("inserts a batch of products and returns count", () => {
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
  });

  it("silently skips duplicates (same name + shop + country + date)", () => {
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
    const count = insertProducts(db, [product]); // duplicate

    expect(count).toBe(0);
  });
});

describe("insertShopeeProduct", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    // Insert a product first to get a valid product_id
    db.prepare(
      `INSERT INTO products (product_name, shop_name, country, scraped_at) VALUES (?, ?, ?, ?)`,
    ).run("Test", "Shop", "th", "2025-01-01");
  });

  it("inserts a shopee product linked to a product", () => {
    insertShopeeProduct(db, 1, {
      title: "Shopee Product",
      price: 15.99,
      soldCount: 200,
      rating: 4.5,
      shopeeUrl: "https://shopee.co.th/item/123",
      updatedAt: "2025-01-01",
    });

    const row = db
      .prepare("SELECT * FROM shopee_products WHERE product_id = ?")
      .get(1) as ShopeeRow | undefined;
    expect(row).toBeDefined();
    expect(row?.title).toBe("Shopee Product");
    expect(row?.price).toBe(15.99);
    expect(row?.sold_count).toBe(200);
    expect(row?.rating).toBe(4.5);
    expect(row?.shopee_url).toBe("https://shopee.co.th/item/123");
  });
});

describe("insertCostData", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    db.prepare(
      `INSERT INTO products (product_name, shop_name, country, scraped_at) VALUES (?, ?, ?, ?)`,
    ).run("Test", "Shop", "th", "2025-01-01");
  });

  it("inserts cost data linked to a product", () => {
    insertCostData(db, 1, {
      cjPrice: 5.0,
      shippingCost: 2.5,
      profitMargin: 0.45,
      cjUrl: "https://cjdropshipping.com/product/123",
      updatedAt: "2025-01-01",
    });

    const row = db
      .prepare("SELECT * FROM cost_data WHERE product_id = ?")
      .get(1) as CostRow | undefined;
    expect(row).toBeDefined();
    expect(row?.cj_price).toBe(5.0);
    expect(row?.shipping_cost).toBe(2.5);
    expect(row?.profit_margin).toBe(0.45);
    expect(row?.cj_url).toBe("https://cjdropshipping.com/product/123");
  });
});

describe("insertCandidate", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    db.prepare(
      `INSERT INTO products (product_name, shop_name, country, scraped_at) VALUES (?, ?, ?, ?)`,
    ).run("Test", "Shop", "th", "2025-01-01");
  });

  it("inserts a candidate linked to a product", () => {
    insertCandidate(db, 1, {
      score: 85.5,
      trendStatus: "rising",
      createdAt: "2025-01-01",
    });

    const row = db
      .prepare("SELECT * FROM candidates WHERE product_id = ?")
      .get(1) as CandidateRow | undefined;
    expect(row).toBeDefined();
    expect(row?.score).toBe(85.5);
    expect(row?.trend_status).toBe("rising");
    expect(row?.synced_to_notion).toBe(0);
  });

  it("appends multiple candidates for the same product_id", () => {
    insertCandidate(db, 1, {
      score: 70.0,
      trendStatus: "stable",
      createdAt: "2025-01-01",
    });
    insertCandidate(db, 1, {
      score: 85.5,
      trendStatus: "rising",
      createdAt: "2025-01-02",
    });

    const rows = db
      .prepare("SELECT * FROM candidates WHERE product_id = ?")
      .all(1) as CandidateRow[];
    // No unique constraint on product_id in candidates — both should exist
    expect(rows.length).toBe(2);
  });
});

describe("getLatestProducts", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    // Insert products for two dates
    const old = [
      {
        productName: "A",
        shopName: "S1",
        country: "th",
        category: "beauty",
        unitsSold: 100,
        gmv: 200,
        orderGrowthRate: 0.1,
        commissionRate: 0.05,
        scrapedAt: "2025-01-01",
      },
    ];
    const recent = [
      {
        productName: "B",
        shopName: "S2",
        country: "th",
        category: "home",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-02",
      },
      {
        productName: "C",
        shopName: "S3",
        country: "id",
        category: "beauty",
        unitsSold: 300,
        gmv: 600,
        orderGrowthRate: 0.3,
        commissionRate: 0.08,
        scrapedAt: "2025-01-02",
      },
    ];
    insertProducts(db, old);
    insertProducts(db, recent);
  });

  it("returns only products with the latest scraped_at for a given region", () => {
    const results = getLatestProducts(db, "th");
    expect(results).toHaveLength(1);
    expect((results[0] as any).product_name).toBe("B");
  });

  it("returns empty array for a region with no data", () => {
    const results = getLatestProducts(db, "vn");
    expect(results).toHaveLength(0);
  });
});

describe("getUnsyncedCandidates", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    insertProducts(db, [
      {
        productName: "A",
        shopName: "S1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
    ]);
    insertCandidate(db, 1, {
      score: 85,
      trendStatus: "rising",
      createdAt: "2025-01-01",
    });
  });

  it("returns candidates with synced_to_notion = 0", () => {
    const results = getUnsyncedCandidates(db);
    expect(results).toHaveLength(1);
    expect((results[0] as any).score).toBe(85);
  });

  it("excludes already synced candidates", () => {
    markSynced(db, 1);
    const results = getUnsyncedCandidates(db);
    expect(results).toHaveLength(0);
  });
});

describe("getTopCandidates", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    insertProducts(db, [
      {
        productName: "A",
        shopName: "S1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
      {
        productName: "B",
        shopName: "S2",
        country: "th",
        category: "home",
        unitsSold: 300,
        gmv: 600,
        orderGrowthRate: 0.3,
        commissionRate: 0.08,
        scrapedAt: "2025-01-01",
      },
      {
        productName: "C",
        shopName: "S3",
        country: "th",
        category: "sports",
        unitsSold: 800,
        gmv: 1500,
        orderGrowthRate: 0.8,
        commissionRate: 0.12,
        scrapedAt: "2025-01-01",
      },
    ]);
    insertCandidate(db, 1, {
      score: 70,
      trendStatus: "stable",
      createdAt: "2025-01-01",
    });
    insertCandidate(db, 2, {
      score: 85,
      trendStatus: "rising",
      createdAt: "2025-01-01",
    });
    insertCandidate(db, 3, {
      score: 55,
      trendStatus: "declining",
      createdAt: "2025-01-01",
    });
  });

  it("returns top N candidates by score descending", () => {
    const results = getTopCandidates(db, 2);
    expect(results).toHaveLength(2);
    expect((results[0] as any).score).toBe(85);
    expect((results[1] as any).score).toBe(70);
  });
});

describe("markSynced", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    insertProducts(db, [
      {
        productName: "A",
        shopName: "S1",
        country: "th",
        category: "beauty",
        unitsSold: 500,
        gmv: 1000,
        orderGrowthRate: 0.5,
        commissionRate: 0.1,
        scrapedAt: "2025-01-01",
      },
    ]);
    insertCandidate(db, 1, {
      score: 85,
      trendStatus: "rising",
      createdAt: "2025-01-01",
    });
  });

  it("sets synced_to_notion to 1 for the given candidate id", () => {
    markSynced(db, 1);
    const row = db
      .prepare("SELECT synced_to_notion FROM candidates WHERE id = ?")
      .get(1) as any;
    expect(row.synced_to_notion).toBe(1);
  });
});
