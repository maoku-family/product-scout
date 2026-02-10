import googleTrends from "google-trends-api";
import { z } from "zod";

import { logger } from "@/utils/logger";

export type TrendStatus = "rising" | "stable" | "declining";

const GEO_MAP: Record<string, string> = {
  th: "TH",
  id: "ID",
  ph: "PH",
  vn: "VN",
  my: "MY",
};

const TimelineDataSchema = z.object({
  default: z.object({
    timelineData: z.array(
      z.object({
        value: z.array(z.number()),
      }),
    ),
  }),
});

/**
 * Get trend status for a keyword in a specific geo region.
 * Compares latest interest value to average.
 * - Rising: latest > average * 1.2
 * - Declining: latest < average * 0.8
 * - Stable: otherwise
 * On error, returns "stable" as fallback (logged).
 */
export async function getTrendStatus(
  keyword: string,
  geo: string,
): Promise<TrendStatus> {
  try {
    const geoCode = GEO_MAP[geo] ?? geo.toUpperCase();
    const results = await googleTrends.interestOverTime({
      keyword,
      geo: geoCode,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });

    const parsed = TimelineDataSchema.parse(JSON.parse(results));

    const timeline = parsed.default.timelineData;
    if (timeline.length === 0) {
      return "stable";
    }

    const values = timeline.map((d) => d.value[0] ?? 0);
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    const latest = values[values.length - 1] ?? 0;

    if (latest > average * 1.2) {
      return "rising";
    }
    if (latest < average * 0.8) {
      return "declining";
    }
    return "stable";
  } catch (error) {
    logger.warn("Google Trends API error, falling back to stable", error);
    return "stable";
  }
}
