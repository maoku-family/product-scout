import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseShopeeSearchResults } from "@/scrapers/shopee";

const fixturesDir = resolve(import.meta.dirname, "../../fixtures/shopee");

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(resolve(fixturesDir, name), "utf-8"),
  ) as unknown;
}

describe("parseShopeeSearchResults", () => {
  it("parses search results JSON into ShopeeProduct array", () => {
    const json = loadFixture("search-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    expect(products).toHaveLength(3);
    expect(products[0]).toBeDefined();
    expect(products[0]?.productId).toBe(12345678);
    expect(products[0]?.title).toBe("LED Ring Light Stand");
    // price is in cents, should be converted to currency units
    expect(products[0]?.price).toBe(299.0);
    expect(products[0]?.soldCount).toBe(1500);
    expect(products[0]?.rating).toBe(4.8);
  });

  it("constructs correct Shopee URL for the region", () => {
    const json = loadFixture("search-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    expect(products[0]?.shopeeUrl).toContain("shopee.co.th");
    expect(products[0]?.shopeeUrl).toContain("12345678");
  });

  it("returns empty array for no results", () => {
    const json = loadFixture("empty-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    expect(products).toHaveLength(0);
  });

  it("validates each product with Zod schema", () => {
    const json = loadFixture("search-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    for (const product of products) {
      expect(product.productId).toBeGreaterThan(0);
      expect(product.price).toBeGreaterThanOrEqual(0);
      expect(product.rating).toBeGreaterThanOrEqual(0);
      expect(product.rating).toBeLessThanOrEqual(5);
    }
  });

  it("uses price_min when available (lowest price)", () => {
    const json = loadFixture("search-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    // Second product: price=59900 but price_min=49900, should use price_min
    expect(products[1]?.price).toBe(499.0);
  });

  it("sets updatedAt from parameter", () => {
    const json = loadFixture("search-results.json");
    const products = parseShopeeSearchResults(json, "th", "2025-01-15");

    expect(products[0]?.updatedAt).toBe("2025-01-15");
  });
});
