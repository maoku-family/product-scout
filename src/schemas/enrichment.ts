import { z } from "zod";

// ── ProductEnrichmentSchema (product_enrichments table) ─────────────

export const ProductEnrichmentSchema = z.object({
  productId: z.number().int().min(1),
  source: z.enum(["shopee", "cj", "amazon", "lazada"]),
  price: z.number().min(0).nullable(),
  soldCount: z.number().int().min(0).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  profitMargin: z.number().nullable(),
  extra: z.string().nullable(),
  scrapedAt: z.string(),
});

export type ProductEnrichment = z.infer<typeof ProductEnrichmentSchema>;
