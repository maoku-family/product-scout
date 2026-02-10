import { describe, expect, it } from "vitest";

import { postFilter, preFilter } from "@/core/filter";
import type { EnrichedProduct } from "@/core/filter";
import type { Filter } from "@/schemas/config";
import type { FastmossProduct } from "@/schemas/product";

describe("preFilter", () => {
  const filters: Filter = {
    price: { min: 5, max: 50 },
    profitMargin: { min: 0.3 },
    minUnitsSold: 100,
    minGrowthRate: 0,
    excludedCategories: ["weapons", "adult products"],
  };

  function makeProduct(
    overrides: Partial<FastmossProduct> = {},
  ): FastmossProduct {
    return {
      productName: "Test Product",
      shopName: "Test Shop",
      country: "th",
      category: "beauty",
      unitsSold: 500,
      gmv: 1000,
      orderGrowthRate: 0.5,
      commissionRate: 0.1,
      scrapedAt: "2025-01-01",
      ...overrides,
    };
  }

  it("passes product meeting all pre-filter rules", () => {
    const products = [makeProduct()];

    const result = preFilter(products, filters);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(products[0]);
  });

  it("filters out product below minUnitsSold", () => {
    const products = [makeProduct({ unitsSold: 50 })];

    const result = preFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("filters out product with negative growth rate when minGrowthRate is 0", () => {
    const products = [makeProduct({ orderGrowthRate: -0.1 })];

    const result = preFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("filters out product in excluded category", () => {
    const products = [makeProduct({ category: "weapons" })];

    const result = preFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("passes product with null category (not in excluded list)", () => {
    const products = [makeProduct({ category: null })];

    const result = preFilter(products, filters);

    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    const result = preFilter([], filters);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });
});

describe("postFilter", () => {
  const filters: Filter = {
    price: { min: 5, max: 50 },
    profitMargin: { min: 0.3 },
    minUnitsSold: 100,
    minGrowthRate: 0,
    excludedCategories: [],
  };

  const baseProduct: FastmossProduct = {
    productName: "Test Product",
    shopName: "Test Shop",
    country: "th",
    category: "beauty",
    unitsSold: 500,
    gmv: 1000,
    orderGrowthRate: 0.5,
    commissionRate: 0.1,
    scrapedAt: "2025-01-01",
  };

  function makeEnriched(
    overrides: Partial<Omit<EnrichedProduct, "product">> = {},
  ): EnrichedProduct {
    return {
      product: baseProduct,
      ...overrides,
    };
  }

  it("passes product with price in range", () => {
    const products = [makeEnriched({ shopeePrice: 25, profitMargin: 0.5 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(1);
  });

  it("filters out product with price below min", () => {
    const products = [makeEnriched({ shopeePrice: 2, profitMargin: 0.5 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("filters out product with price above max", () => {
    const products = [makeEnriched({ shopeePrice: 100, profitMargin: 0.5 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("filters out product with profit margin below min", () => {
    const products = [makeEnriched({ shopeePrice: 25, profitMargin: 0.1 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(0);
  });

  it("passes product without Shopee price data (not filtered by price)", () => {
    const products = [makeEnriched({ profitMargin: 0.5 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(1);
  });

  it("passes product without CJ cost data (not filtered by margin)", () => {
    const products = [makeEnriched({ shopeePrice: 25 })];

    const result = postFilter(products, filters);

    expect(result).toHaveLength(1);
  });
});
