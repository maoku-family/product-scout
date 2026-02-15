#!/usr/bin/env bun
import { parseArgs } from "util";

import { getSignalsForCandidate, getTagsForCandidate } from "@/core/sync";
import { getTopCandidates } from "@/db/queries";
import { getDb } from "@/db/schema";
import { logger } from "@/utils/logger";

const VALID_STRATEGIES: readonly string[] = [
  "default_score",
  "trending_score",
  "blue_ocean_score",
  "high_margin_score",
  "shop_copy_score",
];

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    limit: { type: "string", default: "10" },
    strategy: { type: "string", default: "default_score" },
  },
  strict: true,
});

const limit = Number.parseInt(values.limit, 10);
const strategy = values.strategy;

// Validate strategy flag
if (!VALID_STRATEGIES.includes(strategy)) {
  console.error(
    `Invalid strategy: "${strategy}". Valid options: ${VALID_STRATEGIES.join(", ")}`,
  );
  process.exit(1);
}

const db = getDb();

try {
  const candidates = getTopCandidates(db, limit, strategy);

  if (candidates.length === 0) {
    console.log("No candidates found. Run 'bun run scripts/scout.ts' first.");
    process.exit(0);
  }

  const strategyLabel = strategy
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  console.log(
    `\n=== Top ${String(limit)} Candidates (sorted by ${strategyLabel}) ===\n`,
  );
  console.log(
    "Rank | Default | Trending | Blue Ocean | High Margin | Shop Copy | Country | Product",
  );
  console.log(
    "-----|---------|----------|------------|-------------|-----------|---------|--------",
  );

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) {
      continue;
    }
    const rank = String(i + 1).padStart(4);
    const def = formatScore(c.default_score);
    const trend = formatScore(c.trending_score);
    const blue = formatScore(c.blue_ocean_score);
    const high = formatScore(c.high_margin_score);
    const shop = formatScore(c.shop_copy_score);
    const country = c.country.padEnd(7);

    console.log(
      `${rank} | ${def} | ${trend} | ${blue} | ${high} | ${shop} | ${country} | ${c.product_name}`,
    );

    // Show labels and signals
    const tags = getTagsForCandidate(db, c.candidate_id);
    const signals = getSignalsForCandidate(db, c.candidate_id);

    if (tags.length > 0) {
      console.log(`       Labels:  ${tags.join(", ")}`);
    }
    if (signals.length > 0) {
      console.log(`       Signals: ${signals.join(", ")}`);
    }
  }

  console.log("");
} catch (error) {
  logger.error("Top candidates query failed", error);
  process.exit(1);
}

function formatScore(score: number | null): string {
  if (score === null) {
    return "   -  ";
  }
  return String(Math.round(score)).padStart(6);
}
