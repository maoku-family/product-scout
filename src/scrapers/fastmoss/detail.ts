import { ProductDetailSchema } from "@/schemas/product";
import type { ProductDetail } from "@/schemas/product";
import {
  checkLoginStatus,
  FASTMOSS_BASE_URL,
  launchFastmossContext,
  parsePercentage,
} from "@/scrapers/fastmoss/shared";
import { logger } from "@/utils/logger";
import { parseChineseNumber } from "@/utils/parse-chinese-number";
import { withRetry } from "@/utils/retry";

/**
 * Raw data extracted from the FastMoss product detail page DOM.
 * All values are strings exactly as they appear on screen.
 */
export type RawDetailPageData = {
  fastmossId: string;
  hotIndex: string;
  popularityIndex: string;
  price: string;
  priceUsd: string;
  commissionRate: string;
  rating: string;
  reviewCount: string;
  listedAt: string;
  stockStatus: string;
  totalSales: string;
  totalGmv: string;
  creatorCount: string;
  videoCount: string;
  liveCount: string;
  channelVideoPct: string;
  channelLivePct: string;
  channelOtherPct: string;
  vocPositive: string[];
  vocNegative: string[];
  similarProductCount: string;
  category: string;
};

/**
 * Parse a price string like "$44.00", "฿290.00", "RM15.00", "$11.95 - 35.50"
 * into a numeric value. Takes the first value if it's a range.
 * Returns null for empty or unparseable strings.
 */
function parsePrice(raw: string): number | null {
  if (!raw || raw.trim() === "") {
    return null;
  }

  // Take the first value if it's a range like "$11.95 - 35.50"
  const rangePart = raw.split("-")[0] ?? raw;

  // Remove currency symbols/prefixes
  const cleaned = rangePart
    .trim()
    .replace(/^[A-Za-z₱$¥€£฿]+/, "")
    .replace(/,/g, "")
    .trim();

  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

/**
 * Parse a numeric integer string, removing commas.
 * Returns null for empty or unparseable strings.
 */
function parseIntOrNull(raw: string): number | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number.parseInt(cleaned, 10);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

/**
 * Parse a float string (e.g. rating "4.8").
 * Returns null for empty or unparseable strings.
 */
function parseFloatOrNull(raw: string): number | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

/**
 * Parse a percentage string into a decimal, returning null for empty strings.
 */
function parsePercentageOrNull(raw: string): number | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  return parsePercentage(raw);
}

/**
 * Parse a Chinese-formatted number, returning null for empty strings.
 */
function parseChineseNumberOrNull(raw: string): number | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  return parseChineseNumber(raw);
}

/**
 * Extract YYYY-MM-DD date from a listedAt string like "2023-04-29 (GMT+7)".
 * Returns null for empty strings.
 */
function parseListedAt(raw: string): string | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  const match = /\d{4}-\d{2}-\d{2}/.exec(raw);
  return match ? match[0] : null;
}

/**
 * DOM extraction script — runs inside browser via page.evaluate().
 * Extracts data from the product detail card layout (NOT a table).
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
export function extractDetailPageDataScript(
  fastmossId: string,
): RawDetailPageData {
  const pageText = document.body?.textContent ?? "";

  // Rating: "4.8 / 5" pattern
  let rating = "";
  const ratingMatch = /(\d+\.?\d*)\s*\/\s*5/.exec(pageText);
  if (ratingMatch?.[1]) {
    rating = ratingMatch[1];
  }

  // Review count: "评论数：733"
  let reviewCount = "";
  const reviewMatch = /评论数[：:]\s*([0-9,.]+万?亿?)/.exec(pageText);
  if (reviewMatch?.[1]) {
    reviewCount = reviewMatch[1];
  }

  // Hot index: number before "商品热度指数"
  let hotIndex = "";
  const hotMatch = /([0-9,.]+)\s*商品热度指数/.exec(pageText);
  if (hotMatch?.[1]) {
    hotIndex = hotMatch[1];
  }

  // Popularity index: number before "人气指数"
  let popularityIndex = "";
  const popMatch = /([0-9,.]+)\s*人气指数/.exec(pageText);
  if (popMatch?.[1]) {
    popularityIndex = popMatch[1];
  }

  // Total sales: "12.91万" before "总销量"
  let totalSales = "";
  const salesMatch = /([0-9,.]+万?亿?)\s*总销量/.exec(pageText);
  if (salesMatch?.[1]) {
    totalSales = salesMatch[1];
  }

  // Total GMV: "47.60万" before "总GMV"
  let totalGmv = "";
  const gmvMatch = /([0-9,.]+万?亿?)\s*总GMV/.exec(pageText);
  if (gmvMatch?.[1]) {
    totalGmv = gmvMatch[1];
  }

  // Creator count: before "带货达人数"
  let creatorCount = "";
  const creatorMatch = /([0-9,.]+万?亿?)\s*带货达人数/.exec(pageText);
  if (creatorMatch?.[1]) {
    creatorCount = creatorMatch[1];
  }

  // Video count: before "视频数量"
  let videoCount = "";
  const videoMatch = /([0-9,.]+万?亿?)\s*视频数量/.exec(pageText);
  if (videoMatch?.[1]) {
    videoCount = videoMatch[1];
  }

  // Listed at: "预估上架日期：2023-04-29 (GMT+7)"
  let listedAt = "";
  const listedMatch = /预估上架日期[：:]\s*(.+?)(?:\n|$)/.exec(pageText);
  if (listedMatch?.[1]) {
    listedAt = listedMatch[1].trim();
  }

  // Stock status: "库存：*0+*"
  let stockStatus = "";
  const stockMatch = /库存[：:]\s*\*?(.+?)\*?(?:\n|$)/.exec(pageText);
  if (stockMatch?.[1]) {
    stockStatus = stockMatch[1].replace(/\*/g, "").trim();
  }

  // Price: "价格：$44.00"
  let price = "";
  const priceMatch = /价格[：:]\s*(.+?)(?:\n|$)/.exec(pageText);
  if (priceMatch?.[1]) {
    price = priceMatch[1].replace(/\*/g, "").trim();
  }

  // Commission rate: "佣金率：20%"
  let commissionRate = "";
  const commMatch = /佣金率[：:]\s*(\d+\.?\d*%)/.exec(pageText);
  if (commMatch?.[1]) {
    commissionRate = commMatch[1];
  }

  // Category: from breadcrumb-like text
  let category = "";
  const categoryElements = document.querySelectorAll(
    ".product-category, .breadcrumb",
  );
  if (categoryElements.length > 0) {
    category = categoryElements[0]?.textContent?.trim() ?? "";
  }
  // Fallback: look for pattern like "运动与户外 / ..."
  if (!category) {
    const catMatch =
      /[\u4e00-\u9fff\w]+\s*\/\s*[\u4e00-\u9fff\w]+\s*\/\s*[\u4e00-\u9fff\w]+/.exec(
        pageText,
      );
    if (catMatch) {
      category = catMatch[0];
    }
  }

  // Channel percentages from chart data — try to extract from echarts option
  const channelVideoPct = "";
  const channelLivePct = "";
  const channelOtherPct = "";

  // Live count from tab
  let liveCount = "";
  const liveTabMatch = /商品关联直播\s*\(?\s*(\d+)\s*\)?/.exec(pageText);
  if (liveTabMatch?.[1]) {
    liveCount = liveTabMatch[1];
  }

  // VOC positive and negative points
  const vocPositive: string[] = [];
  const vocNegative: string[] = [];

  // Try to find VOC sections
  const vocSection = document.querySelector(
    '[id*="voc"], [class*="voc"], [class*="VOC"]',
  );
  if (vocSection) {
    const positiveItems = vocSection.querySelectorAll(
      '[class*="positive"] li, [class*="good"] li',
    );
    for (const item of positiveItems) {
      const text = item.textContent?.trim() ?? "";
      if (text) {
        vocPositive.push(text);
      }
    }
    const negativeItems = vocSection.querySelectorAll(
      '[class*="negative"] li, [class*="bad"] li',
    );
    for (const item of negativeItems) {
      const text = item.textContent?.trim() ?? "";
      if (text) {
        vocNegative.push(text);
      }
    }
  }

  // Similar product count
  let similarProductCount = "";
  const similarSection = document.querySelector(
    '[id*="similar"], [class*="similar"]',
  );
  if (similarSection) {
    const items = similarSection.querySelectorAll(
      '[class*="product"], [class*="card"], [class*="item"]',
    );
    similarProductCount = String(items.length);
  }

  return {
    fastmossId,
    hotIndex,
    popularityIndex,
    price,
    priceUsd: price, // Same as price for USD regions; override in caller if needed
    commissionRate,
    rating,
    reviewCount,
    listedAt,
    stockStatus,
    totalSales,
    totalGmv,
    creatorCount,
    videoCount,
    liveCount,
    channelVideoPct,
    channelLivePct,
    channelOtherPct,
    vocPositive,
    vocNegative,
    similarProductCount,
    category,
  };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

/**
 * Transform raw DOM-extracted detail page data into a validated ProductDetail.
 * Pure function — fully testable without Playwright.
 */
export function transformDetailPageData(
  raw: RawDetailPageData,
  productId: number,
  scrapedAt: string,
): ProductDetail | null {
  if (!raw.fastmossId) {
    logger.warn("[fastmoss:detail] Skipping — empty fastmossId");
    return null;
  }

  const parsed = {
    productId,
    fastmossId: raw.fastmossId,
    hotIndex: parseIntOrNull(raw.hotIndex),
    popularityIndex: parseIntOrNull(raw.popularityIndex),
    price: parsePrice(raw.price),
    priceUsd: parsePrice(raw.priceUsd),
    commissionRate: parsePercentageOrNull(raw.commissionRate),
    rating: parseFloatOrNull(raw.rating),
    reviewCount: parseIntOrNull(raw.reviewCount),
    listedAt: parseListedAt(raw.listedAt),
    stockStatus: raw.stockStatus.trim() === "" ? null : raw.stockStatus.trim(),
    creatorCount: parseChineseNumberOrNull(raw.creatorCount),
    videoCount: parseChineseNumberOrNull(raw.videoCount),
    liveCount: parseChineseNumberOrNull(raw.liveCount),
    channelVideoPct: parsePercentageOrNull(raw.channelVideoPct),
    channelLivePct: parsePercentageOrNull(raw.channelLivePct),
    channelOtherPct: parsePercentageOrNull(raw.channelOtherPct),
    vocPositive:
      raw.vocPositive.length > 0 ? JSON.stringify(raw.vocPositive) : null,
    vocNegative:
      raw.vocNegative.length > 0 ? JSON.stringify(raw.vocNegative) : null,
    similarProductCount: parseIntOrNull(raw.similarProductCount),
    scrapedAt,
  };

  const result = ProductDetailSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  logger.warn(
    `[fastmoss:detail] Validation failed for "${raw.fastmossId}"`,
    result.error.issues,
  );
  return null;
}

/**
 * Scrape a single FastMoss product detail page.
 */
export async function scrapeProductDetail(
  fastmossId: string,
  productId: number,
  options?: { profileDir?: string },
): Promise<ProductDetail | null> {
  const context = await launchFastmossContext(options?.profileDir);

  try {
    const page = await context.newPage();
    const url = `${FASTMOSS_BASE_URL}/e-commerce/detail/${fastmossId}`;

    logger.info(`Scraping product detail: ${fastmossId}`);

    await withRetry(
      () =>
        page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
      { maxRetries: 3, delay: 2000 },
    );

    checkLoginStatus(page);

    // Wait for the detail page content to load
    await page.waitForTimeout(3000);

    const rawData = await page.evaluate(
      extractDetailPageDataScript,
      fastmossId,
    );
    await page.close();

    const scrapedAt = new Date().toISOString();
    const detail = transformDetailPageData(rawData, productId, scrapedAt);

    if (detail) {
      logger.info(`Product detail scraped successfully: ${fastmossId}`);
    } else {
      logger.warn(`Failed to transform product detail: ${fastmossId}`);
    }

    return detail;
  } finally {
    await context.close();
  }
}
