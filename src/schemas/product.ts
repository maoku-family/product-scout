import { z } from "zod";

export const FastmossProductSchema = z.object({
  productName: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  unitsSold: z.number().int().min(0),
  gmv: z.number().min(0),
  orderGrowthRate: z.number(),
  commissionRate: z.number().min(0).max(1),
  scrapedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FastmossProduct = z.infer<typeof FastmossProductSchema>;
