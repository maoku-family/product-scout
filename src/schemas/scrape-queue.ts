import { z } from "zod";

// ── ScrapeQueueItemSchema (scrape_queue table) ──────────────────────

export const ScrapeQueueItemSchema = z.object({
  targetType: z.enum(["product_detail", "shop_detail"]),
  targetId: z.string(),
  priority: z.number().int().min(0),
  status: z.enum(["pending", "in_progress", "done", "failed"]),
  lastScrapedAt: z.string().nullable(),
  nextScrapeAfter: z.string().nullable(),
  retryCount: z.number().int().min(0),
  createdAt: z.string(),
});

export type ScrapeQueueItem = z.infer<typeof ScrapeQueueItemSchema>;
