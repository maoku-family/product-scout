#!/usr/bin/env bun
import { resolve } from "node:path";

import { z } from "zod";

import { loadConfig } from "@/config/loader";
import { getDb } from "@/db/schema";
import { RulesConfigSchema } from "@/schemas/config";
import { logger } from "@/utils/logger";

const CountRowSchema = z.object({
  count: z.number(),
});

const QueueStatusSchema = z.object({
  status: z.string(),
  count: z.number(),
});

const db = getDb();

try {
  console.log("\n=== Product Scout Status ===\n");

  // ── Table counts (all 11 tables) ──────────────────────────────────
  const tables = [
    "products",
    "product_snapshots",
    "product_details",
    "product_enrichments",
    "shops",
    "shop_snapshots",
    "candidates",
    "candidate_score_details",
    "tags",
    "candidate_tags",
    "scrape_queue",
  ] as const;

  console.log("Table Counts:");
  for (const table of tables) {
    const raw: unknown = db
      .prepare(`SELECT COUNT(*) as count FROM ${table}`)
      .get();
    const row = CountRowSchema.parse(raw);
    console.log(`  ${table.padEnd(26)} ${String(row.count)}`);
  }

  // ── Scrape queue breakdown ────────────────────────────────────────
  console.log("\nScrape Queue Breakdown:");
  const queueRaw: unknown[] = db
    .prepare(
      "SELECT status, COUNT(*) as count FROM scrape_queue GROUP BY status ORDER BY status",
    )
    .all();
  const queueRows = queueRaw.map((row) => QueueStatusSchema.parse(row));

  if (queueRows.length === 0) {
    console.log("  (empty)");
  } else {
    for (const row of queueRows) {
      console.log(`  ${row.status.padEnd(10)} ${String(row.count)}`);
    }
  }

  // ── Quota usage for today ─────────────────────────────────────────
  console.log("\nToday's Quota Usage:");
  const todayDoneRaw: unknown = db
    .prepare(
      `SELECT COUNT(*) as count FROM scrape_queue
       WHERE status = 'done'
         AND last_scraped_at >= datetime('now', 'start of day')`,
    )
    .get();
  const todayDone = CountRowSchema.parse(todayDoneRaw).count;

  // Load daily budget from config
  let dailyBudget = 300; // default
  try {
    const configDir = resolve(import.meta.dirname, "../config");
    const rules = loadConfig(
      resolve(configDir, "rules.yaml"),
      RulesConfigSchema,
    );
    dailyBudget = rules.scraping?.dailyDetailBudget ?? 300;
  } catch {
    // Fall back to default if config can't be loaded
  }

  console.log(
    `  Detail pages scraped today: ${String(todayDone)} / ${String(dailyBudget)}`,
  );

  // ── Candidate summary ─────────────────────────────────────────────
  console.log("\nCandidate Summary:");
  const totalRaw: unknown = db
    .prepare("SELECT COUNT(*) as count FROM candidates")
    .get();
  const total = CountRowSchema.parse(totalRaw).count;

  const unsyncedRaw: unknown = db
    .prepare(
      "SELECT COUNT(*) as count FROM candidates WHERE synced_to_notion = 0",
    )
    .get();
  const unsynced = CountRowSchema.parse(unsyncedRaw).count;

  console.log(`  Total candidates:     ${String(total)}`);
  console.log(`  Unsynced to Notion:   ${String(unsynced)}`);

  console.log("");
} catch (error) {
  logger.error("Status check failed", error);
  process.exit(1);
}
