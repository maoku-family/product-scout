import { describe, expect, it } from "vitest";

import {
  CategoriesConfigSchema,
  CategorySchema,
  FilterSchema,
  getFiltersForRegion,
  RegionSchema,
  RegionsConfigSchema,
  RulesConfigSchema,
  SecretsConfigSchema,
} from "@/schemas/config";
import type { RulesConfig } from "@/schemas/config";

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

describe("FilterSchema", () => {
  it("parses a valid filter config", () => {
    const input = {
      price: { min: 5, max: 50 },
      profitMargin: { min: 0.3 },
      minUnitsSold: 200,
      minGrowthRate: 0.1,
      excludedCategories: ["weapons", "adult"],
    };

    const result = FilterSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("defaults minUnitsSold to 100 when omitted", () => {
    const input = {
      price: { min: 5, max: 50 },
      profitMargin: { min: 0.3 },
      minGrowthRate: 0.1,
      excludedCategories: [],
    };

    const result = FilterSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minUnitsSold).toBe(100);
    }
  });

  it("defaults minGrowthRate to 0 when omitted", () => {
    const input = {
      price: { min: 5, max: 50 },
      profitMargin: { min: 0.3 },
      minUnitsSold: 500,
      excludedCategories: [],
    };

    const result = FilterSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minGrowthRate).toBe(0);
    }
  });
});

describe("RulesConfigSchema", () => {
  const validDefaults = {
    price: { min: 5, max: 50 },
    profitMargin: { min: 0.3 },
    minUnitsSold: 200,
    minGrowthRate: 0.1,
    excludedCategories: ["weapons"],
  };

  it("parses a valid rules config with defaults only", () => {
    const input = { defaults: validDefaults };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it("parses a valid rules config with region overrides", () => {
    const input = {
      defaults: validDefaults,
      regions: {
        th: { price: { min: 3, max: 30 } },
        vn: { minUnitsSold: 500 },
      },
    };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
  });

  it("rejects when price.min > price.max in defaults", () => {
    const input = {
      defaults: {
        ...validDefaults,
        price: { min: 100, max: 10 },
      },
    };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "defaults price.min must be <= price.max",
      );
    }
  });

  it("parses region override with partial fields", () => {
    const input = {
      defaults: validDefaults,
      regions: {
        th: {
          profitMargin: { min: 0.5 },
          excludedCategories: ["alcohol"],
        },
      },
    };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
  });
});

describe("getFiltersForRegion", () => {
  const baseRules: RulesConfig = {
    defaults: {
      price: { min: 5, max: 50 },
      profitMargin: { min: 0.3 },
      minUnitsSold: 200,
      minGrowthRate: 0.1,
      excludedCategories: ["weapons"],
    },
    regions: {
      th: {
        price: { min: 3, max: 30 },
        minUnitsSold: 500,
      },
    },
  };

  it("returns merged filters for a known region", () => {
    const result = getFiltersForRegion(baseRules, "th");

    expect(result).toEqual({
      price: { min: 3, max: 30 },
      profitMargin: { min: 0.3 },
      minUnitsSold: 500,
      minGrowthRate: 0.1,
      excludedCategories: ["weapons"],
    });
  });

  it("returns defaults for an unknown region", () => {
    const result = getFiltersForRegion(baseRules, "unknown");

    expect(result).toEqual(baseRules.defaults);
  });
});

describe("SecretsConfigSchema", () => {
  it("parses a valid secrets config", () => {
    const input = {
      cjApiKey: "cj-key-123",
      notionKey: "notion-key-456",
      notionDbId: "db-id-789",
    };

    const result = SecretsConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("rejects when cjApiKey is missing", () => {
    const input = {
      notionKey: "notion-key-456",
      notionDbId: "db-id-789",
    };

    const result = SecretsConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
