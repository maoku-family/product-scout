import { FastmossProductSchema } from "@/schemas/product";
import type { FastmossProduct } from "@/schemas/product";
import { ShopSchema, ShopSnapshotSchema } from "@/schemas/shop";
import type { Shop, ShopSnapshot } from "@/schemas/shop";
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
 * Raw shop detail data extracted from the FastMoss detail page.
 * Card-style layout with key-value pairs.
 */
export type RawShopDetailData = {
  fastmossShopId: string;
  shopName: string;
  category: string;
  shopType: string;
  totalSales: string;
  totalRevenue: string;
  activeProducts: string;
  listedProducts: string;
  creatorCount: string;
  rating: string;
  positiveRate: string;
  shipRate48h: string;
  nationalRank: string;
  categoryRank: string;
};

/**
 * Raw product row from the shop detail page product table.
 */
export type RawShopProductRow = {
  productName: string;
  category: string;
  listedAt: string;
  commissionRate: string;
  sales28d: string;
  revenue28d: string;
};

/**
 * Map Chinese shop type label to enum value.
 */
function mapShopType(raw: string): "cross-border" | "local" | "brand" | null {
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
 * Transform raw shop detail data into validated Shop + ShopSnapshot.
 * Returns null if data is invalid.
 * Pure function — fully testable without Playwright.
 */
export function transformShopDetailData(
  raw: RawShopDetailData,
  country: string,
  scrapedAt: string,
): { shop: Shop; snapshot: ShopSnapshot } | null {
  if (!raw.shopName) {
    logger.warn("[fastmoss:shop-detail] Skipping shop with empty name");
    return null;
  }

  const shopRaw = {
    fastmossShopId: raw.fastmossShopId,
    shopName: raw.shopName,
    country,
    category: raw.category === "" ? null : raw.category,
    shopType: mapShopType(raw.shopType),
    firstSeenAt: scrapedAt,
  };

  const shopResult = ShopSchema.safeParse(shopRaw);
  if (!shopResult.success) {
    logger.warn(
      `[fastmoss:shop-detail] Invalid shop "${raw.shopName}"`,
      shopResult.error.issues,
    );
    return null;
  }

  const ratingValue = Number.parseFloat(raw.rating);

  const snapshotRaw = {
    shopId: 1, // Placeholder — will be set by DB layer
    scrapedAt,
    source: "search" as const,
    totalSales: parseChineseNumber(raw.totalSales),
    totalRevenue: parseChineseNumber(raw.totalRevenue),
    activeProducts: parseChineseNumber(raw.activeProducts),
    listedProducts: parseChineseNumber(raw.listedProducts),
    creatorCount: parseChineseNumber(raw.creatorCount),
    rating: Number.isNaN(ratingValue) ? null : ratingValue,
    positiveRate: parsePercentage(raw.positiveRate),
    shipRate48h: parsePercentage(raw.shipRate48h),
    nationalRank: parseChineseNumber(raw.nationalRank),
    categoryRank: parseChineseNumber(raw.categoryRank),
    salesGrowthRate: null,
    newProductSalesRatio: null,
  };

  const snapshotResult = ShopSnapshotSchema.safeParse(snapshotRaw);
  if (!snapshotResult.success) {
    logger.warn(
      `[fastmoss:shop-detail] Invalid snapshot for "${raw.shopName}"`,
      snapshotResult.error.issues,
    );
    return null;
  }

  return {
    shop: shopResult.data,
    snapshot: snapshotResult.data,
  };
}

/**
 * Transform raw product rows from shop detail page into FastmossProduct objects.
 * Pure function — fully testable without Playwright.
 */
export function transformShopProductRows(
  rows: RawShopProductRow[],
  country: string,
  scrapedAt: string,
): FastmossProduct[] {
  const products: FastmossProduct[] = [];

  for (const row of rows) {
    if (!row.productName) {
      continue;
    }

    const raw = {
      productName: row.productName,
      shopName: "",
      country,
      category: row.category === "" ? null : row.category,
      unitsSold: parseChineseNumber(row.sales28d),
      gmv: parseChineseNumber(row.revenue28d),
      orderGrowthRate: 0,
      commissionRate: parsePercentage(row.commissionRate),
      scrapedAt,
    };

    const result = FastmossProductSchema.safeParse(raw);
    if (result.success) {
      products.push(result.data);
    } else {
      logger.warn(
        `[fastmoss:shop-detail] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return products;
}

/**
 * Extract shop detail data from the FastMoss shop detail page using DOM API.
 * Runs inside the browser via page.evaluate().
 * Card-style layout — uses flexible text matching for key-value pairs.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
export function extractShopDetailScript(): {
  detail: RawShopDetailData;
  products: RawShopProductRow[];
} {
  /**
   * Helper: find a value by its label text in the page.
   */
  function findValueByLabel(label: string): string {
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      const text = el.textContent?.trim() ?? "";
      if (text.startsWith(label) && text.length < label.length + 50) {
        const value = text
          .slice(label.length)
          .trim()
          .replace(/^[：:]/, "")
          .trim();
        if (value) {
          return value;
        }
      }
    }
    return "";
  }

  // Extract shop ID from the URL
  const urlParts = window.location.pathname.split("/");
  const fastmossShopId = urlParts[urlParts.length - 1] ?? "";

  // Shop name is typically in a prominent heading
  const shopNameEl = document.querySelector("h1, h2, .shop-name");
  const shopName = shopNameEl?.textContent?.trim() ?? "";

  const detail: RawShopDetailData = {
    fastmossShopId,
    shopName,
    category: findValueByLabel("分类") || "",
    shopType: findValueByLabel("店铺类型"),
    totalSales: findValueByLabel("总销量"),
    totalRevenue: findValueByLabel("总销售额"),
    activeProducts: findValueByLabel("在售商品数"),
    listedProducts: findValueByLabel("在售商品数"),
    creatorCount: findValueByLabel("带货达人数"),
    rating: findValueByLabel("店铺综合评分").split("/")[0]?.trim() ?? "",
    positiveRate: findValueByLabel("好评率"),
    shipRate48h: findValueByLabel("48h内发货率"),
    nationalRank: findValueByLabel("全国排名"),
    categoryRank: findValueByLabel("分类排名"),
  };

  // Extract product table
  const tableRows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0",
  );
  const products: RawShopProductRow[] = [];

  for (const row of tableRows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 6) {
      continue;
    }

    const productName = cells[0]?.textContent?.trim() ?? "";
    const category = cells[1]?.textContent?.trim() ?? "";
    const listedAt = cells[2]?.textContent?.trim() ?? "";
    const commissionRate = cells[3]?.textContent?.trim() ?? "0%";
    const sales28d = cells[4]?.textContent?.trim() ?? "0";
    const revenue28d = cells[5]?.textContent?.trim() ?? "0";

    if (productName) {
      products.push({
        productName,
        category,
        listedAt,
        commissionRate,
        sales28d,
        revenue28d,
      });
    }
  }

  return { detail, products };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

/**
 * Scrape FastMoss shop detail page (/shop-marketing/detail/{id}).
 */
export async function scrapeShopDetail(
  fastmossShopId: string,
  country: string,
  options?: { profileDir?: string },
): Promise<{
  shop: Shop;
  snapshot: ShopSnapshot;
  products: FastmossProduct[];
} | null> {
  const context = await launchFastmossContext(options?.profileDir);

  try {
    const page = await context.newPage();

    const url = `${FASTMOSS_BASE_URL}/shop-marketing/detail/${fastmossShopId}`;

    await withRetry(
      () =>
        page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        }),
      { maxRetries: 3, delay: 2000 },
    );

    await checkLoginStatus(page);

    // Wait for content to load — shop detail uses card layout, not just tables
    await page.waitForTimeout(3000);

    const { detail, products: rawProducts } = await page.evaluate(
      extractShopDetailScript,
    );
    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    const shopData = transformShopDetailData(detail, country, today);

    if (!shopData) {
      logger.warn(
        `[fastmoss:shop-detail] Failed to parse shop detail for ${fastmossShopId}`,
      );
      return null;
    }

    const products = transformShopProductRows(rawProducts, country, today);

    logger.info(
      `FastMoss shop detail scraped: ${shopData.shop.shopName} with ${String(products.length)} products`,
      { fastmossShopId, country },
    );

    return {
      shop: shopData.shop,
      snapshot: shopData.snapshot,
      products,
    };
  } finally {
    await context.close();
  }
}
