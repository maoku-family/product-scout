/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, func-names */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { insertCandidate, insertProducts } from "@/db/queries";
import { initDb, resetDb } from "@/db/schema";

// Mock @notionhq/client — must use function (not arrow) so `new Client()` works
const mockCreate = vi.fn().mockResolvedValue({ id: "notion-page-id" });
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(function (this: any) {
    this.pages = { create: mockCreate };
  }),
}));

// Import after mock setup
const { mapToNotionProperties, syncToNotion } = await import("@/core/sync");

describe("mapToNotionProperties", () => {
  it("maps all required fields to Notion properties", () => {
    const candidate = {
      id: 1,
      product_id: 1,
      score: 85.5,
      trend_status: "rising",
      created_at: "2025-01-15",
      product_name: "LED Ring Light",
      shop_name: "BeautyShop",
      country: "th",
      category: "beauty",
    };

    const properties = mapToNotionProperties(candidate);

    // Should have a title property for Product Name
    expect(properties["Product Name"]).toBeDefined();
    expect(properties["Total Score"]).toBeDefined();
    expect(properties.Trend).toBeDefined();
    expect(properties.Category).toBeDefined();
    expect(properties.Source).toBeDefined();
    expect(properties["Discovery Date"]).toBeDefined();
  });

  it("handles null category", () => {
    const candidate = {
      id: 1,
      product_id: 1,
      score: 70,
      trend_status: "stable",
      created_at: "2025-01-15",
      product_name: "Item",
      shop_name: "Shop",
      country: "th",
      category: null,
    };

    const properties = mapToNotionProperties(candidate);
    // Category should not be present or be empty when null
    expect(properties.Category).toBeDefined();
  });
});

describe("syncToNotion", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    // Reset mock before each test
    mockCreate.mockReset().mockResolvedValue({ id: "notion-page-id" });
    // Insert test data
    insertProducts(db, [
      {
        productName: "LED Ring Light",
        shopName: "BeautyShop",
        country: "th",
        category: "beauty",
        unitsSold: 1500,
        gmv: 4500,
        orderGrowthRate: 0.25,
        commissionRate: 0.08,
        scrapedAt: "2025-01-15",
      },
    ]);
    insertCandidate(db, 1, {
      score: 85.5,
      trendStatus: "rising",
      createdAt: "2025-01-15",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates Notion pages for unsynced candidates", async () => {
    const count = await syncToNotion(db, "test-key", "test-db-id");
    expect(count).toBe(1);
  });

  it("marks candidates as synced after success", async () => {
    await syncToNotion(db, "test-key", "test-db-id");

    // Check the candidate is now marked as synced
    const row = db
      .prepare("SELECT synced_to_notion FROM candidates WHERE id = 1")
      .get() as { synced_to_notion: number } | undefined;
    expect(row?.synced_to_notion).toBe(1);
  });

  it("returns 0 when no unsynced candidates exist", async () => {
    // Mark existing as synced first
    db.prepare("UPDATE candidates SET synced_to_notion = 1").run();

    const count = await syncToNotion(db, "test-key", "test-db-id");
    expect(count).toBe(0);
  });

  it("handles partial failure — logs error but continues", async () => {
    // Insert a second candidate
    insertProducts(db, [
      {
        productName: "Yoga Mat",
        shopName: "FitStore",
        country: "th",
        category: "sports",
        unitsSold: 800,
        gmv: 2400,
        orderGrowthRate: 0.15,
        commissionRate: 0.12,
        scrapedAt: "2025-01-15",
      },
    ]);
    insertCandidate(db, 2, {
      score: 70,
      trendStatus: "stable",
      createdAt: "2025-01-15",
    });

    // Mock: first create succeeds, second fails
    mockCreate
      .mockReset()
      .mockResolvedValueOnce({ id: "page-1" })
      .mockRejectedValueOnce(new Error("Notion API error"));

    const count = await syncToNotion(db, "test-key", "test-db-id");
    // Only 1 of 2 succeeded
    expect(count).toBe(1);
  });
});
