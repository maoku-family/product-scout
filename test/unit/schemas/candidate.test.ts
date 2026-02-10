import { describe, expect, it } from "vitest";

import { CandidateSchema } from "@/schemas/candidate";

const validCandidate = {
  productId: 12345,
  score: 85.5,
  trendStatus: "rising" as const,
  syncedToNotion: false,
  createdAt: "2024-06-15",
};

describe("CandidateSchema", () => {
  it("parses a valid candidate", () => {
    const result = CandidateSchema.safeParse(validCandidate);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validCandidate);
    }
  });

  it("rejects score greater than 100", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      score: 101,
    });

    expect(result.success).toBe(false);
  });

  it("rejects score less than 0", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      score: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid trendStatus", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      trendStatus: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("defaults syncedToNotion to false when omitted", () => {
    const { syncedToNotion: omittedSynced, ...withoutSynced } = validCandidate;
    const result = CandidateSchema.safeParse(withoutSynced);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncedToNotion).toBe(false);
    }
  });

  it("accepts all three trendStatus values", () => {
    const statuses = ["rising", "stable", "declining"] as const;

    for (const status of statuses) {
      const result = CandidateSchema.safeParse({
        ...validCandidate,
        trendStatus: status,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trendStatus).toBe(status);
      }
    }
  });
});
