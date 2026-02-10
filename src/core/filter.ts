import type { Filter } from "@/schemas/config";
import type { FastmossProduct } from "@/schemas/product";

export type EnrichedProduct = {
  product: FastmossProduct;
  shopeePrice?: number;
  profitMargin?: number;
};

/**
 * Pre-filter: runs after FastMoss scrape, before external requests.
 * Filters by: minUnitsSold, minGrowthRate, excludedCategories.
 */
export function preFilter(
  products: FastmossProduct[],
  filters: Filter,
): FastmossProduct[] {
  return products.filter((p) => {
    if (p.unitsSold < filters.minUnitsSold) {
      return false;
    }
    if (p.orderGrowthRate < filters.minGrowthRate) {
      return false;
    }
    if (p.category && filters.excludedCategories.includes(p.category)) {
      return false;
    }
    return true;
  });
}

/**
 * Post-filter: runs after Shopee + CJ data available.
 * Filters by: price range, profit margin.
 * Only applies filters when the corresponding data is present.
 */
export function postFilter(
  products: EnrichedProduct[],
  filters: Filter,
): EnrichedProduct[] {
  return products.filter((p) => {
    // Only filter by price if Shopee price is available
    if (p.shopeePrice !== undefined) {
      if (
        p.shopeePrice < filters.price.min ||
        p.shopeePrice > filters.price.max
      ) {
        return false;
      }
    }
    // Only filter by margin if CJ data is available
    if (p.profitMargin !== undefined) {
      if (p.profitMargin < filters.profitMargin.min) {
        return false;
      }
    }
    return true;
  });
}
