import { describe, expect, it } from "vitest";

import {
  transformShopDetailData,
  transformShopProductRows,
} from "@/scrapers/fastmoss/shop-detail";
import type {
  RawShopDetailData,
  RawShopProductRow,
} from "@/scrapers/fastmoss/shop-detail";

describe("transformShopDetailData", () => {
  const sampleDetail: RawShopDetailData = {
    fastmossShopId: "abc123",
    shopName: "MS.Bra",
    category: "女装与女士内衣",
    shopType: "本土店",
    totalSales: "2386.29万",
    totalRevenue: "฿9.00亿",
    activeProducts: "886",
    listedProducts: "886",
    creatorCount: "11.60万",
    rating: "4.6",
    positiveRate: "100%",
    shipRate48h: "81%",
    nationalRank: "135",
    categoryRank: "12",
  };

  it("transforms raw detail data into Shop + ShopSnapshot", () => {
    const result = transformShopDetailData(sampleDetail, "th", "2025-01-15");

    expect(result).not.toBeNull();

    // Shop fields
    expect(result?.shop.fastmossShopId).toBe("abc123");
    expect(result?.shop.shopName).toBe("MS.Bra");
    expect(result?.shop.country).toBe("th");
    expect(result?.shop.category).toBe("女装与女士内衣");
    expect(result?.shop.shopType).toBe("local");
    expect(result?.shop.firstSeenAt).toBe("2025-01-15");

    // Snapshot fields
    expect(result?.snapshot.scrapedAt).toBe("2025-01-15");
    expect(result?.snapshot.source).toBe("search");
    expect(result?.snapshot.totalSales).toBe(23862900);
    expect(result?.snapshot.totalRevenue).toBe(900000000);
    expect(result?.snapshot.activeProducts).toBe(886);
    expect(result?.snapshot.listedProducts).toBe(886);
    expect(result?.snapshot.creatorCount).toBe(116000);
    expect(result?.snapshot.rating).toBeCloseTo(4.6);
    expect(result?.snapshot.positiveRate).toBeCloseTo(1.0);
    expect(result?.snapshot.shipRate48h).toBeCloseTo(0.81);
    expect(result?.snapshot.nationalRank).toBe(135);
    expect(result?.snapshot.categoryRank).toBe(12);
  });

  it("maps '本土店' to 'local' shopType", () => {
    const result = transformShopDetailData(sampleDetail, "th", "2025-01-15");
    expect(result?.shop.shopType).toBe("local");
  });

  it("maps '跨境店' to 'cross-border' shopType", () => {
    const crossBorderDetail: RawShopDetailData = {
      ...sampleDetail,
      shopType: "跨境店",
    };
    const result = transformShopDetailData(
      crossBorderDetail,
      "th",
      "2025-01-15",
    );
    expect(result?.shop.shopType).toBe("cross-border");
  });

  it("maps '品牌' to 'brand' shopType", () => {
    const brandDetail: RawShopDetailData = {
      ...sampleDetail,
      shopType: "品牌",
    };
    const result = transformShopDetailData(brandDetail, "th", "2025-01-15");
    expect(result?.shop.shopType).toBe("brand");
  });

  it("maps unknown shopType to null", () => {
    const unknownDetail: RawShopDetailData = {
      ...sampleDetail,
      shopType: "其他",
    };
    const result = transformShopDetailData(unknownDetail, "th", "2025-01-15");
    expect(result?.shop.shopType).toBeNull();
  });

  it("returns null for empty shopName", () => {
    const emptyName: RawShopDetailData = {
      ...sampleDetail,
      shopName: "",
    };
    const result = transformShopDetailData(emptyName, "th", "2025-01-15");
    expect(result).toBeNull();
  });

  it("handles empty category as null", () => {
    const noCategory: RawShopDetailData = {
      ...sampleDetail,
      category: "",
    };
    const result = transformShopDetailData(noCategory, "th", "2025-01-15");
    expect(result).not.toBeNull();
    expect(result?.shop.category).toBeNull();
  });

  it("parses Chinese number format for sales and revenue", () => {
    const result = transformShopDetailData(sampleDetail, "th", "2025-01-15");
    // 2386.29万 → 23862900
    expect(result?.snapshot.totalSales).toBe(23862900);
    // ฿9.00亿 → 900000000
    expect(result?.snapshot.totalRevenue).toBe(900000000);
    // 11.60万 → 116000
    expect(result?.snapshot.creatorCount).toBe(116000);
  });
});

describe("transformShopProductRows", () => {
  const sampleProductRows: RawShopProductRow[] = [
    {
      productName: "Cotton Bra Set",
      category: "女装与女士内衣",
      listedAt: "2024-03-15",
      commissionRate: "10%",
      sales28d: "2.5万",
      revenue28d: "฿50.00万",
    },
    {
      productName: "Sports Bra",
      category: "运动与户外",
      listedAt: "2024-06-01",
      commissionRate: "8%",
      sales28d: "1200",
      revenue28d: "฿3.60万",
    },
    {
      productName: "Silk Underwear",
      category: "",
      listedAt: "2024-09-10",
      commissionRate: "12%",
      sales28d: "800",
      revenue28d: "฿2.40万",
    },
  ];

  it("transforms raw product rows into FastmossProduct array", () => {
    const products = transformShopProductRows(
      sampleProductRows,
      "th",
      "2025-01-15",
    );

    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("Cotton Bra Set");
    expect(first?.category).toBe("女装与女士内衣");
    expect(first?.commissionRate).toBeCloseTo(0.1);
    expect(first?.unitsSold).toBe(25000);
    expect(first?.gmv).toBe(500000);
    expect(first?.country).toBe("th");
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("handles empty category as null", () => {
    const products = transformShopProductRows(
      sampleProductRows,
      "th",
      "2025-01-15",
    );
    const third = products[2];
    expect(third).toBeDefined();
    expect(third?.category).toBeNull();
  });

  it("returns empty array for empty input", () => {
    const products = transformShopProductRows([], "th", "2025-01-15");
    expect(products).toHaveLength(0);
  });

  it("parses Chinese number format", () => {
    const products = transformShopProductRows(
      sampleProductRows,
      "th",
      "2025-01-15",
    );
    const first = products[0];
    expect(first?.unitsSold).toBe(25000);
    expect(first?.gmv).toBe(500000);
  });

  it("validates with Zod schema", () => {
    const products = transformShopProductRows(
      sampleProductRows,
      "th",
      "2025-01-15",
    );
    for (const product of products) {
      expect(product.productName).toBeTruthy();
      expect(product.commissionRate).toBeGreaterThanOrEqual(0);
      expect(product.commissionRate).toBeLessThanOrEqual(1);
      expect(product.unitsSold).toBeGreaterThanOrEqual(0);
    }
  });

  it("skips rows with invalid data", () => {
    const invalidRows: RawShopProductRow[] = [
      {
        productName: "",
        category: "test",
        listedAt: "2024-01-01",
        commissionRate: "5%",
        sales28d: "100",
        revenue28d: "500",
      },
    ];
    const products = transformShopProductRows(invalidRows, "th", "2025-01-15");
    // Empty productName should be filtered out
    expect(products).toHaveLength(0);
  });
});
