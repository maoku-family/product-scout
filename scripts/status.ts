#!/usr/bin/env bun
import { z } from "zod";

import { getDb } from "@/db/schema";
import { logger } from "@/utils/logger";

/* eslint-disable @typescript-eslint/naming-convention -- DB column names use snake_case */
const ScrapeRowSchema = z.object({
  scraped_at: z.string(),
  count: z.number(),
});
/* eslint-enable @typescript-eslint/naming-convention */

const RegionCountSchema = z.object({
  country: z.string(),
  count: z.number(),
});

const CountRowSchema = z.object({
  count: z.number(),
});

const db = getDb();

try {
  // Get latest scrape info
  const latestScrapeRaw: unknown = db
    .prepare(
      "SELECT scraped_at, COUNT(*) as count FROM products GROUP BY scraped_at ORDER BY scraped_at DESC LIMIT 1",
    )
    .get();
  const latestScrape = latestScrapeRaw
    ? ScrapeRowSchema.parse(latestScrapeRaw)
    : undefined;

  // Count by region
  const regionCountsRaw: unknown[] = db
    .prepare(
      "SELECT country, COUNT(*) as count FROM products GROUP BY country ORDER BY count DESC",
    )
    .all();
  const regionCounts = regionCountsRaw.map((row) =>
    RegionCountSchema.parse(row),
  );

  // Unsynced candidates
  const unsyncedRaw: unknown = db
    .prepare(
      "SELECT COUNT(*) as count FROM candidates WHERE synced_to_notion = 0",
    )
    .get();
  const unsyncedCount = unsyncedRaw
    ? CountRowSchema.parse(unsyncedRaw)
    : undefined;

  // Total candidates
  const totalRaw: unknown = db
    .prepare("SELECT COUNT(*) as count FROM candidates")
    .get();
  const totalCandidates = totalRaw ? CountRowSchema.parse(totalRaw) : undefined;

  console.log("\n=== Product Scout Status ===\n");

  if (latestScrape) {
    console.log(
      `Latest scrape: ${latestScrape.scraped_at} (${String(latestScrape.count)} products)`,
    );
  } else {
    console.log("No data collected yet.");
  }

  if (regionCounts.length > 0) {
    console.log("\nProducts by region:");
    for (const row of regionCounts) {
      console.log(`  ${row.country}: ${String(row.count)}`);
    }
  }

  console.log(`\nTotal candidates: ${String(totalCandidates?.count ?? 0)}`);
  console.log(`Unsynced to Notion: ${String(unsyncedCount?.count ?? 0)}`);
} catch (error) {
  logger.error("Status check failed", error);
  process.exit(1);
}
