import { describe, expect, it } from "vitest";

import {
  computeScore,
  scoreGrowth,
  scoreMargin,
  scoreSales,
  scoreShopee,
  scoreTrend,
} from "@/core/scorer";
import type { ScoreInput } from "@/core/scorer";

describe("scoreSales", () => {
  it("returns 100 for the max seller", () => {
    expect(scoreSales(1000, 1000)).toBe(100);
  });

  it("returns 50 for half the max", () => {
    expect(scoreSales(500, 1000)).toBe(50);
  });

  it("returns 0 when unitsSold is 0", () => {
    expect(scoreSales(0, 1000)).toBe(0);
  });

  it("returns 0 when maxUnits is 0 (avoid division by zero)", () => {
    expect(scoreSales(0, 0)).toBe(0);
  });
});

describe("scoreGrowth", () => {
  it("returns 100 for growth rate >= 1.0 (100%+)", () => {
    expect(scoreGrowth(1.0)).toBe(100);
  });

  it("returns 50 for growth rate 0.5", () => {
    expect(scoreGrowth(0.5)).toBe(50);
  });

  it("returns 0 for negative growth rate (clamped)", () => {
    expect(scoreGrowth(-0.5)).toBe(0);
  });

  it("returns 0 for zero growth rate", () => {
    expect(scoreGrowth(0)).toBe(0);
  });

  it("caps at 100 for very high growth rates", () => {
    expect(scoreGrowth(5.0)).toBe(100);
  });
});

describe("scoreShopee", () => {
  it("returns 0 when soldCount is undefined (no Shopee data)", () => {
    expect(scoreShopee(undefined)).toBe(0);
  });

  it("returns 0 when soldCount is 0", () => {
    expect(scoreShopee(0)).toBe(0);
  });

  it("returns a proportional score for moderate sales", () => {
    // 100 sales should give a reasonable score
    const score = scoreShopee(100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("caps at 100 for very high sales", () => {
    expect(scoreShopee(10000)).toBe(100);
  });
});

describe("scoreMargin", () => {
  it("returns 100 for margin >= 1.0 (100%)", () => {
    expect(scoreMargin(1.0)).toBe(100);
  });

  it("returns 30 for margin 0.3 (30%)", () => {
    expect(scoreMargin(0.3)).toBe(30);
  });

  it("returns 0 for margin 0 or negative", () => {
    expect(scoreMargin(0)).toBe(0);
    expect(scoreMargin(-0.1)).toBe(0);
  });

  it("caps at 100 for very high margins", () => {
    expect(scoreMargin(1.5)).toBe(100);
  });
});

describe("scoreTrend", () => {
  it("returns 100 for rising", () => {
    expect(scoreTrend("rising")).toBe(100);
  });

  it("returns 50 for stable", () => {
    expect(scoreTrend("stable")).toBe(50);
  });

  it("returns 0 for declining", () => {
    expect(scoreTrend("declining")).toBe(0);
  });
});

describe("computeScore", () => {
  it("returns 100 for perfect data", () => {
    const input: ScoreInput = {
      unitsSold: 1000,
      maxUnits: 1000,
      growthRate: 1.0,
      shopeeSoldCount: 10000,
      profitMargin: 1.0,
      trendStatus: "rising",
    };
    expect(computeScore(input)).toBe(100);
  });

  it("returns 0 for zero data", () => {
    const input: ScoreInput = {
      unitsSold: 0,
      maxUnits: 1000,
      growthRate: 0,
      shopeeSoldCount: 0,
      profitMargin: 0,
      trendStatus: "declining",
    };
    expect(computeScore(input)).toBe(0);
  });

  it("calculates weighted score correctly for mixed data", () => {
    const input: ScoreInput = {
      unitsSold: 500,
      maxUnits: 1000,
      growthRate: 0.5,
      shopeeSoldCount: 100,
      profitMargin: 0.3,
      trendStatus: "stable",
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
    const input: ScoreInput = {
      unitsSold: 333,
      maxUnits: 1000,
      growthRate: 0.33,
      shopeeSoldCount: 50,
      profitMargin: 0.25,
      trendStatus: "stable",
    };
    const score = computeScore(input);
    // Check it's rounded to 1 decimal
    expect(score).toBe(Number(score.toFixed(1)));
  });

  it("handles undefined shopeeSoldCount (no Shopee data)", () => {
    const input: ScoreInput = {
      unitsSold: 500,
      maxUnits: 1000,
      growthRate: 0.5,
      shopeeSoldCount: undefined,
      profitMargin: 0.3,
      trendStatus: "rising",
    };
    // shopee score = 0 (no data), rest still contributes
    const score = computeScore(input);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
