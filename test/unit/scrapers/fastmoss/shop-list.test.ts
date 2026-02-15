import { describe, expect, it } from "vitest";

import { transformShopListRawRows } from "@/scrapers/fastmoss/shop-list";
import type { RawShopListRowData } from "@/scrapers/fastmoss/shop-list";

describe("transformShopListRawRows", () => {
  const sampleSalesRows: RawShopListRowData[] = [
    {
      shopName: "MS.Bra",
      category: "女装与女士内衣",
      rating: "4.6",
      unitsSold: "3.67万",
      salesGrowthRate: "5.17%",
      revenue: "฿120.07万 ($3.45万)",
      revenueGrowthRate: "3.08%",
      activeProducts: "455",
      creatorCount: "11.60万",
    },
    {
      shopName: "FashionWorld",
      category: "时尚配饰",
      rating: "4.2",
      unitsSold: "1500",
      salesGrowthRate: "-2.30%",
      revenue: "฿50.00万 ($1.44万)",
      revenueGrowthRate: "-1.50%",
      activeProducts: "120",
      creatorCount: "3200",
    },
  ];

  it("transforms raw shop sales rows into Shop + ShopSnapshot pairs", () => {
    const results = transformShopListRawRows(
      sampleSalesRows,
      "th",
      "tiktok",
      "2025-01-15",
    );

    expect(results).toHaveLength(2);

    const first = results[0];
    expect(first).toBeDefined();

    // Shop fields
    expect(first?.shop.shopName).toBe("MS.Bra");
    expect(first?.shop.country).toBe("th");
    expect(first?.shop.category).toBe("女装与女士内衣");
    expect(first?.shop.fastmossShopId).toBe("");
    expect(first?.shop.firstSeenAt).toBe("2025-01-15");

    // Snapshot fields
    expect(first?.snapshot.scrapedAt).toBe("2025-01-15");
    expect(first?.snapshot.source).toBe("tiktok");
    expect(first?.snapshot.activeProducts).toBe(455);
    expect(first?.snapshot.creatorCount).toBe(116000);
    expect(first?.snapshot.rating).toBeCloseTo(4.6);
    expect(first?.snapshot.salesGrowthRate).toBeCloseTo(0.0517);
    expect(first?.snapshot.totalSales).toBe(36700);
    expect(first?.snapshot.totalRevenue).toBe(1200700);
  });

  it("handles negative growth rates", () => {
    const results = transformShopListRawRows(
      sampleSalesRows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    const second = results[1];
    expect(second).toBeDefined();
    expect(second?.snapshot.salesGrowthRate).toBeCloseTo(-0.023);
  });

  it("handles brand shopType prefix", () => {
    const rows: RawShopListRowData[] = [
      {
        shopName: "FounderskinOfficial",
        category: "保健",
        rating: "4.5",
        unitsSold: "1.39万",
        salesGrowthRate: "45.16%",
        revenue: "฿310.42万 ($8.94万)",
        revenueGrowthRate: "43.68%",
        activeProducts: "95",
        creatorCount: "500",
        shopType: "品牌",
      },
    ];
    const results = transformShopListRawRows(
      rows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.shop.shopType).toBe("brand");
  });

  it("handles hotTiktok source with newCreators field", () => {
    const rows: RawShopListRowData[] = [
      {
        shopName: "FounderskinOfficial",
        category: "保健",
        rating: "4.5",
        unitsSold: "1.39万",
        salesGrowthRate: "45.16%",
        revenue: "฿310.42万 ($8.94万)",
        revenueGrowthRate: "43.68%",
        activeProducts: "95",
        creatorCount: "500",
        shopType: "品牌",
        newCreators: "713",
      },
    ];
    const results = transformShopListRawRows(
      rows,
      "th",
      "hotTiktok",
      "2025-01-15",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.snapshot.source).toBe("hotTiktok");
  });

  it("returns empty array for empty input", () => {
    const results = transformShopListRawRows([], "th", "tiktok", "2025-01-15");
    expect(results).toHaveLength(0);
  });

  it("handles empty category as null", () => {
    const rows: RawShopListRowData[] = [
      {
        shopName: "NoCategory",
        category: "",
        rating: "4.0",
        unitsSold: "100",
        salesGrowthRate: "0%",
        revenue: "฿1000",
        revenueGrowthRate: "0%",
        activeProducts: "10",
        creatorCount: "5",
      },
    ];
    const results = transformShopListRawRows(
      rows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.shop.category).toBeNull();
  });

  it("parses revenue with currency prefix and parenthesized USD", () => {
    const rows: RawShopListRowData[] = [
      {
        shopName: "TestShop",
        category: "test",
        rating: "3.5",
        unitsSold: "500",
        salesGrowthRate: "10%",
        revenue: "฿120.07万 ($3.45万)",
        revenueGrowthRate: "5%",
        activeProducts: "50",
        creatorCount: "100",
      },
    ];
    const results = transformShopListRawRows(
      rows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    expect(results).toHaveLength(1);
    // Revenue should parse the local currency part: ฿120.07万 → 1200700
    expect(results[0]?.snapshot.totalRevenue).toBe(1200700);
  });

  it("skips rows with invalid data", () => {
    const rows: RawShopListRowData[] = [
      {
        shopName: "",
        category: "test",
        rating: "invalid",
        unitsSold: "abc",
        salesGrowthRate: "xyz",
        revenue: "nope",
        revenueGrowthRate: "nope",
        activeProducts: "nope",
        creatorCount: "nope",
      },
    ];
    const results = transformShopListRawRows(
      rows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    // Empty shopName should be filtered out
    expect(results).toHaveLength(0);
  });

  it("validates with Zod schemas", () => {
    const results = transformShopListRawRows(
      sampleSalesRows,
      "th",
      "tiktok",
      "2025-01-15",
    );
    for (const result of results) {
      expect(result.shop.shopName).toBeTruthy();
      expect(result.shop.country).toBe("th");
      expect(result.snapshot.scrapedAt).toBe("2025-01-15");
    }
  });
});
