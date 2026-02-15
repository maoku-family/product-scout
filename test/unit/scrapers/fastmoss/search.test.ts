import { describe, expect, it } from "vitest";

import { transformSearchRawRows } from "@/scrapers/fastmoss/search";

describe("transformSearchRawRows", () => {
  const sampleRows = [
    {
      productName: "Portable Blender",
      shopName: "KitchenWorld",
      creatorConversionRate: "35%",
      sevenDaySales: "2500",
      sevenDayRevenue: "RM7.5万",
      totalUnitsSold: "5万",
      totalSalesAmount: "RM15万",
      creatorCount: "200",
    },
    {
      productName: "Hair Dryer",
      shopName: "BeautyTools",
      creatorConversionRate: "12.5%",
      sevenDaySales: "1.2万",
      sevenDayRevenue: "₱3.6万",
      totalUnitsSold: "8万",
      totalSalesAmount: "₱24万",
      creatorCount: "3500",
    },
  ];

  it("transforms raw rows into SearchItem array", () => {
    const items = transformSearchRawRows(sampleRows, "my", "2025-01-15");

    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("Portable Blender");
    expect(first?.shopName).toBe("KitchenWorld");
    expect(first?.country).toBe("my");
    expect(first?.creatorConversionRate).toBeCloseTo(0.35);
    expect(first?.sevenDaySales).toBe(2500);
    expect(first?.sevenDayRevenue).toBe(75000);
    expect(first?.totalUnitsSold).toBe(50000);
    expect(first?.totalSalesAmount).toBe(150000);
    expect(first?.creatorCount).toBe(200);
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("returns empty array for empty input", () => {
    const items = transformSearchRawRows([], "th", "2025-01-15");
    expect(items).toHaveLength(0);
  });

  it("parses Chinese number format", () => {
    const rows = [
      {
        productName: "Test Product",
        shopName: "TestShop",
        creatorConversionRate: "50%",
        sevenDaySales: "3.5万",
        sevenDayRevenue: "RM10.5万",
        totalUnitsSold: "10万",
        totalSalesAmount: "RM30万",
        creatorCount: "1.5万",
      },
    ];
    const items = transformSearchRawRows(rows, "my", "2025-01-15");
    expect(items).toHaveLength(1);
    expect(items[0]?.sevenDaySales).toBe(35000);
    expect(items[0]?.sevenDayRevenue).toBe(105000);
    expect(items[0]?.totalUnitsSold).toBe(100000);
    expect(items[0]?.totalSalesAmount).toBe(300000);
    expect(items[0]?.creatorCount).toBe(15000);
  });

  it("parses creator conversion rate correctly", () => {
    const items = transformSearchRawRows(sampleRows, "ph", "2025-01-15");
    const second = items[1];
    expect(second).toBeDefined();
    expect(second?.creatorConversionRate).toBeCloseTo(0.125);
  });

  it("validates with Zod schema", () => {
    const items = transformSearchRawRows(sampleRows, "th", "2025-01-15");
    for (const item of items) {
      expect(item.productName).toBeTruthy();
      expect(item.creatorConversionRate).toBeGreaterThanOrEqual(0);
      expect(item.creatorConversionRate).toBeLessThanOrEqual(1);
      expect(item.sevenDaySales).toBeGreaterThanOrEqual(0);
      expect(item.totalUnitsSold).toBeGreaterThanOrEqual(0);
      expect(item.creatorCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("skips invalid rows and logs warning", () => {
    const rows = [
      {
        productName: "Valid Product",
        shopName: "Shop",
        creatorConversionRate: "10%",
        sevenDaySales: "100",
        sevenDayRevenue: "200",
        totalUnitsSold: "300",
        totalSalesAmount: "400",
        creatorCount: "50",
      },
      {
        productName: "Invalid Product",
        shopName: "Shop",
        creatorConversionRate: "200%", // > 100% — should fail Zod max(1)
        sevenDaySales: "100",
        sevenDayRevenue: "200",
        totalUnitsSold: "300",
        totalSalesAmount: "400",
        creatorCount: "50",
      },
    ];
    const items = transformSearchRawRows(rows, "th", "2025-01-15");
    expect(items).toHaveLength(1);
    expect(items[0]?.productName).toBe("Valid Product");
  });
});
