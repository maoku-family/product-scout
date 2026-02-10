/**
 * Score based on sales volume, normalized against max seller.
 * Returns 0-100.
 */
export function scoreSales(unitsSold: number, maxUnits: number): number {
  if (maxUnits === 0) {
    return 0;
  }
  return Math.min(100, Math.round((unitsSold / maxUnits) * 100));
}

/**
 * Score based on order growth rate.
 * Positive growth = proportional score, negative = 0 (clamped).
 * Growth rate of 1.0 (100%) = score 100. Capped at 100.
 */
export function scoreGrowth(rate: number): number {
  if (rate <= 0) {
    return 0;
  }
  return Math.min(100, Math.round(rate * 100));
}

/**
 * Score based on Shopee validation (sold count).
 * No data = 0. Has sales = proportional, using log scale for fairness.
 * 1000+ sales = 100.
 */
export function scoreShopee(soldCount: number | undefined): number {
  if (soldCount === undefined || soldCount <= 0) {
    return 0;
  }
  // Log scale: log10(soldCount) / log10(1000) * 100, capped at 100
  // 1 sale → ~0, 10 → ~33, 100 → ~67, 1000+ → 100
  return Math.min(
    100,
    Math.round((Math.log10(soldCount) / Math.log10(1000)) * 100),
  );
}

/**
 * Score based on profit margin.
 * margin * 100, clamped to 0-100.
 */
export function scoreMargin(margin: number): number {
  if (margin <= 0) {
    return 0;
  }
  return Math.min(100, Math.round(margin * 100));
}

/**
 * Score based on Google Trends status.
 * rising=100, stable=50, declining=0.
 */
export function scoreTrend(status: "rising" | "stable" | "declining"): number {
  const scores: Record<string, number> = {
    rising: 100,
    stable: 50,
    declining: 0,
  };
  return scores[status] ?? 0;
}
