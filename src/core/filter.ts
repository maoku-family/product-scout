import type { Filter } from "@/schemas/config";
import type { FastmossProduct } from "@/schemas/product";

// ── Pre-filter types ────────────────────────────────────────────────

/**
 * Minimal product shape for pre-filtering.
 * Any source (saleslist, newProducts, hotlist, search, shop-detail)
 * can be mapped to this shape before pre-filtering.
 */
export type PreFilterProduct = {
  productName: string;
  category: string | null;
  unitsSold: number;
  growthRate: number;
};

/**
 * Map a FastmossProduct to PreFilterProduct (backward compatibility).
 */
export function toPreFilterProduct(p: FastmossProduct): PreFilterProduct {
  return {
    productName: p.productName,
    category: p.category,
    unitsSold: p.unitsSold,
    growthRate: p.orderGrowthRate,
  };
}

// ── Post-filter types ───────────────────────────────────────────────

/**
 * Product data with enrichment info for post-filtering.
 * Built from product_enrichments table data.
 */
export type PostFilterProduct = {
  productId: number;
  shopeePrice?: number;
  profitMargin?: number;
};

// ── Backward compatibility ──────────────────────────────────────────

/**
 * @deprecated Use PostFilterProduct instead.
 */
export type EnrichedProduct = {
  product: FastmossProduct;
  shopeePrice?: number;
  profitMargin?: number;
};

// ── Pre-filter ──────────────────────────────────────────────────────

/**
 * Pre-filter: runs after data collection, before external requests.
 * Filters by: minUnitsSold, minGrowthRate, excludedCategories.
 *
 * Works with any product type that has the PreFilterProduct shape.
 */
export function preFilter<T extends PreFilterProduct>(
  products: T[],
  filters: Filter,
): T[] {
  return products.filter((p) => {
    if (p.unitsSold < filters.minUnitsSold) {
      return false;
    }
    if (p.growthRate < filters.minGrowthRate) {
      return false;
    }
    if (p.category && filters.excludedCategories.includes(p.category)) {
      return false;
    }
    return true;
  });
}

// ── Post-filter ─────────────────────────────────────────────────────

/**
 * Post-filter: runs after enrichment data is available.
 * Filters by: price range, profit margin.
 * Only applies filters when the corresponding data is present.
 *
 * Works with any type that has the PostFilterProduct shape.
 */
export function postFilter<T extends PostFilterProduct>(
  products: T[],
  filters: Filter,
): T[] {
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
