import { describe, expect, it } from "vitest";

import { transformHotvideoRawRows } from "@/scrapers/fastmoss/hotvideo";

describe("transformHotvideoRawRows", () => {
  const sampleRows = [
    {
      productName: "Wireless Earbuds",
      videoContent: "Amazing sound quality review",
      totalUnitsSold: "1.5万",
      totalSalesAmount: "RM4.5万",
      totalViews: "50万",
      totalLikes: "2.3万",
      totalComments: "1500",
    },
    {
      productName: "Skin Care Set",
      videoContent: "Morning routine with this set",
      totalUnitsSold: "8000",
      totalSalesAmount: "₱24000",
      totalViews: "12万",
      totalLikes: "8500",
      totalComments: "620",
    },
  ];

  it("transforms raw rows into HotvideoItem array", () => {
    const items = transformHotvideoRawRows(sampleRows, "my", "2025-01-15");

    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("Wireless Earbuds");
    expect(first?.videoContent).toBe("Amazing sound quality review");
    expect(first?.country).toBe("my");
    expect(first?.totalUnitsSold).toBe(15000);
    expect(first?.totalSalesAmount).toBe(45000);
    expect(first?.totalViews).toBe(500000);
    expect(first?.totalLikes).toBe(23000);
    expect(first?.totalComments).toBe(1500);
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("returns empty array for empty input", () => {
    const items = transformHotvideoRawRows([], "th", "2025-01-15");
    expect(items).toHaveLength(0);
  });

  it("parses Chinese number format for all numeric fields", () => {
    const rows = [
      {
        productName: "Test Product",
        videoContent: "Test video",
        totalUnitsSold: "3.2万",
        totalSalesAmount: "Rp9.6万",
        totalViews: "1.5亿",
        totalLikes: "100万",
        totalComments: "5万",
      },
    ];
    const items = transformHotvideoRawRows(rows, "id", "2025-01-15");
    expect(items).toHaveLength(1);
    expect(items[0]?.totalUnitsSold).toBe(32000);
    expect(items[0]?.totalSalesAmount).toBe(96000);
    expect(items[0]?.totalViews).toBe(150000000);
    expect(items[0]?.totalLikes).toBe(1000000);
    expect(items[0]?.totalComments).toBe(50000);
  });

  it("validates with Zod schema", () => {
    const items = transformHotvideoRawRows(sampleRows, "th", "2025-01-15");
    for (const item of items) {
      expect(item.productName).toBeTruthy();
      expect(item.totalUnitsSold).toBeGreaterThanOrEqual(0);
      expect(item.totalViews).toBeGreaterThanOrEqual(0);
      expect(item.totalLikes).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles video content text correctly", () => {
    const rows = [
      {
        productName: "Product A",
        videoContent: "这是一个很长的视频描述内容",
        totalUnitsSold: "100",
        totalSalesAmount: "200",
        totalViews: "1000",
        totalLikes: "50",
        totalComments: "10",
      },
    ];
    const items = transformHotvideoRawRows(rows, "th", "2025-01-15");
    expect(items).toHaveLength(1);
    expect(items[0]?.videoContent).toBe("这是一个很长的视频描述内容");
  });
});
