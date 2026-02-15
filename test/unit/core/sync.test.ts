/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCandidateTag,
  insertProducts,
  upsertCandidate,
  upsertTag,
} from "@/db/queries";
import type { CandidateWithProduct } from "@/db/queries";
import { initDb, resetDb } from "@/db/schema";

// Mock @notionhq/client — return object with pages.create from constructor
const mockCreate = vi.fn().mockResolvedValue({ id: "notion-page-id" });
vi.mock("@notionhq/client", () => ({
  Client: class {
    pages = { create: mockCreate };
  },
}));

// Import after mock setup
const {
  mapToNotionProperties,
  syncToNotion,
  getTagsForCandidate,
  getSignalsForCandidate,
} = await import("@/core/sync");

// ── mapToNotionProperties ───────────────────────────────────────────

describe("mapToNotionProperties", () => {
  const candidate: CandidateWithProduct = {
    candidate_id: 1,
    product_id: 1,
    default_score: 85.5,
    trending_score: 72.3,
    blue_ocean_score: 60.1,
    high_margin_score: 90.0,
    shop_copy_score: 55.5,
    synced_to_notion: 0,
    created_at: "2025-01-15",
    product_name: "LED Ring Light",
    shop_name: "BeautyShop",
    country: "th",
    category: "beauty",
  };

  it("maps all 5 strategy scores as number properties", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties["Default Score"]).toEqual({ number: 85.5 });
    expect(properties["Trending Score"]).toEqual({ number: 72.3 });
    expect(properties["Blue Ocean Score"]).toEqual({ number: 60.1 });
    expect(properties["High Margin Score"]).toEqual({ number: 90.0 });
    expect(properties["Shop Copy Score"]).toEqual({ number: 55.5 });
  });

  it("does not include old Total Score or Trend properties", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties["Total Score"]).toBeUndefined();
    expect(properties.Trend).toBeUndefined();
  });

  it("maps Labels as Multi-select property", () => {
    const tags = ["rising-star", "high-commission", "trending"];
    const properties = mapToNotionProperties(candidate, tags, "");

    expect(properties.Labels).toEqual({
      multi_select: [
        { name: "rising-star" },
        { name: "high-commission" },
        { name: "trending" },
      ],
    });
  });

  it("maps empty labels to empty Multi-select array", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties.Labels).toEqual({ multi_select: [] });
  });

  it("maps Signals as rich text", () => {
    const signalSummary = "Sales growth +135%, high commission 20%";
    const properties = mapToNotionProperties(candidate, [], signalSummary);

    expect(properties.Signals).toEqual({
      rich_text: [
        { text: { content: "Sales growth +135%, high commission 20%" } },
      ],
    });
  });

  it("maps empty signals to empty rich text", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties.Signals).toEqual({
      rich_text: [{ text: { content: "" } }],
    });
  });

  it("still includes Product Name as title", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties["Product Name"]).toEqual({
      title: [{ text: { content: "LED Ring Light" } }],
    });
  });

  it("still includes Category, Source, and Discovery Date", () => {
    const properties = mapToNotionProperties(candidate, [], "");

    expect(properties.Category).toEqual({ select: { name: "beauty" } });
    expect(properties.Source).toEqual({ select: { name: "th" } });
    expect(properties["Discovery Date"]).toEqual({
      date: { start: "2025-01-15" },
    });
  });

  it("handles null category", () => {
    const nullCatCandidate: CandidateWithProduct = {
      ...candidate,
      category: null,
    };
    const properties = mapToNotionProperties(nullCatCandidate, [], "");

    expect(properties.Category).toEqual({ select: null });
  });

  it("handles null scores", () => {
    const nullScoreCandidate: CandidateWithProduct = {
      ...candidate,
      default_score: null,
      trending_score: null,
      blue_ocean_score: null,
      high_margin_score: null,
      shop_copy_score: null,
    };
    const properties = mapToNotionProperties(nullScoreCandidate, [], "");

    expect(properties["Default Score"]).toEqual({ number: null });
    expect(properties["Trending Score"]).toEqual({ number: null });
    expect(properties["Blue Ocean Score"]).toEqual({ number: null });
    expect(properties["High Margin Score"]).toEqual({ number: null });
    expect(properties["Shop Copy Score"]).toEqual({ number: null });
  });
});

// ── getTagsForCandidate / getSignalsForCandidate ────────────────────

describe("getTagsForCandidate", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    insertProducts(db, [
      {
        productName: "LED Ring Light",
        shopName: "BeautyShop",
        country: "th",
        category: "beauty",
        unitsSold: 1500,
        gmv: 4500,
        orderGrowthRate: 0.25,
        commissionRate: 0.08,
        scrapedAt: "2025-01-15",
      },
    ]);
    upsertCandidate(db, {
      productId: 1,
      defaultScore: 85.5,
      trendingScore: 72.3,
      blueOceanScore: 60.1,
      highMarginScore: 90.0,
      shopCopyScore: 55.5,
    });
  });

  afterEach(() => {
    resetDb();
  });

  it("returns all tag names for a candidate", () => {
    const tagId1 = upsertTag(db, { tagType: "label", tagName: "rising-star" });
    const tagId2 = upsertTag(db, { tagType: "label", tagName: "trending" });
    addCandidateTag(db, 1, tagId1);
    addCandidateTag(db, 1, tagId2);

    const tags = getTagsForCandidate(db, 1);

    expect(tags).toContain("rising-star");
    expect(tags).toContain("trending");
    expect(tags).toHaveLength(2);
  });

  it("returns empty array when candidate has no tags", () => {
    const tags = getTagsForCandidate(db, 1);
    expect(tags).toEqual([]);
  });
});

describe("getSignalsForCandidate", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    insertProducts(db, [
      {
        productName: "LED Ring Light",
        shopName: "BeautyShop",
        country: "th",
        category: "beauty",
        unitsSold: 1500,
        gmv: 4500,
        orderGrowthRate: 0.25,
        commissionRate: 0.08,
        scrapedAt: "2025-01-15",
      },
    ]);
    upsertCandidate(db, {
      productId: 1,
      defaultScore: 85.5,
      trendingScore: 72.3,
      blueOceanScore: 60.1,
      highMarginScore: 90.0,
      shopCopyScore: 55.5,
    });
  });

  afterEach(() => {
    resetDb();
  });

  it("returns only signal-type tag names", () => {
    const sigTagId = upsertTag(db, {
      tagType: "signal",
      tagName: "Sales growth +135%",
    });
    const labelTagId = upsertTag(db, {
      tagType: "label",
      tagName: "rising-star",
    });
    addCandidateTag(db, 1, sigTagId);
    addCandidateTag(db, 1, labelTagId);

    const signals = getSignalsForCandidate(db, 1);

    expect(signals).toContain("Sales growth +135%");
    expect(signals).not.toContain("rising-star");
    expect(signals).toHaveLength(1);
  });

  it("returns empty array when candidate has no signal tags", () => {
    const signals = getSignalsForCandidate(db, 1);
    expect(signals).toEqual([]);
  });
});

// ── syncToNotion ────────────────────────────────────────────────────

describe("syncToNotion", () => {
  let db: Database;

  beforeEach(() => {
    resetDb();
    db = initDb(":memory:");
    // Reset mock before each test
    mockCreate.mockReset().mockResolvedValue({ id: "notion-page-id" });
    // Insert test data
    insertProducts(db, [
      {
        productName: "LED Ring Light",
        shopName: "BeautyShop",
        country: "th",
        category: "beauty",
        unitsSold: 1500,
        gmv: 4500,
        orderGrowthRate: 0.25,
        commissionRate: 0.08,
        scrapedAt: "2025-01-15",
      },
    ]);
    upsertCandidate(db, {
      productId: 1,
      defaultScore: 85.5,
      trendingScore: 72.3,
      blueOceanScore: 60.1,
      highMarginScore: 90.0,
      shopCopyScore: 55.5,
    });
  });

  afterEach(() => {
    resetDb();
  });

  it("creates Notion pages for unsynced candidates", async () => {
    const count = await syncToNotion(db, "test-key", "test-db-id");
    expect(count).toBe(1);
  });

  it("passes correct properties including multi-score to Notion", async () => {
    // Add tags and signals
    const tagId = upsertTag(db, { tagType: "label", tagName: "trending" });
    const sigId = upsertTag(db, {
      tagType: "signal",
      tagName: "High commission 8%",
    });
    addCandidateTag(db, 1, tagId);
    addCandidateTag(db, 1, sigId);

    await syncToNotion(db, "test-key", "test-db-id");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const props = callArgs.properties;

    // Check multi-score properties
    expect(props["Default Score"]).toEqual({ number: 85.5 });
    expect(props["Trending Score"]).toEqual({ number: 72.3 });

    // Check labels
    expect(props.Labels).toEqual({
      multi_select: [{ name: "trending" }],
    });

    // Check signals
    expect(props.Signals).toEqual({
      rich_text: [{ text: { content: "High commission 8%" } }],
    });
  });

  it("marks candidates as synced after success", async () => {
    await syncToNotion(db, "test-key", "test-db-id");

    // Check the candidate is now marked as synced
    const row = db
      .prepare("SELECT synced_to_notion FROM candidates WHERE candidate_id = 1")
      .get() as { synced_to_notion: number } | undefined;
    expect(row?.synced_to_notion).toBe(1);
  });

  it("returns 0 when no unsynced candidates exist", async () => {
    // Mark existing as synced first
    db.prepare("UPDATE candidates SET synced_to_notion = 1").run();

    const count = await syncToNotion(db, "test-key", "test-db-id");
    expect(count).toBe(0);
  });

  it("handles partial failure — logs error but continues", async () => {
    // Insert a second candidate
    insertProducts(db, [
      {
        productName: "Yoga Mat",
        shopName: "FitStore",
        country: "th",
        category: "sports",
        unitsSold: 800,
        gmv: 2400,
        orderGrowthRate: 0.15,
        commissionRate: 0.12,
        scrapedAt: "2025-01-15",
      },
    ]);
    upsertCandidate(db, {
      productId: 2,
      defaultScore: 70,
      trendingScore: 50,
      blueOceanScore: 40,
      highMarginScore: 60,
      shopCopyScore: 30,
    });

    // Mock: first create succeeds, second fails
    mockCreate
      .mockReset()
      .mockResolvedValueOnce({ id: "page-1" })
      .mockRejectedValueOnce(new Error("Notion API error"));

    const count = await syncToNotion(db, "test-key", "test-db-id");
    // Only 1 of 2 succeeded
    expect(count).toBe(1);
  });
});
