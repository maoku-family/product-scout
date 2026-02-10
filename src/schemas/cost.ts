import { z } from "zod";

export const CostSchema = z.object({
  productId: z.number().int().min(1),
  cjPrice: z.number().min(0),
  shippingCost: z.number().min(0),
  profitMargin: z.number(),
  cjUrl: z.url(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type Cost = z.infer<typeof CostSchema>;
