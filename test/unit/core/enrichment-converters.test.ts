/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from "vitest";

import type { CjCostResult } from "@/api/cj";
import {
  cjToEnrichment,
  shopeeToEnrichment,
} from "@/core/enrichment-converters";
import type { ShopeeProduct } from "@/schemas/shopee";

describe("shopeeToEnrichment", () => {
  const shopeeProduct: ShopeeProduct = {
    productId: 12345,
    title: "LED Ring Light Stand",
    price: 299.0,
    soldCount: 1500,
    rating: 4.8,
    shopeeUrl: "https://shopee.co.th/product/111/12345",
    updatedAt: "2025-01-15",
  };

  it("sets source to 'shopee'", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    expect(result.source).toBe("shopee");
  });

  it("maps price, soldCount, and rating from ShopeeProduct", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    expect(result.price).toBe(299.0);
    expect(result.soldCount).toBe(1500);
    expect(result.rating).toBe(4.8);
  });

  it("sets productId from the database product ID parameter", () => {
    const result = shopeeToEnrichment(shopeeProduct, 42);
    expect(result.productId).toBe(42);
  });

  it("stores shopeeUrl in extra JSON", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    expect(result.extra).not.toBeNull();
    const extra = JSON.parse(result.extra!) as Record<string, unknown>;
    expect(extra.shopeeUrl).toBe("https://shopee.co.th/product/111/12345");
  });

  it("stores shopee productId in extra JSON", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    const extra = JSON.parse(result.extra!) as Record<string, unknown>;
    expect(extra.shopeeProductId).toBe(12345);
  });

  it("stores title in extra JSON", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    const extra = JSON.parse(result.extra!) as Record<string, unknown>;
    expect(extra.title).toBe("LED Ring Light Stand");
  });

  it("sets scrapedAt from updatedAt", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    expect(result.scrapedAt).toBe("2025-01-15");
  });

  it("sets profitMargin to null (shopee has no margin data)", () => {
    const result = shopeeToEnrichment(shopeeProduct, 1);
    expect(result.profitMargin).toBeNull();
  });
});

describe("cjToEnrichment", () => {
  const cjResult: CjCostResult = {
    cjPrice: 5.99,
    shippingCost: 3.0,
    profitMargin: 0.5505,
    cjUrl: "https://cjdropshipping.com/product/abc123",
  };

  it("sets source to 'cj'", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-01-15");
    expect(result.source).toBe("cj");
  });

  it("maps cjPrice to price", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-01-15");
    expect(result.price).toBe(5.99);
  });

  it("maps profitMargin from CJ result", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-01-15");
    expect(result.profitMargin).toBe(0.5505);
  });

  it("sets productId from the database product ID parameter", () => {
    const result = cjToEnrichment(cjResult, 42, "2025-01-15");
    expect(result.productId).toBe(42);
  });

  it("stores cjUrl, shippingCost in extra JSON", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-01-15");
    expect(result.extra).not.toBeNull();
    const extra = JSON.parse(result.extra!) as Record<string, unknown>;
    expect(extra.cjUrl).toBe("https://cjdropshipping.com/product/abc123");
    expect(extra.shippingCost).toBe(3.0);
  });

  it("sets scrapedAt from parameter", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-02-20");
    expect(result.scrapedAt).toBe("2025-02-20");
  });

  it("sets soldCount and rating to null (CJ has no sales/rating data)", () => {
    const result = cjToEnrichment(cjResult, 1, "2025-01-15");
    expect(result.soldCount).toBeNull();
    expect(result.rating).toBeNull();
  });
});
