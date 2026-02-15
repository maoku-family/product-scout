import { HotlistItemSchema } from "@/schemas/product";
import type { HotlistItem } from "@/schemas/product";
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
 * Raw row data extracted from the FastMoss hotlist DOM.
 * Headers: 排名 | 商品 | 国家/地区 | 所属店铺 | 商品分类 | 佣金比例 | 销量 | 销售额 | 关联达人 | 总关联达人 | 操作
 */
export type RawHotlistRowData = {
  productName: string;
  shopName: string;
  category: string;
  commissionRate: string;
  unitsSold: string;
  salesAmount: string;
  creatorCount: string;
  totalCreatorCount: string;
};

/**
 * Extract hotlist data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
export function extractHotlistTableDataScript(): RawHotlistRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawHotlistRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 11) {
      continue;
    }

    // Cell 1: product name (text before "售价")
    const cell1Text = cells[1]?.textContent?.trim() ?? "";
    const productName = cell1Text.split("售价")[0]?.trim() ?? "";

    // Cell 3: shop name (text before "店铺销量")
    const cell3Text = cells[3]?.textContent?.trim() ?? "";
    const shopName = cell3Text.split("店铺销量")[0]?.trim() ?? "";

    // Cell 4: category
    const category = cells[4]?.textContent?.trim() ?? "";

    // Cell 5: commission rate
    const commissionRate = cells[5]?.textContent?.trim() ?? "0%";

    // Cell 6: units sold
    const unitsSold = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: sales amount
    const salesAmount = cells[7]?.textContent?.trim() ?? "0";

    // Cell 8: creator count (关联达人)
    const creatorCount = cells[8]?.textContent?.trim() ?? "0";

    // Cell 9: total creator count (总关联达人)
    const totalCreatorCount = cells[9]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        shopName,
        category,
        commissionRate,
        unitsSold,
        salesAmount,
        creatorCount,
        totalCreatorCount,
      });
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Transform raw DOM data into validated HotlistItem objects.
 * Pure function — fully testable without Playwright.
 */
export function transformHotlistRawRows(
  rows: RawHotlistRowData[],
  country: string,
  scrapedAt: string,
): HotlistItem[] {
  const items: HotlistItem[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      shopName: row.shopName,
      country,
      category: row.category === "" ? null : row.category,
      commissionRate: parsePercentage(row.commissionRate),
      unitsSold: parseChineseNumber(row.unitsSold),
      salesAmount: parseChineseNumber(row.salesAmount),
      creatorCount: parseChineseNumber(row.creatorCount),
      totalCreatorCount: parseChineseNumber(row.totalCreatorCount),
      scrapedAt,
    };

    const result = HotlistItemSchema.safeParse(raw);
    if (result.success) {
      items.push(result.data);
    } else {
      logger.warn(
        `[fastmoss:hotlist] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return items;
}

/**
 * Scrape FastMoss hotlist page.
 */
export async function scrapeHotlist(
  options: FastmossScrapeOptions,
): Promise<HotlistItem[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = new URL(`${FASTMOSS_BASE_URL}/e-commerce/hotlist`);
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

    const rawRows = await page.evaluate(extractHotlistTableDataScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformHotlistRawRows(rawRows, options.region, today);

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(`FastMoss hotlist scraped ${String(items.length)} products`, {
      region: options.region,
      category: options.category,
    });

    return items;
  } finally {
    await context.close();
  }
}
