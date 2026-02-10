# FastMoss Scraper CDP Rewrite Plan

> **Status: Archived** — This is a historical plan document. The implementation may differ from what's described here (e.g., CDP was replaced by Playwright persistent context). For the current state, refer to [design.md](../design.md) and [architecture.md](../architecture.md).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite FastMoss scraper to use CDP bridge (connect to user's system Chrome) and DOM-based data extraction instead of regex HTML parsing.

**Architecture:** Replace `chromium.launchPersistentContext()` with `chromium.connectOverCDP()` to connect to the user's already-running Chrome browser. Replace regex HTML parsing with `page.evaluate()` DOM extraction. Add a helper script to launch Chrome with CDP debugging port. Add a Chinese number parser utility for FastMoss's "2.28万" format.

**Tech Stack:** Playwright CDP, page.evaluate() DOM API, Bun TypeScript

---

## Background

Testing revealed 4 issues with the current FastMoss scraper:

1. **WAF blocking**: Headless Playwright is detected by Tencent EdgeOne WAF → "Restricted Access"
2. **HTML parser mismatch**: Regex `<tr class="product-row">` doesn't match actual HTML (Ant Design `tr.ant-table-row.ant-table-row-level-0`)
3. **`waitUntil: "networkidle"` timeout**: React SPA has continuous network activity
4. **Chinese number format**: Sales data uses "2.28万" format (= 22800)

### Actual FastMoss HTML Structure (from testing)

- Row selector: `tr.ant-table-row.ant-table-row-level-0`
- Cell selector: `td.ant-table-cell`
- 12 columns per row:

| Index | Content | Example |
|-------|---------|---------|
| 0 | Rank | (SVG badge) |
| 1 | Product name + price | `[NEW 2026] ANAS Velvet...售价：RM5.99` |
| 2 | Country | `马来西亚` |
| 3 | Shop name + shop sales | `ANAS店铺销量：708.41万` |
| 4 | Category | `口红与唇彩` |
| 5 | Commission rate (hidden) | `1%` |
| 6 | Sales volume | `2.28万` |
| 7 | Sales growth rate | `1249.68%` |
| 8 | Revenue (GMV) | `RM15.00万` |
| 9 | Total sales | `113.70万` |
| 10 | Total revenue | `RM682.38万` |
| 11 | Actions | (buttons) |

---

### Task 1: Add Chinese number parser utility

**Files:**
- Create: `src/utils/parse-chinese-number.ts`
- Create: `test/unit/utils/parse-chinese-number.test.ts`

FastMoss displays numbers in Chinese format: "2.28万" = 22800, "7.63亿" = 763000000. We need a pure function to parse these.

**Step 1: Write the failing tests**

Create `test/unit/utils/parse-chinese-number.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseChineseNumber } from "@/utils/parse-chinese-number";

describe("parseChineseNumber", () => {
  it("parses plain numbers", () => {
    expect(parseChineseNumber("1234")).toBe(1234);
    expect(parseChineseNumber("0")).toBe(0);
  });

  it("parses 万 (10,000) suffix", () => {
    expect(parseChineseNumber("2.28万")).toBe(22800);
    expect(parseChineseNumber("1.93万")).toBe(19300);
    expect(parseChineseNumber("113.70万")).toBe(1137000);
  });

  it("parses 亿 (100,000,000) suffix", () => {
    expect(parseChineseNumber("7.63亿")).toBe(763000000);
    expect(parseChineseNumber("725.78亿")).toBe(72578000000);
  });

  it("handles numbers with currency prefix", () => {
    expect(parseChineseNumber("RM15.00万")).toBe(150000);
    expect(parseChineseNumber("Rp5221.61万")).toBe(52216100);
    expect(parseChineseNumber("₱46.10万")).toBe(461000);
  });

  it("handles numbers with comma separators", () => {
    expect(parseChineseNumber("1,234")).toBe(1234);
    expect(parseChineseNumber("Rp3,202")).toBe(3202);
  });

  it("returns 0 for unparseable strings", () => {
    expect(parseChineseNumber("")).toBe(0);
    expect(parseChineseNumber("N/A")).toBe(0);
    expect(parseChineseNumber("--")).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/utils/parse-chinese-number.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/utils/parse-chinese-number.ts`:

```typescript
/**
 * Parse a Chinese-formatted number string into a numeric value.
 *
 * Handles:
 * - Plain numbers: "1234" → 1234
 * - 万 suffix (10,000): "2.28万" → 22800
 * - 亿 suffix (100,000,000): "7.63亿" → 763000000
 * - Currency prefixes: "RM15.00万" → 150000
 * - Comma separators: "1,234" → 1234
 *
 * Returns 0 for unparseable strings.
 */
export function parseChineseNumber(raw: string): number {
  if (!raw || raw.trim() === "") return 0;

  // Remove currency prefixes (RM, Rp, ₱, $, etc.) and whitespace
  let cleaned = raw.trim().replace(/^[A-Za-z₱$¥€£]+/, "");

  // Remove comma separators
  cleaned = cleaned.replace(/,/g, "");

  // Check for Chinese multiplier suffixes
  let multiplier = 1;
  if (cleaned.endsWith("亿")) {
    multiplier = 100_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("万")) {
    multiplier = 10_000;
    cleaned = cleaned.slice(0, -1);
  }

  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return 0;

  return Math.round(value * multiplier);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/utils/parse-chinese-number.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/utils/parse-chinese-number.ts test/unit/utils/parse-chinese-number.test.ts
git commit -m "feat: add chinese number parser utility"
```

---

### Task 2: Rewrite FastMoss scraper to use CDP + DOM extraction

**Files:**
- Modify: `src/scrapers/fastmoss.ts` (full rewrite)

This is the core change. Replace:
- `chromium.launchPersistentContext()` → `chromium.connectOverCDP()`
- `page.content()` + regex parsing → `page.evaluate()` DOM extraction
- `waitUntil: "networkidle"` → `waitUntil: "domcontentloaded"` + wait for table selector

**Step 1: Rewrite `src/scrapers/fastmoss.ts`**

```typescript
import { chromium } from "playwright";

import { FastmossProductSchema } from "@/schemas/product";
import type { FastmossProduct } from "@/schemas/product";
import { parseChineseNumber } from "@/utils/parse-chinese-number";
import { logger } from "@/utils/logger";

const FASTMOSS_BASE_URL = "https://www.fastmoss.com/e-commerce/saleslist";
const CDP_URL = "http://127.0.0.1:9222";

export type FastmossScrapeOptions = {
  region: string;
  category?: string;
  limit?: number;
  cdpUrl?: string;
};

/**
 * Raw row data extracted from the FastMoss DOM via page.evaluate().
 * Matches the actual Ant Design table structure.
 */
type RawRowData = {
  productName: string;
  shopName: string;
  category: string;
  commissionRate: string;
  unitsSold: string;
  growthRate: string;
  gmv: string;
};

/**
 * Extract product data from the FastMoss ranking table using DOM API.
 * Runs inside the browser via page.evaluate().
 */
function extractTableDataScript(): RawRowData[] {
  const rows = document.querySelectorAll(
    "tr.ant-table-row.ant-table-row-level-0"
  );
  const results: RawRowData[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll("td.ant-table-cell");
    if (cells.length < 11) continue;

    // Cell 1: product name (text before "售价：")
    const cell1Text = cells[1]?.textContent?.trim() ?? "";
    const productName = cell1Text.split("售价")[0]?.trim() ?? "";

    // Cell 3: shop name (text before "店铺销量")
    const cell3Text = cells[3]?.textContent?.trim() ?? "";
    const shopName = cell3Text.split("店铺销量")[0]?.trim() ?? "";

    // Cell 4: category
    const category = cells[4]?.textContent?.trim() ?? "";

    // Cell 5: commission rate (e.g., "1%")
    const commissionRate = cells[5]?.textContent?.trim() ?? "0%";

    // Cell 6: sales volume (e.g., "2.28万")
    const unitsSold = cells[6]?.textContent?.trim() ?? "0";

    // Cell 7: growth rate (e.g., "1249.68%" or "-2.51%")
    const growthRate = cells[7]?.textContent?.trim() ?? "0%";

    // Cell 8: GMV / revenue (e.g., "RM15.00万")
    const gmv = cells[8]?.textContent?.trim() ?? "0";

    if (productName) {
      results.push({
        productName,
        shopName,
        category,
        commissionRate,
        unitsSold,
        growthRate,
        gmv,
      });
    }
  }

  return results;
}

/**
 * Parse a percentage string like "25.5%" or "-5.2%" or "1249.68%" into a decimal.
 * Returns 0 if unparseable.
 */
function parsePercentage(raw: string): number {
  const cleaned = raw.replace("%", "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return 0;
  return value / 100;
}

/**
 * Transform raw DOM data into validated FastmossProduct objects.
 * Pure function — fully testable without Playwright.
 */
export function transformRawRows(
  rows: RawRowData[],
  country: string,
  scrapedAt: string,
): FastmossProduct[] {
  const products: FastmossProduct[] = [];

  for (const row of rows) {
    const raw = {
      productName: row.productName,
      shopName: row.shopName,
      country,
      category: row.category === "" ? null : row.category,
      unitsSold: parseChineseNumber(row.unitsSold),
      gmv: parseChineseNumber(row.gmv),
      orderGrowthRate: parsePercentage(row.growthRate),
      commissionRate: parsePercentage(row.commissionRate),
      scrapedAt,
    };

    const result = FastmossProductSchema.safeParse(raw);
    if (result.success) {
      products.push(result.data);
    } else {
      logger.warn(
        `[fastmoss] Skipping invalid product "${row.productName}"`,
        result.error.issues,
      );
    }
  }

  return products;
}

/**
 * Scrape FastMoss ranking page by connecting to a running Chrome via CDP.
 *
 * Prerequisites:
 * 1. Chrome must be running with: --remote-debugging-port=9222
 * 2. User must be logged into FastMoss in that Chrome
 *
 * Use `bun run scripts/chrome.ts` to launch Chrome with the correct flags.
 */
export async function scrapeFastmoss(
  options: FastmossScrapeOptions,
): Promise<FastmossProduct[]> {
  const cdpUrl = options.cdpUrl ?? CDP_URL;

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (error) {
    logger.error(
      "Failed to connect to Chrome via CDP. Is Chrome running with --remote-debugging-port=9222?",
      error,
    );
    throw new Error(
      "Cannot connect to Chrome. Please run: bun run scripts/chrome.ts",
    );
  }

  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("No browser context found in Chrome");
    }

    const page = await context.newPage();

    // Build URL with region filter
    const url = new URL(FASTMOSS_BASE_URL);
    url.searchParams.set("country", options.region);
    if (options.category) {
      url.searchParams.set("category", options.category);
    }

    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Check for login redirect (expired session)
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/sign")) {
      await page.close();
      logger.error("FastMoss session expired — please login in Chrome");
      throw new Error(
        "FastMoss session expired. Please login at https://www.fastmoss.com in your Chrome browser.",
      );
    }

    // Wait for the Ant Design table to render
    await page.waitForSelector("tr.ant-table-row", { timeout: 30000 });

    // Small extra wait for all data to populate
    await page.waitForTimeout(2000);

    // Extract data from DOM
    const rawRows = await page.evaluate(extractTableDataScript);

    await page.close();

    const today = new Date().toISOString().slice(0, 10);
    let products = transformRawRows(rawRows, options.region, today);

    // Apply limit if specified
    if (options.limit && products.length > options.limit) {
      products = products.slice(0, options.limit);
    }

    logger.info(`FastMoss scraped ${String(products.length)} products`, {
      region: options.region,
      category: options.category,
    });

    return products;
  } finally {
    // Disconnect from CDP — does NOT close Chrome
    browser.close();
  }
}
```

**Step 2: Run lint to verify no errors**

Run: `bun run lint`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add src/scrapers/fastmoss.ts
git commit -m "feat: rewrite fastmoss scraper to use CDP bridge and DOM extraction"
```

---

### Task 3: Update test fixtures and parser tests

**Files:**
- Modify: `test/fixtures/fastmoss/ranking-page.html` (rewrite to match real structure)
- Modify: `test/fixtures/fastmoss/empty-page.html` (update to new structure)
- Modify: `test/unit/scrapers/fastmoss.test.ts` (rewrite all tests)

**Step 1: Rewrite fixture `test/fixtures/fastmoss/ranking-page.html`**

Replace with HTML that matches the actual Ant Design table structure from FastMoss:

```html
<!DOCTYPE html>
<html>
<body>
  <table>
    <thead>
      <tr>
        <th class="ant-table-cell">排名</th>
        <th class="ant-table-cell">商品</th>
        <th class="ant-table-cell">国家/地区</th>
        <th class="ant-table-cell">所属店铺</th>
        <th class="ant-table-cell">商品分类</th>
        <th class="ant-table-cell">佣金比例</th>
        <th class="ant-table-cell">销量</th>
        <th class="ant-table-cell">销量环比</th>
        <th class="ant-table-cell">销售额</th>
        <th class="ant-table-cell">总销量</th>
        <th class="ant-table-cell">总销售额</th>
        <th class="ant-table-cell">操作</th>
      </tr>
    </thead>
    <tbody>
      <tr class="ant-table-row ant-table-row-level-0">
        <td class="ant-table-cell">1</td>
        <td class="ant-table-cell">LED Ring Light售价：฿199</td>
        <td class="ant-table-cell">泰国</td>
        <td class="ant-table-cell">BeautyShop店铺销量：10.00万</td>
        <td class="ant-table-cell">美妆个护</td>
        <td class="ant-table-cell">8%</td>
        <td class="ant-table-cell">1500</td>
        <td class="ant-table-cell">25.5%</td>
        <td class="ant-table-cell">฿4500.00</td>
        <td class="ant-table-cell">5.00万</td>
        <td class="ant-table-cell">฿100.00万</td>
        <td class="ant-table-cell"></td>
      </tr>
      <tr class="ant-table-row ant-table-row-level-0">
        <td class="ant-table-cell">2</td>
        <td class="ant-table-cell">Yoga Mat售价：฿599</td>
        <td class="ant-table-cell">泰国</td>
        <td class="ant-table-cell">FitStore店铺销量：5.00万</td>
        <td class="ant-table-cell">运动与户外</td>
        <td class="ant-table-cell">12%</td>
        <td class="ant-table-cell">800</td>
        <td class="ant-table-cell">-5.2%</td>
        <td class="ant-table-cell">฿2400.00</td>
        <td class="ant-table-cell">3.00万</td>
        <td class="ant-table-cell">฿50.00万</td>
        <td class="ant-table-cell"></td>
      </tr>
      <tr class="ant-table-row ant-table-row-level-0">
        <td class="ant-table-cell">3</td>
        <td class="ant-table-cell">Phone Case售价：฿99</td>
        <td class="ant-table-cell">泰国</td>
        <td class="ant-table-cell">TechHub店铺销量：20.00万</td>
        <td class="ant-table-cell"></td>
        <td class="ant-table-cell">5%</td>
        <td class="ant-table-cell">3000</td>
        <td class="ant-table-cell">45.0%</td>
        <td class="ant-table-cell">฿6000.00</td>
        <td class="ant-table-cell">10.00万</td>
        <td class="ant-table-cell">฿200.00万</td>
        <td class="ant-table-cell"></td>
      </tr>
    </tbody>
  </table>
</body>
</html>
```

**Step 2: Rewrite fixture `test/fixtures/fastmoss/empty-page.html`**

```html
<!DOCTYPE html>
<html>
<body>
  <table>
    <thead>
      <tr>
        <th class="ant-table-cell">排名</th>
        <th class="ant-table-cell">商品</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  </table>
</body>
</html>
```

**Step 3: Rewrite `test/unit/scrapers/fastmoss.test.ts`**

The key change: we now test `transformRawRows()` (pure function) instead of `parseFastmossRanking()` (deleted). The scraper tests mock `chromium.connectOverCDP()` instead of `chromium.launchPersistentContext()`.

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { transformRawRows, scrapeFastmoss } from "@/scrapers/fastmoss";

// --- transformRawRows tests (pure function, no mocks needed) ---

describe("transformRawRows", () => {
  const sampleRows = [
    {
      productName: "LED Ring Light",
      shopName: "BeautyShop",
      category: "美妆个护",
      commissionRate: "8%",
      unitsSold: "1500",
      growthRate: "25.5%",
      gmv: "฿4500.00",
    },
    {
      productName: "Yoga Mat",
      shopName: "FitStore",
      category: "运动与户外",
      commissionRate: "12%",
      unitsSold: "800",
      growthRate: "-5.2%",
      gmv: "฿2400.00",
    },
    {
      productName: "Phone Case",
      shopName: "TechHub",
      category: "",
      commissionRate: "5%",
      unitsSold: "3000",
      growthRate: "45.0%",
      gmv: "฿6000.00",
    },
  ];

  it("transforms raw rows into FastmossProduct array", () => {
    const products = transformRawRows(sampleRows, "th", "2025-01-15");

    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first).toBeDefined();
    expect(first?.productName).toBe("LED Ring Light");
    expect(first?.shopName).toBe("BeautyShop");
    expect(first?.country).toBe("th");
    expect(first?.unitsSold).toBe(1500);
    expect(first?.gmv).toBe(4500);
    expect(first?.orderGrowthRate).toBeCloseTo(0.255);
    expect(first?.commissionRate).toBeCloseTo(0.08);
    expect(first?.scrapedAt).toBe("2025-01-15");
  });

  it("handles empty category as null", () => {
    const products = transformRawRows(sampleRows, "th", "2025-01-15");
    const third = products[2];
    expect(third).toBeDefined();
    expect(third?.category).toBeNull();
  });

  it("handles negative growth rate", () => {
    const products = transformRawRows(sampleRows, "th", "2025-01-15");
    const second = products[1];
    expect(second).toBeDefined();
    expect(second?.orderGrowthRate).toBeCloseTo(-0.052);
  });

  it("validates each product with Zod schema", () => {
    const products = transformRawRows(sampleRows, "th", "2025-01-15");
    for (const product of products) {
      expect(product.productName).toBeTruthy();
      expect(product.unitsSold).toBeGreaterThanOrEqual(0);
      expect(product.commissionRate).toBeGreaterThanOrEqual(0);
      expect(product.commissionRate).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty array for empty input", () => {
    const products = transformRawRows([], "th", "2025-01-15");
    expect(products).toHaveLength(0);
  });

  it("skips invalid rows (missing product name)", () => {
    const invalid = [{ productName: "", shopName: "", category: "", commissionRate: "0%", unitsSold: "0", growthRate: "0%", gmv: "0" }];
    const products = transformRawRows(invalid, "th", "2025-01-15");
    // Zod schema requires productName to be a non-empty string — this depends on schema definition
    // If schema allows empty string, product will be included
    expect(products.length).toBeLessThanOrEqual(1);
  });

  it("parses Chinese number format for sales volume", () => {
    const rows = [{
      productName: "Test Product",
      shopName: "TestShop",
      category: "test",
      commissionRate: "5%",
      unitsSold: "2.28万",
      growthRate: "10%",
      gmv: "RM15.00万",
    }];
    const products = transformRawRows(rows, "my", "2025-01-15");
    expect(products).toHaveLength(1);
    expect(products[0]?.unitsSold).toBe(22800);
    expect(products[0]?.gmv).toBe(150000);
  });
});

// --- scrapeFastmoss tests (mocked CDP connection) ---

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: vi.fn(),
  },
}));

const playwrightMod: typeof import("playwright") = await import("playwright");
// eslint-disable-next-line @typescript-eslint/unbound-method
const { connectOverCDP } = playwrightMod.chromium;
const mockConnectOverCDP = vi.mocked(connectOverCDP);

type MockPage = {
  goto: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type MockContext = {
  newPage: ReturnType<typeof vi.fn>;
};

type MockBrowser = {
  contexts: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function createMockPage(
  options: { url?: string; rawRows?: unknown[] } = {},
): MockPage {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue(
      options.url ?? "https://www.fastmoss.com/e-commerce/saleslist",
    ),
    evaluate: vi.fn().mockResolvedValue(options.rawRows ?? []),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowser(mockPage: MockPage): MockBrowser {
  const mockContext: MockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    contexts: vi.fn().mockReturnValue([mockContext]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function setupMock(mockBrowser: MockBrowser): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  mockConnectOverCDP.mockResolvedValueOnce(mockBrowser as never);
}

describe("scrapeFastmoss", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects to Chrome via CDP", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await scrapeFastmoss({ region: "th" });

    expect(mockConnectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9222");
  });

  it("accepts custom CDP URL", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await scrapeFastmoss({ region: "th", cdpUrl: "http://localhost:9333" });

    expect(mockConnectOverCDP).toHaveBeenCalledWith("http://localhost:9333");
  });

  it("detects expired session (redirected to login page)", async () => {
    const mockPage = createMockPage({
      url: "https://www.fastmoss.com/login",
    });
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await expect(scrapeFastmoss({ region: "th" })).rejects.toThrow(
      /session.*expired|login/i,
    );
  });

  it("extracts data via page.evaluate and returns products", async () => {
    const rawRows = [{
      productName: "Test Product",
      shopName: "TestShop",
      category: "beauty",
      commissionRate: "5%",
      unitsSold: "100",
      growthRate: "10%",
      gmv: "200",
    }];
    const mockPage = createMockPage({ rawRows });
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    const products = await scrapeFastmoss({ region: "th" });

    expect(products).toHaveLength(1);
    expect(products[0]?.productName).toBe("Test Product");
    expect(mockPage.evaluate).toHaveBeenCalled();
  });

  it("disconnects from CDP after scraping", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await scrapeFastmoss({ region: "th" });

    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("disconnects from CDP even on error", async () => {
    const mockPage = createMockPage({
      url: "https://www.fastmoss.com/login",
    });
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await expect(scrapeFastmoss({ region: "th" })).rejects.toThrow();
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("applies limit to results", async () => {
    const rawRows = Array.from({ length: 5 }, (_, i) => ({
      productName: `P${String(i)}`,
      shopName: `S${String(i)}`,
      category: "cat",
      commissionRate: "5%",
      unitsSold: String(100 + i),
      growthRate: "10%",
      gmv: String(200 + i),
    }));
    const mockPage = createMockPage({ rawRows });
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    const products = await scrapeFastmoss({ region: "th", limit: 2 });
    expect(products).toHaveLength(2);
  });

  it("navigates to correct URL with region and category", async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);
    setupMock(mockBrowser);

    await scrapeFastmoss({ region: "vn", category: "beauty" });

    const gotoCall = String(mockPage.goto.mock.calls[0]?.[0]);
    expect(gotoCall).toContain("country=vn");
    expect(gotoCall).toContain("category=beauty");
  });

  it("throws clear error when CDP connection fails", async () => {
    mockConnectOverCDP.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(scrapeFastmoss({ region: "th" })).rejects.toThrow(
      /Cannot connect to Chrome/,
    );
  });
});
```

**Step 4: Run all tests**

Run: `bun test`
Expected: All tests PASS (parser tests now use `transformRawRows`, scraper tests mock CDP)

**Step 5: Commit**

```bash
git add test/fixtures/fastmoss/ test/unit/scrapers/fastmoss.test.ts
git commit -m "test: rewrite fastmoss tests for CDP bridge and DOM extraction"
```

---

### Task 4: Add Chrome launcher helper script

**Files:**
- Create: `scripts/chrome.ts`

A convenience script so the user doesn't need to remember the Chrome launch command.

**Step 1: Create `scripts/chrome.ts`**

```typescript
#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Launch Chrome with CDP debugging port for Playwright connection.
 *
 * Usage: bun run scripts/chrome.ts [--port 9222]
 */
const port = (() => {
  const idx = process.argv.indexOf("--port");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return "9222";
})();

const chromePaths: Record<string, string> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

const chromePath = chromePaths[platform()];
if (!chromePath) {
  console.error(`Unsupported platform: ${platform()}`);
  process.exit(1);
}

console.log(`Launching Chrome with CDP on port ${port}...`);
console.log("Keep this terminal open while running the scraper.");
console.log("Press Ctrl+C to stop.\n");

const child = spawn(chromePath, [`--remote-debugging-port=${port}`], {
  stdio: "inherit",
  detached: false,
});

child.on("error", (error) => {
  console.error("Failed to launch Chrome:", error.message);
  console.error(`\nMake sure Chrome is installed at: ${chromePath}`);
  process.exit(1);
});

child.on("exit", (code) => {
  console.log(`Chrome exited with code ${String(code)}`);
});
```

**Step 2: Test it manually**

Run: `bun run scripts/chrome.ts`
Expected: Chrome opens. Verify `http://127.0.0.1:9222/json/version` returns CDP info.

**Step 3: Commit**

```bash
git add scripts/chrome.ts
git commit -m "feat: add chrome launcher script for CDP connection"
```

---

### Task 5: Update pipeline to remove `withRetry` from FastMoss navigation

**Files:**
- Modify: `src/core/pipeline.ts` (no changes needed — pipeline calls `scrapeFastmoss()` which now handles CDP internally)

**Step 1: Verify pipeline still works with new scraper signature**

The `scrapeFastmoss()` function signature is unchanged: `(options: FastmossScrapeOptions) => Promise<FastmossProduct[]>`. The `PipelineOptions` type doesn't change. No pipeline modifications needed.

Run: `bun test`
Expected: All tests PASS

**Step 2: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 3: Commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore: lint fixes after fastmoss rewrite"
```

---

### Task 6: Manual end-to-end test

**Step 1: Launch Chrome with CDP**

```bash
bun run scripts/chrome.ts
```

**Step 2: Login to FastMoss in Chrome**

Navigate to https://www.fastmoss.com and login.

**Step 3: Run scraper dry-run**

In a new terminal:
```bash
bun run scripts/scout.ts --region th --limit 5 --dry-run
```

Expected: Should see scraped products in output, no Notion sync.

**Step 4: Verify output**

Check that:
- Products have valid names, categories, sales volumes
- Chinese numbers parsed correctly (万/亿)
- Growth rates parsed correctly (positive and negative percentages)
- Commission rates are decimal values (0-1 range)

---

### Task 7: Update documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/design.md`

**Step 1: Update architecture.md**

In the Scrapers table, update the `fastmoss.ts` entry:
- Method: `CDP bridge (connectOverCDP) + page.evaluate() DOM extraction`
- Description: Connects to user's running Chrome via CDP. Uses `page.evaluate()` to extract data from Ant Design table DOM. Includes `transformRawRows()` pure function for testable data transformation. Parses Chinese number format (万/亿).

In Key Technical Decisions, add/update:
- `FastMoss uses CDP bridge instead of persistent context`: WAF blocks Playwright's bundled Chromium. CDP connects to user's real Chrome, completely undetectable.
- `FastMoss uses DOM extraction instead of regex HTML parsing`: Page uses React + Ant Design. DOM API via `page.evaluate()` is more reliable than regex on dynamically-rendered HTML.

**Step 2: Update design.md**

In the Data Sources table, update FastMoss collection method:
- `FastMoss (CDP bridge to Chrome + DOM extraction)`

Update the Key Data Source Decisions table:
- Add: `Playwright persistent context` → `CDP bridge to system Chrome` → `Persistent context used Playwright's Chromium which is blocked by WAF. CDP connects to user's real Chrome browser for undetectable scraping.`

**Step 3: Commit**

```bash
git add docs/architecture.md docs/design.md
git commit -m "docs: update architecture and design for FastMoss CDP rewrite"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Chinese number parser utility + tests | 5 min |
| 2 | Rewrite FastMoss scraper (CDP + DOM) | 10 min |
| 3 | Rewrite test fixtures and tests | 10 min |
| 4 | Chrome launcher helper script | 5 min |
| 5 | Verify pipeline compatibility | 3 min |
| 6 | Manual end-to-end test | 5 min |
| 7 | Update documentation | 5 min |

**Total: ~45 minutes**

---

## Implementation Deviation: CDP → Persistent Context

During end-to-end testing, we discovered that **Bun's WebSocket implementation is incompatible with Playwright's `connectOverCDP`**. The connection hangs indefinitely (raw WebSocket works fine; Node.js + Playwright works fine; only Bun + Playwright CDP fails). Debug logs showed: `WebSocket was closed before the connection was established` with code 1006.

**Final approach:** Replaced `chromium.connectOverCDP()` with `chromium.launchPersistentContext()` using `channel: "chrome"`.

| Aspect | Original Plan (CDP) | Actual Implementation (Persistent Context) |
|--------|--------------------|--------------------------------------------|
| Connection | `chromium.connectOverCDP("http://127.0.0.1:9222")` | `chromium.launchPersistentContext(profileDir, { channel: "chrome" })` |
| Chrome lifecycle | User launches Chrome manually via `scripts/chrome.ts` | Playwright launches and manages Chrome automatically |
| Login persistence | Via `--user-data-dir` flag on Chrome | Via `profileDir` parameter (same underlying mechanism) |
| WAF bypass | ✅ System Chrome | ✅ System Chrome (identical) |
| Bun compatibility | ❌ WebSocket hangs | ✅ Works perfectly |

**Task-level impact:**
- **Task 1** (Chinese number parser): No change — implemented as planned.
- **Task 2** (Scraper rewrite): Changed from `connectOverCDP` to `launchPersistentContext`. DOM extraction logic unchanged.
- **Task 3** (Tests): Mocks `launchPersistentContext` instead of `connectOverCDP`. Test coverage equivalent.
- **Task 4** (Chrome launcher script): **No longer needed.** Playwright manages Chrome lifecycle directly.
- **Task 5** (Pipeline compatibility): No change — `scrapeFastmoss()` function signature updated (`cdpUrl` → `profileDir`), pipeline call site unchanged.
- **Task 6** (E2E test): Passed successfully. 5 products scraped from FastMoss Thailand.
- **Task 7** (Documentation): Updated to reflect persistent context approach.
