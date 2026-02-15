import { describe, expect, it } from "vitest";

import {
  FastmossProductSchema,
  ProductDetailSchema,
  ProductSchema,
  ProductSnapshotSchema,
} from "@/schemas/product";

// ── FastmossProductSchema (backward compat) ─────────────────────────

const validFastmossProduct = {
  productName: "Vitamin C Serum 30ml",
  shopName: "BeautyShop",
  country: "TH",
  category: "Beauty",
  unitsSold: 1500,
  gmv: 45000.5,
  orderGrowthRate: 0.25,
  commissionRate: 0.1,
  scrapedAt: "2024-01-15",
};

describe("FastmossProductSchema", () => {
  it("parses a valid product", () => {
    const result = FastmossProductSchema.safeParse(validFastmossProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validFastmossProduct);
    }
  });

  it("rejects when productName is missing", () => {
    const result = FastmossProductSchema.safeParse({
      shopName: validFastmossProduct.shopName,
      country: validFastmossProduct.country,
      category: validFastmossProduct.category,
      unitsSold: validFastmossProduct.unitsSold,
      gmv: validFastmossProduct.gmv,
      orderGrowthRate: validFastmossProduct.orderGrowthRate,
      commissionRate: validFastmossProduct.commissionRate,
      scrapedAt: validFastmossProduct.scrapedAt,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative unitsSold", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      unitsSold: -1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts zero unitsSold", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      unitsSold: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative gmv", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      gmv: -100,
    });

    expect(result.success).toBe(false);
  });

  it("accepts negative orderGrowthRate", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      orderGrowthRate: -0.35,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderGrowthRate).toBe(-0.35);
    }
  });

  it("rejects commissionRate above 1", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      commissionRate: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects commissionRate below 0", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      commissionRate: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts null category", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      category: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeNull();
    }
  });

  it("validates scrapedAt as YYYY-MM-DD format", () => {
    const result = FastmossProductSchema.safeParse({
      ...validFastmossProduct,
      scrapedAt: "2024-01-15",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid scrapedAt format", () => {
    const invalidDates = [
      "01-15-2024",
      "2024/01/15",
      "2024-1-5",
      "not-a-date",
      "20240115",
    ];

    for (const date of invalidDates) {
      const result = FastmossProductSchema.safeParse({
        ...validFastmossProduct,
        scrapedAt: date,
      });

      expect(result.success).toBe(false);
    }
  });
});

// ── ProductSchema ───────────────────────────────────────────────────

const validProduct = {
  canonicalId: "vit-c-serum-beautyshop-th",
  fastmossId: "fm_12345",
  productName: "Vitamin C Serum 30ml",
  shopName: "BeautyShop",
  country: "TH",
  category: "Beauty",
  subcategory: "Skincare",
  firstSeenAt: "2024-01-15T10:30:00",
};

describe("ProductSchema", () => {
  it("parses valid product data", () => {
    const result = ProductSchema.safeParse(validProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productName).toBe("Vitamin C Serum 30ml");
      expect(result.data.shopName).toBe("BeautyShop");
      expect(result.data.country).toBe("TH");
    }
  });

  it("rejects when productName is missing", () => {
    const { productName: productNameOmitted, ...without } = validProduct;
    const result = ProductSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when shopName is missing", () => {
    const { shopName: shopNameOmitted, ...without } = validProduct;
    const result = ProductSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when country is missing", () => {
    const { country: countryOmitted, ...without } = validProduct;
    const result = ProductSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("allows nullable canonicalId", () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      canonicalId: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canonicalId).toBeNull();
    }
  });

  it("allows nullable fastmossId", () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      fastmossId: null,
    });

    expect(result.success).toBe(true);
  });

  it("allows nullable category and subcategory", () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      category: null,
      subcategory: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeNull();
      expect(result.data.subcategory).toBeNull();
    }
  });

  it("requires firstSeenAt as a string", () => {
    const result = ProductSchema.safeParse({
      ...validProduct,
      firstSeenAt: "2024-01-15T10:30:00",
    });

    expect(result.success).toBe(true);
  });
});

// ── ProductSnapshotSchema ───────────────────────────────────────────

const validSnapshot = {
  productId: 1,
  scrapedAt: "2024-01-15T10:30:00",
  source: "saleslist" as const,
  rank: 5,
  unitsSold: 1500,
  salesAmount: 45000.5,
  growthRate: 0.25,
  totalUnitsSold: 50000,
  totalSalesAmount: 1500000.0,
  commissionRate: 0.1,
  creatorCount: 50,
  videoViews: 100000,
  videoLikes: 5000,
  videoComments: 200,
  creatorConversionRate: 0.05,
};

describe("ProductSnapshotSchema", () => {
  it("parses valid snapshot data", () => {
    const result = ProductSnapshotSchema.safeParse(validSnapshot);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe(1);
      expect(result.data.source).toBe("saleslist");
      expect(result.data.unitsSold).toBe(1500);
    }
  });

  it("rejects when productId is missing", () => {
    const { productId: productIdOmitted, ...without } = validSnapshot;
    const result = ProductSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when scrapedAt is missing", () => {
    const { scrapedAt: scrapedAtOmitted, ...without } = validSnapshot;
    const result = ProductSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when source is missing", () => {
    const { source: sourceOmitted, ...without } = validSnapshot;
    const result = ProductSnapshotSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects invalid source value", () => {
    const result = ProductSnapshotSchema.safeParse({
      ...validSnapshot,
      source: "invalidSource",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid source values", () => {
    const sources = [
      "saleslist",
      "newProducts",
      "hotlist",
      "hotvideo",
      "search",
    ] as const;

    for (const source of sources) {
      const result = ProductSnapshotSchema.safeParse({
        ...validSnapshot,
        source,
      });

      expect(result.success).toBe(true);
    }
  });

  it("allows nullable optional fields", () => {
    const result = ProductSnapshotSchema.safeParse({
      productId: 1,
      scrapedAt: "2024-01-15T10:30:00",
      source: "saleslist",
      rank: null,
      unitsSold: null,
      salesAmount: null,
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

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rank).toBeNull();
      expect(result.data.unitsSold).toBeNull();
    }
  });

  it("rejects negative unitsSold", () => {
    const result = ProductSnapshotSchema.safeParse({
      ...validSnapshot,
      unitsSold: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects commissionRate above 1", () => {
    const result = ProductSnapshotSchema.safeParse({
      ...validSnapshot,
      commissionRate: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer productId", () => {
    const result = ProductSnapshotSchema.safeParse({
      ...validSnapshot,
      productId: 1.5,
    });

    expect(result.success).toBe(false);
  });
});

// ── ProductDetailSchema ─────────────────────────────────────────────

const validDetail = {
  productId: 1,
  fastmossId: "fm_12345",
  hotIndex: 85,
  popularityIndex: 90,
  price: 299.0,
  priceUsd: 8.5,
  commissionRate: 0.1,
  rating: 4.8,
  reviewCount: 1200,
  listedAt: "2024-01-01T00:00:00",
  stockStatus: "in_stock",
  creatorCount: 50,
  videoCount: 200,
  liveCount: 30,
  channelVideoPct: 0.6,
  channelLivePct: 0.3,
  channelOtherPct: 0.1,
  vocPositive: '["good quality","fast delivery"]',
  vocNegative: '["small size"]',
  similarProductCount: 15,
  scrapedAt: "2024-01-15T10:30:00",
};

describe("ProductDetailSchema", () => {
  it("parses valid detail data", () => {
    const result = ProductDetailSchema.safeParse(validDetail);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe(1);
      expect(result.data.fastmossId).toBe("fm_12345");
      expect(result.data.price).toBe(299.0);
    }
  });

  it("rejects when productId is missing", () => {
    const { productId: productIdOmitted, ...without } = validDetail;
    const result = ProductDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when fastmossId is missing", () => {
    const { fastmossId: fastmossIdOmitted, ...without } = validDetail;
    const result = ProductDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when scrapedAt is missing", () => {
    const { scrapedAt: scrapedAtOmitted, ...without } = validDetail;
    const result = ProductDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("allows nullable optional fields", () => {
    const result = ProductDetailSchema.safeParse({
      productId: 1,
      fastmossId: "fm_12345",
      hotIndex: null,
      popularityIndex: null,
      price: null,
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
      scrapedAt: "2024-01-15T10:30:00",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hotIndex).toBeNull();
      expect(result.data.vocPositive).toBeNull();
    }
  });

  it("rejects rating above 5", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      rating: 5.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating below 0", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      rating: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects commissionRate above 1", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      commissionRate: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      price: -10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative reviewCount", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      reviewCount: -1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts channel percentages as 0-1 range", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      channelVideoPct: 0.0,
      channelLivePct: 1.0,
      channelOtherPct: 0.0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects channel percentage above 1", () => {
    const result = ProductDetailSchema.safeParse({
      ...validDetail,
      channelVideoPct: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("stores voc fields as JSON strings", () => {
    const result = ProductDetailSchema.safeParse(validDetail);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.vocPositive).toBe("string");
      expect(typeof result.data.vocNegative).toBe("string");
    }
  });
});
