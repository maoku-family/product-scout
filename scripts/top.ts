#!/usr/bin/env bun
import { parseArgs } from "util";

import { z } from "zod";

import { getTopCandidates } from "@/db/queries";
import { getDb } from "@/db/schema";
import { logger } from "@/utils/logger";

/* eslint-disable @typescript-eslint/naming-convention -- DB column names use snake_case */
const CandidateRowSchema = z.object({
  product_name: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  score: z.number(),
  trend_status: z.string(),
  synced_to_notion: z.number(),
});
/* eslint-enable @typescript-eslint/naming-convention */

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    limit: { type: "string", default: "10" },
  },
  strict: true,
});

const limit = Number.parseInt(values.limit, 10);
const db = getDb();

try {
  const rawCandidates: unknown[] = getTopCandidates(db, limit);
  const candidates = rawCandidates.map((row) => CandidateRowSchema.parse(row));

  if (candidates.length === 0) {
    console.log("No candidates found. Run 'bun run scripts/scout.ts' first.");
    process.exit(0);
  }

  console.log(`\n=== Top ${String(limit)} Candidates ===\n`);
  console.log("Rank | Score | Trend     | Country | Category | Product");
  console.log("-----|-------|-----------|---------|----------|--------");

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) {
      continue;
    }
    const rank = String(i + 1).padStart(4);
    const score = String(c.score).padStart(5);
    const trend = c.trend_status.padEnd(9);
    const country = c.country.padEnd(7);
    const category = (c.category ?? "-").padEnd(8);
    console.log(
      `${rank} | ${score} | ${trend} | ${country} | ${category} | ${c.product_name}`,
    );
  }

  console.log("");
} catch (error) {
  logger.error("Top candidates query failed", error);
  process.exit(1);
}
