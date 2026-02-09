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

export const RulesConfigSchema = z
  .object({
    defaults: FilterSchema,
    regions: z.record(z.string(), RegionFilterOverrideSchema).optional(),
  })
  .refine((d) => d.defaults.price.min <= d.defaults.price.max, {
    message: "defaults price.min must be <= price.max",
  });

export const SecretsConfigSchema = z.object({
  cjApiKey: z.string(),
  notionKey: z.string(),
  notionDbId: z.string(),
});

export type Region = z.infer<typeof RegionSchema>;
export type RegionsConfig = z.infer<typeof RegionsConfigSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type RegionFilterOverride = z.infer<typeof RegionFilterOverrideSchema>;
export type RulesConfig = z.infer<typeof RulesConfigSchema>;
export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

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
