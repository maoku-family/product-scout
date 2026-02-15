import { describe, expect, it } from "vitest";

import { CandidateTagSchema, TagSchema } from "@/schemas/tag";

// ── TagSchema ───────────────────────────────────────────────────────

const validTag = {
  tagType: "discovery" as const,
  tagName: "trending_beauty",
};

describe("TagSchema", () => {
  it("parses valid tag data", () => {
    const result = TagSchema.safeParse(validTag);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagType).toBe("discovery");
      expect(result.data.tagName).toBe("trending_beauty");
    }
  });

  it("rejects when tagType is missing", () => {
    const { tagType: tagTypeOmitted, ...without } = validTag;
    const result = TagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when tagName is missing", () => {
    const { tagName: tagNameOmitted, ...without } = validTag;
    const result = TagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects invalid tagType", () => {
    const result = TagSchema.safeParse({
      ...validTag,
      tagType: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid tagType values", () => {
    const types = ["discovery", "strategy", "signal", "manual"] as const;

    for (const tagType of types) {
      const result = TagSchema.safeParse({
        ...validTag,
        tagType,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tagType).toBe(tagType);
      }
    }
  });
});

// ── CandidateTagSchema ──────────────────────────────────────────────

const validCandidateTag = {
  candidateId: 1,
  tagId: 5,
  createdAt: "2024-01-15T10:30:00",
  createdBy: "system",
};

describe("CandidateTagSchema", () => {
  it("parses valid candidate tag data", () => {
    const result = CandidateTagSchema.safeParse(validCandidateTag);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.candidateId).toBe(1);
      expect(result.data.tagId).toBe(5);
      expect(result.data.createdBy).toBe("system");
    }
  });

  it("rejects when candidateId is missing", () => {
    const { candidateId: candidateIdOmitted, ...without } = validCandidateTag;
    const result = CandidateTagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when tagId is missing", () => {
    const { tagId: tagIdOmitted, ...without } = validCandidateTag;
    const result = CandidateTagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when createdAt is missing", () => {
    const { createdAt: createdAtOmitted, ...without } = validCandidateTag;
    const result = CandidateTagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when createdBy is missing", () => {
    const { createdBy: createdByOmitted, ...without } = validCandidateTag;
    const result = CandidateTagSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects non-integer candidateId", () => {
    const result = CandidateTagSchema.safeParse({
      ...validCandidateTag,
      candidateId: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer tagId", () => {
    const result = CandidateTagSchema.safeParse({
      ...validCandidateTag,
      tagId: 2.5,
    });

    expect(result.success).toBe(false);
  });

  it("accepts different createdBy values", () => {
    const result = CandidateTagSchema.safeParse({
      ...validCandidateTag,
      createdBy: "manual",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdBy).toBe("manual");
    }
  });
});
