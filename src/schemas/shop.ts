import { z } from "zod";

// ── ShopSchema (shops table) ────────────────────────────────────────

export const ShopSchema = z.object({
  fastmossShopId: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  shopType: z.enum(["cross-border", "local", "brand"]).nullable(),
  firstSeenAt: z.string(),
});

export type Shop = z.infer<typeof ShopSchema>;

// ── ShopSnapshotSchema (shop_snapshots table) ───────────────────────

export const ShopSnapshotSchema = z.object({
  shopId: z.number().int().min(1),
  scrapedAt: z.string(),
  source: z.enum(["tiktok", "hotTiktok", "search"]),
  totalSales: z.number().int().min(0).nullable(),
  totalRevenue: z.number().min(0).nullable(),
  activeProducts: z.number().int().min(0).nullable(),
  listedProducts: z.number().int().min(0).nullable(),
  creatorCount: z.number().int().min(0).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  positiveRate: z.number().min(0).max(1).nullable(),
  shipRate48h: z.number().min(0).max(1).nullable(),
  nationalRank: z.number().int().min(0).nullable(),
  categoryRank: z.number().int().min(0).nullable(),
  salesGrowthRate: z.number().nullable(),
  newProductSalesRatio: z.number().min(0).max(1).nullable(),
});

export type ShopSnapshot = z.infer<typeof ShopSnapshotSchema>;
