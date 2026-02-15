import { homedir } from "node:os";
import { resolve } from "node:path";

import type { BrowserContext, Page } from "playwright";
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
 * Selectors that match the login button in the FastMoss top bar.
 * The Chinese UI shows "注册/登录", so we match "注册/登录" exactly.
 * Also checks English "Log in" in case the UI language changes.
 * Playwright's $() does not support comma-separated selectors, so we try each one.
 * We add a visibility check to avoid matching hidden/footer elements.
 */
const LOGIN_BUTTON_SELECTORS = ['text="注册/登录"', 'text="Log in"'];

/**
 * Check if the current page is logged in to FastMoss.
 * Detects the login button in the top bar — present on all pages when not logged in.
 * Supports both Chinese ("注册/登录") and English ("Log in") UI.
 * Only matches visible elements to avoid false positives from hidden DOM nodes.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  for (const selector of LOGIN_BUTTON_SELECTORS) {
    const loginButton = await page.$(selector);
    if (loginButton !== null && (await loginButton.isVisible())) {
      return false;
    }
  }
  return true;
}

/**
 * Check if the current page is logged in to FastMoss.
 * Throws an error if not logged in (detected via login button in top bar).
 */
export async function checkLoginStatus(page: Page): Promise<void> {
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    logger.error("FastMoss not logged in — login button detected");
    throw new Error(
      "FastMoss not logged in — login button detected. Run: bun run scripts/login.ts",
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
