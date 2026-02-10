import { homedir } from "node:os";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { FastmossProductSchema } from "@/schemas/product";
import type { FastmossProduct } from "@/schemas/product";
import { logger } from "@/utils/logger";
import { parseChineseNumber } from "@/utils/parse-chinese-number";
import { withRetry } from "@/utils/retry";

const FASTMOSS_BASE_URL = "https://www.fastmoss.com/e-commerce/saleslist";
const DEFAULT_PROFILE_DIR = resolve(homedir(), ".product-scout-chrome");

export type FastmossScrapeOptions = {
  region: string;
  category?: string;
  limit?: number;
  /** Custom profile directory for Chrome persistent context */
  profileDir?: string;
};

/**
 * Raw row data extracted from the FastMoss DOM via page.evaluate().
 * Matches the actual Ant Design table structure.
 */
type RawRowData = {
  productName: string;
  shopName: string;
  category: string;
  commissionRate: string;
  unitsSold: string;
  growthRate: string;
  gmv: string;
};

/**
 * Extract product data from the FastMoss ranking table using DOM API.
 * Runs inside the browser via page.evaluate() — not in Node.
 * ESLint disabled because DOM types are unresolved in the Node TS context.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
function extractTableDataScript(): RawRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const results: RawRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 11) {
      continue;
    }

    // Cell 1: product name (text before "售价：")
    const cell1Text = cells[1]?.textContent?.trim() ?? "";
    const productName = cell1Text.split("售价")[0]?.trim() ?? "";

    // Cell 3: shop name (text before "店铺销量")
    const cell3Text = cells[3]?.textContent?.trim() ?? "";
    const shopName = cell3Text.split("店铺销量")[0]?.trim() ?? "";

    // Cell 4: category
    const category = cells[4]?.textContent?.trim() ?? "";

    // Cell 5: commission rate (e.g., "1%")
    const commissionRate = cells[5]?.textContent?.trim() ?? "0%";

    // Cell 6: sales volume (e.g., "2.28万")
    const unitsSold = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: growth rate (e.g., "1249.68%" or "-2.51%")
    const growthRate = cells[7]?.textContent?.trim() ?? "0%";

    // Cell 8: GMV / revenue (e.g., "RM15.00万")
    const gmv = cells[8]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        shopName,
        category,
        commissionRate,
        unitsSold,
        growthRate,
        gmv,
      });
    }
  }

  return results;
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Parse a percentage string like "25.5%" or "-5.2%" or "1249.68%" into a decimal.
 * Returns 0 if unparseable.
 */
function parsePercentage(raw: string): number {
  const cleaned = raw.replace("%", "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return 0;
  }
  return value / 100;
}

/**
 * Transform raw DOM data into validated FastmossProduct objects.
 * Pure function — fully testable without Playwright.
 */
export function transformRawRows(
  rows: RawRowData[],
  country: string,
  scrapedAt: string,
): FastmossProduct[] {
  const products: FastmossProduct[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      shopName: row.shopName,
      country,
      category: row.category === "" ? null : row.category,
      unitsSold: parseChineseNumber(row.unitsSold),
      gmv: parseChineseNumber(row.gmv),
      orderGrowthRate: parsePercentage(row.growthRate),
      commissionRate: parsePercentage(row.commissionRate),
      scrapedAt,
    };

    const result = FastmossProductSchema.safeParse(raw);
    if (result.success) {
      products.push(result.data);
    } else {
      logger.warn(
        `[fastmoss] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return products;
}

/**
 * Scrape FastMoss ranking page using system Chrome with a persistent profile.
 *
 * Uses Playwright's launchPersistentContext with `channel: "chrome"` to:
 * - Use the system Chrome browser (avoids WAF blocking Playwright's Chromium)
 * - Preserve login sessions via the persistent profile directory
 * - No need for a separate Chrome CDP launcher script
 *
 * First run: User needs to login to FastMoss in the launched Chrome window.
 * Subsequent runs: Login session is preserved in the profile.
 */
export async function scrapeFastmoss(
  options: FastmossScrapeOptions,
): Promise<FastmossProduct[]> {
  const profileDir = options.profileDir ?? DEFAULT_PROFILE_DIR;

  logger.info("Launching Chrome with persistent profile", { profileDir });

  const context = await withRetry(
    () =>
      chromium.launchPersistentContext(profileDir, {
        channel: "chrome",
        headless: false,
        timeout: 30000,
      }),
    { maxRetries: 3, delay: 2000 },
  );

  try {
    const page = await context.newPage();

    // Build URL with region filter
    const url = new URL(FASTMOSS_BASE_URL);
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

    // Check for login redirect (expired session)
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/sign")) {
      await page.close();
      logger.error("FastMoss session expired — please login in Chrome");
      throw new Error(
        "FastMoss session expired. Please login at https://www.fastmoss.com in your Chrome browser.",
      );
    }

    // Wait for the Ant Design table to render
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });

    // Small extra wait for all data to populate
    await page.waitForTimeout(2000);

    // Extract data from DOM
    const rawRows = await page.evaluate(extractTableDataScript);

    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let products = transformRawRows(rawRows, options.region, today);

    // Apply limit if specified
    if (options.limit && products.length > options.limit) {
      products = products.slice(0, options.limit);
    }

    logger.info(`FastMoss scraped ${String(products.length)} products`, {
      region: options.region,
      category: options.category,
    });

    return products;
  } finally {
    await context.close();
  }
}
