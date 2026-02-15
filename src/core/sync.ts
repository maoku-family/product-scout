/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, no-plusplus */
import { Client } from "@notionhq/client";
import type { Database } from "bun:sqlite";

import { getUnsyncedCandidates, markSynced } from "@/db/queries";
import type { CandidateWithProduct } from "@/db/queries";
import { logger } from "@/utils/logger";

// ── Internal row type for tag queries ───────────────────────────────

type TagNameRow = { tag_name: string };

// ── Tag helpers ─────────────────────────────────────────────────────

/**
 * Get label tag names for a candidate (excludes signal tags).
 * Used for the Labels Multi-select property in Notion.
 */
export function getTagsForCandidate(
  db: Database,
  candidateId: number,
): string[] {
  const rows = db
    .prepare(
      `SELECT t.tag_name
       FROM candidate_tags ct
       JOIN tags t ON ct.tag_id = t.tag_id
       WHERE ct.candidate_id = ? AND t.tag_type != 'signal'`,
    )
    .all(candidateId) as TagNameRow[];

  return rows.map((r) => r.tag_name);
}

/**
 * Get signal-type tag names for a candidate.
 * Signals are tags where tag_type = 'signal'.
 */
export function getSignalsForCandidate(
  db: Database,
  candidateId: number,
): string[] {
  const rows = db
    .prepare(
      `SELECT t.tag_name
       FROM candidate_tags ct
       JOIN tags t ON ct.tag_id = t.tag_id
       WHERE ct.candidate_id = ? AND t.tag_type = 'signal'`,
    )
    .all(candidateId) as TagNameRow[];

  return rows.map((r) => r.tag_name);
}

// ── Notion property mapping ─────────────────────────────────────────

/**
 * Map a candidate to Notion page properties.
 * Includes 5 strategy scores, labels (Multi-select), and signals (rich text).
 */
export function mapToNotionProperties(
  candidate: CandidateWithProduct,
  tags: string[],
  signalSummary: string,
): Record<string, unknown> {
  return {
    "Product Name": {
      title: [{ text: { content: candidate.product_name } }],
    },
    "Default Score": { number: candidate.default_score },
    "Trending Score": { number: candidate.trending_score },
    "Blue Ocean Score": { number: candidate.blue_ocean_score },
    "High Margin Score": { number: candidate.high_margin_score },
    "Shop Copy Score": { number: candidate.shop_copy_score },
    Labels: { multi_select: tags.map((name) => ({ name })) },
    Signals: { rich_text: [{ text: { content: signalSummary } }] },
    Category: candidate.category
      ? { select: { name: candidate.category } }
      : { select: null },
    Source: { select: { name: candidate.country } },
    "Discovery Date": { date: { start: candidate.created_at } },
  };
}

// ── Sync to Notion ──────────────────────────────────────────────────

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
  const candidates = getUnsyncedCandidates(db);

  if (candidates.length === 0) {
    logger.info("No unsynced candidates to sync");
    return 0;
  }

  let syncedCount = 0;

  for (const candidate of candidates) {
    try {
      const tags = getTagsForCandidate(db, candidate.candidate_id);
      const signals = getSignalsForCandidate(db, candidate.candidate_id);
      const signalSummary = signals.join(", ");

      await client.pages.create({
        parent: { database_id: notionDbId },
        properties: mapToNotionProperties(
          candidate,
          tags,
          signalSummary,
        ) as any,
      });
      markSynced(db, candidate.candidate_id);
      syncedCount++;
      logger.info("Synced to Notion", {
        productName: candidate.product_name,
      });
    } catch (error) {
      logger.error("Failed to sync candidate to Notion", {
        candidateId: candidate.candidate_id,
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
