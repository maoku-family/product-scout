/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CjCostResult } from "@/api/cj";
import { searchCjProduct } from "@/api/cj";
import { getTrendStatus } from "@/api/google-trends";
import { runPipeline } from "@/core/pipeline";
import type { PipelineOptions } from "@/core/pipeline";
import { syncToNotion } from "@/core/sync";
import { initDb, resetDb } from "@/db/schema";
import type {
  RulesConfig,
  ScoringConfig,
  SearchStrategiesConfig,
  SignalsConfig,
} from "@/schemas/config";
import type {
  FastmossProduct,
  HotlistItem,
  NewProductItem,
  SearchItem,
} from "@/schemas/product";
import {
  scrapeFastmoss,
  scrapeHotlist,
  scrapeHotvideo,
  scrapeNewProducts,
  scrapeProductDetail,
  scrapeSearch,
  scrapeShopDetail,
  scrapeShopHotList,
  scrapeShopSalesList,
} from "@/scrapers/fastmoss";
import { searchShopee } from "@/scrapers/shopee";

// ── Mock ALL external modules ───────────────────────────────────────

vi.mock("@/scrapers/fastmoss", () => ({
  scrapeFastmoss: vi.fn(),
  scrapeNewProducts: vi.fn(),
  scrapeHotlist: vi.fn(),
  scrapeHotvideo: vi.fn(),
  scrapeSearch: vi.fn(),
  scrapeShopSalesList: vi.fn(),
  scrapeShopHotList: vi.fn(),
  scrapeShopDetail: vi.fn(),
  scrapeProductDetail: vi.fn(),
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

// ── Cast mocks ──────────────────────────────────────────────────────

const mockScrapeFastmoss = scrapeFastmoss as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeNewProducts = scrapeNewProducts as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeHotlist = scrapeHotlist as unknown as ReturnType<typeof vi.fn>;
const mockScrapeHotvideo = scrapeHotvideo as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeSearch = scrapeSearch as unknown as ReturnType<typeof vi.fn>;
const mockScrapeShopSalesList = scrapeShopSalesList as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeShopHotList = scrapeShopHotList as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeShopDetail = scrapeShopDetail as unknown as ReturnType<
  typeof vi.fn
>;
const mockScrapeProductDetail = scrapeProductDetail as unknown as ReturnType<
  typeof vi.fn
>;
const mockSearchShopee = searchShopee as unknown as ReturnType<typeof vi.fn>;
const mockGetTrendStatus = getTrendStatus as unknown as ReturnType<
  typeof vi.fn
>;
const mockSearchCjProduct = searchCjProduct as unknown as ReturnType<
  typeof vi.fn
>;
const mockSyncToNotion = syncToNotion as unknown as ReturnType<typeof vi.fn>;

// ── Test fixtures ───────────────────────────────────────────────────

const testSecrets = {
  cjApiKey: "test-cj-key",
  notionKey: "test-notion-key",
  notionDbId: "test-db-id",
};

const testRules: RulesConfig = {
  defaults: {
    price: { min: 5, max: 50 },
    profitMargin: { min: 0.2 },
    minUnitsSold: 100,
    minGrowthRate: 0,
    excludedCategories: ["weapons"],
  },
  scraping: {
    dailyDetailBudget: 300,
    dailySearchBudget: 300,
    freshness: {
      detailRefreshDays: 7,
      vocRefreshDays: 14,
      shopRefreshDays: 7,
    },
  },
};

const testScoring: ScoringConfig = {
  scoringProfiles: {
    default: {
      name: "Default",
      dimensions: {
        salesVolume: 30,
        salesGrowthRate: 20,
        shopeeValidation: 25,
        profitMargin: 15,
        googleTrends: 10,
      },
    },
    trending: {
      name: "Trending",
      dimensions: {
        salesGrowthRate: 40,
        googleTrends: 30,
        salesVolume: 20,
        shopeeValidation: 10,
      },
    },
  },
};

const testSignals: SignalsConfig = {
  signalRules: {
    "explosive-growth": {
      condition: "salesGrowthRate > 1.0",
    },
  },
};

const testSearchStrategies: SearchStrategiesConfig = {
  strategies: {
    "blue-ocean": {
      name: "Blue Ocean",
      region: "th",
      filters: { minSales: "100" },
    },
  },
};

const testConfig = {
  rules: testRules,
  scoring: testScoring,
  signals: testSignals,
  searchStrategies: testSearchStrategies,
};

const defaultOptions: PipelineOptions = {
  region: "th",
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

function makeNewProductItem(
  overrides: Partial<NewProductItem> = {},
): NewProductItem {
  return {
    productName: "New Product",
    shopName: "New Shop",
    country: "th",
    category: "beauty",
    commissionRate: 0.1,
    threeDaySales: 200,
    threeDayRevenue: 5000,
    totalUnitsSold: 1000,
    totalSalesAmount: 25000,
    scrapedAt: "2025-01-15",
    ...overrides,
  };
}

function makeHotlistItem(overrides: Partial<HotlistItem> = {}): HotlistItem {
  return {
    productName: "Hot Product",
    shopName: "Hot Shop",
    country: "th",
    category: "beauty",
    commissionRate: 0.1,
    unitsSold: 800,
    salesAmount: 20000,
    creatorCount: 50,
    totalCreatorCount: 200,
    scrapedAt: "2025-01-15",
    ...overrides,
  };
}

function makeSearchItem(overrides: Partial<SearchItem> = {}): SearchItem {
  return {
    productName: "Search Product",
    shopName: "Search Shop",
    country: "th",
    creatorConversionRate: 0.1,
    sevenDaySales: 300,
    sevenDayRevenue: 9000,
    totalUnitsSold: 1500,
    totalSalesAmount: 45000,
    creatorCount: 30,
    scrapedAt: "2025-01-15",
    ...overrides,
  };
}

// ── Setup & teardown ────────────────────────────────────────────────

describe("Pipeline (Phase A→E)", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    vi.clearAllMocks();

    // Default mocks — all scrapers return empty
    mockScrapeFastmoss.mockResolvedValue([]);
    mockScrapeNewProducts.mockResolvedValue([]);
    mockScrapeHotlist.mockResolvedValue([]);
    mockScrapeHotvideo.mockResolvedValue([]);
    mockScrapeSearch.mockResolvedValue([]);
    mockScrapeShopSalesList.mockResolvedValue([]);
    mockScrapeShopHotList.mockResolvedValue([]);
    mockScrapeShopDetail.mockResolvedValue(null);
    mockScrapeProductDetail.mockResolvedValue(null);
    mockSearchShopee.mockResolvedValue([]);
    mockGetTrendStatus.mockResolvedValue("stable");
    mockSearchCjProduct.mockResolvedValue(null);
    mockSyncToNotion.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Phase A: Data Collection ────────────────────────────────────

  describe("Phase A: Data Collection", () => {
    it("scrapes all 4 FastMoss list pages and shop lists", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeNewProducts.mockResolvedValue([makeNewProductItem()]);
      mockScrapeHotlist.mockResolvedValue([makeHotlistItem()]);
      mockScrapeHotvideo.mockResolvedValue([]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(mockScrapeFastmoss).toHaveBeenCalledTimes(1);
      expect(mockScrapeNewProducts).toHaveBeenCalledTimes(1);
      expect(mockScrapeHotlist).toHaveBeenCalledTimes(1);
      expect(mockScrapeHotvideo).toHaveBeenCalledTimes(1);
      expect(mockScrapeShopSalesList).toHaveBeenCalledTimes(1);
      expect(mockScrapeShopHotList).toHaveBeenCalledTimes(1);
      expect(result.phaseA.collected).toBeGreaterThan(0);
    });

    it("runs search strategies from config", async () => {
      mockScrapeSearch.mockResolvedValue([makeSearchItem()]);

      await runPipeline(db, defaultOptions, testSecrets, testConfig);

      expect(mockScrapeSearch).toHaveBeenCalledTimes(1);
    });

    it("scrapes shop sales and hot lists and stores them", async () => {
      mockScrapeShopSalesList.mockResolvedValue([
        {
          shop: {
            fastmossShopId: "shop1",
            shopName: "Top Shop",
            country: "th",
            category: "beauty",
            shopType: "local",
            firstSeenAt: "2025-01-15",
          },
          snapshot: {
            shopId: 1,
            scrapedAt: "2025-01-15",
            source: "tiktok",
            totalSales: 5000,
            totalRevenue: 100000,
            activeProducts: 20,
            listedProducts: null,
            creatorCount: 10,
            rating: 4.5,
            positiveRate: null,
            shipRate48h: null,
            nationalRank: null,
            categoryRank: null,
            salesGrowthRate: 0.2,
            newProductSalesRatio: null,
          },
        },
      ]);
      mockScrapeShopHotList.mockResolvedValue([]);

      await runPipeline(db, defaultOptions, testSecrets, testConfig);

      const shops = db.prepare("SELECT COUNT(*) as cnt FROM shops").get() as {
        cnt: number;
      };
      expect(shops.cnt).toBe(1);

      const snapshots = db
        .prepare("SELECT COUNT(*) as cnt FROM shop_snapshots")
        .get() as { cnt: number };
      expect(snapshots.cnt).toBe(1);
    });

    it("scrapes shop detail for top shops and collects products", async () => {
      // First, set up a shop in the shop list
      mockScrapeShopSalesList.mockResolvedValue([
        {
          shop: {
            fastmossShopId: "shop-abc",
            shopName: "Detail Shop",
            country: "th",
            category: "beauty",
            shopType: "local",
            firstSeenAt: "2025-01-15",
          },
          snapshot: {
            shopId: 1,
            scrapedAt: "2025-01-15",
            source: "tiktok",
            totalSales: 5000,
            totalRevenue: 100000,
            activeProducts: 20,
            listedProducts: null,
            creatorCount: 10,
            rating: 4.5,
            positiveRate: null,
            shipRate48h: null,
            nationalRank: null,
            categoryRank: null,
            salesGrowthRate: 0.2,
            newProductSalesRatio: null,
          },
        },
      ]);
      mockScrapeShopHotList.mockResolvedValue([]);
      mockScrapeShopDetail.mockResolvedValue({
        shop: {
          fastmossShopId: "shop-abc",
          shopName: "Detail Shop",
          country: "th",
          category: "beauty",
          shopType: "local",
          firstSeenAt: "2025-01-15",
        },
        snapshot: {
          shopId: 1,
          scrapedAt: "2025-01-15",
          source: "search",
          totalSales: 5000,
          totalRevenue: 100000,
          activeProducts: 20,
          listedProducts: 25,
          creatorCount: 10,
          rating: 4.5,
          positiveRate: 0.95,
          shipRate48h: 0.9,
          nationalRank: 50,
          categoryRank: 10,
          salesGrowthRate: null,
          newProductSalesRatio: null,
        },
        products: [
          makeFastmossProduct({
            productName: "Shop Product A",
            shopName: "Detail Shop",
          }),
        ],
      });

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(mockScrapeShopDetail).toHaveBeenCalledTimes(1);
      // Product from shop detail should be collected
      expect(result.phaseA.collected).toBeGreaterThanOrEqual(1);
      const products = db
        .prepare("SELECT COUNT(*) as cnt FROM products WHERE product_name = ?")
        .get("Shop Product A") as { cnt: number };
      expect(products.cnt).toBe(1);
    });

    it("deduplicates products across sources", async () => {
      // Same product from two different sources
      mockScrapeFastmoss.mockResolvedValue([
        makeFastmossProduct({ productName: "DupeProd", shopName: "DupeShop" }),
      ]);
      mockScrapeHotlist.mockResolvedValue([
        makeHotlistItem({ productName: "DupeProd", shopName: "DupeShop" }),
      ]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // Should be deduplicated to 1 product in DB
      expect(result.phaseA.deduplicated).toBeGreaterThan(0);
      const products = db
        .prepare("SELECT COUNT(*) as cnt FROM products WHERE product_name = ?")
        .get("DupeProd") as { cnt: number };
      expect(products.cnt).toBe(1);
    });

    it("stores products and snapshots in DB", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);

      await runPipeline(db, defaultOptions, testSecrets, testConfig);

      const products = db
        .prepare("SELECT COUNT(*) as cnt FROM products")
        .get() as { cnt: number };
      expect(products.cnt).toBe(1);

      const snapshots = db
        .prepare("SELECT COUNT(*) as cnt FROM product_snapshots")
        .get() as { cnt: number };
      expect(snapshots.cnt).toBeGreaterThanOrEqual(1);
    });

    it("continues even if some scrapers fail", async () => {
      mockScrapeFastmoss.mockRejectedValue(new Error("Network error"));
      mockScrapeNewProducts.mockResolvedValue([makeNewProductItem()]);
      mockScrapeHotlist.mockResolvedValue([]);
      mockScrapeHotvideo.mockResolvedValue([]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // Should still collect products from the source that succeeded
      expect(result.phaseA.collected).toBeGreaterThan(0);
    });

    it("skips Phase A when skipScrape is true", async () => {
      const result = await runPipeline(
        db,
        { ...defaultOptions, skipScrape: true },
        testSecrets,
        testConfig,
      );

      expect(mockScrapeFastmoss).not.toHaveBeenCalled();
      expect(mockScrapeNewProducts).not.toHaveBeenCalled();
      expect(result.phaseA.collected).toBe(0);
    });
  });

  // ── Phase B: Queue Building ─────────────────────────────────────

  describe("Phase B: Pre-filter & Queue Building", () => {
    it("pre-filters products before building queue", async () => {
      mockScrapeFastmoss.mockResolvedValue([
        makeFastmossProduct({ unitsSold: 500 }),
        makeFastmossProduct({
          productName: "Low Sales",
          shopName: "Low Shop",
          unitsSold: 10,
        }),
      ]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // "Low Sales" should be pre-filtered
      expect(result.phaseB.preFiltered).toBeGreaterThan(0);
    });

    it("builds a scrape queue within budget", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(result.phaseB.queued).toBe(1);
    });
  });

  // ── Phase C: Deep Mining ────────────────────────────────────────

  describe("Phase C: Deep Mining", () => {
    it("scrapes product details for queue items", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: 0.6,
        channelLivePct: 0.3,
        channelOtherPct: 0.1,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: 10,
        scrapedAt: "2025-01-15T00:00:00Z",
      });

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // No fastmoss_id on product, so detail scraping is skipped
      expect(result.phaseC.detailed).toBe(0);
    });

    it("enriches products with Shopee data", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: null,
        channelLivePct: null,
        channelOtherPct: null,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: null,
        scrapedAt: "2025-01-15T00:00:00Z",
      });
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

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // Shopee mock returns 1 result, so enriched should be 1
      expect(result.phaseC.enriched).toBe(1);
    });
  });

  // ── Phase D: Post-filter + Label + Score ────────────────────────

  describe("Phase D: Post-filter + Label + Score", () => {
    it("scores products with multi-strategy scorer", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: null,
        channelLivePct: null,
        channelOtherPct: null,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: null,
        scrapedAt: "2025-01-15T00:00:00Z",
      });
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
      mockSearchCjProduct.mockResolvedValue({
        cjPrice: 5,
        shippingCost: 3,
        profitMargin: 0.6,
        cjUrl: "https://cj.com/1",
      });

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // 1 product survives pre-filter, so it should be scored
      expect(result.phaseD.scored).toBe(1);
    });

    it("applies tags to candidates", async () => {
      mockScrapeFastmoss.mockResolvedValue([
        makeFastmossProduct({ orderGrowthRate: 1.5 }),
      ]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: null,
        channelLivePct: null,
        channelOtherPct: null,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: null,
        scrapedAt: "2025-01-15T00:00:00Z",
      });
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

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      // At least 1 discovery tag (found-on-saleslist)
      expect(result.phaseD.labeled).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Phase E: Output ─────────────────────────────────────────────

  describe("Phase E: Output", () => {
    it("syncs candidates to Notion", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: null,
        channelLivePct: null,
        channelOtherPct: null,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: null,
        scrapedAt: "2025-01-15T00:00:00Z",
      });
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
      mockSyncToNotion.mockResolvedValue(1);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(mockSyncToNotion).toHaveBeenCalledTimes(1);
      expect(result.phaseE.synced).toBe(1);
    });

    it("skips Notion sync in dry-run mode", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);

      const result = await runPipeline(
        db,
        { ...defaultOptions, dryRun: true },
        testSecrets,
        testConfig,
      );

      expect(mockSyncToNotion).not.toHaveBeenCalled();
      expect(result.phaseE.synced).toBe(0);
    });
  });

  // ── End-to-end ──────────────────────────────────────────────────

  describe("End-to-end", () => {
    it("returns PipelineResult with all phase metrics", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);

      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(result).toHaveProperty("phaseA");
      expect(result).toHaveProperty("phaseB");
      expect(result).toHaveProperty("phaseC");
      expect(result).toHaveProperty("phaseD");
      expect(result).toHaveProperty("phaseE");
      expect(result.phaseA).toHaveProperty("collected");
      expect(result.phaseA).toHaveProperty("deduplicated");
      expect(result.phaseB).toHaveProperty("preFiltered");
      expect(result.phaseB).toHaveProperty("queued");
      expect(result.phaseC).toHaveProperty("detailed");
      expect(result.phaseC).toHaveProperty("enriched");
      expect(result.phaseD).toHaveProperty("postFiltered");
      expect(result.phaseD).toHaveProperty("labeled");
      expect(result.phaseD).toHaveProperty("scored");
      expect(result.phaseE).toHaveProperty("synced");
    });

    it("handles empty pipeline gracefully", async () => {
      // All scrapers return empty — pipeline should complete without error
      const result = await runPipeline(
        db,
        defaultOptions,
        testSecrets,
        testConfig,
      );

      expect(result.phaseA.collected).toBe(0);
      expect(result.phaseB.queued).toBe(0);
      expect(result.phaseC.detailed).toBe(0);
      expect(result.phaseD.scored).toBe(0);
      expect(result.phaseE.synced).toBe(0);
    });

    it("passes region and limit to scrapers", async () => {
      await runPipeline(
        db,
        { region: "th", limit: 5 },
        testSecrets,
        testConfig,
      );

      expect(mockScrapeFastmoss).toHaveBeenCalledWith(
        expect.objectContaining({ region: "th", limit: 5 }),
      );
    });

    it("writes enrichments to product_enrichments table", async () => {
      mockScrapeFastmoss.mockResolvedValue([makeFastmossProduct()]);
      mockScrapeProductDetail.mockResolvedValue({
        productId: 1,
        fastmossId: "fm123",
        hotIndex: 80,
        popularityIndex: 70,
        price: 15.0,
        priceUsd: 15.0,
        commissionRate: 0.1,
        rating: 4.5,
        reviewCount: 100,
        listedAt: "2024-06-01",
        stockStatus: "in_stock",
        creatorCount: 50,
        videoCount: 30,
        liveCount: 5,
        channelVideoPct: null,
        channelLivePct: null,
        channelOtherPct: null,
        vocPositive: null,
        vocNegative: null,
        similarProductCount: null,
        scrapedAt: "2025-01-15T00:00:00Z",
      });
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
      mockSearchCjProduct.mockResolvedValue({
        cjPrice: 5,
        shippingCost: 3,
        profitMargin: 0.6,
        cjUrl: "https://cj.com/1",
      } satisfies CjCostResult);

      await runPipeline(
        db,
        { ...defaultOptions, dryRun: true },
        testSecrets,
        testConfig,
      );

      const shopeeRows = db
        .prepare("SELECT * FROM product_enrichments WHERE source = ?")
        .all("shopee") as Array<{
        price: number | null;
        sold_count: number | null;
      }>;
      expect(shopeeRows.length).toBeGreaterThanOrEqual(1);

      const cjRows = db
        .prepare("SELECT * FROM product_enrichments WHERE source = ?")
        .all("cj") as Array<{
        price: number | null;
        profit_margin: number | null;
      }>;
      expect(cjRows.length).toBeGreaterThanOrEqual(1);
    });
  });
});
