#!/usr/bin/env bun
import { resolve } from "node:path";
import { parseArgs } from "util";

import { loadConfig } from "@/config/loader";
import { runPipeline } from "@/core/pipeline";
import type { FullConfig } from "@/core/pipeline";
import { getDb } from "@/db/schema";
import {
  RulesConfigSchema,
  ScoringConfigSchema,
  SearchStrategiesConfigSchema,
  SecretsConfigSchema,
  SignalsConfigSchema,
} from "@/schemas/config";
import { logger } from "@/utils/logger";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    region: { type: "string", default: "th" },
    category: { type: "string" },
    limit: { type: "string" },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
    "dry-run": { type: "boolean", default: false },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
    "skip-scrape": { type: "boolean", default: false },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
    "shop-detail-limit": { type: "string" },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
    "strategy-threshold": { type: "string" },
  },
  strict: true,
});

const region = values.region;
const category = values.category;
const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
const dryRun = values["dry-run"];
const skipScrape = values["skip-scrape"];
const shopDetailLimit = values["shop-detail-limit"]
  ? Number.parseInt(values["shop-detail-limit"], 10)
  : undefined;
const strategyThreshold = values["strategy-threshold"]
  ? Number.parseInt(values["strategy-threshold"], 10)
  : undefined;

logger.info("Starting product scout", {
  region,
  category,
  limit,
  dryRun,
  skipScrape,
});

const configDir = resolve(import.meta.dirname, "../config");

const rules = loadConfig(resolve(configDir, "rules.yaml"), RulesConfigSchema);
const scoring = loadConfig(
  resolve(configDir, "scoring.yaml"),
  ScoringConfigSchema,
);
const signals = loadConfig(
  resolve(configDir, "signals.yaml"),
  SignalsConfigSchema,
);
const searchStrategies = loadConfig(
  resolve(configDir, "search-strategies.yaml"),
  SearchStrategiesConfigSchema,
);
const secrets = loadConfig(
  resolve(configDir, "secrets.yaml"),
  SecretsConfigSchema,
);

const config: FullConfig = { rules, scoring, signals, searchStrategies };

const db = getDb();

try {
  const result = await runPipeline(
    db,
    {
      region,
      category,
      limit,
      dryRun,
      skipScrape,
      shopDetailLimit,
      strategyThreshold,
    },
    secrets,
    config,
  );

  console.log("\n=== Pipeline Results ===\n");

  console.log("Phase A — Data Collection");
  console.log(`  Collected:     ${String(result.phaseA.collected)}`);
  console.log(`  Deduplicated:  ${String(result.phaseA.deduplicated)}`);

  console.log("Phase B — Pre-filter & Queue");
  console.log(`  Pre-filtered:  ${String(result.phaseB.preFiltered)}`);
  console.log(`  Queued:        ${String(result.phaseB.queued)}`);

  console.log("Phase C — Deep Mining");
  console.log(`  Detailed:      ${String(result.phaseC.detailed)}`);
  console.log(`  Enriched:      ${String(result.phaseC.enriched)}`);

  console.log("Phase D — Label & Score");
  console.log(`  Post-filtered: ${String(result.phaseD.postFiltered)}`);
  console.log(`  Labeled:       ${String(result.phaseD.labeled)}`);
  console.log(`  Scored:        ${String(result.phaseD.scored)}`);

  console.log("Phase E — Output");
  console.log(`  Synced:        ${String(result.phaseE.synced)}`);

  console.log("");
} catch (error) {
  logger.error("Pipeline failed", error);
  process.exit(1);
}
