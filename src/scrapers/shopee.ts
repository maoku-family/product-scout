import { z } from "zod";

import { ShopeeProductSchema } from "@/schemas/shopee";
import type { ShopeeProduct } from "@/schemas/shopee";
import { logger } from "@/utils/logger";

export type ShopeeSearchOptions = {
  keyword: string;
  region: string;
  limit?: number;
};

/**
 * Region to Shopee domain mapping.
 */
const SHOPEE_DOMAINS: Record<string, string> = {
  th: "shopee.co.th",
  id: "shopee.co.id",
  ph: "shopee.ph",
  vn: "shopee.vn",
  my: "shopee.com.my",
};

/* eslint-disable @typescript-eslint/naming-convention -- Shopee external API uses snake_case */
const ShopeeItemSchema = z.object({
  item_basic: z.object({
    itemid: z.number(),
    name: z.string(),
    price: z.number(),
    price_min: z.number().optional(),
    historical_sold: z.number(),
    item_rating: z.object({
      rating_star: z.number(),
    }),
    shopid: z.number(),
  }),
});

const ShopeeResponseSchema = z.object({
  items: z.array(ShopeeItemSchema).nullable().default([]),
});
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Parse Shopee search API JSON response into validated products.
 * Pure function — no Playwright dependency.
 */
export function parseShopeeSearchResults(
  json: unknown,
  region: string,
  updatedAt: string,
): ShopeeProduct[] {
  const parsed = ShopeeResponseSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("Failed to parse Shopee response", parsed.error);
    return [];
  }

  const domain = SHOPEE_DOMAINS[region] ?? "shopee.com";
  const products: ShopeeProduct[] = [];

  for (const item of parsed.data.items ?? []) {
    const basic = item.item_basic;
    // Use price_min if available (lowest variant price), otherwise regular price
    const priceRaw = basic.price_min ?? basic.price;
    const price = priceRaw / 100; // Shopee prices are in cents

    const candidate = ShopeeProductSchema.safeParse({
      productId: basic.itemid,
      title: basic.name,
      price,
      soldCount: basic.historical_sold,
      rating: basic.item_rating.rating_star,
      shopeeUrl: `https://${domain}/product/${String(basic.shopid)}/${String(basic.itemid)}`,
      updatedAt,
    });

    if (candidate.success) {
      products.push(candidate.data);
    } else {
      logger.warn("Invalid Shopee product skipped", { itemid: basic.itemid });
    }
  }

  return products;
}

/**
 * Search for products on Shopee using the public search API.
 * Returns empty array on any error (graceful degradation).
 */
export async function searchShopee(
  options: ShopeeSearchOptions,
): Promise<ShopeeProduct[]> {
  const domain = SHOPEE_DOMAINS[options.region] ?? "shopee.com";
  const limit = options.limit ?? 10;
  const url = `https://${domain}/api/v4/search/search_items?keyword=${encodeURIComponent(options.keyword)}&limit=${String(limit)}`;

  try {
    /* eslint-disable @typescript-eslint/naming-convention -- HTTP headers use non-camelCase names */
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    if (!response.ok) {
      logger.warn(`Shopee API returned ${String(response.status)}`, {
        keyword: options.keyword,
        region: options.region,
      });
      return [];
    }

    const json: unknown = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    let products = parseShopeeSearchResults(json, options.region, today);

    if (options.limit && products.length > options.limit) {
      products = products.slice(0, options.limit);
    }

    logger.info(`Shopee found ${String(products.length)} products`, {
      keyword: options.keyword,
      region: options.region,
    });

    return products;
  } catch (error) {
    logger.warn("Shopee search failed, returning empty", {
      keyword: options.keyword,
      error,
    });
    return [];
  }
}
