import { NewProductItemSchema } from "@/schemas/product";
import type { NewProductItem } from "@/schemas/product";
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
 * Raw row data extracted from the FastMoss newProducts DOM.
 * Headers: 排名 | 商品 | 国家/地区 | 所属店铺 | 商品分类 | 佣金比例 | 三日销量 | 三日销售额 | 总销量 | 总销售额 | 操作
 */
export type RawNewProductsRowData = {
  productName: string;
  shopName: string;
  category: string;
  commissionRate: string;
  threeDaySales: string;
  threeDayRevenue: string;
  totalUnitsSold: string;
  totalSalesAmount: string;
};

/**
 * Extract newProducts data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
export function extractNewProductsTableDataScript(): RawNewProductsRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawNewProductsRowData[] = [];

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

    // Cell 6: three-day sales
    const threeDaySales = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: three-day revenue
    const threeDayRevenue = cells[7]?.textContent?.trim() ?? "0";

    // Cell 8: total units sold
    const totalUnitsSold = cells[8]?.textContent?.trim() ?? "0";

    // Cell 9: total sales amount
    const totalSalesAmount = cells[9]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        shopName,
        category,
        commissionRate,
        threeDaySales,
        threeDayRevenue,
        totalUnitsSold,
        totalSalesAmount,
      });
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Transform raw DOM data into validated NewProductItem objects.
 * Pure function — fully testable without Playwright.
 */
export function transformNewProductsRawRows(
  rows: RawNewProductsRowData[],
  country: string,
  scrapedAt: string,
): NewProductItem[] {
  const items: NewProductItem[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      shopName: row.shopName,
      country,
      category: row.category === "" ? null : row.category,
      commissionRate: parsePercentage(row.commissionRate),
      threeDaySales: parseChineseNumber(row.threeDaySales),
      threeDayRevenue: parseChineseNumber(row.threeDayRevenue),
      totalUnitsSold: parseChineseNumber(row.totalUnitsSold),
      totalSalesAmount: parseChineseNumber(row.totalSalesAmount),
      scrapedAt,
    };

    const result = NewProductItemSchema.safeParse(raw);
    if (result.success) {
      items.push(result.data);
    } else {
      logger.warn(
        `[fastmoss:newProducts] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return items;
}

/**
 * Scrape FastMoss newProducts page.
 */
export async function scrapeNewProducts(
  options: FastmossScrapeOptions,
): Promise<NewProductItem[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = new URL(`${FASTMOSS_BASE_URL}/e-commerce/newProducts`);
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

    checkLoginStatus(page);
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });
    await page.waitForTimeout(2000);

    const rawRows = await page.evaluate(extractNewProductsTableDataScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformNewProductsRawRows(rawRows, options.region, today);

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(
      `FastMoss newProducts scraped ${String(items.length)} products`,
      { region: options.region, category: options.category },
    );

    return items;
  } finally {
    await context.close();
  }
}
