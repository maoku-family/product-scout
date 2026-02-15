import { describe, expect, it } from "vitest";

import { ScrapeQueueItemSchema } from "@/schemas/scrape-queue";

const validQueueItem = {
  targetType: "product_detail" as const,
  targetId: "fm_12345",
  priority: 2,
  status: "pending" as const,
  lastScrapedAt: "2024-01-14T10:30:00",
  nextScrapeAfter: "2024-01-15T10:30:00",
  retryCount: 0,
  createdAt: "2024-01-10T08:00:00",
};

describe("ScrapeQueueItemSchema", () => {
  it("parses valid queue item data", () => {
    const result = ScrapeQueueItemSchema.safeParse(validQueueItem);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetType).toBe("product_detail");
      expect(result.data.targetId).toBe("fm_12345");
      expect(result.data.status).toBe("pending");
    }
  });

  it("rejects when targetType is missing", () => {
    const { targetType: targetTypeOmitted, ...without } = validQueueItem;
    const result = ScrapeQueueItemSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects when targetId is missing", () => {
    const { targetId: targetIdOmitted, ...without } = validQueueItem;
    const result = ScrapeQueueItemSchema.safeParse(without);

    expect(result.success).toBe(false);
  });

  it("rejects invalid targetType", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      targetType: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid targetType values", () => {
    const types = ["product_detail", "shop_detail"] as const;

    for (const targetType of types) {
      const result = ScrapeQueueItemSchema.safeParse({
        ...validQueueItem,
        targetType,
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      status: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    const statuses = ["pending", "in_progress", "done", "failed"] as const;

    for (const status of statuses) {
      const result = ScrapeQueueItemSchema.safeParse({
        ...validQueueItem,
        status,
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects negative priority", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      priority: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer priority", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      priority: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative retryCount", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      retryCount: -1,
    });

    expect(result.success).toBe(false);
  });

  it("allows nullable optional fields", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      targetType: "product_detail",
      targetId: "fm_12345",
      priority: 2,
      status: "pending",
      lastScrapedAt: null,
      nextScrapeAfter: null,
      retryCount: 0,
      createdAt: "2024-01-10T08:00:00",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastScrapedAt).toBeNull();
      expect(result.data.nextScrapeAfter).toBeNull();
    }
  });

  it("rejects non-integer retryCount", () => {
    const result = ScrapeQueueItemSchema.safeParse({
      ...validQueueItem,
      retryCount: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
