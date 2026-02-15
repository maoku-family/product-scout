import { describe, expect, it } from "vitest";

import {
  CategoriesConfigSchema,
  CategorySchema,
  FilterSchema,
  getFiltersForRegion,
  RegionSchema,
  RegionsConfigSchema,
  RulesConfigSchema,
  ScoringConfigSchema,
  ScoringProfileSchema,
  ScrapingConfigSchema,
  SearchStrategiesConfigSchema,
  SearchStrategySchema,
  SecretsConfigSchema,
  SignalRuleSchema,
  SignalsConfigSchema,
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

  it("parses secrets with optional fastmoss credentials", () => {
    const input = {
      cjApiKey: "cj-key-123",
      notionKey: "notion-key-456",
      notionDbId: "db-id-789",
      fastmossEmail: "user@example.com",
      fastmossPassword: "secret123",
    };

    const result = SecretsConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fastmossEmail).toBe("user@example.com");
      expect(result.data.fastmossPassword).toBe("secret123");
    }
  });

  it("parses secrets without fastmoss credentials (backward compatible)", () => {
    const input = {
      cjApiKey: "cj-key-123",
      notionKey: "notion-key-456",
      notionDbId: "db-id-789",
    };

    const result = SecretsConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fastmossEmail).toBeUndefined();
      expect(result.data.fastmossPassword).toBeUndefined();
    }
  });
});

describe("ScrapingConfigSchema", () => {
  it("parses a valid scraping config", () => {
    const input = {
      dailyDetailBudget: 500,
      dailySearchBudget: 400,
      freshness: {
        detailRefreshDays: 3,
        vocRefreshDays: 7,
        shopRefreshDays: 5,
      },
    };

    const result = ScrapingConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dailyDetailBudget).toBe(500);
      expect(result.data.freshness.detailRefreshDays).toBe(3);
    }
  });

  it("applies defaults for budget fields when omitted", () => {
    const input = {
      freshness: {
        detailRefreshDays: 3,
        vocRefreshDays: 7,
        shopRefreshDays: 5,
      },
    };

    const result = ScrapingConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dailyDetailBudget).toBe(300);
      expect(result.data.dailySearchBudget).toBe(300);
    }
  });

  it("applies defaults for freshness fields when omitted", () => {
    const input = {
      dailyDetailBudget: 100,
      dailySearchBudget: 100,
      freshness: {},
    };

    const result = ScrapingConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.freshness.detailRefreshDays).toBe(7);
      expect(result.data.freshness.vocRefreshDays).toBe(14);
      expect(result.data.freshness.shopRefreshDays).toBe(7);
    }
  });

  it("rejects when freshness is missing", () => {
    const input = {
      dailyDetailBudget: 300,
      dailySearchBudget: 300,
    };

    const result = ScrapingConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("RulesConfigSchema with scraping", () => {
  const validDefaults = {
    price: { min: 5, max: 50 },
    profitMargin: { min: 0.3 },
    minUnitsSold: 200,
    minGrowthRate: 0.1,
    excludedCategories: ["weapons"],
  };

  it("parses rules config with optional scraping section", () => {
    const input = {
      defaults: validDefaults,
      scraping: {
        dailyDetailBudget: 300,
        dailySearchBudget: 300,
        freshness: {
          detailRefreshDays: 7,
          vocRefreshDays: 14,
          shopRefreshDays: 7,
        },
      },
    };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scraping?.dailyDetailBudget).toBe(300);
      expect(result.data.scraping?.freshness.vocRefreshDays).toBe(14);
    }
  });

  it("parses rules config without scraping section (backward compatible)", () => {
    const input = { defaults: validDefaults };

    const result = RulesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scraping).toBeUndefined();
    }
  });
});

describe("ScoringProfileSchema", () => {
  it("parses a valid scoring profile", () => {
    const input = {
      name: "Composite Score",
      dimensions: {
        salesVolume: 40,
        salesGrowthRate: 30,
        profitMargin: 30,
      },
    };

    const result = ScoringProfileSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Composite Score");
      expect(result.data.dimensions.salesVolume).toBe(40);
    }
  });

  it("rejects when name is missing", () => {
    const input = {
      dimensions: { salesVolume: 100 },
    };

    const result = ScoringProfileSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("rejects when dimensions contains non-numeric values", () => {
    const input = {
      name: "Bad Profile",
      dimensions: { salesVolume: "high" },
    };

    const result = ScoringProfileSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("ScoringConfigSchema", () => {
  it("parses a valid scoring config with multiple profiles", () => {
    const input = {
      scoringProfiles: {
        default: {
          name: "Composite Score",
          dimensions: {
            salesVolume: 40,
            salesGrowthRate: 30,
            profitMargin: 30,
          },
        },
        trending: {
          name: "Trending / Explosive",
          dimensions: {
            salesGrowthRate: 30,
            hotIndex: 25,
            videoViews: 25,
            recency: 20,
          },
        },
      },
    };

    const result = ScoringConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.scoringProfiles)).toHaveLength(2);
      expect(result.data.scoringProfiles.default?.name).toBe("Composite Score");
    }
  });

  it("rejects when dimension weights do not sum to 100", () => {
    const input = {
      scoringProfiles: {
        bad: {
          name: "Bad Profile",
          dimensions: {
            salesVolume: 20,
            salesGrowthRate: 15,
          },
        },
      },
    };

    const result = ScoringConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("rejects when scoringProfiles key is missing", () => {
    const input = {};

    const result = ScoringConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("SignalRuleSchema", () => {
  it("parses a valid signal rule", () => {
    const input = { condition: "salesGrowthRate > 1.0" };

    const result = SignalRuleSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition).toBe("salesGrowthRate > 1.0");
    }
  });

  it("rejects when condition is missing", () => {
    const input = {};

    const result = SignalRuleSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("SignalsConfigSchema", () => {
  it("parses a valid signals config with multiple rules", () => {
    const input = {
      signalRules: {
        ["sales-surge"]: { condition: "salesGrowthRate > 1.0" },
        ["low-competition"]: { condition: "creatorCount < 50" },
        ["high-commission"]: { condition: "commissionRate > 0.15" },
      },
    };

    const result = SignalsConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.signalRules)).toHaveLength(3);
      expect(result.data.signalRules["sales-surge"]?.condition).toBe(
        "salesGrowthRate > 1.0",
      );
    }
  });

  it("rejects when signalRules key is missing", () => {
    const input = {};

    const result = SignalsConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("SearchStrategySchema", () => {
  it("parses a valid search strategy with string filters", () => {
    const input = {
      name: "Blue Ocean - Beauty",
      region: "th",
      filters: {
        commissionRate: ">0.15",
        totalSales: ">1000",
      },
    };

    const result = SearchStrategySchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Blue Ocean - Beauty");
      expect(result.data.region).toBe("th");
      expect(result.data.filters.commissionRate).toBe(">0.15");
    }
  });

  it("parses a search strategy with numeric filter values", () => {
    const input = {
      name: "Test Strategy",
      region: "th",
      filters: {
        minSales: 500,
        maxPrice: 100,
      },
    };

    const result = SearchStrategySchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters.minSales).toBe(500);
    }
  });

  it("rejects when name is missing", () => {
    const input = {
      region: "th",
      filters: { commissionRate: ">0.15" },
    };

    const result = SearchStrategySchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it("rejects when region is missing", () => {
    const input = {
      name: "Test",
      filters: { commissionRate: ">0.15" },
    };

    const result = SearchStrategySchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

describe("SearchStrategiesConfigSchema", () => {
  it("parses a valid search strategies config with multiple strategies", () => {
    const input = {
      strategies: {
        ["blue-ocean-beauty"]: {
          name: "Blue Ocean - Beauty",
          region: "th",
          filters: {
            commissionRate: ">0.15",
            creatorConversionRate: ">0.3",
            totalSales: ">1000",
            creatorCount: "<50",
          },
        },
        ["high-margin-general"]: {
          name: "High Margin - General",
          region: "th",
          filters: {
            price: ">20",
            commissionRate: ">0.10",
            totalSales: ">500",
          },
        },
      },
    };

    const result = SearchStrategiesConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data.strategies)).toHaveLength(2);
      expect(result.data.strategies["blue-ocean-beauty"]?.region).toBe("th");
    }
  });

  it("rejects when strategies key is missing", () => {
    const input = {};

    const result = SearchStrategiesConfigSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});
