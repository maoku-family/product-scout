import { z } from "zod";

export const RegionSchema = z.object({
  name: z.string(),
  currency: z.string(),
  language: z.string(),
  enabled: z.boolean().default(true),
});

export const RegionsConfigSchema = z.object({
  regions: z.record(z.string(), RegionSchema),
});

export const CategorySchema = z.object({
  name: z.string(),
  searchKeywords: z.array(z.string()).min(1),
});

export const CategoriesConfigSchema = z.object({
  categories: z.record(z.string(), CategorySchema),
});

export const FilterSchema = z.object({
  price: z.object({ min: z.number(), max: z.number() }),
  profitMargin: z.object({ min: z.number() }),
  minUnitsSold: z.number().default(100),
  minGrowthRate: z.number().default(0),
  excludedCategories: z.array(z.string()),
});

export const RegionFilterOverrideSchema = FilterSchema.partial();

// Scraping config (added to rules)
export const ScrapingFreshnessSchema = z.object({
  detailRefreshDays: z.number().positive().default(7),
  vocRefreshDays: z.number().positive().default(14),
  shopRefreshDays: z.number().positive().default(7),
});

export const ScrapingConfigSchema = z.object({
  dailyDetailBudget: z.number().positive().default(300),
  dailySearchBudget: z.number().positive().default(300),
  freshness: ScrapingFreshnessSchema,
});

export const RulesConfigSchema = z
  .object({
    defaults: FilterSchema,
    regions: z.record(z.string(), RegionFilterOverrideSchema).optional(),
    scraping: ScrapingConfigSchema.optional(),
  })
  .refine((d) => d.defaults.price.min <= d.defaults.price.max, {
    message: "defaults price.min must be <= price.max",
  });

export const SecretsConfigSchema = z.object({
  cjApiKey: z.string(),
  notionKey: z.string(),
  notionDbId: z.string(),
  fastmossEmail: z.string().optional(),
  fastmossPassword: z.string().optional(),
});

export type Region = z.infer<typeof RegionSchema>;
export type RegionsConfig = z.infer<typeof RegionsConfigSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type RegionFilterOverride = z.infer<typeof RegionFilterOverrideSchema>;
export type ScrapingFreshness = z.infer<typeof ScrapingFreshnessSchema>;
export type ScrapingConfig = z.infer<typeof ScrapingConfigSchema>;
export type RulesConfig = z.infer<typeof RulesConfigSchema>;
export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

// Scoring config
export const ScoringDimensionSchema = z.record(z.string(), z.number());

export const ScoringProfileSchema = z
  .object({
    name: z.string(),
    dimensions: ScoringDimensionSchema,
  })
  .refine(
    (p) => {
      const sum = Object.values(p.dimensions).reduce((a, b) => a + b, 0);
      return sum === 100;
    },
    { message: "Dimension weights must sum to 100" },
  );

export const ScoringConfigSchema = z.object({
  scoringProfiles: z.record(z.string(), ScoringProfileSchema),
});

// Signal config
export const SignalRuleSchema = z.object({
  condition: z.string().min(1),
});

export const SignalsConfigSchema = z.object({
  signalRules: z.record(z.string(), SignalRuleSchema),
});

// Search strategy config
export const SearchStrategyFilterSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

export const SearchStrategySchema = z.object({
  name: z.string(),
  region: z.string(),
  filters: SearchStrategyFilterSchema,
});

export const SearchStrategiesConfigSchema = z.object({
  strategies: z.record(z.string(), SearchStrategySchema),
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type SignalsConfig = z.infer<typeof SignalsConfigSchema>;
export type SearchStrategy = z.infer<typeof SearchStrategySchema>;
export type SearchStrategiesConfig = z.infer<
  typeof SearchStrategiesConfigSchema
>;

function deepMerge(target: Filter, override: RegionFilterOverride): Filter {
  const result: Filter = {
    price: { ...target.price },
    profitMargin: { ...target.profitMargin },
    minUnitsSold: target.minUnitsSold,
    minGrowthRate: target.minGrowthRate,
    excludedCategories: [...target.excludedCategories],
  };

  if (override.price !== undefined) {
    result.price = { ...result.price, ...override.price };
  }
  if (override.profitMargin !== undefined) {
    result.profitMargin = { ...result.profitMargin, ...override.profitMargin };
  }
  if (override.minUnitsSold !== undefined) {
    result.minUnitsSold = override.minUnitsSold;
  }
  if (override.minGrowthRate !== undefined) {
    result.minGrowthRate = override.minGrowthRate;
  }
  if (override.excludedCategories !== undefined) {
    result.excludedCategories = [...override.excludedCategories];
  }

  return result;
}

export function getFiltersForRegion(
  rules: RulesConfig,
  region: string,
): Filter {
  const regionOverride = rules.regions?.[region] ?? {};
  return deepMerge(rules.defaults, regionOverride);
}
