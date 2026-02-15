import { z } from "zod";

// ── Score field helper ──────────────────────────────────────────────

const scoreField = z.number().min(0).max(100).nullable();

// ── CandidateSchema (candidates table) ──────────────────────────────

export const CandidateSchema = z.object({
  productId: z.number().int().min(1),
  defaultScore: scoreField,
  trendingScore: scoreField,
  blueOceanScore: scoreField,
  highMarginScore: scoreField,
  shopCopyScore: scoreField,
  syncedToNotion: z.boolean().default(false),
  createdAt: z.string(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

// ── CandidateScoreDetailSchema (candidate_score_details table) ──────

export const CandidateScoreDetailSchema = z.object({
  candidateId: z.number().int().min(1),
  profile: z.string(),
  dimension: z.string(),
  rawValue: z.number().nullable(),
  normalizedValue: z.number().min(0).max(1).nullable(),
  weight: z.number().min(0).max(1).nullable(),
  weightedScore: z.number().nullable(),
});

export type CandidateScoreDetail = z.infer<typeof CandidateScoreDetailSchema>;
