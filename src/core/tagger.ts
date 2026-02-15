import type { SignalsConfig } from "@/schemas/config";
import type { Tag } from "@/schemas/tag";

// ── Source-to-tag name mapping ──────────────────────────────────────

const SOURCE_TAG_MAP: Record<string, string> = {
  saleslist: "sales-rank",
};

/**
 * Map scraper source names to discovery tags.
 * Known sources are mapped via SOURCE_TAG_MAP; unknown sources pass through as-is.
 */
export function applyDiscoveryTags(sources: string[]): Tag[] {
  const seen = new Set<string>();
  const tags: Tag[] = [];

  for (const source of sources) {
    const tagName = SOURCE_TAG_MAP[source] ?? source;
    if (seen.has(tagName)) {
      continue;
    }
    seen.add(tagName);
    tags.push({ tagType: "discovery", tagName });
  }

  return tags;
}

// ── Condition parsing ───────────────────────────────────────────────

type Operator = ">" | "<" | ">=" | "<=" | "==";

const OPERATORS: Operator[] = [">=", "<=", "==", ">", "<"];

type ParsedCondition = {
  field: string;
  operator: Operator;
  value: string | number;
};

/**
 * Parse a simple condition string like "salesGrowthRate > 1.0"
 * into { field, operator, value }.
 */
function parseCondition(condition: string): ParsedCondition | null {
  for (const op of OPERATORS) {
    const idx = condition.indexOf(op);
    if (idx === -1) {
      continue;
    }

    const field = condition.slice(0, idx).trim();
    const rawValue = condition.slice(idx + op.length).trim();

    if (!field || !rawValue) {
      continue;
    }

    // Parse value: strip surrounding quotes for strings, parse number otherwise
    let value: string | number;
    if (
      (rawValue.startsWith("'") && rawValue.endsWith("'")) ||
      (rawValue.startsWith('"') && rawValue.endsWith('"'))
    ) {
      value = rawValue.slice(1, -1);
    } else {
      value = Number(rawValue);
      if (Number.isNaN(value)) {
        continue;
      }
    }

    return { field, operator: op, value };
  }

  return null;
}

/**
 * Evaluate a parsed condition against a product data value.
 */
function evaluateCondition(
  actual: string | number,
  operator: Operator,
  expected: string | number,
): boolean {
  switch (operator) {
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
    case "==":
      return actual === expected;
    default:
      return false;
  }
}

/**
 * Evaluate signal rules from signals.yaml against product data.
 * Each rule's condition is parsed and checked. Rules whose required
 * fields are missing in the product data are skipped.
 */
export function applySignalTags(
  productData: Record<string, string | number>,
  signalRules: SignalsConfig,
): Tag[] {
  const tags: Tag[] = [];

  for (const [ruleName, rule] of Object.entries(signalRules.signalRules)) {
    const parsed = parseCondition(rule.condition);
    if (!parsed) {
      continue;
    }

    const actual = productData[parsed.field];
    if (actual === undefined) {
      continue;
    }

    if (evaluateCondition(actual, parsed.operator, parsed.value)) {
      tags.push({ tagType: "signal", tagName: ruleName });
    }
  }

  return tags;
}

// ── Strategy tags ───────────────────────────────────────────────────

/**
 * Convert camelCase to kebab-case.
 * "highMargin" → "high-margin", "blueOcean" → "blue-ocean"
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Check each scoring profile's score against a threshold.
 * Scores meeting or exceeding the threshold produce a strategy tag.
 * Profile names are converted from camelCase to kebab-case.
 */
export function applyStrategyTags(
  scores: Record<string, number>,
  threshold: number,
): Tag[] {
  const tags: Tag[] = [];

  for (const [profile, score] of Object.entries(scores)) {
    if (score >= threshold) {
      tags.push({ tagType: "strategy", tagName: toKebabCase(profile) });
    }
  }

  return tags;
}
