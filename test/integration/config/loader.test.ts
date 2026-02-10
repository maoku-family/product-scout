import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "@/config/loader";
import {
  CategoriesConfigSchema,
  RegionsConfigSchema,
  RulesConfigSchema,
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
});
