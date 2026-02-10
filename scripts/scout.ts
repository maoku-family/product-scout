#!/usr/bin/env bun
import { resolve } from "node:path";
import { parseArgs } from "util";

import { loadConfig } from "@/config/loader";
import { runPipeline } from "@/core/pipeline";
import { getDb } from "@/db/schema";
import {
  getFiltersForRegion,
  RulesConfigSchema,
  SecretsConfigSchema,
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
  },
  strict: true,
});

const region = values.region;
const category = values.category;
const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
const dryRun = values["dry-run"];

logger.info("Starting product scout", { region, category, limit, dryRun });

const configDir = resolve(import.meta.dirname, "../config");
const rules = loadConfig(resolve(configDir, "rules.yaml"), RulesConfigSchema);
const secrets = loadConfig(
  resolve(configDir, "secrets.yaml"),
  SecretsConfigSchema,
);
const filters = getFiltersForRegion(rules, region);

const db = getDb();

try {
  const result = await runPipeline(
    db,
    { region, category, limit, dryRun },
    secrets,
    filters,
  );

  console.log("\n=== Pipeline Results ===");
  console.log(`Scraped:      ${String(result.scraped)}`);
  console.log(`Pre-filtered: ${String(result.preFiltered)}`);
  console.log(`Enriched:     ${String(result.enriched)}`);
  console.log(`Post-filtered:${String(result.postFiltered)}`);
  console.log(`Scored:       ${String(result.scored)}`);
  console.log(`Synced:       ${String(result.synced)}`);
} catch (error) {
  logger.error("Pipeline failed", error);
  process.exit(1);
}
