import { describe, expect, it } from "vitest";

import {
  CandidateSchema,
  CandidateScoreDetailSchema,
} from "@/schemas/candidate";

// ── CandidateSchema (updated for multi-profile scores) ──────────────

const validCandidate = {
  productId: 1,
  defaultScore: 85.5,
  trendingScore: 72.0,
  blueOceanScore: 60.0,
  highMarginScore: 90.0,
  shopCopyScore: 45.0,
  syncedToNotion: false,
  createdAt: "2024-06-15T10:30:00",
};

describe("CandidateSchema", () => {
  it("parses valid candidate data", () => {
    const result = CandidateSchema.safeParse(validCandidate);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe(1);
      expect(result.data.defaultScore).toBe(85.5);
      expect(result.data.syncedToNotion).toBe(false);
    }
  });

  it("rejects when productId is missing", () => {
    const { productId: productIdOmitted, ...without } = validCandidate;
    const result = CandidateSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("allows nullable score fields", () => {
    const result = CandidateSchema.safeParse({
      productId: 1,
      defaultScore: null,
      trendingScore: null,
      blueOceanScore: null,
      highMarginScore: null,
      shopCopyScore: null,
      syncedToNotion: false,
      createdAt: "2024-06-15T10:30:00",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultScore).toBeNull();
      expect(result.data.trendingScore).toBeNull();
    }
  });

  it("rejects negative score", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      defaultScore: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects score above 100", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      defaultScore: 101,
    });

    expect(result.success).toBe(false);
  });

  it("defaults syncedToNotion to false when omitted", () => {
    const { syncedToNotion: syncedToNotionOmitted, ...without } =
      validCandidate;
    const result = CandidateSchema.safeParse(without);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncedToNotion).toBe(false);
    }
  });

  it("rejects non-integer productId", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      productId: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("requires createdAt as a string", () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      createdAt: "2024-06-15T10:30:00",
    });

    expect(result.success).toBe(true);
  });
});

// ── CandidateScoreDetailSchema ──────────────────────────────────────

const validScoreDetail = {
  candidateId: 1,
  profile: "default",
  dimension: "sales_velocity",
  rawValue: 1500.0,
  normalizedValue: 0.85,
  weight: 0.3,
  weightedScore: 25.5,
};

describe("CandidateScoreDetailSchema", () => {
  it("parses valid score detail data", () => {
    const result = CandidateScoreDetailSchema.safeParse(validScoreDetail);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.candidateId).toBe(1);
      expect(result.data.profile).toBe("default");
      expect(result.data.dimension).toBe("sales_velocity");
      expect(result.data.weightedScore).toBe(25.5);
    }
  });

  it("rejects when candidateId is missing", () => {
    const { candidateId: candidateIdOmitted, ...without } = validScoreDetail;
    const result = CandidateScoreDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when profile is missing", () => {
    const { profile: profileOmitted, ...without } = validScoreDetail;
    const result = CandidateScoreDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when dimension is missing", () => {
    const { dimension: dimensionOmitted, ...without } = validScoreDetail;
    const result = CandidateScoreDetailSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("allows nullable numeric fields", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      candidateId: 1,
      profile: "default",
      dimension: "sales_velocity",
      rawValue: null,
      normalizedValue: null,
      weight: null,
      weightedScore: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawValue).toBeNull();
      expect(result.data.normalizedValue).toBeNull();
    }
  });

  it("rejects non-integer candidateId", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      candidateId: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("accepts any numeric rawValue", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      rawValue: -500.5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawValue).toBe(-500.5);
    }
  });

  it("accepts normalizedValue in 0-1 range", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      normalizedValue: 0.5,
    });

    expect(result.success).toBe(true);
  });

  it("rejects normalizedValue above 1", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      normalizedValue: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects normalizedValue below 0", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      normalizedValue: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects weight above 1", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      weight: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects weight below 0", () => {
    const result = CandidateScoreDetailSchema.safeParse({
      ...validScoreDetail,
      weight: -0.1,
    });

    expect(result.success).toBe(false);
  });
});
