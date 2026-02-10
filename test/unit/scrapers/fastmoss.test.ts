import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFastmossRanking, scrapeFastmoss } from "@/scrapers/fastmoss";

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

// --- scrapeFastmoss tests (mocked Playwright) ---

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
  },
}));

const playwrightMod: typeof import("playwright") = await import("playwright");
// eslint-disable-next-line @typescript-eslint/unbound-method
const { launchPersistentContext } = playwrightMod.chromium;
const mockLaunchPersistentContext = vi.mocked(launchPersistentContext);

type MockPage = {
  goto: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type MockContext = {
  pages: ReturnType<typeof vi.fn>;
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

/** Helper to create a mock Playwright Page */
function createMockPage(
  options: { url?: string; content?: string } = {},
): MockPage {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi
      .fn()
      .mockReturnValue(
        options.url ?? "https://www.fastmoss.com/e-commerce/saleslist",
      ),
    content: vi
      .fn()
      .mockResolvedValue(
        options.content ??
          '<table class="ranking-table"><tbody></tbody></table>',
      ),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/** Helper to create a mock Playwright BrowserContext */
function createMockContext(
  pages: MockPage[] = [createMockPage()],
): MockContext {
  return {
    pages: vi.fn().mockReturnValue(pages),
    newPage: vi.fn().mockResolvedValue(pages[0]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function setupMock(mockContext: MockContext): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  mockLaunchPersistentContext.mockResolvedValueOnce(mockContext as never);
}

describe("scrapeFastmoss", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses persistent context from db/browser-data/", async () => {
    const mockPage = createMockPage();
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    await scrapeFastmoss({ region: "th" });

    expect(mockLaunchPersistentContext).toHaveBeenCalledWith(
      expect.stringContaining("browser-data"),
      expect.any(Object),
    );
  });

  it("detects expired session (redirected to login page)", async () => {
    const mockPage = createMockPage({
      url: "https://www.fastmoss.com/login",
    });
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    await expect(scrapeFastmoss({ region: "th" })).rejects.toThrow(
      /session.*expired|login/i,
    );
  });

  it("calls parser on page content and returns products", async () => {
    const html = `<table class="ranking-table"><tbody>
      <tr class="product-row"><td class="product-name">Test</td><td class="shop-name">Shop</td><td class="category">beauty</td><td class="units-sold">100</td><td class="gmv">200</td><td class="growth-rate">10%</td><td class="commission-rate">5%</td></tr>
    </tbody></table>`;
    const mockPage = createMockPage({ content: html });
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    const products = await scrapeFastmoss({ region: "th" });

    expect(products).toHaveLength(1);
    expect(products[0]?.productName).toBe("Test");
  });

  it("closes browser context after scraping", async () => {
    const mockPage = createMockPage();
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    await scrapeFastmoss({ region: "th" });

    expect(mockContext.close).toHaveBeenCalled();
  });

  it("closes browser context even on error", async () => {
    const mockPage = createMockPage({
      url: "https://www.fastmoss.com/login",
    });
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    await expect(scrapeFastmoss({ region: "th" })).rejects.toThrow();

    expect(mockContext.close).toHaveBeenCalled();
  });

  it("applies limit to results", async () => {
    const rows = Array.from(
      { length: 5 },
      (unused, i) =>
        `<tr class="product-row"><td class="product-name">P${String(i)}</td><td class="shop-name">S${String(i)}</td><td class="category">cat</td><td class="units-sold">${String(100 + i)}</td><td class="gmv">${String(200 + i)}</td><td class="growth-rate">10%</td><td class="commission-rate">5%</td></tr>`,
    ).join("\n");
    const html = `<table class="ranking-table"><tbody>${rows}</tbody></table>`;
    const mockPage = createMockPage({ content: html });
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    const products = await scrapeFastmoss({ region: "th", limit: 2 });

    expect(products).toHaveLength(2);
  });

  it("navigates to correct URL with region and category", async () => {
    const mockPage = createMockPage();
    const mockContext = createMockContext([mockPage]);
    setupMock(mockContext);

    await scrapeFastmoss({ region: "vn", category: "beauty" });

    const gotoCall = String(mockPage.goto.mock.calls[0]?.[0]);
    expect(gotoCall).toContain("country=vn");
    expect(gotoCall).toContain("category=beauty");
  });
});
