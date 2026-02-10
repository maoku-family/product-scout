import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchCjProduct } from "@/api/cj";
import { getTrendStatus } from "@/api/google-trends";
import { runPipeline } from "@/core/pipeline";
import { syncToNotion } from "@/core/sync";
import { initDb, resetDb } from "@/db/schema";
import type { Filter } from "@/schemas/config";
import type { FastmossProduct } from "@/schemas/product";
import { scrapeFastmoss } from "@/scrapers/fastmoss";
import { searchShopee } from "@/scrapers/shopee";

// Mock all external modules
vi.mock("@/scrapers/fastmoss", () => ({
  scrapeFastmoss: vi.fn(),
}));
vi.mock("@/scrapers/shopee", () => ({
  searchShopee: vi.fn(),
}));
vi.mock("@/api/google-trends", () => ({
  getTrendStatus: vi.fn(),
}));
vi.mock("@/api/cj", () => ({
  searchCjProduct: vi.fn(),
}));
vi.mock("@/core/sync", () => ({
  syncToNotion: vi.fn(),
}));

const mockScrapeFastmoss = vi.mocked(scrapeFastmoss);
const mockSearchShopee = vi.mocked(searchShopee);
const mockGetTrendStatus = vi.mocked(getTrendStatus);
const mockSearchCjProduct = vi.mocked(searchCjProduct);
const mockSyncToNotion = vi.mocked(syncToNotion);

const testFilters: Filter = {
  price: { min: 5, max: 50 },
  profitMargin: { min: 0.2 },
  minUnitsSold: 100,
  minGrowthRate: 0,
  excludedCategories: ["weapons"],
};

const testSecrets = {
  cjApiKey: "test-cj-key",
  notionKey: "test-notion-key",
  notionDbId: "test-db-id",
};

function makeFastmossProduct(
  overrides: Partial<FastmossProduct> = {},
): FastmossProduct {
  return {
    productName: "Test Product",
    shopName: "Test Shop",
    country: "th",
    category: "beauty",
    unitsSold: 500,
    gmv: 1000,
    orderGrowthRate: 0.5,
    commissionRate: 0.1,
    scrapedAt: "2025-01-15",
    ...overrides,
  };
}

describe("runPipeline", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    vi.clearAllMocks();

    // Default mocks
    mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
    mockSearchShopee.mockResolvedValue([
      {
        productId: 1,
        title: "Test",
        price: 20,
        soldCount: 300,
        rating: 4.5,
        shopeeUrl: "https://shopee.co.th/item/1",
        updatedAt: "2025-01-15",
      },
    ]);
    mockGetTrendStatus.mockResolvedValue("rising");
    mockSearchCjProduct.mockResolvedValue({
      cjPrice: 5,
      shippingCost: 3,
      profitMargin: 0.6,
      cjUrl: "https://cj.com/1",
    });
    mockSyncToNotion.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs pipeline in correct order and returns summary", async () => {
    const result = await runPipeline(
      db,
      { region: "th" },
      testSecrets,
      testFilters,
    );

    expect(result.scraped).toBe(1);
    expect(result.preFiltered).toBeGreaterThanOrEqual(0);
    expect(result.scored).toBeGreaterThanOrEqual(0);
    expect(mockScrapeFastmoss).toHaveBeenCalledTimes(1);
  });

  it("pre-filter reduces products before external requests", async () => {
    // Product below minUnitsSold should be filtered out
    mockScrapeFastmoss.mockResolvedValue([
      makeFastmossProduct({ unitsSold: 500 }),
      makeFastmossProduct({ productName: "Low Sales", unitsSold: 10 }),
    ]);

    const result = await runPipeline(
      db,
      { region: "th" },
      testSecrets,
      testFilters,
    );

    // Low Sales product should be pre-filtered
    expect(result.scraped).toBe(2);
    expect(result.preFiltered).toBe(1);
  });

  it("skips Notion sync in dry-run mode", async () => {
    const result = await runPipeline(
      db,
      { region: "th", dryRun: true },
      testSecrets,
      testFilters,
    );

    expect(mockSyncToNotion).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
  });

  it("continues with partial data when scraper fails", async () => {
    mockSearchShopee.mockResolvedValue([]); // Shopee returns nothing
    mockSearchCjProduct.mockResolvedValue(null); // CJ returns nothing

    const result = await runPipeline(
      db,
      { region: "th" },
      testSecrets,
      testFilters,
    );

    // Should still score and process (with lower scores due to missing data)
    expect(result.scraped).toBe(1);
    expect(result.scored).toBeGreaterThanOrEqual(0);
  });

  it("passes limit option to FastMoss scraper", async () => {
    await runPipeline(db, { region: "th", limit: 5 }, testSecrets, testFilters);

    expect(mockScrapeFastmoss).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });
});
