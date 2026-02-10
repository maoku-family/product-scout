import { describe, expect, it } from "vitest";

import { ShopeeProductSchema } from "@/schemas/shopee";

const validShopeeProduct = {
  productId: 12345,
  title: "Wireless Bluetooth Earbuds",
  price: 299.0,
  soldCount: 5000,
  rating: 4.8,
  shopeeUrl: "https://shopee.co.th/product/12345",
  updatedAt: "2024-06-15",
};

describe("ShopeeProductSchema", () => {
  it("parses a valid shopee product", () => {
    const result = ShopeeProductSchema.safeParse(validShopeeProduct);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validShopeeProduct);
    }
  });

  it("rejects when title is missing", () => {
    const { title: omittedTitle, ...withoutTitle } = validShopeeProduct;
    const result = ShopeeProductSchema.safeParse(withoutTitle);

    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = ShopeeProductSchema.safeParse({
      ...validShopeeProduct,
      price: -10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating greater than 5", () => {
    const result = ShopeeProductSchema.safeParse({
      ...validShopeeProduct,
      rating: 5.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects rating less than 0", () => {
    const result = ShopeeProductSchema.safeParse({
      ...validShopeeProduct,
      rating: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects soldCount as float", () => {
    const result = ShopeeProductSchema.safeParse({
      ...validShopeeProduct,
      soldCount: 100.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid shopeeUrl", () => {
    const result = ShopeeProductSchema.safeParse({
      ...validShopeeProduct,
      shopeeUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid updatedAt format", () => {
    const invalidDates = [
      "06-15-2024",
      "2024/06/15",
      "2024-6-5",
      "not-a-date",
      "20240615",
    ];

    for (const date of invalidDates) {
      const result = ShopeeProductSchema.safeParse({
        ...validShopeeProduct,
        updatedAt: date,
      });

      expect(result.success).toBe(false);
    }
  });
});
