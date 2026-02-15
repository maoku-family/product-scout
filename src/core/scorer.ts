import type { ScoringConfig } from "@/schemas/config";

// ── Types ───────────────────────────────────────────────────────────

export type ScoringInput = {
  // From product_snapshots
  salesVolume?: number;
  salesGrowthRate?: number;
  creatorCount?: number;
  videoViews?: number;
  creatorConversionRate?: number;

  // From product_details
  hotIndex?: number;
  vocPositiveRate?: number;
  daysSinceListed?: number;
  competitionScore?: number;

  // From product_enrichments
  shopeeValidation?: number; // soldCount from Shopee
  profitMargin?: number;
  commissionRate?: number;
  gpm?: number;
  pricePoint?: number;

  // From shop data
  shopRating?: number;
  productSalesInShop?: number;
  shopSalesGrowth?: number;

  // From external
  googleTrends?: "rising" | "stable" | "declining";

  // Context for relative scoring
  maxSalesVolume?: number;
};

export type CandidateScoreDetail = {
  profile: string;
  dimension: string;
  rawValue: number | null;
  normalizedValue: number | null;
  weight: number;
  weightedScore: number;
};

export type MultiScoreResult = {
  scores: Record<string, number | null>; // profile name → score (null if insufficient data)
  details: CandidateScoreDetail[]; // per-dimension breakdown
};

// ── Normalization context ───────────────────────────────────────────

export type NormContext = {
  maxSalesVolume?: number;
};

// ── Utility ─────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ── Google Trends string → numeric mapping ──────────────────────────

const TREND_MAP: Record<string, number> = {
  rising: 2,
  stable: 1,
  declining: 0,
};

// ── Normalizer registry ─────────────────────────────────────────────

const normalizers: Record<string, (raw: number, ctx: NormContext) => number> = {
  salesVolume: (raw, ctx) => {
    if (!ctx.maxSalesVolume || ctx.maxSalesVolume === 0) {
      return 0;
    }
    return clamp((raw / ctx.maxSalesVolume) * 100);
  },

  salesGrowthRate: (raw) => clamp(raw * 100),

  // Log scale: log10(soldCount) / log10(1000) * 100, capped at 100
  // Same as old scoreShopee
  shopeeValidation: (raw) => {
    if (raw <= 0) {
      return 0;
    }
    return clamp((Math.log10(raw) / Math.log10(1000)) * 100);
  },

  profitMargin: (raw) => clamp(raw * 100),

  // Inverse — fewer creators = higher score
  // Use log scale: 100 - log10(count+1) / log10(1001) * 100
  creatorCount: (raw) => {
    if (raw <= 0) {
      return 100;
    }
    return clamp(100 - (Math.log10(raw + 1) / Math.log10(1001)) * 100);
  },

  // Already 0-100
  hotIndex: (raw) => clamp(raw),

  // vocPositiveRate * 100
  voc: (raw) => clamp(raw * 100),

  // rising=100, stable=50, declining=0
  // Input is numeric: 2=rising, 1=stable, 0=declining
  googleTrends: (raw) => {
    if (raw >= 2) {
      return 100;
    }
    if (raw >= 1) {
      return 50;
    }
    return 0;
  },

  // Days since listed — newer = higher score
  // 0 days = 100, 120+ days = 0 (linear decay)
  recency: (raw) => {
    if (raw <= 0) {
      return 100;
    }
    return clamp(100 - (raw / 120) * 100);
  },

  // Log scale: log10(views) / log10(1_000_000) * 100
  videoViews: (raw) => {
    if (raw <= 0) {
      return 0;
    }
    return clamp((Math.log10(raw) / Math.log10(1_000_000)) * 100);
  },

  // Inverse: 100 - raw
  competitionScore: (raw) => clamp(100 - raw),

  // rate * 100
  creatorConversionRate: (raw) => clamp(raw * 100),

  // Already 0-100
  gpm: (raw) => clamp(raw),

  // rate * 100
  commissionRate: (raw) => clamp(raw * 100),

  // Sweet spot range: $10-$30 USD
  // Peak at $20, decays outside range
  pricePoint: (raw) => {
    if (raw <= 0) {
      return 0;
    }
    const sweetSpotCenter = 20;
    const sweetSpotWidth = 15; // Half-width of the sweet spot
    const distance = Math.abs(raw - sweetSpotCenter);
    return clamp(100 - (distance / sweetSpotWidth) * 50);
  },

  // Rating is 0-5, multiply by 20
  shopRating: (raw) => clamp(raw * 20),

  // Log scale: log10(sales) / log10(10000) * 100
  productSalesInShop: (raw) => {
    if (raw <= 0) {
      return 0;
    }
    return clamp((Math.log10(raw) / Math.log10(10_000)) * 100);
  },

  // rate * 100
  shopSalesGrowth: (raw) => clamp(raw * 100),
};

// ── Public: normalize a single value ────────────────────────────────

/**
 * Normalize a raw value for a given dimension to 0-100.
 * Returns 0 for unknown dimensions.
 */
export function normalizeValue(
  dimension: string,
  rawValue: number,
  context: NormContext,
): number {
  const fn = normalizers[dimension];
  if (!fn) {
    return 0;
  }
  return fn(rawValue, context);
}

// ── Resolve raw value from ScoringInput ─────────────────────────────

/**
 * Extract the raw numeric value for a dimension from the scoring input.
 * Handles the special case of googleTrends (string → number mapping).
 * Returns undefined if the data is not available.
 */
function getRawValue(
  dimension: string,
  input: ScoringInput,
): number | undefined {
  switch (dimension) {
    case "salesVolume":
      return input.salesVolume;
    case "salesGrowthRate":
      return input.salesGrowthRate;
    case "shopeeValidation":
      return input.shopeeValidation;
    case "profitMargin":
      return input.profitMargin;
    case "creatorCount":
      return input.creatorCount;
    case "hotIndex":
      return input.hotIndex;
    case "voc":
      return input.vocPositiveRate;
    case "googleTrends":
      return input.googleTrends !== undefined
        ? (TREND_MAP[input.googleTrends] ?? 0)
        : undefined;
    case "recency":
      return input.daysSinceListed;
    case "videoViews":
      return input.videoViews;
    case "competitionScore":
      return input.competitionScore;
    case "creatorConversionRate":
      return input.creatorConversionRate;
    case "gpm":
      return input.gpm;
    case "commissionRate":
      return input.commissionRate;
    case "pricePoint":
      return input.pricePoint;
    case "shopRating":
      return input.shopRating;
    case "productSalesInShop":
      return input.productSalesInShop;
    case "shopSalesGrowth":
      return input.shopSalesGrowth;
    default:
      return undefined;
  }
}

// ── Public: compute multi-profile scores ────────────────────────────

/**
 * Compute scores for all profiles in the scoring config.
 * Returns scores per profile and per-dimension details.
 *
 * - Missing data dimensions are scored as 0.
 * - If ALL dimensions in a profile have missing data, the profile score is null.
 * - Weights are percentages that sum to 100.
 */
export function computeMultiScore(
  data: ScoringInput,
  config: ScoringConfig,
): MultiScoreResult {
  const scores: Record<string, number | null> = {};
  const details: CandidateScoreDetail[] = [];

  const context: NormContext = {
    maxSalesVolume: data.maxSalesVolume,
  };

  for (const [profileName, profile] of Object.entries(config.scoringProfiles)) {
    let totalWeightedScore = 0;
    let hasAnyData = false;

    for (const [dimension, weight] of Object.entries(profile.dimensions)) {
      const rawValue = getRawValue(dimension, data);
      const hasData = rawValue !== undefined;

      if (hasData) {
        hasAnyData = true;
      }

      const normalizedValue = hasData
        ? normalizeValue(dimension, rawValue, context)
        : 0;
      const weightedScore = (normalizedValue * weight) / 100;
      totalWeightedScore += weightedScore;

      details.push({
        profile: profileName,
        dimension,
        rawValue: rawValue ?? null,
        normalizedValue: hasData ? normalizedValue : null,
        weight,
        weightedScore,
      });
    }

    scores[profileName] = hasAnyData
      ? Number(totalWeightedScore.toFixed(1))
      : null;
  }

  return { scores, details };
}

// ── Backward compatibility ──────────────────────────────────────────

/**
 * Old ScoreInput type — kept for backward compatibility.
 * Used by pipeline.ts until Task 14 rewrites it.
 */
export type ScoreInput = {
  unitsSold: number;
  maxUnits: number;
  growthRate: number;
  shopeeSoldCount: number | undefined;
  profitMargin: number;
  trendStatus: "rising" | "stable" | "declining";
};

/**
 * Old individual scoring functions — kept for backward compatibility.
 */
export function scoreSales(unitsSold: number, maxUnits: number): number {
  if (maxUnits === 0) {
    return 0;
  }
  return Math.min(100, Math.round((unitsSold / maxUnits) * 100));
}

export function scoreGrowth(rate: number): number {
  if (rate <= 0) {
    return 0;
  }
  return Math.min(100, Math.round(rate * 100));
}

export function scoreShopee(soldCount: number | undefined): number {
  if (soldCount === undefined || soldCount <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((Math.log10(soldCount) / Math.log10(1000)) * 100),
  );
}

export function scoreMargin(margin: number): number {
  if (margin <= 0) {
    return 0;
  }
  return Math.min(100, Math.round(margin * 100));
}

export function scoreTrend(status: "rising" | "stable" | "declining"): number {
  const trendScores: Record<string, number> = {
    rising: 100,
    stable: 50,
    declining: 0,
  };
  return trendScores[status] ?? 0;
}

const WEIGHTS = {
  sales: 0.3,
  growth: 0.2,
  shopee: 0.25,
  margin: 0.15,
  trend: 0.1,
} as const;

/**
 * Compute weighted composite score using the old fixed 5-dimension approach.
 * Returns 0-100, rounded to 1 decimal place.
 *
 * @deprecated Use computeMultiScore instead.
 */
export function computeScore(input: ScoreInput): number {
  const salesScore = scoreSales(input.unitsSold, input.maxUnits);
  const growthScore = scoreGrowth(input.growthRate);
  const shopeeScore = scoreShopee(input.shopeeSoldCount);
  const marginScore = scoreMargin(input.profitMargin);
  const trendScore = scoreTrend(input.trendStatus);

  const total =
    salesScore * WEIGHTS.sales +
    growthScore * WEIGHTS.growth +
    shopeeScore * WEIGHTS.shopee +
    marginScore * WEIGHTS.margin +
    trendScore * WEIGHTS.trend;

  return Number(total.toFixed(1));
}
