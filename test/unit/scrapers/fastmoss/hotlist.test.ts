import { describe, expect, it } from "vitest";

import { transformHotlistRawRows } from "@/scrapers/fastmoss/hotlist";

describe("transformHotlistRawRows", () => {
  const sampleRows = [
    {
      productName: "LED Strip Lights",
      shopName: "HomeDecor",
      category: "家居日用",
      commissionRate: "15%",
      unitsSold: "5000",
      salesAmount: "RM2.5万",
      creatorCount: "120",
      totalCreatorCount: "450",
    },
    {
      productName: "Phone Holder",
      shopName: "GadgetWorld",
      category: "",
      commissionRate: "8%",
      unitsSold: "3.2万",
      salesAmount: "₱9.6万",
      creatorCount: "85",
      totalCreatorCount: "1200",
    },
  ];

  it("transforms raw rows into HotlistItem array", () => {
    const items = transformHotlistRawRows(sampleRows, "my", "2025-01-15");

    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("LED Strip Lights");
    expect(first?.shopName).toBe("HomeDecor");
    expect(first?.country).toBe("my");
    expect(first?.category).toBe("家居日用");
    expect(first?.commissionRate).toBeCloseTo(0.15);
    expect(first?.unitsSold).toBe(5000);
    expect(first?.salesAmount).toBe(25000);
    expect(first?.creatorCount).toBe(120);
    expect(first?.totalCreatorCount).toBe(450);
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("handles empty category as null", () => {
    const items = transformHotlistRawRows(sampleRows, "ph", "2025-01-15");
    const second = items[1];
    expect(second).toBeDefined();
    expect(second?.category).toBeNull();
  });

  it("returns empty array for empty input", () => {
    const items = transformHotlistRawRows([], "th", "2025-01-15");
    expect(items).toHaveLength(0);
  });

  it("parses Chinese number format for sales and creators", () => {
    const rows = [
      {
        productName: "Test Product",
        shopName: "TestShop",
        category: "test",
        commissionRate: "10%",
        unitsSold: "1.5万",
        salesAmount: "RM4.5万",
        creatorCount: "2000",
        totalCreatorCount: "1.2万",
      },
    ];
    const items = transformHotlistRawRows(rows, "my", "2025-01-15");
    expect(items).toHaveLength(1);
    expect(items[0]?.unitsSold).toBe(15000);
    expect(items[0]?.salesAmount).toBe(45000);
    expect(items[0]?.creatorCount).toBe(2000);
    expect(items[0]?.totalCreatorCount).toBe(12000);
  });

  it("validates with Zod schema", () => {
    const items = transformHotlistRawRows(sampleRows, "th", "2025-01-15");
    for (const item of items) {
      expect(item.productName).toBeTruthy();
      expect(item.commissionRate).toBeGreaterThanOrEqual(0);
      expect(item.commissionRate).toBeLessThanOrEqual(1);
      expect(item.unitsSold).toBeGreaterThanOrEqual(0);
      expect(item.creatorCount).toBeGreaterThanOrEqual(0);
    }
  });
});
