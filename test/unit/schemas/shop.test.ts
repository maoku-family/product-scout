import { describe, expect, it } from "vitest";

import { ShopSchema, ShopSnapshotSchema } from "@/schemas/shop";

// ── ShopSchema ──────────────────────────────────────────────────────

const validShop = {
  fastmossShopId: "fms_67890",
  shopName: "BeautyShop Official",
  country: "TH",
  category: "Beauty",
  shopType: "local" as const,
  firstSeenAt: "2024-01-15T10:30:00",
};

describe("ShopSchema", () => {
  it("parses valid shop data", () => {
    const result = ShopSchema.safeParse(validShop);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fastmossShopId).toBe("fms_67890");
      expect(result.data.shopName).toBe("BeautyShop Official");
      expect(result.data.country).toBe("TH");
    }
  });

  it("rejects when fastmossShopId is missing", () => {
    const { fastmossShopId: fastmossShopIdOmitted, ...without } = validShop;
    const result = ShopSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when shopName is missing", () => {
    const { shopName: shopNameOmitted, ...without } = validShop;
    const result = ShopSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when country is missing", () => {
    const { country: countryOmitted, ...without } = validShop;
    const result = ShopSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("allows nullable category", () => {
    const result = ShopSchema.safeParse({
      ...validShop,
      category: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeNull();
    }
  });

  it("allows nullable shopType", () => {
    const result = ShopSchema.safeParse({
      ...validShop,
      shopType: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shopType).toBeNull();
    }
  });

  it("accepts all valid shopType values", () => {
    const types = ["cross-border", "local", "brand"] as const;

    for (const shopType of types) {
      const result = ShopSchema.safeParse({
        ...validShop,
        shopType,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shopType).toBe(shopType);
      }
    }
  });

  it("rejects invalid shopType", () => {
    const result = ShopSchema.safeParse({
      ...validShop,
      shopType: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("requires firstSeenAt as a string", () => {
    const result = ShopSchema.safeParse({
      ...validShop,
      firstSeenAt: "2024-01-15T10:30:00",
    });

    expect(result.success).toBe(true);
  });
});

// ── ShopSnapshotSchema ──────────────────────────────────────────────

const validShopSnapshot = {
  shopId: 1,
  scrapedAt: "2024-01-15T10:30:00",
  source: "tiktok" as const,
  totalSales: 50000,
  totalRevenue: 1500000.0,
  activeProducts: 120,
  listedProducts: 200,
  creatorCount: 80,
  rating: 4.7,
  positiveRate: 0.95,
  shipRate48h: 0.88,
  nationalRank: 150,
  categoryRank: 25,
  salesGrowthRate: 0.15,
  newProductSalesRatio: 0.3,
};

describe("ShopSnapshotSchema", () => {
  it("parses valid snapshot data", () => {
    const result = ShopSnapshotSchema.safeParse(validShopSnapshot);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shopId).toBe(1);
      expect(result.data.source).toBe("tiktok");
      expect(result.data.totalSales).toBe(50000);
    }
  });

  it("rejects when shopId is missing", () => {
    const { shopId: shopIdOmitted, ...without } = validShopSnapshot;
    const result = ShopSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when scrapedAt is missing", () => {
    const { scrapedAt: scrapedAtOmitted, ...without } = validShopSnapshot;
    const result = ShopSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when source is missing", () => {
    const { source: sourceOmitted, ...without } = validShopSnapshot;
    const result = ShopSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects invalid source value", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      source: "invalid",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid source values", () => {
    const sources = ["tiktok", "hotTiktok", "search"] as const;

    for (const source of sources) {
      const result = ShopSnapshotSchema.safeParse({
        ...validShopSnapshot,
        source,
      });

      expect(result.success).toBe(true);
    }
  });

  it("allows nullable optional fields", () => {
    const result = ShopSnapshotSchema.safeParse({
      shopId: 1,
      scrapedAt: "2024-01-15T10:30:00",
      source: "tiktok",
      totalSales: null,
      totalRevenue: null,
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
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalSales).toBeNull();
      expect(result.data.rating).toBeNull();
    }
  });

  it("rejects negative totalSales", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      totalSales: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating above 5", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      rating: 5.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating below 0", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      rating: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects positiveRate above 1", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      positiveRate: 1.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects shipRate48h above 1", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      shipRate48h: 1.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer shopId", () => {
    const result = ShopSnapshotSchema.safeParse({
      ...validShopSnapshot,
      shopId: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
