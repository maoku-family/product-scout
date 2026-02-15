import { ShopSchema, ShopSnapshotSchema } from "@/schemas/shop";
import type { Shop, ShopSnapshot } from "@/schemas/shop";
import {
  checkLoginStatus,
  FASTMOSS_BASE_URL,
  launchFastmossContext,
  parsePercentage,
} from "@/scrapers/fastmoss/shared";
import type { FastmossScrapeOptions } from "@/scrapers/fastmoss/shared";
import { logger } from "@/utils/logger";
import { parseChineseNumber } from "@/utils/parse-chinese-number";
import { withRetry } from "@/utils/retry";

/**
 * Raw row data extracted from the FastMoss shop list DOM.
 * Shared between shop sales list (/shop-marketing/tiktok) and
 * shop hot list (/shop-marketing/hotTiktok).
 */
export type RawShopListRowData = {
  shopName: string;
  category: string;
  rating: string;
  unitsSold: string;
  salesGrowthRate: string;
  revenue: string;
  revenueGrowthRate: string;
  activeProducts: string;
  creatorCount: string;
  shopType?: string;
  newCreators?: string;
};

/**
 * Parse revenue string, extracting only the local currency part.
 * Input formats: "฿120.07万 ($3.45万)" → "฿120.07万"
 *                "฿1000" → "฿1000"
 */
function parseRevenueLocal(raw: string): number {
  // Take only the part before any parenthesized USD value
  const localPart = raw.split("(")[0]?.trim() ?? raw;
  return parseChineseNumber(localPart);
}

/**
 * Map Chinese shop type label to enum value.
 */
function mapShopType(raw?: string): "cross-border" | "local" | "brand" | null {
  if (!raw) {
    return null;
  }
  if (raw.includes("品牌")) {
    return "brand";
  }
  if (raw.includes("本土")) {
    return "local";
  }
  if (raw.includes("跨境")) {
    return "cross-border";
  }
  return null;
}

/**
 * Transform raw shop list rows into validated Shop + ShopSnapshot pairs.
 * Pure function — fully testable without Playwright.
 */
export function transformShopListRawRows(
  rows: RawShopListRowData[],
  country: string,
  source: string,
  scrapedAt: string,
): { shop: Shop; snapshot: ShopSnapshot }[] {
  const results: { shop: Shop; snapshot: ShopSnapshot }[] = [];

  for (const row of rows) {
    if (!row.shopName) {
      continue;
    }

    const shopRaw = {
      fastmossShopId: "",
      shopName: row.shopName,
      country,
      category: row.category === "" ? null : row.category,
      shopType: mapShopType(row.shopType),
      firstSeenAt: scrapedAt,
    };

    const shopResult = ShopSchema.safeParse(shopRaw);
    if (!shopResult.success) {
      logger.warn(
        `[fastmoss:shop-list] Skipping invalid shop "${row.shopName}"`,
        shopResult.error.issues,
      );
      continue;
    }

    const snapshotRaw = {
      shopId: 1, // Placeholder — will be set by DB layer
      scrapedAt,
      source,
      totalSales: parseChineseNumber(row.unitsSold),
      totalRevenue: parseRevenueLocal(row.revenue),
      activeProducts: parseChineseNumber(row.activeProducts),
      listedProducts: null,
      creatorCount: parseChineseNumber(row.creatorCount),
      rating: Number.parseFloat(row.rating) || null,
      positiveRate: null,
      shipRate48h: null,
      nationalRank: null,
      categoryRank: null,
      salesGrowthRate: parsePercentage(row.salesGrowthRate),
      newProductSalesRatio: null,
    };

    const snapshotResult = ShopSnapshotSchema.safeParse(snapshotRaw);
    if (!snapshotResult.success) {
      logger.warn(
        `[fastmoss:shop-list] Skipping invalid snapshot for "${row.shopName}"`,
        snapshotResult.error.issues,
      );
      continue;
    }

    results.push({
      shop: shopResult.data,
      snapshot: snapshotResult.data,
    });
  }

  return results;
}

/**
 * Extract shop list data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 *
 * Headers: 排名 | 店铺 | 销量 | 销量环比 | 销售额 | 销量额环比 | 动销商品数 | 带货达人数 | 操作
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-plus-operands */
export function extractShopSalesListScript(): RawShopListRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawShopListRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 9) {
      continue;
    }

    // Cell 1: shop info — "品牌 ShopName Category Rating"
    const cell1Text = cells[1]?.textContent?.trim() ?? "";

    // Detect brand prefix
    let shopType: string | undefined;
    let shopText = cell1Text;
    if (shopText.startsWith("品牌")) {
      shopType = "品牌";
      shopText = shopText.slice(2).trim();
    }

    // Extract rating (last number like "4.6")
    const ratingMatch = shopText.match(/(\d+\.\d+)\s*$/);
    const rating = ratingMatch?.[1] ?? "";
    if (ratingMatch) {
      shopText = shopText.slice(0, ratingMatch.index).trim();
    }

    // Split remaining into shopName + category (last segment)
    // Pattern: "MS.Bra 女装与女士内衣" → shopName: "MS.Bra", category: "女装与女士内衣"
    const lastSpaceIdx = shopText.lastIndexOf(" ");
    const shopName =
      lastSpaceIdx > 0 ? shopText.slice(0, lastSpaceIdx).trim() : shopText;
    const category =
      lastSpaceIdx > 0 ? shopText.slice(lastSpaceIdx + 1).trim() : "";

    // Cell 2: unitsSold
    const unitsSold = cells[2]?.textContent?.trim() ?? "0";

    // Cell 3: salesGrowthRate
    const salesGrowthRate = cells[3]?.textContent?.trim() ?? "0%";

    // Cell 4: revenue
    const revenue = cells[4]?.textContent?.trim() ?? "0";

    // Cell 5: revenueGrowthRate
    const revenueGrowthRate = cells[5]?.textContent?.trim() ?? "0%";

    // Cell 6: activeProducts
    const activeProducts = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: creatorCount
    const creatorCount = cells[7]?.textContent?.trim() ?? "0";

    if (shopName) {
      const rowData: RawShopListRowData = {
        shopName,
        category,
        rating,
        unitsSold,
        salesGrowthRate,
        revenue,
        revenueGrowthRate,
        activeProducts,
        creatorCount,
      };
      if (shopType) {
        rowData.shopType = shopType;
      }
      results.push(rowData);
    }
  }

  return results;
}

/**
 * Extract shop hot list data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 *
 * Headers: 排名 | 店铺 | 新增带货达人 | 销量 | 销量环比 | 销售额 | 销量额环比 | 动销商品数 | 操作
 */
export function extractShopHotListScript(): RawShopListRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawShopListRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 9) {
      continue;
    }

    // Cell 1: shop info
    const cell1Text = cells[1]?.textContent?.trim() ?? "";

    let shopType: string | undefined;
    let shopText = cell1Text;
    if (shopText.startsWith("品牌")) {
      shopType = "品牌";
      shopText = shopText.slice(2).trim();
    }

    const ratingMatch = shopText.match(/(\d+\.\d+)\s*$/);
    const rating = ratingMatch?.[1] ?? "";
    if (ratingMatch) {
      shopText = shopText.slice(0, ratingMatch.index).trim();
    }

    const lastSpaceIdx = shopText.lastIndexOf(" ");
    const shopName =
      lastSpaceIdx > 0 ? shopText.slice(0, lastSpaceIdx).trim() : shopText;
    const category =
      lastSpaceIdx > 0 ? shopText.slice(lastSpaceIdx + 1).trim() : "";

    // Cell 2: newCreators (新增带货达人)
    const newCreators = cells[2]?.textContent?.trim() ?? "0";

    // Cell 3: unitsSold
    const unitsSold = cells[3]?.textContent?.trim() ?? "0";

    // Cell 4: salesGrowthRate
    const salesGrowthRate = cells[4]?.textContent?.trim() ?? "0%";

    // Cell 5: revenue
    const revenue = cells[5]?.textContent?.trim() ?? "0";

    // Cell 6: revenueGrowthRate
    const revenueGrowthRate = cells[6]?.textContent?.trim() ?? "0%";

    // Cell 7: activeProducts
    const activeProducts = cells[7]?.textContent?.trim() ?? "0";

    // creatorCount not directly in this table; derive from newCreators
    const creatorCount = "0";

    if (shopName) {
      const rowData: RawShopListRowData = {
        shopName,
        category,
        rating,
        unitsSold,
        salesGrowthRate,
        revenue,
        revenueGrowthRate,
        activeProducts,
        creatorCount,
        newCreators,
      };
      if (shopType) {
        rowData.shopType = shopType;
      }
      results.push(rowData);
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-plus-operands */

/**
 * Scrape FastMoss shop sales list (/shop-marketing/tiktok).
 */
export async function scrapeShopSalesList(
  options: FastmossScrapeOptions,
): Promise<{ shop: Shop; snapshot: ShopSnapshot }[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = new URL(`${FASTMOSS_BASE_URL}/shop-marketing/tiktok`);
    url.searchParams.set("country", options.region);
    if (options.category) {
      url.searchParams.set("category", options.category);
    }

    await withRetry(
      () =>
        page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
      { maxRetries: 3, delay: 2000 },
    );

    await checkLoginStatus(page);
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const rawRows = await page.evaluate(extractShopSalesListScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformShopListRawRows(
      rawRows,
      options.region,
      "tiktok",
      today,
    );

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(
      `FastMoss shop sales list scraped ${String(items.length)} shops`,
      { region: options.region, category: options.category },
    );

    return items;
  } finally {
    await context.close();
  }
}

/**
 * Scrape FastMoss shop hot list (/shop-marketing/hotTiktok).
 */
export async function scrapeShopHotList(
  options: FastmossScrapeOptions,
): Promise<{ shop: Shop; snapshot: ShopSnapshot }[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = new URL(`${FASTMOSS_BASE_URL}/shop-marketing/hotTiktok`);
    url.searchParams.set("country", options.region);
    if (options.category) {
      url.searchParams.set("category", options.category);
    }

    await withRetry(
      () =>
        page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
      { maxRetries: 3, delay: 2000 },
    );

    await checkLoginStatus(page);
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const rawRows = await page.evaluate(extractShopHotListScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformShopListRawRows(
      rawRows,
      options.region,
      "hotTiktok",
      today,
    );

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(
      `FastMoss shop hot list scraped ${String(items.length)} shops`,
      { region: options.region, category: options.category },
    );

    return items;
  } finally {
    await context.close();
  }
}
