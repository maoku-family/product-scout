import { z } from "zod";

import { ShopeeProductSchema } from "@/schemas/shopee";
import type { ShopeeProduct } from "@/schemas/shopee";
import { logger } from "@/utils/logger";

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
