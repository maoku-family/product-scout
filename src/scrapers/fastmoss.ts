import { chromium } from "playwright";

import { FastmossProductSchema } from "@/schemas/product";
import type { FastmossProduct } from "@/schemas/product";
import { logger } from "@/utils/logger";
import { withRetry } from "@/utils/retry";

const FASTMOSS_BASE_URL = "https://www.fastmoss.com/e-commerce/saleslist";
const BROWSER_DATA_DIR = "db/browser-data";
const MIN_DELAY_MS = 1000;

export type FastmossScrapeOptions = {
  region: string;
  category?: string;
  limit?: number;
};

/**
 * Scrape FastMoss ranking page using Playwright with persistent context.
 * - Uses saved session from db/browser-data/
 * - Detects expired session (redirect to login page)
 * - Applies region + category filters via URL
 * - Respects rate limiting (1s+ delay between navigations)
 */
export async function scrapeFastmoss(
  options: FastmossScrapeOptions,
): Promise<FastmossProduct[]> {
  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: true,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // Build URL with region filter
    const url = new URL(FASTMOSS_BASE_URL);
    url.searchParams.set("country", options.region);
    if (options.category) {
      url.searchParams.set("category", options.category);
    }

    await withRetry(async () => {
      await page.goto(url.toString(), { waitUntil: "networkidle" });
    });

    // Check for login redirect (expired session)
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      logger.error("FastMoss session expired — please login manually");
      throw new Error(
        "FastMoss session expired. Please login manually via: npx playwright open db/browser-data/",
      );
    }

    await page.waitForTimeout(MIN_DELAY_MS);

    const html = await page.content();
    const today = new Date().toISOString().slice(0, 10);
    let products = parseFastmossRanking(html, options.region, today);

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

/**
 * Extract text content from an HTML element matched by class name within a row.
 * Returns the trimmed text content between the opening and closing tags.
 */
function extractCellText(rowHtml: string, className: string): string {
  const pattern = new RegExp(
    `<td\\s[^>]*class="${className}"[^>]*>([^<]*)</td>`,
  );
  const match = pattern.exec(rowHtml);
  return match?.[1]?.trim() ?? "";
}

/**
 * Parse a percentage string like "25.5%" or "-5.2%" into a decimal number.
 * Returns 0 if the string cannot be parsed.
 */
function parsePercentage(raw: string): number {
  const cleaned = raw.replace("%", "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return 0;
  }
  return value / 100;
}

/**
 * Parse FastMoss ranking page HTML into validated products.
 * Pure function — no Playwright dependency, fully testable.
 */
export function parseFastmossRanking(
  html: string,
  country: string,
  scrapedAt: string,
): FastmossProduct[] {
  const products: FastmossProduct[] = [];

  // Match all product rows
  const rowPattern = /<tr\s[^>]*class="product-row"[^>]*>[\s\S]*?<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[0];

    const productName = extractCellText(rowHtml, "product-name");
    const shopName = extractCellText(rowHtml, "shop-name");
    const categoryRaw = extractCellText(rowHtml, "category");
    const unitsSoldRaw = extractCellText(rowHtml, "units-sold");
    const gmvRaw = extractCellText(rowHtml, "gmv");
    const growthRateRaw = extractCellText(rowHtml, "growth-rate");
    const commissionRateRaw = extractCellText(rowHtml, "commission-rate");

    const raw = {
      productName,
      shopName,
      country,
      category: categoryRaw === "" ? null : categoryRaw,
      unitsSold: Number.parseInt(unitsSoldRaw, 10),
      gmv: Number.parseFloat(gmvRaw),
      orderGrowthRate: parsePercentage(growthRateRaw),
      commissionRate: parsePercentage(commissionRateRaw),
      scrapedAt,
    };

    const result = FastmossProductSchema.safeParse(raw);
    if (result.success) {
      products.push(result.data);
    } else {
      logger.warn(
        `[fastmoss] Skipping invalid product "${productName}"`,
        result.error.issues,
      );
    }
  }

  return products;
}
