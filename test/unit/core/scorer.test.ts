import { describe, expect, it } from "vitest";

import {
  scoreGrowth,
  scoreMargin,
  scoreSales,
  scoreShopee,
  scoreTrend,
} from "@/core/scorer";

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
