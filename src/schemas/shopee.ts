import { z } from "zod";

export const ShopeeProductSchema = z.object({
  productId: z.number().int().min(1),
  title: z.string(),
  price: z.number().min(0),
  soldCount: z.number().int().min(0),
  rating: z.number().min(0).max(5),
  shopeeUrl: z.url(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ShopeeProduct = z.infer<typeof ShopeeProductSchema>;
