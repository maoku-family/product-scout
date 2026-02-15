import { describe, expect, it } from "vitest";

import { computeMultiScore, computeScore, normalizeValue } from "@/core/scorer";
import type { ScoringInput } from "@/core/scorer";
import type { ScoringConfig } from "@/schemas/config";

// ── Helper: minimal scoring config for tests ────────────────────────

const testConfig: ScoringConfig = {
  scoringProfiles: {
    default: {
      name: "Composite Score",
      dimensions: {
        salesVolume: 20,
        salesGrowthRate: 15,
        shopeeValidation: 15,
        profitMargin: 15,
        creatorCount: 10,
        hotIndex: 10,
        voc: 5,
        googleTrends: 5,
        recency: 5,
      },
    },
    trending: {
      name: "Trending / Explosive",
      dimensions: {
        salesGrowthRate: 30,
        hotIndex: 25,
        videoViews: 20,
        recency: 15,
        creatorCount: 10,
      },
    },
    blueOcean: {
      name: "Blue Ocean",
      dimensions: {
        competitionScore: 35,
        salesVolume: 30,
        creatorConversionRate: 20,
        voc: 15,
      },
    },
    highMargin: {
      name: "High Margin",
      dimensions: {
        profitMargin: 40,
        gpm: 25,
        commissionRate: 20,
        pricePoint: 15,
      },
    },
    shopCopy: {
      name: "Shop Copy",
      dimensions: {
        shopRating: 25,
        productSalesInShop: 30,
        shopSalesGrowth: 20,
        creatorConversionRate: 15,
        profitMargin: 10,
      },
    },
  },
};

// ── normalizeValue ──────────────────────────────────────────────────

describe("normalizeValue", () => {
  describe("salesVolume", () => {
    it("normalizes relative to maxSalesVolume", () => {
      expect(normalizeValue("salesVolume", 500, { maxSalesVolume: 1000 })).toBe(
        50,
      );
    });

    it("returns 100 for the max seller", () => {
      expect(
        normalizeValue("salesVolume", 1000, { maxSalesVolume: 1000 }),
      ).toBe(100);
    });

    it("returns 0 when maxSalesVolume is 0", () => {
      expect(normalizeValue("salesVolume", 100, { maxSalesVolume: 0 })).toBe(0);
    });

    it("clamps at 100", () => {
      expect(
        normalizeValue("salesVolume", 1500, { maxSalesVolume: 1000 }),
      ).toBe(100);
    });
  });

  describe("salesGrowthRate", () => {
    it("maps growth rate 1.0 (100%) to score 100", () => {
      expect(normalizeValue("salesGrowthRate", 1.0, {})).toBe(100);
    });

    it("maps growth rate 0.5 to score 50", () => {
      expect(normalizeValue("salesGrowthRate", 0.5, {})).toBe(50);
    });

    it("clamps negative growth to 0", () => {
      expect(normalizeValue("salesGrowthRate", -0.5, {})).toBe(0);
    });

    it("clamps at 100 for very high growth", () => {
      expect(normalizeValue("salesGrowthRate", 5.0, {})).toBe(100);
    });
  });

  describe("shopeeValidation", () => {
    it("returns 0 for sold count 0", () => {
      expect(normalizeValue("shopeeValidation", 0, {})).toBe(0);
    });

    it("returns 100 for 1000+ sales", () => {
      expect(normalizeValue("shopeeValidation", 1000, {})).toBe(100);
    });

    it("returns proportional score for moderate sales", () => {
      const score = normalizeValue("shopeeValidation", 100, {});
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("caps at 100 for very high sales", () => {
      expect(normalizeValue("shopeeValidation", 10000, {})).toBe(100);
    });
  });

  describe("profitMargin", () => {
    it("maps margin 0.5 to score 50", () => {
      expect(normalizeValue("profitMargin", 0.5, {})).toBe(50);
    });

    it("clamps negative margin to 0", () => {
      expect(normalizeValue("profitMargin", -0.1, {})).toBe(0);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("profitMargin", 1.5, {})).toBe(100);
    });
  });

  describe("creatorCount", () => {
    it("gives higher score to fewer creators (inverse)", () => {
      const lowCreators = normalizeValue("creatorCount", 10, {});
      const highCreators = normalizeValue("creatorCount", 500, {});
      expect(lowCreators).toBeGreaterThan(highCreators);
    });

    it("clamps to 0-100 range", () => {
      expect(normalizeValue("creatorCount", 0, {})).toBeLessThanOrEqual(100);
      expect(normalizeValue("creatorCount", 0, {})).toBeGreaterThanOrEqual(0);
      expect(normalizeValue("creatorCount", 10000, {})).toBeGreaterThanOrEqual(
        0,
      );
    });
  });

  describe("hotIndex", () => {
    it("passes through directly (already 0-100)", () => {
      expect(normalizeValue("hotIndex", 75, {})).toBe(75);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("hotIndex", 150, {})).toBe(100);
    });

    it("clamps at 0", () => {
      expect(normalizeValue("hotIndex", -10, {})).toBe(0);
    });
  });

  describe("competitionScore", () => {
    it("inverts: 100 - raw", () => {
      expect(normalizeValue("competitionScore", 80, {})).toBe(20);
    });

    it("returns 100 for competition score 0", () => {
      expect(normalizeValue("competitionScore", 0, {})).toBe(100);
    });

    it("returns 0 for competition score 100", () => {
      expect(normalizeValue("competitionScore", 100, {})).toBe(0);
    });
  });

  describe("voc", () => {
    it("maps vocPositiveRate 0.9 to score 90", () => {
      expect(normalizeValue("voc", 0.9, {})).toBe(90);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("voc", 1.5, {})).toBe(100);
    });
  });

  describe("googleTrends", () => {
    it("returns 100 for rising (value 2)", () => {
      expect(normalizeValue("googleTrends", 2, {})).toBe(100);
    });

    it("returns 50 for stable (value 1)", () => {
      expect(normalizeValue("googleTrends", 1, {})).toBe(50);
    });

    it("returns 0 for declining (value 0)", () => {
      expect(normalizeValue("googleTrends", 0, {})).toBe(0);
    });
  });

  describe("recency", () => {
    it("gives high score to recently listed products", () => {
      // 1 day old
      const score = normalizeValue("recency", 1, {});
      expect(score).toBeGreaterThan(90);
    });

    it("gives lower score to older products", () => {
      // 90 days old
      const score = normalizeValue("recency", 90, {});
      expect(score).toBeLessThan(30);
    });

    it("clamps to 0-100", () => {
      expect(normalizeValue("recency", 0, {})).toBeLessThanOrEqual(100);
      expect(normalizeValue("recency", 365, {})).toBeGreaterThanOrEqual(0);
    });
  });

  describe("videoViews", () => {
    it("uses log scale", () => {
      const score = normalizeValue("videoViews", 1000000, {});
      expect(score).toBe(100);
    });

    it("returns 0 for 0 views", () => {
      expect(normalizeValue("videoViews", 0, {})).toBe(0);
    });
  });

  describe("creatorConversionRate", () => {
    it("maps 0.5 to 50", () => {
      expect(normalizeValue("creatorConversionRate", 0.5, {})).toBe(50);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("creatorConversionRate", 1.5, {})).toBe(100);
    });
  });

  describe("gpm", () => {
    it("passes through directly (already 0-100)", () => {
      expect(normalizeValue("gpm", 65, {})).toBe(65);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("gpm", 120, {})).toBe(100);
    });
  });

  describe("commissionRate", () => {
    it("maps 0.2 to 20", () => {
      expect(normalizeValue("commissionRate", 0.2, {})).toBe(20);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("commissionRate", 1.5, {})).toBe(100);
    });
  });

  describe("pricePoint", () => {
    it("gives highest score in the sweet spot range", () => {
      // Sweet spot is roughly $10-$30 USD
      const inRange = normalizeValue("pricePoint", 20, {});
      expect(inRange).toBeGreaterThan(80);
    });

    it("gives lower score outside the sweet spot", () => {
      const tooExpensive = normalizeValue("pricePoint", 200, {});
      expect(tooExpensive).toBeLessThan(50);
    });

    it("returns 0 for price 0", () => {
      expect(normalizeValue("pricePoint", 0, {})).toBe(0);
    });
  });

  describe("shopRating", () => {
    it("maps rating 5.0 to score 100", () => {
      expect(normalizeValue("shopRating", 5.0, {})).toBe(100);
    });

    it("maps rating 4.0 to score 80", () => {
      expect(normalizeValue("shopRating", 4.0, {})).toBe(80);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("shopRating", 6.0, {})).toBe(100);
    });
  });

  describe("productSalesInShop", () => {
    it("uses log scale", () => {
      const score = normalizeValue("productSalesInShop", 10000, {});
      expect(score).toBe(100);
    });

    it("returns 0 for 0 sales", () => {
      expect(normalizeValue("productSalesInShop", 0, {})).toBe(0);
    });
  });

  describe("shopSalesGrowth", () => {
    it("maps 0.5 to 50", () => {
      expect(normalizeValue("shopSalesGrowth", 0.5, {})).toBe(50);
    });

    it("clamps at 100", () => {
      expect(normalizeValue("shopSalesGrowth", 1.5, {})).toBe(100);
    });

    it("clamps negative to 0", () => {
      expect(normalizeValue("shopSalesGrowth", -0.3, {})).toBe(0);
    });
  });

  describe("unknown dimension", () => {
    it("returns 0 for unknown dimension names", () => {
      expect(normalizeValue("unknownDimension", 50, {})).toBe(0);
    });
  });
});

// ── computeMultiScore ───────────────────────────────────────────────

describe("computeMultiScore", () => {
  it("returns scores for all profiles", () => {
    const input: ScoringInput = {
      salesVolume: 800,
      salesGrowthRate: 0.7,
      shopeeValidation: 500,
      profitMargin: 0.3,
      creatorCount: 20,
      hotIndex: 75,
      vocPositiveRate: 0.85,
      googleTrends: "rising",
      daysSinceListed: 10,
      videoViews: 100000,
      competitionScore: 30,
      creatorConversionRate: 0.15,
      gpm: 60,
      commissionRate: 0.15,
      pricePoint: 25,
      shopRating: 4.5,
      productSalesInShop: 5000,
      shopSalesGrowth: 0.4,
      maxSalesVolume: 1000,
    };

    const result = computeMultiScore(input, testConfig);

    // All 5 profiles should have scores
    expect(result.scores).toHaveProperty("default");
    expect(result.scores).toHaveProperty("trending");
    expect(result.scores).toHaveProperty("blueOcean");
    expect(result.scores).toHaveProperty("highMargin");
    expect(result.scores).toHaveProperty("shopCopy");

    // Scores should be numbers in 0-100
    for (const [, score] of Object.entries(result.scores)) {
      if (score !== null) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("returns details for each dimension per profile", () => {
    const input: ScoringInput = {
      salesVolume: 500,
      salesGrowthRate: 0.5,
      maxSalesVolume: 1000,
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        simple: {
          name: "Simple",
          dimensions: { salesVolume: 60, salesGrowthRate: 40 },
        },
      },
    });

    // Should have 2 detail entries for this profile
    const simpleDetails = result.details.filter((d) => d.profile === "simple");
    expect(simpleDetails).toHaveLength(2);

    // Check structure of detail entries
    for (const detail of simpleDetails) {
      expect(detail).toHaveProperty("profile", "simple");
      expect(detail).toHaveProperty("dimension");
      expect(detail).toHaveProperty("rawValue");
      expect(detail).toHaveProperty("normalizedValue");
      expect(detail).toHaveProperty("weight");
      expect(detail).toHaveProperty("weightedScore");
    }
  });

  it("computes weighted score correctly for a simple profile", () => {
    const input: ScoringInput = {
      salesVolume: 500,
      salesGrowthRate: 0.5,
      maxSalesVolume: 1000,
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        simple: {
          name: "Simple",
          dimensions: { salesVolume: 60, salesGrowthRate: 40 },
        },
      },
    });

    // salesVolume: 500/1000 * 100 = 50, weight 60% => 30
    // salesGrowthRate: 0.5 * 100 = 50, weight 40% => 20
    // Total: 50
    expect(result.scores.simple).toBe(50);
  });

  it("handles missing data dimensions by scoring as 0", () => {
    const input: ScoringInput = {
      salesVolume: 1000,
      maxSalesVolume: 1000,
      // salesGrowthRate is undefined
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        test: {
          name: "Test",
          dimensions: { salesVolume: 50, salesGrowthRate: 50 },
        },
      },
    });

    // salesVolume: 100, weight 50% => 50
    // salesGrowthRate: undefined => 0, weight 50% => 0
    // Total: 50
    expect(result.scores.test).toBe(50);
  });

  it("returns null score when ALL dimensions have missing data", () => {
    const input: ScoringInput = {
      // No data for any dimension in the profile
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        shopCopy: {
          name: "Shop Copy",
          dimensions: {
            shopRating: 25,
            productSalesInShop: 30,
            shopSalesGrowth: 20,
            creatorConversionRate: 15,
            profitMargin: 10,
          },
        },
      },
    });

    expect(result.scores.shopCopy).toBeNull();
  });

  it("does NOT return null when at least one dimension has data", () => {
    const input: ScoringInput = {
      profitMargin: 0.5,
      // Other shopCopy dimensions missing
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        shopCopy: {
          name: "Shop Copy",
          dimensions: {
            shopRating: 25,
            productSalesInShop: 30,
            shopSalesGrowth: 20,
            creatorConversionRate: 15,
            profitMargin: 10,
          },
        },
      },
    });

    expect(result.scores.shopCopy).not.toBeNull();
    expect(result.scores.shopCopy).toBeGreaterThanOrEqual(0);
  });

  it("rounds scores to 1 decimal place", () => {
    const input: ScoringInput = {
      salesVolume: 333,
      salesGrowthRate: 0.33,
      maxSalesVolume: 1000,
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        test: {
          name: "Test",
          dimensions: { salesVolume: 60, salesGrowthRate: 40 },
        },
      },
    });

    const score = result.scores.test;
    if (score !== null) {
      expect(score).toBe(Number(score.toFixed(1)));
    }
  });

  it("handles the googleTrends string-to-number mapping in input", () => {
    const input: ScoringInput = {
      googleTrends: "rising",
    };

    const result = computeMultiScore(input, {
      scoringProfiles: {
        test: {
          name: "Test",
          dimensions: { googleTrends: 100 },
        },
      },
    });

    // googleTrends: rising => 100, weight 100% => 100
    expect(result.scores.test).toBe(100);
  });

  it("handles all profiles from the real scoring.yaml config", () => {
    const input: ScoringInput = {
      salesVolume: 800,
      salesGrowthRate: 0.7,
      shopeeValidation: 500,
      profitMargin: 0.3,
      creatorCount: 20,
      hotIndex: 75,
      vocPositiveRate: 0.85,
      googleTrends: "rising",
      daysSinceListed: 10,
      videoViews: 100000,
      competitionScore: 30,
      creatorConversionRate: 0.15,
      gpm: 60,
      commissionRate: 0.15,
      pricePoint: 25,
      shopRating: 4.5,
      productSalesInShop: 5000,
      shopSalesGrowth: 0.4,
      maxSalesVolume: 1000,
    };

    const result = computeMultiScore(input, testConfig);

    // default and trending should have good scores with this data
    expect(result.scores.default).not.toBeNull();
    expect(result.scores.trending).not.toBeNull();
    expect(result.scores.blueOcean).not.toBeNull();
    expect(result.scores.highMargin).not.toBeNull();
    expect(result.scores.shopCopy).not.toBeNull();

    // With good data across the board, default should be decent
    const defaultScore = result.scores.default;
    expect(defaultScore).not.toBeNull();
    expect(defaultScore).toBeGreaterThan(40);
  });
});

// ── computeScore (backward compatibility) ───────────────────────────

/* eslint-disable @typescript-eslint/no-deprecated */
describe("computeScore (backward compatibility)", () => {
  it("still accepts the old ScoreInput type and returns a number", () => {
    const input = {
      unitsSold: 1000,
      maxUnits: 1000,
      growthRate: 1.0,
      shopeeSoldCount: 10000 as number | undefined,
      profitMargin: 1.0,
      trendStatus: "rising" as const,
    };
    const score = computeScore(input);
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 100 for perfect data", () => {
    const input = {
      unitsSold: 1000,
      maxUnits: 1000,
      growthRate: 1.0,
      shopeeSoldCount: 10000 as number | undefined,
      profitMargin: 1.0,
      trendStatus: "rising" as const,
    };
    expect(computeScore(input)).toBe(100);
  });

  it("returns 0 for zero data", () => {
    const input = {
      unitsSold: 0,
      maxUnits: 1000,
      growthRate: 0,
      shopeeSoldCount: 0 as number | undefined,
      profitMargin: 0,
      trendStatus: "declining" as const,
    };
    expect(computeScore(input)).toBe(0);
  });

  it("calculates weighted score correctly for mixed data", () => {
    const input = {
      unitsSold: 500,
      maxUnits: 1000,
      growthRate: 0.5,
      shopeeSoldCount: 100 as number | undefined,
      profitMargin: 0.3,
      trendStatus: "stable" as const,
    };

    // sales: 50 * 0.30 = 15
    // growth: 50 * 0.20 = 10
    // shopee: ~67 * 0.25 = ~16.75
    // margin: 30 * 0.15 = 4.5
    // trend: 50 * 0.10 = 5
    // Total: ~51.25
    const score = computeScore(input);
    expect(score).toBeGreaterThan(45);
    expect(score).toBeLessThan(55);
  });

  it("rounds result to 1 decimal place", () => {
    const input = {
      unitsSold: 333,
      maxUnits: 1000,
      growthRate: 0.33,
      shopeeSoldCount: 50 as number | undefined,
      profitMargin: 0.25,
      trendStatus: "stable" as const,
    };
    const score = computeScore(input);
    expect(score).toBe(Number(score.toFixed(1)));
  });

  it("handles undefined shopeeSoldCount", () => {
    const input = {
      unitsSold: 500,
      maxUnits: 1000,
      growthRate: 0.5,
      shopeeSoldCount: undefined,
      profitMargin: 0.3,
      trendStatus: "rising" as const,
    };
    const score = computeScore(input);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
