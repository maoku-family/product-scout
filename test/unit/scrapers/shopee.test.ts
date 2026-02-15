import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

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

/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion -- Shopee API mock data uses snake_case */

// Mock global fetch once at module level — avoids race conditions in parallel tests
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

// Import after mock setup so module captures the mocked fetch
const { searchShopee } = await import("@/scrapers/shopee");

describe("searchShopee", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("constructs correct URL for the region", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });

    await searchShopee({ keyword: "yoga mat", region: "th" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("shopee.co.th"),
      expect.any(Object),
    );
  });

  it("returns parsed products from API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            {
              item_basic: {
                itemid: 999,
                name: "Test Product",
                price: 19900,
                price_min: 19900,
                historical_sold: 500,
                item_rating: { rating_star: 4.5 },
                shopid: 111,
              },
            },
          ],
        }),
    });

    const products = await searchShopee({ keyword: "test", region: "th" });

    expect(products).toHaveLength(1);
    expect(products[0]?.title).toBe("Test Product");
    expect(products[0]?.price).toBe(199.0);
  });

  it("respects limit option", async () => {
    const items = Array.from({ length: 5 }, (_unused, i) => ({
      item_basic: {
        itemid: i + 1,
        name: `Product ${String(i + 1)}`,
        price: 10000,
        historical_sold: 100,
        item_rating: { rating_star: 4.0 },
        shopid: 100,
      },
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items }),
    });

    const products = await searchShopee({
      keyword: "test",
      region: "th",
      limit: 3,
    });

    expect(products.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array on block/captcha (non-ok response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const products = await searchShopee({ keyword: "test", region: "th" });

    expect(products).toHaveLength(0);
  });

  it("returns empty array on network error (graceful degradation)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const products = await searchShopee({ keyword: "test", region: "th" });

    expect(products).toHaveLength(0);
  });
});
/* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
