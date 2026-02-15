import googleTrends from "google-trends-api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTrendStatus } from "@/api/google-trends";

// Mock google-trends-api module
vi.mock("google-trends-api", () => ({
  default: {
    interestOverTime: vi.fn(),
  },
}));

const mockInterestOverTime = vi.mocked(googleTrends.interestOverTime);

describe("getTrendStatus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'rising' when latest interest > average * 1.2", async () => {
    // Timeline data where latest value (80) > average (50) * 1.2 = 60
    mockInterestOverTime.mockResolvedValueOnce(
      JSON.stringify({
        default: {
          timelineData: [
            { time: "1", value: [30] },
            { time: "2", value: [40] },
            { time: "3", value: [50] },
            { time: "4", value: [80] },
          ],
        },
      }),
    );

    const result = await getTrendStatus("yoga mat", "th");
    expect(result).toBe("rising");
  });

  it("returns 'declining' when latest interest < average * 0.8", async () => {
    // Timeline data where latest value (20) < average (60) * 0.8 = 48
    mockInterestOverTime.mockResolvedValueOnce(
      JSON.stringify({
        default: {
          timelineData: [
            { time: "1", value: [60] },
            { time: "2", value: [70] },
            { time: "3", value: [80] },
            { time: "4", value: [20] },
          ],
        },
      }),
    );

    const result = await getTrendStatus("fidget spinner", "th");
    expect(result).toBe("declining");
  });

  it("returns 'stable' when latest interest is within normal range", async () => {
    mockInterestOverTime.mockResolvedValueOnce(
      JSON.stringify({
        default: {
          timelineData: [
            { time: "1", value: [50] },
            { time: "2", value: [48] },
            { time: "3", value: [52] },
            { time: "4", value: [50] },
          ],
        },
      }),
    );

    const result = await getTrendStatus("phone case", "th");
    expect(result).toBe("stable");
  });

  it("returns 'stable' as fallback on API error", async () => {
    mockInterestOverTime.mockRejectedValueOnce(new Error("API limit exceeded"));

    const result = await getTrendStatus("anything", "th");
    expect(result).toBe("stable");
  });

  it("returns 'stable' when timeline data is empty", async () => {
    mockInterestOverTime.mockResolvedValueOnce(
      JSON.stringify({
        default: {
          timelineData: [],
        },
      }),
    );

    const result = await getTrendStatus("niche product", "th");
    expect(result).toBe("stable");
  });

  it("maps region code to correct geo parameter", async () => {
    mockInterestOverTime.mockResolvedValueOnce(
      JSON.stringify({
        default: { timelineData: [{ time: "1", value: [50] }] },
      }),
    );

    await getTrendStatus("test", "id");

    expect(mockInterestOverTime).toHaveBeenCalledWith(
      expect.objectContaining({ geo: "ID" }),
    );
  });
});
