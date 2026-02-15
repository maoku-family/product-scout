import { describe, expect, it } from "vitest";

import { transformDetailPageData } from "@/scrapers/fastmoss/detail";
import type { RawDetailPageData } from "@/scrapers/fastmoss/detail";

function makeRawData(
  overrides: Partial<RawDetailPageData> = {},
): RawDetailPageData {
  return {
    fastmossId: "1729384282250514779",
    hotIndex: "150212",
    popularityIndex: "51428",
    price: "$44.00",
    priceUsd: "$44.00",
    commissionRate: "20%",
    rating: "4.8",
    reviewCount: "733",
    listedAt: "2023-04-29 (GMT+7)",
    stockStatus: "0+",
    totalSales: "12.91万",
    totalGmv: "47.60万",
    creatorCount: "18.00万",
    videoCount: "5.66万",
    liveCount: "120",
    channelVideoPct: "65%",
    channelLivePct: "25%",
    channelOtherPct: "10%",
    vocPositive: ["quality is great", "fast shipping"],
    vocNegative: ["expensive", "small size"],
    similarProductCount: "12",
    category: "运动与户外 / 休闲与室外休闲设备 / 飞镖",
    ...overrides,
  };
}

describe("transformDetailPageData", () => {
  const productId = 42;
  const scrapedAt = "2025-02-11T03:46:31.000Z";

  it("transforms all fields from a complete raw data object", () => {
    const raw = makeRawData();
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.productId).toBe(42);
    expect(result?.fastmossId).toBe("1729384282250514779");
    expect(result?.hotIndex).toBe(150212);
    expect(result?.popularityIndex).toBe(51428);
    expect(result?.price).toBeCloseTo(44.0);
    expect(result?.priceUsd).toBeCloseTo(44.0);
    expect(result?.commissionRate).toBeCloseTo(0.2);
    expect(result?.rating).toBeCloseTo(4.8);
    expect(result?.reviewCount).toBe(733);
    expect(result?.listedAt).toBe("2023-04-29");
    expect(result?.stockStatus).toBe("0+");
    expect(result?.creatorCount).toBe(180000);
    expect(result?.videoCount).toBe(56600);
    expect(result?.liveCount).toBe(120);
    expect(result?.channelVideoPct).toBeCloseTo(0.65);
    expect(result?.channelLivePct).toBeCloseTo(0.25);
    expect(result?.channelOtherPct).toBeCloseTo(0.1);
    expect(result?.similarProductCount).toBe(12);
    expect(result?.scrapedAt).toBe(scrapedAt);
  });

  it("handles Chinese number format with 万 suffix", () => {
    const raw = makeRawData({
      totalSales: "12.91万",
      creatorCount: "18.00万",
      videoCount: "5.66万",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.creatorCount).toBe(180000);
    expect(result?.videoCount).toBe(56600);
  });

  it("handles Chinese number format with 亿 suffix", () => {
    const raw = makeRawData({
      creatorCount: "1.5亿",
      videoCount: "2亿",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.creatorCount).toBe(150000000);
    expect(result?.videoCount).toBe(200000000);
  });

  it("handles Thai Baht currency symbol", () => {
    const raw = makeRawData({
      price: "฿290.00",
      priceUsd: "",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(290.0);
    expect(result?.priceUsd).toBeNull();
  });

  it("handles Malaysian Ringgit currency prefix", () => {
    const raw = makeRawData({
      price: "RM15.00",
      priceUsd: "",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(15.0);
    expect(result?.priceUsd).toBeNull();
  });

  it("handles USD dollar sign", () => {
    const raw = makeRawData({
      price: "$44.00",
      priceUsd: "$44.00",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(44.0);
    expect(result?.priceUsd).toBeCloseTo(44.0);
  });

  it("handles percentage strings for commission rate", () => {
    const raw = makeRawData({ commissionRate: "15.5%" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.commissionRate).toBeCloseTo(0.155);
  });

  it("handles percentage strings for channel percentages", () => {
    const raw = makeRawData({
      channelVideoPct: "72.5%",
      channelLivePct: "20.3%",
      channelOtherPct: "7.2%",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.channelVideoPct).toBeCloseTo(0.725);
    expect(result?.channelLivePct).toBeCloseTo(0.203);
    expect(result?.channelOtherPct).toBeCloseTo(0.072);
  });

  it("extracts date from listedAt string with timezone info", () => {
    const raw = makeRawData({ listedAt: "2023-04-29 (GMT+7)" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.listedAt).toBe("2023-04-29");
  });

  it("handles listedAt with different timezone notation", () => {
    const raw = makeRawData({ listedAt: "2024-12-01 (GMT+8)" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.listedAt).toBe("2024-12-01");
  });

  it("returns null for optional fields when they are empty strings", () => {
    const raw = makeRawData({
      hotIndex: "",
      popularityIndex: "",
      price: "",
      priceUsd: "",
      commissionRate: "",
      rating: "",
      reviewCount: "",
      listedAt: "",
      stockStatus: "",
      creatorCount: "",
      videoCount: "",
      liveCount: "",
      channelVideoPct: "",
      channelLivePct: "",
      channelOtherPct: "",
      vocPositive: [],
      vocNegative: [],
      similarProductCount: "",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.hotIndex).toBeNull();
    expect(result?.popularityIndex).toBeNull();
    expect(result?.price).toBeNull();
    expect(result?.priceUsd).toBeNull();
    expect(result?.commissionRate).toBeNull();
    expect(result?.rating).toBeNull();
    expect(result?.reviewCount).toBeNull();
    expect(result?.listedAt).toBeNull();
    expect(result?.stockStatus).toBeNull();
    expect(result?.creatorCount).toBeNull();
    expect(result?.videoCount).toBeNull();
    expect(result?.liveCount).toBeNull();
    expect(result?.channelVideoPct).toBeNull();
    expect(result?.channelLivePct).toBeNull();
    expect(result?.channelOtherPct).toBeNull();
    expect(result?.vocPositive).toBeNull();
    expect(result?.vocNegative).toBeNull();
    expect(result?.similarProductCount).toBeNull();
  });

  it("serializes VOC data as JSON strings", () => {
    const raw = makeRawData({
      vocPositive: ["quality is great", "fast shipping"],
      vocNegative: ["expensive"],
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.vocPositive).toBe(
      JSON.stringify(["quality is great", "fast shipping"]),
    );
    expect(result?.vocNegative).toBe(JSON.stringify(["expensive"]));
  });

  it("sets VOC to null when arrays are empty", () => {
    const raw = makeRawData({ vocPositive: [], vocNegative: [] });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.vocPositive).toBeNull();
    expect(result?.vocNegative).toBeNull();
  });

  it("handles plain numeric strings without currency symbols", () => {
    const raw = makeRawData({
      price: "44.00",
      priceUsd: "44.00",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(44.0);
    expect(result?.priceUsd).toBeCloseTo(44.0);
  });

  it("handles price range by taking the first value", () => {
    const raw = makeRawData({
      price: "$11.95 - 35.50",
      priceUsd: "$11.95 - 35.50",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(11.95);
    expect(result?.priceUsd).toBeCloseTo(11.95);
  });

  it("returns null when fastmossId is empty", () => {
    const raw = makeRawData({ fastmossId: "" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).toBeNull();
  });

  it("validates productId must be >= 1", () => {
    const raw = makeRawData();
    const result = transformDetailPageData(raw, 0, scrapedAt);

    expect(result).toBeNull();
  });

  it("handles rating of exactly 5", () => {
    const raw = makeRawData({ rating: "5" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.rating).toBe(5);
  });

  it("handles rating of 0", () => {
    const raw = makeRawData({ rating: "0" });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.rating).toBe(0);
  });

  it("handles comma-separated numbers", () => {
    const raw = makeRawData({
      hotIndex: "1,500,212",
      reviewCount: "1,234",
    });
    const result = transformDetailPageData(raw, productId, scrapedAt);

    expect(result).not.toBeNull();
    expect(result?.hotIndex).toBe(1500212);
    expect(result?.reviewCount).toBe(1234);
  });
});
