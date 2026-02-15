/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from "vitest";

import {
  applyDiscoveryTags,
  applySignalTags,
  applyStrategyTags,
} from "@/core/tagger";
import type { SignalsConfig } from "@/schemas/config";
import type { Tag } from "@/schemas/tag";

// ── applyDiscoveryTags ──────────────────────────────────────────────

describe("applyDiscoveryTags", () => {
  it("maps known source names to discovery tags", () => {
    const tags = applyDiscoveryTags(["saleslist", "search"]);
    expect(tags).toEqual<Tag[]>([
      { tagType: "discovery", tagName: "sales-rank" },
      { tagType: "discovery", tagName: "search" },
    ]);
  });

  it("returns empty array for empty sources", () => {
    const tags = applyDiscoveryTags([]);
    expect(tags).toEqual([]);
  });

  it("maps saleslist to sales-rank", () => {
    const tags = applyDiscoveryTags(["saleslist"]);
    expect(tags).toEqual<Tag[]>([
      { tagType: "discovery", tagName: "sales-rank" },
    ]);
  });

  it("passes through unknown source names as-is", () => {
    const tags = applyDiscoveryTags(["custom-source"]);
    expect(tags).toEqual<Tag[]>([
      { tagType: "discovery", tagName: "custom-source" },
    ]);
  });

  it("deduplicates sources", () => {
    const tags = applyDiscoveryTags(["search", "search"]);
    expect(tags).toEqual<Tag[]>([{ tagType: "discovery", tagName: "search" }]);
  });
});

// ── applySignalTags ─────────────────────────────────────────────────

describe("applySignalTags", () => {
  const signalRules: SignalsConfig = {
    signalRules: {
      "sales-surge": { condition: "salesGrowthRate > 1.0" },
      "low-competition": { condition: "creatorCount < 50" },
      "high-commission": { condition: "commissionRate > 0.15" },
      "good-reviews": { condition: "vocPositiveRate > 0.8" },
      "cross-border": { condition: "shopType == 'cross-border'" },
    },
  };

  it("applies matching signal rules", () => {
    const data = { salesGrowthRate: 1.5, creatorCount: 30 };
    const tags = applySignalTags(data, signalRules);
    expect(tags).toEqual<Tag[]>([
      { tagType: "signal", tagName: "sales-surge" },
      { tagType: "signal", tagName: "low-competition" },
    ]);
  });

  it("returns empty array when no rules match", () => {
    const data = { salesGrowthRate: 0.5, creatorCount: 100 };
    const tags = applySignalTags(data, signalRules);
    expect(tags).toEqual([]);
  });

  it("skips rules when required field is missing in product data", () => {
    // Only salesGrowthRate is present; creatorCount is missing
    const data = { salesGrowthRate: 1.5 };
    const tags = applySignalTags(data, signalRules);
    expect(tags).toEqual<Tag[]>([
      { tagType: "signal", tagName: "sales-surge" },
    ]);
  });

  it("handles == operator for string comparison", () => {
    const data = { shopType: "cross-border" };
    const tags = applySignalTags(data, signalRules);
    expect(tags).toEqual<Tag[]>([
      { tagType: "signal", tagName: "cross-border" },
    ]);
  });

  it("handles == operator that does not match", () => {
    const data = { shopType: "local" };
    const tags = applySignalTags(data, signalRules);
    expect(tags).toEqual([]);
  });

  it("handles >= operator", () => {
    const config: SignalsConfig = {
      signalRules: {
        "min-rate": { condition: "rate >= 0.5" },
      },
    };
    expect(applySignalTags({ rate: 0.5 }, config)).toEqual<Tag[]>([
      { tagType: "signal", tagName: "min-rate" },
    ]);
    expect(applySignalTags({ rate: 0.6 }, config)).toEqual<Tag[]>([
      { tagType: "signal", tagName: "min-rate" },
    ]);
    expect(applySignalTags({ rate: 0.4 }, config)).toEqual([]);
  });

  it("handles <= operator", () => {
    const config: SignalsConfig = {
      signalRules: {
        "max-price": { condition: "price <= 100" },
      },
    };
    expect(applySignalTags({ price: 100 }, config)).toEqual<Tag[]>([
      { tagType: "signal", tagName: "max-price" },
    ]);
    expect(applySignalTags({ price: 50 }, config)).toEqual<Tag[]>([
      { tagType: "signal", tagName: "max-price" },
    ]);
    expect(applySignalTags({ price: 101 }, config)).toEqual([]);
  });

  it("handles empty signal rules", () => {
    const config: SignalsConfig = { signalRules: {} };
    const tags = applySignalTags({ salesGrowthRate: 5.0 }, config);
    expect(tags).toEqual([]);
  });

  it("applies all matching rules from signals.yaml example data", () => {
    const fullData = {
      salesGrowthRate: 1.5,
      creatorCount: 30,
      commissionRate: 0.2,
      vocPositiveRate: 0.9,
      shopType: "cross-border",
    };
    const tags = applySignalTags(fullData, signalRules);
    expect(tags).toEqual<Tag[]>([
      { tagType: "signal", tagName: "sales-surge" },
      { tagType: "signal", tagName: "low-competition" },
      { tagType: "signal", tagName: "high-commission" },
      { tagType: "signal", tagName: "good-reviews" },
      { tagType: "signal", tagName: "cross-border" },
    ]);
  });
});

// ── applyStrategyTags ───────────────────────────────────────────────

describe("applyStrategyTags", () => {
  it("returns tags for scores above threshold", () => {
    const scores = { trending: 82, blueOcean: 35, highMargin: 71 };
    const tags = applyStrategyTags(scores, 60);
    expect(tags).toEqual<Tag[]>([
      { tagType: "strategy", tagName: "trending" },
      { tagType: "strategy", tagName: "high-margin" },
    ]);
  });

  it("returns empty array when no scores meet threshold", () => {
    const scores = { trending: 50, blueOcean: 35 };
    const tags = applyStrategyTags(scores, 60);
    expect(tags).toEqual([]);
  });

  it("includes scores exactly at the threshold", () => {
    const scores = { trending: 60 };
    const tags = applyStrategyTags(scores, 60);
    expect(tags).toEqual<Tag[]>([{ tagType: "strategy", tagName: "trending" }]);
  });

  it("handles empty scores", () => {
    const tags = applyStrategyTags({}, 60);
    expect(tags).toEqual([]);
  });

  it("converts camelCase profile names to kebab-case tag names", () => {
    const scores = { blueOcean: 90, highMargin: 80 };
    const tags = applyStrategyTags(scores, 60);
    expect(tags).toEqual<Tag[]>([
      { tagType: "strategy", tagName: "blue-ocean" },
      { tagType: "strategy", tagName: "high-margin" },
    ]);
  });

  it("preserves already-kebab-case names", () => {
    const scores = { "blue-ocean": 90 };
    const tags = applyStrategyTags(scores, 60);
    expect(tags).toEqual<Tag[]>([
      { tagType: "strategy", tagName: "blue-ocean" },
    ]);
  });
});
