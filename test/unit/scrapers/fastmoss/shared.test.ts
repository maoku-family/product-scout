import { describe, expect, it, vi } from "vitest";

// Mock playwright and retry before importing shared
vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
  },
}));

vi.mock("@/utils/retry", () => ({
  withRetry: vi
    .fn()
    .mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}));

import {
  checkLoginStatus,
  isLoggedIn,
  parsePercentage,
} from "@/scrapers/fastmoss/shared";

// --- isLoggedIn tests ---

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- mock cast */
describe("isLoggedIn", () => {
  it("returns false when login button is present (first selector matches)", async () => {
    const mockPage = {
      $: vi.fn().mockResolvedValue({
        /* mock element handle */
      }),
    };

    const result = await isLoggedIn(mockPage as never);

    expect(result).toBe(false);
    // Should stop at first match — "text=登录"
    expect(mockPage.$).toHaveBeenCalledWith("text=登录");
  });

  it("returns true when no login button is found", async () => {
    const mockPage = {
      $: vi.fn().mockResolvedValue(null),
    };

    const result = await isLoggedIn(mockPage as never);

    expect(result).toBe(true);
    // Should try all selectors
    expect(mockPage.$).toHaveBeenCalledWith("text=登录");
    expect(mockPage.$).toHaveBeenCalledWith("text=Log in");
  });
});

// --- checkLoginStatus tests ---

describe("checkLoginStatus", () => {
  it("throws when 'Log in' button is present (not logged in)", async () => {
    const mockPage = {
      $: vi.fn().mockResolvedValue({
        /* mock element handle */
      }),
    };

    await expect(checkLoginStatus(mockPage as never)).rejects.toThrow(
      /not logged in/i,
    );
  });

  it("resolves when 'Log in' button is absent (logged in)", async () => {
    const mockPage = {
      $: vi.fn().mockResolvedValue(null),
    };

    await expect(checkLoginStatus(mockPage as never)).resolves.toBeUndefined();
  });

  it("throws with instruction to run login script", async () => {
    const mockPage = {
      $: vi.fn().mockResolvedValue({
        /* mock element */
      }),
    };

    await expect(checkLoginStatus(mockPage as never)).rejects.toThrow(
      /scripts\/login\.ts/,
    );
  });
});
/* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

// --- parsePercentage tests ---

describe("parsePercentage", () => {
  it("parses positive percentage", () => {
    expect(parsePercentage("25.5%")).toBeCloseTo(0.255);
  });

  it("parses negative percentage", () => {
    expect(parsePercentage("-5.2%")).toBeCloseTo(-0.052);
  });

  it("parses large percentage", () => {
    expect(parsePercentage("1249.68%")).toBeCloseTo(12.4968);
  });

  it("parses percentage with commas", () => {
    expect(parsePercentage("1,249.68%")).toBeCloseTo(12.4968);
  });

  it("returns 0 for unparseable string", () => {
    expect(parsePercentage("abc")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parsePercentage("")).toBe(0);
  });
});
