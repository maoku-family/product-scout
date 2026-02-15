import { z } from "zod";

// ── FastmossProductSchema (backward compatible) ─────────────────────

export const FastmossProductSchema = z.object({
  productName: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  unitsSold: z.number().int().min(0),
  gmv: z.number().min(0),
  orderGrowthRate: z.number(),
  commissionRate: z.number().min(0).max(1),
  scrapedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FastmossProduct = z.infer<typeof FastmossProductSchema>;

// ── NewProductItem (newProducts page scraped data) ───────────────────

export const NewProductItemSchema = z.object({
  productName: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  commissionRate: z.number().min(0).max(1),
  threeDaySales: z.number().int().min(0),
  threeDayRevenue: z.number().min(0),
  totalUnitsSold: z.number().int().min(0),
  totalSalesAmount: z.number().min(0),
  scrapedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type NewProductItem = z.infer<typeof NewProductItemSchema>;

// ── HotlistItem (hotlist page scraped data) ──────────────────────────

export const HotlistItemSchema = z.object({
  productName: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  commissionRate: z.number().min(0).max(1),
  unitsSold: z.number().int().min(0),
  salesAmount: z.number().min(0),
  creatorCount: z.number().int().min(0),
  totalCreatorCount: z.number().int().min(0),
  scrapedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type HotlistItem = z.infer<typeof HotlistItemSchema>;

// ── HotvideoItem (hotvideo page scraped data) ────────────────────────

export const HotvideoItemSchema = z.object({
  productName: z.string(),
  videoContent: z.string(),
  country: z.string(),
  totalUnitsSold: z.number().int().min(0),
  totalSalesAmount: z.number().min(0),
  totalViews: z.number().int().min(0),
  totalLikes: z.number().int().min(0),
  totalComments: z.number().int().min(0),
  scrapedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type HotvideoItem = z.infer<typeof HotvideoItemSchema>;

// ── ProductSchema (products table) ──────────────────────────────────

export const ProductSchema = z.object({
  canonicalId: z.string().nullable(),
  fastmossId: z.string().nullable(),
  productName: z.string(),
  shopName: z.string(),
  country: z.string(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  firstSeenAt: z.string(),
});

export type Product = z.infer<typeof ProductSchema>;

// ── ProductSnapshotSchema (product_snapshots table) ─────────────────

export const ProductSnapshotSchema = z.object({
  productId: z.number().int().min(1),
  scrapedAt: z.string(),
  source: z.enum(["saleslist", "newProducts", "hotlist", "hotvideo", "search"]),
  rank: z.number().int().min(0).nullable(),
  unitsSold: z.number().int().min(0).nullable(),
  salesAmount: z.number().min(0).nullable(),
  growthRate: z.number().nullable(),
  totalUnitsSold: z.number().int().min(0).nullable(),
  totalSalesAmount: z.number().min(0).nullable(),
  commissionRate: z.number().min(0).max(1).nullable(),
  creatorCount: z.number().int().min(0).nullable(),
  videoViews: z.number().int().min(0).nullable(),
  videoLikes: z.number().int().min(0).nullable(),
  videoComments: z.number().int().min(0).nullable(),
  creatorConversionRate: z.number().min(0).max(1).nullable(),
});

export type ProductSnapshot = z.infer<typeof ProductSnapshotSchema>;

// ── ProductDetailSchema (product_details table) ─────────────────────

export const ProductDetailSchema = z.object({
  productId: z.number().int().min(1),
  fastmossId: z.string(),
  hotIndex: z.number().int().min(0).nullable(),
  popularityIndex: z.number().int().min(0).nullable(),
  price: z.number().min(0).nullable(),
  priceUsd: z.number().min(0).nullable(),
  commissionRate: z.number().min(0).max(1).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).nullable(),
  listedAt: z.string().nullable(),
  stockStatus: z.string().nullable(),
  creatorCount: z.number().int().min(0).nullable(),
  videoCount: z.number().int().min(0).nullable(),
  liveCount: z.number().int().min(0).nullable(),
  channelVideoPct: z.number().min(0).max(1).nullable(),
  channelLivePct: z.number().min(0).max(1).nullable(),
  channelOtherPct: z.number().min(0).max(1).nullable(),
  vocPositive: z.string().nullable(),
  vocNegative: z.string().nullable(),
  similarProductCount: z.number().int().min(0).nullable(),
  scrapedAt: z.string(),
});

export type ProductDetail = z.infer<typeof ProductDetailSchema>;
