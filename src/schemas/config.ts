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

export type Region = z.infer<typeof RegionSchema>;
export type RegionsConfig = z.infer<typeof RegionsConfigSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>;
