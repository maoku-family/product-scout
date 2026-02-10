/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import {
  insertCandidate,
  insertCostData,
  insertProducts,
  insertShopeeProduct,
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
