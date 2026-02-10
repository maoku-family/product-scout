/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

/**
 * Shim to make bun:sqlite code work under Node/vitest via better-sqlite3.
 * bun:sqlite's Database.run() maps to better-sqlite3's Database.exec().
 */
const BetterSqlite3 = require("better-sqlite3");

// eslint-disable-next-line @typescript-eslint/no-explicit-any, func-style
const DatabaseShim = function (...args: unknown[]): any {
  const instance = new BetterSqlite3(...args);
  // bun:sqlite uses `run()` for executing SQL; better-sqlite3 uses `exec()`
  instance.run = instance.exec.bind(instance);
  return instance;
};

export { DatabaseShim as Database };
