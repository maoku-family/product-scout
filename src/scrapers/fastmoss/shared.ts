import { homedir } from "node:os";
import { resolve } from "node:path";

import type { BrowserContext } from "playwright";
import { chromium } from "playwright";

import { logger } from "@/utils/logger";
import { withRetry } from "@/utils/retry";

export const FASTMOSS_BASE_URL = "https://www.fastmoss.com";
export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".product-scout-chrome");

export type FastmossScrapeOptions = {
  region: string;
  category?: string;
  limit?: number;
  /** Custom profile directory for Chrome persistent context */
  profileDir?: string;
};

/**
 * Launch a persistent Chrome context for FastMoss scraping.
 * Uses system Chrome with a persistent profile to preserve login sessions.
 */
export async function launchFastmossContext(
  profileDir?: string,
): Promise<BrowserContext> {
  const dir = profileDir ?? DEFAULT_PROFILE_DIR;
  logger.info("Launching Chrome with persistent profile", { profileDir: dir });

  return withRetry(
    () =>
      chromium.launchPersistentContext(dir, {
        channel: "chrome",
        headless: false,
        timeout: 30000,
      }),
    { maxRetries: 3, delay: 2000 },
  );
}

/**
 * Check if the current page has been redirected to a login page.
 * Throws an error if the session has expired.
 */
export function checkLoginStatus(page: { url: () => string }): void {
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl.includes("/sign")) {
    logger.error("FastMoss session expired — please login in Chrome");
    throw new Error(
      "FastMoss session expired. Please login at https://www.fastmoss.com in your Chrome browser.",
    );
  }
}

/**
 * Parse a percentage string like "25.5%" or "-5.2%" or "1249.68%" into a decimal.
 * Returns 0 if unparseable.
 */
export function parsePercentage(raw: string): number {
  const cleaned = raw.replace("%", "").replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return 0;
  }
  return value / 100;
}
