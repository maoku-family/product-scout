import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFastmossRanking } from "@/scrapers/fastmoss";

const fixturesDir = resolve(import.meta.dirname, "../../fixtures/fastmoss");

describe("parseFastmossRanking", () => {
  it("parses HTML rows into an array of FastmossProduct", () => {
    const html = readFileSync(
      resolve(fixturesDir, "ranking-page.html"),
      "utf-8",
    );
    const products = parseFastmossRanking(html, "th", "2025-01-15");

    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("LED Ring Light");
    expect(first?.shopName).toBe("BeautyShop");
    expect(first?.country).toBe("th");
    expect(first?.unitsSold).toBe(1500);
    expect(first?.gmv).toBe(4500.0);
    expect(first?.orderGrowthRate).toBeCloseTo(0.255);
    expect(first?.commissionRate).toBeCloseTo(0.08);
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("handles missing category as null", () => {
    const html = readFileSync(
      resolve(fixturesDir, "ranking-page.html"),
      "utf-8",
    );
    const products = parseFastmossRanking(html, "th", "2025-01-15");

    // Third product has empty category
    const third = products[2];
    expect(third).toBeDefined();
    expect(third?.category).toBeNull();
  });

  it("handles negative growth rate", () => {
    const html = readFileSync(
      resolve(fixturesDir, "ranking-page.html"),
      "utf-8",
    );
    const products = parseFastmossRanking(html, "th", "2025-01-15");

    // Second product has -5.2% growth
    const second = products[1];
    expect(second).toBeDefined();
    expect(second?.orderGrowthRate).toBeCloseTo(-0.052);
  });

  it("validates each product with Zod schema", () => {
    const html = readFileSync(
      resolve(fixturesDir, "ranking-page.html"),
      "utf-8",
    );
    const products = parseFastmossRanking(html, "th", "2025-01-15");

    // All products should be valid — parser validates internally
    for (const product of products) {
      expect(product.productName).toBeTruthy();
      expect(product.unitsSold).toBeGreaterThanOrEqual(0);
      expect(product.commissionRate).toBeGreaterThanOrEqual(0);
      expect(product.commissionRate).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty array for empty page", () => {
    const html = readFileSync(resolve(fixturesDir, "empty-page.html"), "utf-8");
    const products = parseFastmossRanking(html, "th", "2025-01-15");

    expect(products).toHaveLength(0);
  });
});
