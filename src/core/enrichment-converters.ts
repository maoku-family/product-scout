import type { CjCostResult } from "@/api/cj";
import type { InsertProductEnrichmentInput } from "@/db/queries";
import type { ShopeeProduct } from "@/schemas/shopee";

/**
 * Convert a ShopeeProduct to InsertProductEnrichmentInput.
 * Shopee-specific fields (shopeeUrl, shopeeProductId, title) are stored in `extra` JSON.
 */
export function shopeeToEnrichment(
  shopee: ShopeeProduct,
  productId: number,
): InsertProductEnrichmentInput {
  return {
    productId,
    source: "shopee",
    price: shopee.price,
    soldCount: shopee.soldCount,
    rating: shopee.rating,
    profitMargin: null,
    extra: JSON.stringify({
      shopeeProductId: shopee.productId,
      title: shopee.title,
      shopeeUrl: shopee.shopeeUrl,
    }),
    scrapedAt: shopee.updatedAt,
  };
}

/**
 * Convert a CjCostResult to InsertProductEnrichmentInput.
 * CJ-specific fields (cjUrl, shippingCost) are stored in `extra` JSON.
 */
export function cjToEnrichment(
  cj: CjCostResult,
  productId: number,
  scrapedAt: string,
): InsertProductEnrichmentInput {
  return {
    productId,
    source: "cj",
    price: cj.cjPrice,
    soldCount: null,
    rating: null,
    profitMargin: cj.profitMargin,
    extra: JSON.stringify({
      cjUrl: cj.cjUrl,
      shippingCost: cj.shippingCost,
    }),
    scrapedAt,
  };
}
