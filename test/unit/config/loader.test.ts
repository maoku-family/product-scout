import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "@/config/loader";
import { RegionsConfigSchema } from "@/schemas/config";

describe("loadConfig", () => {
  const fixturesDir = resolve(import.meta.dirname, "../../fixtures/config");

  it("loads and validates a valid YAML file", () => {
    const result = loadConfig(
      resolve(fixturesDir, "valid-regions.yaml"),
      RegionsConfigSchema,
    );
    expect(result.regions.th).toBeDefined();
    expect(result.regions.th?.name).toBe("Thailand");
  });

  it("throws on invalid YAML content", () => {
    expect(() => {
      loadConfig(
        resolve(fixturesDir, "invalid-regions.yaml"),
        RegionsConfigSchema,
      );
    }).toThrow();
  });

  it("throws on missing file", () => {
    expect(() => {
      loadConfig(resolve(fixturesDir, "nonexistent.yaml"), RegionsConfigSchema);
    }).toThrow();
  });
});
