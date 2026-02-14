import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "@/config/loader";
import {
  CategoriesConfigSchema,
  RegionsConfigSchema,
  RulesConfigSchema,
  ScoringConfigSchema,
  SearchStrategiesConfigSchema,
  SignalsConfigSchema,
} from "@/schemas/config";

const configDir = resolve(import.meta.dirname, "../../../config");

describe("config file integration", () => {
  it("loads and validates regions.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "regions.yaml"),
      RegionsConfigSchema,
    );
    expect(config.regions.th).toBeDefined();
    expect(config.regions.th?.name).toBe("Thailand");
    expect(config.regions.th?.currency).toBe("THB");
  });

  it("loads and validates categories.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "categories.yaml"),
      CategoriesConfigSchema,
    );
    expect(config.categories.beauty).toBeDefined();
    expect(config.categories.beauty?.searchKeywords.length).toBeGreaterThan(0);
  });

  it("loads and validates rules.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "rules.yaml"),
      RulesConfigSchema,
    );
    expect(config.defaults.price.min).toBeLessThanOrEqual(
      config.defaults.price.max,
    );
    expect(config.defaults.excludedCategories.length).toBeGreaterThan(0);
  });

  it("loads and validates rules.yaml scraping section", () => {
    const config = loadConfig(
      resolve(configDir, "rules.yaml"),
      RulesConfigSchema,
    );
    expect(config.scraping).toBeDefined();
    expect(config.scraping?.dailyDetailBudget).toBe(300);
    expect(config.scraping?.dailySearchBudget).toBe(300);
    expect(config.scraping?.freshness.detailRefreshDays).toBe(7);
    expect(config.scraping?.freshness.vocRefreshDays).toBe(14);
    expect(config.scraping?.freshness.shopRefreshDays).toBe(7);
  });

  it("loads and validates scoring.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "scoring.yaml"),
      ScoringConfigSchema,
    );
    expect(config.scoringProfiles.default).toBeDefined();
    expect(config.scoringProfiles.default?.name).toBe("Composite Score");
    expect(config.scoringProfiles.default?.dimensions.salesVolume).toBe(20);
    expect(config.scoringProfiles.trending).toBeDefined();
    expect(config.scoringProfiles.blueOcean).toBeDefined();
    expect(config.scoringProfiles.highMargin).toBeDefined();
    expect(config.scoringProfiles.shopCopy).toBeDefined();
    expect(Object.keys(config.scoringProfiles)).toHaveLength(5);
  });

  it("loads and validates signals.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "signals.yaml"),
      SignalsConfigSchema,
    );
    expect(config.signalRules["sales-surge"]).toBeDefined();
    expect(config.signalRules["sales-surge"]?.condition).toBe(
      "salesGrowthRate > 1.0",
    );
    expect(config.signalRules["low-competition"]).toBeDefined();
    expect(config.signalRules["viral-video"]).toBeDefined();
    expect(Object.keys(config.signalRules)).toHaveLength(8);
  });

  it("loads and validates search-strategies.yaml", () => {
    const config = loadConfig(
      resolve(configDir, "search-strategies.yaml"),
      SearchStrategiesConfigSchema,
    );
    expect(config.strategies["blue-ocean-beauty"]).toBeDefined();
    expect(config.strategies["blue-ocean-beauty"]?.name).toBe(
      "Blue Ocean - Beauty",
    );
    expect(config.strategies["blue-ocean-beauty"]?.region).toBe("th");
    expect(config.strategies["blue-ocean-beauty"]?.filters.commissionRate).toBe(
      ">0.15",
    );
    expect(config.strategies["high-margin-general"]).toBeDefined();
    expect(Object.keys(config.strategies)).toHaveLength(2);
  });
});
