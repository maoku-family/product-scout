import { z } from "zod";

export const CandidateSchema = z.object({
  productId: z.number().int().min(1),
  score: z.number().min(0).max(100),
  trendStatus: z.enum(["rising", "stable", "declining"]),
  syncedToNotion: z.boolean().default(false),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type Candidate = z.infer<typeof CandidateSchema>;
