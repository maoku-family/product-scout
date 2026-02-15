/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import type { Database } from "bun:sqlite";

import { logger } from "@/utils/logger";

// ── Types ───────────────────────────────────────────────────────────

export type ScrapingFreshness = {
  detailRefreshDays: number;
  searchRefreshDays: number;
};

type QueueCandidate = {
  product_id: number;
  priority: number;
};

type RetryRow = {
  retry_count: number;
};

// ── buildScrapeQueue ────────────────────────────────────────────────

/**
 * Build a prioritised scrape queue and write up to `budget` items into
 * the scrape_queue table.
 *
 * Priority levels:
 *   P1 (3) – product exists but has never been scraped for details
 *   P2 (2) – product_details.scraped_at is stale AND product reappeared today
 *   P3 (1) – product is manually tagged "track"
 *
 * Returns the number of items enqueued.
 */
export function buildScrapeQueue(
  db: Database,
  budget: number,
  freshness: ScrapingFreshness,
): number {
  // Clear any old pending items so we rebuild from scratch
  db.prepare("DELETE FROM scrape_queue WHERE status = 'pending'").run();

  const candidates: QueueCandidate[] = [];

  // ── P1: products with NO product_details row (never scraped) ──────
  const p1Rows = db
    .prepare(
      `SELECT p.product_id
       FROM products p
       LEFT JOIN product_details pd ON p.product_id = pd.product_id
       WHERE pd.product_id IS NULL`,
    )
    .all() as Array<{ product_id: number }>;

  for (const row of p1Rows) {
    candidates.push({ product_id: row.product_id, priority: 3 });
  }

  // ── P2: stale product_details AND reappeared today ────────────────
  const p2Rows = db
    .prepare(
      `SELECT pd.product_id
       FROM product_details pd
       JOIN product_snapshots ps ON pd.product_id = ps.product_id
       WHERE pd.scraped_at < datetime('now', ? || ' days')
         AND ps.scraped_at >= datetime('now', 'start of day')`,
    )
    .all(`-${String(freshness.detailRefreshDays)}`) as Array<{
    product_id: number;
  }>;

  for (const row of p2Rows) {
    // Avoid duplicates if already added as P1
    if (!candidates.some((c) => c.product_id === row.product_id)) {
      candidates.push({ product_id: row.product_id, priority: 2 });
    }
  }

  // ── P3: manually tagged "track" ──────────────────────────────────
  const p3Rows = db
    .prepare(
      `SELECT c.product_id
       FROM candidates c
       JOIN candidate_tags ct ON c.candidate_id = ct.candidate_id
       JOIN tags t ON ct.tag_id = t.tag_id
       WHERE t.tag_type = 'manual' AND t.tag_name = 'track'`,
    )
    .all() as Array<{ product_id: number }>;

  for (const row of p3Rows) {
    if (!candidates.some((c) => c.product_id === row.product_id)) {
      candidates.push({ product_id: row.product_id, priority: 1 });
    }
  }

  // ── Sort by priority DESC, then take up to budget ─────────────────
  candidates.sort((a, b) => b.priority - a.priority);
  const selected = candidates.slice(0, budget);

  // ── Insert into scrape_queue ──────────────────────────────────────
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO scrape_queue (target_type, target_id, priority)
     VALUES ('product_detail', ?, ?)`,
  );

  for (const item of selected) {
    insertStmt.run(String(item.product_id), item.priority);
  }

  logger.info("Scrape queue built", {
    total_candidates: candidates.length,
    enqueued: selected.length,
    budget,
  });

  return selected.length;
}

// ── consumeQuota ────────────────────────────────────────────────────

/**
 * Mark a queue item as done or failed.
 *
 * - "done": sets status = "done" and last_scraped_at = now
 * - "failed": increments retry_count; if retry_count < 3 keeps "pending",
 *   otherwise sets status = "failed"
 */
export function consumeQuota(
  db: Database,
  queueId: number,
  status: "done" | "failed",
): void {
  if (status === "done") {
    db.prepare(
      `UPDATE scrape_queue
       SET status = 'done', last_scraped_at = datetime('now')
       WHERE queue_id = ?`,
    ).run(queueId);

    logger.info("Scrape queue item completed", { queueId });
    return;
  }

  // status === "failed"
  // First read current retry_count
  const row = db
    .prepare(`SELECT retry_count FROM scrape_queue WHERE queue_id = ?`)
    .get(queueId) as RetryRow | undefined;

  if (row === undefined) {
    logger.error("Scrape queue item not found", { queueId });
    return;
  }

  const newRetryCount = row.retry_count + 1;
  const newStatus = newRetryCount < 3 ? "pending" : "failed";

  db.prepare(
    `UPDATE scrape_queue
     SET retry_count = ?, status = ?
     WHERE queue_id = ?`,
  ).run(newRetryCount, newStatus, queueId);

  logger.info("Scrape queue item failed", {
    queueId,
    retryCount: newRetryCount,
    newStatus,
  });
}
