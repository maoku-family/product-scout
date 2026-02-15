#!/usr/bin/env bun
import { resolve } from "node:path";
import { parseArgs } from "util";

import type { Page } from "playwright";

import { loadConfig } from "@/config/loader";
import { SecretsConfigSchema } from "@/schemas/config";
import {
  FASTMOSS_BASE_URL,
  isLoggedIn,
  launchFastmossContext,
} from "@/scrapers/fastmoss/shared";
import { logger } from "@/utils/logger";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    auto: { type: "boolean", default: false },
  },
  strict: true,
});

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200; // ~10 minutes

/**
 * Poll until the user is logged in.
 * Returns true if login detected, false if timed out.
 */
async function pollForLogin(page: Page): Promise<boolean> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (await isLoggedIn(page)) {
      return true;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  return false;
}

async function manualLogin(): Promise<void> {
  logger.info("FastMoss login — manual mode");

  const context = await launchFastmossContext();

  try {
    const page = await context.newPage();
    await page.goto(FASTMOSS_BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for page to settle
    await page.waitForTimeout(2000);

    // Check if already logged in
    if (await isLoggedIn(page)) {
      logger.info("Already logged in to FastMoss");
      console.log("\n✅ Already logged in to FastMoss. No action needed.\n");
      await page.close();
      return;
    }

    // Click login button to open the login modal
    const loginButton = await page.$("text=登录");
    if (loginButton) {
      await loginButton.click();
      await page.waitForTimeout(1000);
    }

    console.log(
      "\n🔑 Please complete login in the browser window...\n" +
        "   Waiting for login to complete (polling every 3s)...\n",
    );

    const success = await pollForLogin(page);

    if (success) {
      logger.info("FastMoss login successful");
      console.log("✅ Login successful! Cookies saved.\n");
    } else {
      logger.error("FastMoss login timed out");
      console.error("❌ Login timed out. Please try again.\n");
      process.exit(1);
    }

    await page.close();
  } finally {
    await context.close();
  }
}

async function autoLogin(): Promise<void> {
  logger.info("FastMoss login — auto mode");

  // Load credentials from secrets.yaml
  let secrets;
  try {
    secrets = loadConfig(resolve("config/secrets.yaml"), SecretsConfigSchema);
  } catch (error) {
    logger.error("Failed to load config/secrets.yaml", { error });
    console.error(
      "\n❌ Failed to load config/secrets.yaml.\n" +
        "   Ensure the file exists and is valid YAML.\n",
    );
    process.exit(1);
  }

  if (!secrets.fastmossEmail || !secrets.fastmossPassword) {
    console.error(
      "\n❌ Auto mode requires fastmossEmail and fastmossPassword in config/secrets.yaml.\n" +
        "   Add the following to your secrets.yaml:\n\n" +
        "     fastmossEmail: your-phone-number\n" +
        "     fastmossPassword: your-password\n\n" +
        "   Or use manual mode: bun run scripts/login.ts\n",
    );
    process.exit(1);
  }

  const context = await launchFastmossContext();

  try {
    const page = await context.newPage();
    await page.goto(FASTMOSS_BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for page to settle
    await page.waitForTimeout(3000);

    // Check if already logged in
    if (await isLoggedIn(page)) {
      logger.info("Already logged in to FastMoss");
      console.log("\n✅ Already logged in to FastMoss. No action needed.\n");
      await page.close();
      return;
    }

    // Step 1: Click login button to open the login modal
    const loginButton = await page.$("text=登录");
    if (!loginButton) {
      logger.error("Could not find login button on the page");
      console.error(
        "\n❌ Could not find login button. Page may have changed.\n",
      );
      process.exit(1);
    }
    await loginButton.click();
    logger.info("Opened login modal");
    await page.waitForTimeout(1500);

    // Step 2: Click "手机号登录/注册" tab (modal defaults to WeChat QR)
    const phoneTab = await page.$("text=手机号登录");
    if (!phoneTab) {
      logger.error("Could not find phone login tab");
      console.error(
        "\n❌ Could not find phone login tab in modal.\n" +
          "   Try manual mode: bun run scripts/login.ts\n",
      );
      process.exit(1);
    }
    await phoneTab.click();
    logger.info("Switched to phone login tab");
    await page.waitForTimeout(1000);

    // Step 3: Click "密码登录" link to switch from SMS to password mode
    const pwdLoginLink = await page.$("text=密码登录");
    if (!pwdLoginLink) {
      logger.error("Could not find password login link");
      console.error(
        "\n❌ Could not find '密码登录' link.\n" +
          "   Try manual mode: bun run scripts/login.ts\n",
      );
      process.exit(1);
    }
    await pwdLoginLink.click();
    logger.info("Switched to password login mode");
    await page.waitForTimeout(1000);

    // Step 4: Fill phone number and password
    const phoneInput = await page.$("#phone");
    const passwordInput = await page.$("#password");

    if (!phoneInput || !passwordInput) {
      logger.error("Could not find phone/password inputs");
      console.error(
        "\n❌ Could not find phone/password inputs in login modal.\n" +
          "   Try manual mode: bun run scripts/login.ts\n",
      );
      process.exit(1);
    }

    await phoneInput.fill(secrets.fastmossEmail);
    await passwordInput.fill(secrets.fastmossPassword);
    logger.info("Filled credentials");

    // Step 5: Click "注册/登录" submit button
    const submitButton = await page.$(".ant-btn-primary");
    if (submitButton) {
      await submitButton.click();
      logger.info("Clicked submit button");
    }

    // Wait for login to complete
    await page.waitForTimeout(3000);

    const success = await pollForLogin(page);

    if (success) {
      logger.info("FastMoss auto login successful");
      console.log("\n✅ Auto login successful! Cookies saved.\n");
    } else {
      logger.error("FastMoss auto login failed or timed out");
      console.error(
        "\n❌ Auto login failed. Check your credentials or try manual mode.\n" +
          "   Manual mode: bun run scripts/login.ts\n",
      );
      process.exit(1);
    }

    await page.close();
  } finally {
    await context.close();
  }
}

// Main
if (values.auto) {
  await autoLogin();
} else {
  await manualLogin();
}
