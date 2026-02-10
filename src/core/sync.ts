/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, no-plusplus */
import { Client } from "@notionhq/client";
import type { Database } from "bun:sqlite";

import { getUnsyncedCandidates, markSynced } from "@/db/queries";
import { logger } from "@/utils/logger";

type UnsyncedCandidate = {
  id: number;
  product_id: number;
  score: number;
  trend_status: string;
  created_at: string;
  product_name: string;
  shop_name: string;
  country: string;
  category: string | null;
};

/**
 * Map a candidate to Notion page properties.
 */
export function mapToNotionProperties(
  candidate: UnsyncedCandidate,
): Record<string, unknown> {
  return {
    "Product Name": {
      title: [{ text: { content: candidate.product_name } }],
    },
    "Total Score": { number: candidate.score },
    Trend: { select: { name: candidate.trend_status } },
    Category: candidate.category
      ? { select: { name: candidate.category } }
      : { select: null },
    Source: { select: { name: candidate.country } },
    "Discovery Date": { date: { start: candidate.created_at } },
  };
}

/**
 * Sync unsynced candidates to Notion.
 * Returns the number of successfully synced candidates.
 */
export async function syncToNotion(
  db: Database,
  notionApiKey: string,
  notionDbId: string,
): Promise<number> {
  const client = new Client({ auth: notionApiKey });
  const candidates = getUnsyncedCandidates(db) as UnsyncedCandidate[];

  if (candidates.length === 0) {
    logger.info("No unsynced candidates to sync");
    return 0;
  }

  let syncedCount = 0;

  for (const candidate of candidates) {
    try {
      await client.pages.create({
        parent: { database_id: notionDbId },
        properties: mapToNotionProperties(candidate) as any,
      });
      markSynced(db, candidate.id);
      syncedCount++;
      logger.info("Synced to Notion", {
        productName: candidate.product_name,
      });
    } catch (error) {
      logger.error("Failed to sync candidate to Notion", {
        candidateId: candidate.id,
        productName: candidate.product_name,
        error,
      });
      // Continue with next candidate
    }
  }

  logger.info(
    `Notion sync complete: ${String(syncedCount)}/${String(candidates.length)}`,
  );
  return syncedCount;
}
