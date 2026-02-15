import { z } from "zod";

// ── TagSchema (tags table) ──────────────────────────────────────────

export const TagSchema = z.object({
  tagType: z.enum(["discovery", "strategy", "signal", "manual"]),
  tagName: z.string(),
});

export type Tag = z.infer<typeof TagSchema>;

// ── CandidateTagSchema (candidate_tags table) ───────────────────────

export const CandidateTagSchema = z.object({
  candidateId: z.number().int().min(1),
  tagId: z.number().int().min(1),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type CandidateTag = z.infer<typeof CandidateTagSchema>;
