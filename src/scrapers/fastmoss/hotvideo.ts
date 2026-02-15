import { HotvideoItemSchema } from "@/schemas/product";
import type { HotvideoItem } from "@/schemas/product";
import {
  checkLoginStatus,
  FASTMOSS_BASE_URL,
  launchFastmossContext,
} from "@/scrapers/fastmoss/shared";
import type { FastmossScrapeOptions } from "@/scrapers/fastmoss/shared";
import { logger } from "@/utils/logger";
import { parseChineseNumber } from "@/utils/parse-chinese-number";
import { withRetry } from "@/utils/retry";

/**
 * Raw row data extracted from the FastMoss hotvideo DOM.
 * Headers: 带货商品 | 视频内容 | 总销量 | 总销售额 | 总播放量 | 总点赞数 | 总评论数 | 操作
 * Note: hotvideo has a completely different structure — no ranking, shop, category, or commission columns.
 */
export type RawHotvideoRowData = {
  productName: string;
  videoContent: string;
  totalUnitsSold: string;
  totalSalesAmount: string;
  totalViews: string;
  totalLikes: string;
  totalComments: string;
};

/**
 * Extract hotvideo data from the FastMoss table using DOM API.
 * Runs inside the browser via page.evaluate().
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
export function extractHotvideoTableDataScript(): RawHotvideoRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawHotvideoRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 8) {
      continue;
    }

    // Cell 0: product name (带货商品) — text before "售价"
    const cell0Text = cells[0]?.textContent?.trim() ?? "";
    const productName = cell0Text.split("售价")[0]?.trim() ?? "";

    // Cell 1: video content (视频内容)
    const videoContent = cells[1]?.textContent?.trim() ?? "";

    // Cell 2: total units sold
    const totalUnitsSold = cells[2]?.textContent?.trim() ?? "0";

    // Cell 3: total sales amount
    const totalSalesAmount = cells[3]?.textContent?.trim() ?? "0";

    // Cell 4: total views
    const totalViews = cells[4]?.textContent?.trim() ?? "0";

    // Cell 5: total likes
    const totalLikes = cells[5]?.textContent?.trim() ?? "0";

    // Cell 6: total comments
    const totalComments = cells[6]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        videoContent,
        totalUnitsSold,
        totalSalesAmount,
        totalViews,
        totalLikes,
        totalComments,
      });
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Transform raw DOM data into validated HotvideoItem objects.
 * Pure function — fully testable without Playwright.
 */
export function transformHotvideoRawRows(
  rows: RawHotvideoRowData[],
  country: string,
  scrapedAt: string,
): HotvideoItem[] {
  const items: HotvideoItem[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      videoContent: row.videoContent,
      country,
      totalUnitsSold: parseChineseNumber(row.totalUnitsSold),
      totalSalesAmount: parseChineseNumber(row.totalSalesAmount),
      totalViews: parseChineseNumber(row.totalViews),
      totalLikes: parseChineseNumber(row.totalLikes),
      totalComments: parseChineseNumber(row.totalComments),
      scrapedAt,
    };

    const result = HotvideoItemSchema.safeParse(raw);
    if (result.success) {
      items.push(result.data);
    } else {
      logger.warn(
        `[fastmoss:hotvideo] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return items;
}

/**
 * Scrape FastMoss hotvideo page.
 */
export async function scrapeHotvideo(
  options: FastmossScrapeOptions,
): Promise<HotvideoItem[]> {
  const context = await launchFastmossContext(options.profileDir);

  try {
    const page = await context.newPage();

    const url = new URL(`${FASTMOSS_BASE_URL}/e-commerce/hotvideo`);
    url.searchParams.set("country", options.region);

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

    const rawRows = await page.evaluate(extractHotvideoTableDataScript);
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let items = transformHotvideoRawRows(rawRows, options.region, today);

    if (options.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    logger.info(`FastMoss hotvideo scraped ${String(items.length)} products`, {
      region: options.region,
    });

    return items;
  } finally {
    await context.close();
  }
}
