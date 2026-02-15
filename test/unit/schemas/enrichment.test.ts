import { describe, expect, it } from "vitest";

import { ProductEnrichmentSchema } from "@/schemas/enrichment";

const validEnrichment = {
  productId: 1,
  source: "shopee" as const,
  price: 299.0,
  soldCount: 5000,
  rating: 4.5,
  profitMargin: 0.35,
  extra: '{"shopeeUrl":"https://shopee.co.th/item/123","shippingCost":30}',
  scrapedAt: "2024-01-15T10:30:00",
};

describe("ProductEnrichmentSchema", () => {
  it("parses valid enrichment data", () => {
    const result = ProductEnrichmentSchema.safeParse(validEnrichment);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe(1);
      expect(result.data.source).toBe("shopee");
      expect(result.data.price).toBe(299.0);
    }
  });

  it("rejects when productId is missing", () => {
    const { productId: productIdOmitted, ...without } = validEnrichment;
    const result = ProductEnrichmentSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when source is missing", () => {
    const { source: sourceOmitted, ...without } = validEnrichment;
    const result = ProductEnrichmentSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when scrapedAt is missing", () => {
    const { scrapedAt: scrapedAtOmitted, ...without } = validEnrichment;
    const result = ProductEnrichmentSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects invalid source value", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      source: "ebay",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid source values", () => {
    const sources = ["shopee", "cj", "amazon", "lazada"] as const;

    for (const source of sources) {
      const result = ProductEnrichmentSchema.safeParse({
        ...validEnrichment,
        source,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe(source);
      }
    }
  });

  it("allows nullable optional fields", () => {
    const result = ProductEnrichmentSchema.safeParse({
      productId: 1,
      source: "shopee",
      price: null,
      soldCount: null,
      rating: null,
      profitMargin: null,
      extra: null,
      scrapedAt: "2024-01-15T10:30:00",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBeNull();
      expect(result.data.extra).toBeNull();
    }
  });

  it("rejects negative price", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      price: -10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative soldCount", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      soldCount: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating above 5", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      rating: 5.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating below 0", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      rating: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts profitMargin as any number (can be negative)", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      profitMargin: -0.2,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profitMargin).toBe(-0.2);
    }
  });

  it("stores extra as JSON string", () => {
    const result = ProductEnrichmentSchema.safeParse(validEnrichment);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.extra).toBe("string");
    }
  });

  it("rejects non-integer productId", () => {
    const result = ProductEnrichmentSchema.safeParse({
      ...validEnrichment,
      productId: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
