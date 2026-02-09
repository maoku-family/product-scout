import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: resolve(import.meta.dirname, "./src") },
      {
        find: "bun:sqlite",
        replacement: resolve(import.meta.dirname, "./test/shims/bun-sqlite.ts"),
      },
    ],
  },
  test: {
    globals: false,
  },
});
