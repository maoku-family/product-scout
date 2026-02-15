/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CjCostResult } from "@/api/cj";

// Mock global fetch once at module level — avoids race conditions in parallel tests
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

// Import after mock setup so module captures the mocked fetch
const { searchCjProduct } = await import("@/api/cj");

function mockJsonResponse(body: unknown): {
  ok: boolean;
  json: () => Promise<unknown>;
} {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  };
}

describe("searchCjProduct", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns cost data for a valid CJ response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        result: true,
        message: "Success",
        data: {
          list: [
            {
              pid: "abc123",
              productNameEn: "Yoga Mat",
              sellPrice: 5.99,
              productImage: "https://img.cj.com/123.jpg",
              categoryName: "Sports",
            },
          ],
        },
      }),
    );

    const result = await searchCjProduct("yoga mat", 20.0, "test-api-key");

    expect(result).not.toBeNull();
    const costResult = result as CjCostResult;
    expect(costResult.cjPrice).toBe(5.99);
    expect(costResult.cjUrl).toContain("abc123");
    // profitMargin = (shopeePrice - cjPrice - shippingCost) / shopeePrice
    expect(costResult.profitMargin).toBeGreaterThan(0);
  });

  it("returns null when no products found", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        result: true,
        message: "Success",
        data: { list: [] },
      }),
    );

    const result = await searchCjProduct("nonexistent", 20.0, "test-api-key");
    expect(result).toBeNull();
  });

  it("returns null when data is null", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        result: true,
        message: "Success",
        data: null,
      }),
    );

    const result = await searchCjProduct("anything", 20.0, "test-api-key");
    expect(result).toBeNull();
  });

  it("calculates profit margin correctly", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        result: true,
        message: "Success",
        data: {
          list: [{ pid: "x1", productNameEn: "Item", sellPrice: 10.0 }],
        },
      }),
    );

    const shopeePrice = 30.0;
    const result = await searchCjProduct("item", shopeePrice, "key");

    // shippingCost is estimated (default ~3.0 USD)
    // profitMargin = (30 - 10 - 3) / 30 = 0.567
    expect(result).not.toBeNull();
    const costResult = result as CjCostResult;
    expect(costResult.profitMargin).toBeCloseTo(
      (shopeePrice - 10.0 - costResult.shippingCost) / shopeePrice,
      2,
    );
  });

  it("throws on API error response (non-ok)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(searchCjProduct("item", 20.0, "key")).rejects.toThrow();
  });

  it("sends correct headers and body", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 200,
        result: true,
        message: "Success",
        data: { list: [] },
      }),
    );

    await searchCjProduct("yoga mat", 20.0, "my-api-key");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("cjdropshipping.com"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "CJ-Access-Token": "my-api-key",
          "Content-Type": "application/json",
        }) as Record<string, string>,
      }),
    );
  });
});
