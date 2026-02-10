import { describe, expect, it } from "vitest";

import { parseChineseNumber } from "@/utils/parse-chinese-number";

describe("parseChineseNumber", () => {
  it("parses plain numbers", () => {
    expect(parseChineseNumber("1234")).toBe(1234);
    expect(parseChineseNumber("0")).toBe(0);
  });

  it("parses 万 (10,000) suffix", () => {
    expect(parseChineseNumber("2.28万")).toBe(22800);
    expect(parseChineseNumber("1.93万")).toBe(19300);
    expect(parseChineseNumber("113.70万")).toBe(1137000);
  });

  it("parses 亿 (100,000,000) suffix", () => {
    expect(parseChineseNumber("7.63亿")).toBe(763000000);
    expect(parseChineseNumber("725.78亿")).toBe(72578000000);
  });

  it("handles numbers with currency prefix", () => {
    expect(parseChineseNumber("RM15.00万")).toBe(150000);
    expect(parseChineseNumber("Rp5221.61万")).toBe(52216100);
    expect(parseChineseNumber("₱46.10万")).toBe(461000);
  });

  it("handles numbers with comma separators", () => {
    expect(parseChineseNumber("1,234")).toBe(1234);
    expect(parseChineseNumber("Rp3,202")).toBe(3202);
  });

  it("returns 0 for unparseable strings", () => {
    expect(parseChineseNumber("")).toBe(0);
    expect(parseChineseNumber("N/A")).toBe(0);
    expect(parseChineseNumber("--")).toBe(0);
  });
});
