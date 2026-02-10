import { describe, expect, it } from "vitest";

import { CostSchema } from "@/schemas/cost";

const validCost = {
  productId: 12345,
  cjPrice: 50.0,
  shippingCost: 15.0,
  profitMargin: 0.35,
  cjUrl: "https://cjdropshipping.com/product/12345",
  updatedAt: "2024-06-15",
};

describe("CostSchema", () => {
  it("parses valid cost data", () => {
    const result = CostSchema.safeParse(validCost);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validCost);
    }
  });

  it("rejects negative cjPrice", () => {
    const result = CostSchema.safeParse({
      ...validCost,
      cjPrice: -10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative shippingCost", () => {
    const result = CostSchema.safeParse({
      ...validCost,
      shippingCost: -5,
    });

    expect(result.success).toBe(false);
  });

  it("accepts negative profitMargin", () => {
    const result = CostSchema.safeParse({
      ...validCost,
      profitMargin: -0.2,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profitMargin).toBe(-0.2);
    }
  });

  it("rejects invalid cjUrl", () => {
    const result = CostSchema.safeParse({
      ...validCost,
      cjUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects productId as 0", () => {
    const result = CostSchema.safeParse({
      ...validCost,
      productId: 0,
    });

    expect(result.success).toBe(false);
  });
});
