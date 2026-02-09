import { describe, expect, it } from "vitest";

import {
  CategoriesConfigSchema,
  CategorySchema,
  RegionSchema,
  RegionsConfigSchema,
} from "@/schemas/config";

describe("RegionSchema", () => {
  it("parses a valid region config", () => {
    const input = {
      name: "Thailand",
      currency: "THB",
      language: "th",
      enabled: true,
    };

    const result = RegionSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("rejects when a required field is missing", () => {
    const input = {
      name: "Thailand",
      // missing currency and language
    };

    const result = RegionSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("defaults enabled to true when omitted", () => {
    const input = {
      name: "Thailand",
      currency: "THB",
      language: "th",
    };

    const result = RegionSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });
});

describe("RegionsConfigSchema", () => {
  it("parses a valid regions config with multiple entries", () => {
    const input = {
      regions: {
        th: { name: "Thailand", currency: "THB", language: "th" },
        vn: {
          name: "Vietnam",
          currency: "VND",
          language: "vi",
          enabled: false,
        },
      },
    };

    const result = RegionsConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regions.th?.enabled).toBe(true);
      expect(result.data.regions.vn?.enabled).toBe(false);
    }
  });
});

describe("CategorySchema", () => {
  it("parses a valid category config", () => {
    const input = {
      name: "Beauty",
      searchKeywords: ["skincare", "makeup"],
    };

    const result = CategorySchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("rejects when searchKeywords is an empty array", () => {
    const input = {
      name: "Beauty",
      searchKeywords: [],
    };

    const result = CategorySchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("rejects when name is missing", () => {
    const input = {
      searchKeywords: ["skincare"],
    };

    const result = CategorySchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("CategoriesConfigSchema", () => {
  it("parses a valid categories config with multiple entries", () => {
    const input = {
      categories: {
        beauty: {
          name: "Beauty",
          searchKeywords: ["skincare", "makeup"],
        },
        electronics: {
          name: "Electronics",
          searchKeywords: ["phone accessories"],
        },
      },
    };

    const result = CategoriesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.categories)).toHaveLength(2);
    }
  });
});
