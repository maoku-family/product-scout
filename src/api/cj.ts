import { z } from "zod";

import { logger } from "@/utils/logger";
import { withRetry } from "@/utils/retry";

const CJ_API_URL =
  "https://developers.cjdropshipping.com/api2.0/v1/product/list";
const DEFAULT_SHIPPING_COST = 3.0; // USD estimated average for SEA

const CjProductSchema = z.object({
  pid: z.string(),
  productNameEn: z.string(),
  sellPrice: z.number().min(0),
  productImage: z.string().optional(),
  categoryName: z.string().optional(),
});

const CjResponseSchema = z.object({
  code: z.number(),
  result: z.boolean(),
  message: z.string(),
  data: z
    .object({
      list: z.array(CjProductSchema),
    })
    .nullable(),
});

export type CjCostResult = {
  cjPrice: number;
  shippingCost: number;
  profitMargin: number;
  cjUrl: string;
};

/**
 * Search CJ for a product and calculate cost data.
 * Returns null if no matching product found.
 */
export async function searchCjProduct(
  keyword: string,
  shopeePrice: number,
  apiKey: string,
): Promise<CjCostResult | null> {
  return withRetry(async () => {
    /* eslint-disable @typescript-eslint/naming-convention */
    const headers = {
      "CJ-Access-Token": apiKey,
      "Content-Type": "application/json",
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    const response = await fetch(CJ_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        productNameEn: keyword,
        pageNum: 1,
        pageSize: 10,
      }),
    });

    if (!response.ok) {
      const msg = `CJ API error: ${String(response.status)} ${response.statusText}`;
      logger.error(msg);
      throw new Error(msg);
    }

    const json: unknown = await response.json();
    const parsed = CjResponseSchema.parse(json);

    if (!parsed.data || parsed.data.list.length === 0) {
      logger.debug("No CJ products found", { keyword });
      return null;
    }

    const product = parsed.data.list[0];
    if (!product) {
      return null;
    }

    const shippingCost = DEFAULT_SHIPPING_COST;
    const profitMargin =
      (shopeePrice - product.sellPrice - shippingCost) / shopeePrice;

    return {
      cjPrice: product.sellPrice,
      shippingCost,
      profitMargin: Number(profitMargin.toFixed(4)),
      cjUrl: `https://cjdropshipping.com/product/${product.pid}`,
    };
  });
}
