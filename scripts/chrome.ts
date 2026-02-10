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

child.on("error", (error: Error) => {
  console.error("Failed to launch Chrome:", error.message);
  console.error(`\nMake sure Chrome is installed at: ${chromePath}`);
  process.exit(1);
});

child.on("exit", (code: number | null) => {
  console.log(`Chrome exited with code ${String(code)}`);
});
