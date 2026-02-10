import { describe, expect, it } from "vitest";

import { FastmossProductSchema } from "@/schemas/product";

const validProduct = {
  productName: "Vitamin C Serum 30ml",
  shopName: "BeautyShop",
  country: "TH",
  category: "Beauty",
  unitsSold: 1500,
  gmv: 45000.5,
  orderGrowthRate: 0.25,
  commissionRate: 0.1,
  scrapedAt: "2024-01-15",
};

describe("FastmossProductSchema", () => {
  it("parses a valid product", () => {
    const result = FastmossProductSchema.safeParse(validProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validProduct);
    }
  });

  it("rejects when productName is missing", () => {
    const result = FastmossProductSchema.safeParse({
      shopName: validProduct.shopName,
      country: validProduct.country,
      category: validProduct.category,
      unitsSold: validProduct.unitsSold,
      gmv: validProduct.gmv,
      orderGrowthRate: validProduct.orderGrowthRate,
      commissionRate: validProduct.commissionRate,
      scrapedAt: validProduct.scrapedAt,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative unitsSold", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      unitsSold: -1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts zero unitsSold", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      unitsSold: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative gmv", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      gmv: -100,
    });

    expect(result.success).toBe(false);
  });

  it("accepts negative orderGrowthRate", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      orderGrowthRate: -0.35,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderGrowthRate).toBe(-0.35);
    }
  });

  it("rejects commissionRate above 1", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      commissionRate: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects commissionRate below 0", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      commissionRate: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts null category", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      category: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBeNull();
    }
  });

  it("validates scrapedAt as YYYY-MM-DD format", () => {
    const result = FastmossProductSchema.safeParse({
      ...validProduct,
      scrapedAt: "2024-01-15",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid scrapedAt format", () => {
    const invalidDates = [
      "01-15-2024",
      "2024/01/15",
      "2024-1-5",
      "not-a-date",
      "20240115",
    ];

    for (const date of invalidDates) {
      const result = FastmossProductSchema.safeParse({
        ...validProduct,
        scrapedAt: date,
      });

      expect(result.success).toBe(false);
    }
  });
});
