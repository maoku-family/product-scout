import type { SearchStrategy } from "@/schemas/config";
import { SearchItemSchema } from "@/schemas/product";
import type { SearchItem } from "@/schemas/product";
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

export type FastmossSearchOptions = FastmossScrapeOptions & {
  strategy: SearchStrategy;
};

/**
 * Raw row data extracted from the FastMoss search DOM.
 * Headers: 商品 | 所属店铺 | 达人出单率 | 近7天销量趋势 | 近7天销量 | 近7天销售额 | 总销量 | 总销售额 | 关联达人 | 操作
 * Note: no ranking column. Trend column (cell 3) is a chart, not text — skipped.
 */
export type RawSearchRowData = {
  productName: string;
  shopName: string;
  creatorConversionRate: string;
  sevenDaySales: string;
  sevenDayRevenue: string;
  totalUnitsSold: string;
  totalSalesAmount: string;
  creatorCount: string;
};

/**
 * Extract search data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
export function extractSearchTableDataScript(): RawSearchRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawSearchRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 10) {
      continue;
    }

    // Cell 0: product name (text before "售价")
    const cell0Text = cells[0]?.textContent?.trim() ?? "";
    const productName = cell0Text.split("售价")[0]?.trim() ?? "";

    // Cell 1: shop name (text before "店铺销量")
    const cell1Text = cells[1]?.textContent?.trim() ?? "";
    const shopName = cell1Text.split("店铺销量")[0]?.trim() ?? "";

    // Cell 2: creator conversion rate (达人出单率)
    const creatorConversionRate = cells[2]?.textContent?.trim() ?? "0%";

    // Cell 3: 7-day sales trend (chart — skipped)

    // Cell 4: 7-day sales
    const sevenDaySales = cells[4]?.textContent?.trim() ?? "0";

    // Cell 5: 7-day revenue
    const sevenDayRevenue = cells[5]?.textContent?.trim() ?? "0";

    // Cell 6: total units sold
    const totalUnitsSold = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: total sales amount
    const totalSalesAmount = cells[7]?.textContent?.trim() ?? "0";

    // Cell 8: creator count (关联达人)
    const creatorCount = cells[8]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        shopName,
        creatorConversionRate,
        sevenDaySales,
        sevenDayRevenue,
        totalUnitsSold,
        totalSalesAmount,
        creatorCount,
      });
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Transform raw DOM data into validated SearchItem objects.
 * Pure function — fully testable without Playwright.
 */
export function transformSearchRawRows(
  rows: RawSearchRowData[],
  country: string,
  scrapedAt: string,
): SearchItem[] {
  const items: SearchItem[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      shopName: row.shopName,
      country,
      creatorConversionRate: parsePercentage(row.creatorConversionRate),
      sevenDaySales: parseChineseNumber(row.sevenDaySales),
      sevenDayRevenue: parseChineseNumber(row.sevenDayRevenue),
      totalUnitsSold: parseChineseNumber(row.totalUnitsSold),
      totalSalesAmount: parseChineseNumber(row.totalSalesAmount),
      creatorCount: parseChineseNumber(row.creatorCount),
      scrapedAt,
    };

    const result = SearchItemSchema.safeParse(raw);
    if (result.success) {
      items.push(result.data);
    } else {
      logger.warn(
        `[fastmoss:search] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return items;
}

/**
 * Build the search URL with strategy filters as query parameters.
 */
function buildSearchUrl(options: FastmossSearchOptions): URL {
  const url = new URL(`${FASTMOSS_BASE_URL}/e-commerce/search`);
  url.searchParams.set("country", options.region);

  if (options.category) {
    url.searchParams.set("category", options.category);
  }

  // Apply strategy filters as query parameters
  for (const [key, value] of Object.entries(options.strategy.filters)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

/**
 * Scrape FastMoss search page with configurable strategy.
 */
export async function scrapeSearch(
  options: FastmossSearchOptions,
): Promise<SearchItem[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = buildSearchUrl(options);

    logger.info(
      `Scraping FastMoss search with strategy "${options.strategy.name}"`,
      {
        url: url.toString(),
      },
    );

    await withRetry(
      () =>
        page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
      { maxRetries: 3, delay: 2000 },
    );

    checkLoginStatus(page);
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const rawRows = await page.evaluate(extractSearchTableDataScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformSearchRawRows(rawRows, options.region, today);

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(`FastMoss search scraped ${String(items.length)} products`, {
      region: options.region,
      strategy: options.strategy.name,
    });

    return items;
  } finally {
    await context.close();
  }
}
