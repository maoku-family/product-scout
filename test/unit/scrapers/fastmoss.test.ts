import { afterEach, describe, expect, it, vi } from "vitest";

// Make withRetry pass through immediately (no retries, no delays)
vi.mock("@/utils/retry", () => ({
  withRetry: vi
    .fn()
    .mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}));

import { scrapeFastmoss, transformRawRows } from "@/scrapers/fastmoss";

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
      gmv: "4500.00",
    },
    {
      productName: "Yoga Mat",
      shopName: "FitStore",
      category: "运动与户外",
      commissionRate: "12%",
      unitsSold: "800",
      growthRate: "-5.2%",
      gmv: "2400.00",
    },
    {
      productName: "Phone Case",
      shopName: "TechHub",
      category: "",
      commissionRate: "5%",
      unitsSold: "3000",
      growthRate: "45.0%",
      gmv: "6000.00",
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

  it("parses Chinese number format for sales volume", () => {
    const rows = [
      {
        productName: "Test Product",
        shopName: "TestShop",
        category: "test",
        commissionRate: "5%",
        unitsSold: "2.28万",
        growthRate: "10%",
        gmv: "RM15.00万",
      },
    ];
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const mockConnectOverCDP = connectOverCDP as unknown as ReturnType<
  typeof vi.fn
>;

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
    url: vi
      .fn()
      .mockReturnValue(
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
    const rawRows = [
      {
        productName: "Test Product",
        shopName: "TestShop",
        category: "beauty",
        commissionRate: "5%",
        unitsSold: "100",
        growthRate: "10%",
        gmv: "200",
      },
    ];
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
    const rawRows = Array.from({ length: 5 }).map((unused, i) => ({
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
