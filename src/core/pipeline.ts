/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-type-assertion */
import type { Database } from "bun:sqlite";

import { searchCjProduct } from "@/api/cj";
import { getTrendStatus } from "@/api/google-trends";
import {
  cjToEnrichment,
  shopeeToEnrichment,
} from "@/core/enrichment-converters";
import { postFilter, preFilter } from "@/core/filter";
import type { PostFilterProduct, PreFilterProduct } from "@/core/filter";
import { computeMultiScore } from "@/core/scorer";
import type { ScoringInput } from "@/core/scorer";
import { buildScrapeQueue, consumeQuota } from "@/core/scrape-queue";
import { syncToNotion } from "@/core/sync";
import {
  applyDiscoveryTags,
  applySignalTags,
  applyStrategyTags,
} from "@/core/tagger";
import {
  addCandidateTag,
  dequeueNextTargets,
  insertCandidateScoreDetail,
  insertProductEnrichment,
  insertProductSnapshot,
  insertShopSnapshot,
  upsertCandidate,
  upsertProduct,
  upsertProductDetail,
  upsertShop,
  upsertTag,
} from "@/db/queries";
import { getFiltersForRegion } from "@/schemas/config";
import type {
  RulesConfig,
  ScoringConfig,
  SearchStrategiesConfig,
  SignalsConfig,
} from "@/schemas/config";
import type {
  FastmossProduct,
  HotlistItem,
  HotvideoItem,
  NewProductItem,
  SearchItem,
} from "@/schemas/product";
import {
  scrapeFastmoss,
  scrapeHotlist,
  scrapeHotvideo,
  scrapeNewProducts,
  scrapeProductDetail,
  scrapeSearch,
  scrapeShopDetail,
  scrapeShopHotList,
  scrapeShopSalesList,
} from "@/scrapers/fastmoss";
import { searchShopee } from "@/scrapers/shopee";
import { logger } from "@/utils/logger";

// ── Types ───────────────────────────────────────────────────────────

export type PipelineOptions = {
  region: string;
  category?: string;
  limit?: number;
  dryRun?: boolean;
  skipScrape?: boolean;
  strategyThreshold?: number;
  shopDetailLimit?: number;
};

export type PipelineResult = {
  phaseA: { collected: number; deduplicated: number };
  phaseB: { preFiltered: number; queued: number };
  phaseC: { detailed: number; enriched: number };
  phaseD: { postFiltered: number; labeled: number; scored: number };
  phaseE: { synced: number };
};

export type FullConfig = {
  rules: RulesConfig;
  scoring: ScoringConfig;
  signals: SignalsConfig;
  searchStrategies: SearchStrategiesConfig;
};

type Secrets = {
  cjApiKey: string;
  notionKey: string;
  notionDbId: string;
};

// ── Internal DB row types ───────────────────────────────────────────

type SnapshotRow = {
  units_sold: number | null;
  growth_rate: number | null;
  sales_amount: number | null;
  creator_count: number | null;
  video_views: number | null;
  commission_rate: number | null;
  creator_conversion_rate: number | null;
  source: string;
};

type DetailRow = {
  hot_index: number | null;
  popularity_index: number | null;
  price: number | null;
  price_usd: number | null;
  commission_rate: number | null;
  rating: number | null;
  review_count: number | null;
  listed_at: string | null;
  creator_count: number | null;
  video_count: number | null;
  voc_positive: string | null;
  voc_negative: string | null;
  similar_product_count: number | null;
};

type EnrichmentRow = {
  source: string;
  price: number | null;
  sold_count: number | null;
  profit_margin: number | null;
};

type CountRow = { cnt: number };

// ── Phase A: Data Collection ────────────────────────────────────────

async function phaseA_collect(
  db: Database,
  options: PipelineOptions,
  config: FullConfig,
): Promise<{ collected: number; deduplicated: number }> {
  if (options.skipScrape) {
    logger.info("Skipping Phase A (skipScrape=true)");
    return { collected: 0, deduplicated: 0 };
  }

  const scrapeOpts = {
    region: options.region,
    category: options.category,
    limit: options.limit,
  };

  const countBefore = (
    db.prepare("SELECT COUNT(*) as cnt FROM products").get() as CountRow
  ).cnt;

  let totalCollected = 0;

  // ── 1. Saleslist ──────────────────────────────────────────────────
  try {
    const products = await scrapeFastmoss(scrapeOpts);
    for (const p of products) {
      storeFastmossProduct(db, p, "saleslist");
    }
    totalCollected += products.length;
    logger.info(`Phase A: saleslist collected ${String(products.length)}`);
  } catch (error) {
    logger.error("Phase A: saleslist scrape failed", error);
  }

  // ── 2. New Products ──────────────────────────────────────────────
  try {
    const items = await scrapeNewProducts(scrapeOpts);
    for (const item of items) {
      storeNewProductItem(db, item);
    }
    totalCollected += items.length;
    logger.info(`Phase A: newProducts collected ${String(items.length)}`);
  } catch (error) {
    logger.error("Phase A: newProducts scrape failed", error);
  }

  // ── 3. Hotlist ────────────────────────────────────────────────────
  try {
    const items = await scrapeHotlist(scrapeOpts);
    for (const item of items) {
      storeHotlistItem(db, item);
    }
    totalCollected += items.length;
    logger.info(`Phase A: hotlist collected ${String(items.length)}`);
  } catch (error) {
    logger.error("Phase A: hotlist scrape failed", error);
  }

  // ── 4. Hotvideo ──────────────────────────────────────────────────
  try {
    const items = await scrapeHotvideo(scrapeOpts);
    for (const item of items) {
      storeHotvideoItem(db, item);
    }
    totalCollected += items.length;
    logger.info(`Phase A: hotvideo collected ${String(items.length)}`);
  } catch (error) {
    logger.error("Phase A: hotvideo scrape failed", error);
  }

  // ── 5. Search strategies ─────────────────────────────────────────
  for (const [strategyKey, strategy] of Object.entries(
    config.searchStrategies.strategies,
  )) {
    // Only run strategies matching the current region
    if (strategy.region !== options.region) {
      continue;
    }
    try {
      const items = await scrapeSearch({
        ...scrapeOpts,
        strategy,
      });
      for (const item of items) {
        storeSearchItem(db, item);
      }
      totalCollected += items.length;
      logger.info(
        `Phase A: search "${strategyKey}" collected ${String(items.length)}`,
      );
    } catch (error) {
      logger.error(`Phase A: search "${strategyKey}" failed`, error);
    }
  }

  // ── 6. Shop Sales List ──────────────────────────────────────────
  try {
    const shopItems = await scrapeShopSalesList(scrapeOpts);
    for (const item of shopItems) {
      const shopId = upsertShop(db, {
        fastmossShopId: item.shop.fastmossShopId,
        shopName: item.shop.shopName,
        country: item.shop.country,
        category: item.shop.category,
        shopType: item.shop.shopType,
      });
      insertShopSnapshot(db, { ...item.snapshot, shopId });
    }
    logger.info(
      `Phase A: shopSalesList collected ${String(shopItems.length)} shops`,
    );
  } catch (error) {
    logger.error("Phase A: shopSalesList scrape failed", error);
  }

  // ── 7. Shop Hot List ────────────────────────────────────────────
  try {
    const shopItems = await scrapeShopHotList(scrapeOpts);
    for (const item of shopItems) {
      const shopId = upsertShop(db, {
        fastmossShopId: item.shop.fastmossShopId,
        shopName: item.shop.shopName,
        country: item.shop.country,
        category: item.shop.category,
        shopType: item.shop.shopType,
      });
      insertShopSnapshot(db, { ...item.snapshot, shopId });
    }
    logger.info(
      `Phase A: shopHotList collected ${String(shopItems.length)} shops`,
    );
  } catch (error) {
    logger.error("Phase A: shopHotList scrape failed", error);
  }

  // ── 8. Shop Detail (top N shops) ────────────────────────────────
  const shopDetailLimit = options.shopDetailLimit ?? 5;
  const topShops = db
    .prepare(
      `SELECT s.fastmoss_shop_id, s.country
       FROM shops s
       JOIN shop_snapshots ss ON s.shop_id = ss.shop_id
       WHERE s.fastmoss_shop_id != ''
       ORDER BY ss.total_sales DESC
       LIMIT ?`,
    )
    .all(shopDetailLimit) as Array<{
    fastmoss_shop_id: string;
    country: string;
  }>;

  for (const shop of topShops) {
    try {
      const detail = await scrapeShopDetail(
        shop.fastmoss_shop_id,
        shop.country,
      );
      if (detail) {
        const shopId = upsertShop(db, {
          fastmossShopId: detail.shop.fastmossShopId,
          shopName: detail.shop.shopName,
          country: detail.shop.country,
          category: detail.shop.category,
          shopType: detail.shop.shopType,
        });
        insertShopSnapshot(db, { ...detail.snapshot, shopId });
        for (const product of detail.products) {
          storeFastmossProduct(db, product, "shop-detail");
          totalCollected += 1;
        }
        logger.info(
          `Phase A: shopDetail "${detail.shop.shopName}" → ${String(detail.products.length)} products`,
        );
      }
    } catch (error) {
      logger.error(
        `Phase A: shopDetail "${shop.fastmoss_shop_id}" failed`,
        error,
      );
    }
  }

  const countAfter = (
    db.prepare("SELECT COUNT(*) as cnt FROM products").get() as CountRow
  ).cnt;

  const deduplicated = totalCollected - (countAfter - countBefore);

  logger.info("Phase A complete", { totalCollected, deduplicated });
  return { collected: totalCollected, deduplicated };
}

// ── Phase A helpers: store products from each source ────────────────

function storeFastmossProduct(
  db: Database,
  p: FastmossProduct,
  source: string,
): void {
  const productId = upsertProduct(db, {
    productName: p.productName,
    shopName: p.shopName,
    country: p.country,
    category: p.category,
    subcategory: null,
  });

  insertProductSnapshot(db, {
    productId,
    scrapedAt: p.scrapedAt,
    source,
    rank: null,
    unitsSold: p.unitsSold,
    salesAmount: p.gmv,
    growthRate: p.orderGrowthRate,
    totalUnitsSold: null,
    totalSalesAmount: null,
    commissionRate: p.commissionRate,
    creatorCount: null,
    videoViews: null,
    videoLikes: null,
    videoComments: null,
    creatorConversionRate: null,
  });
}

function storeNewProductItem(db: Database, item: NewProductItem): void {
  const productId = upsertProduct(db, {
    productName: item.productName,
    shopName: item.shopName,
    country: item.country,
    category: item.category,
    subcategory: null,
  });

  insertProductSnapshot(db, {
    productId,
    scrapedAt: item.scrapedAt,
    source: "newProducts",
    rank: null,
    unitsSold: item.threeDaySales,
    salesAmount: item.threeDayRevenue,
    growthRate: null,
    totalUnitsSold: item.totalUnitsSold,
    totalSalesAmount: item.totalSalesAmount,
    commissionRate: item.commissionRate,
    creatorCount: null,
    videoViews: null,
    videoLikes: null,
    videoComments: null,
    creatorConversionRate: null,
  });
}

function storeHotlistItem(db: Database, item: HotlistItem): void {
  const productId = upsertProduct(db, {
    productName: item.productName,
    shopName: item.shopName,
    country: item.country,
    category: item.category,
    subcategory: null,
  });

  insertProductSnapshot(db, {
    productId,
    scrapedAt: item.scrapedAt,
    source: "hotlist",
    rank: null,
    unitsSold: item.unitsSold,
    salesAmount: item.salesAmount,
    growthRate: null,
    totalUnitsSold: null,
    totalSalesAmount: null,
    commissionRate: item.commissionRate,
    creatorCount: item.creatorCount,
    videoViews: null,
    videoLikes: null,
    videoComments: null,
    creatorConversionRate: null,
  });
}

function storeHotvideoItem(db: Database, item: HotvideoItem): void {
  // Hotvideo has no shopName — use "unknown" placeholder
  const productId = upsertProduct(db, {
    productName: item.productName,
    shopName: "unknown",
    country: item.country,
    category: null,
    subcategory: null,
  });

  insertProductSnapshot(db, {
    productId,
    scrapedAt: item.scrapedAt,
    source: "hotvideo",
    rank: null,
    unitsSold: null,
    salesAmount: null,
    growthRate: null,
    totalUnitsSold: item.totalUnitsSold,
    totalSalesAmount: item.totalSalesAmount,
    commissionRate: null,
    creatorCount: null,
    videoViews: item.totalViews,
    videoLikes: item.totalLikes,
    videoComments: item.totalComments,
    creatorConversionRate: null,
  });
}

function storeSearchItem(db: Database, item: SearchItem): void {
  const productId = upsertProduct(db, {
    productName: item.productName,
    shopName: item.shopName,
    country: item.country,
    category: null,
    subcategory: null,
  });

  insertProductSnapshot(db, {
    productId,
    scrapedAt: item.scrapedAt,
    source: "search",
    rank: null,
    unitsSold: item.sevenDaySales,
    salesAmount: item.sevenDayRevenue,
    growthRate: null,
    totalUnitsSold: item.totalUnitsSold,
    totalSalesAmount: item.totalSalesAmount,
    commissionRate: null,
    creatorCount: item.creatorCount,
    videoViews: null,
    videoLikes: null,
    videoComments: null,
    creatorConversionRate: item.creatorConversionRate,
  });
}

// ── Scraping config defaults (shared by Phase B and C) ──────────────

const DEFAULT_SCRAPING_CONFIG = {
  dailyDetailBudget: 300,
  dailySearchBudget: 300,
  freshness: {
    detailRefreshDays: 7,
    vocRefreshDays: 14,
    shopRefreshDays: 7,
  },
} as const;

function getScrapingConfig(config: FullConfig): typeof DEFAULT_SCRAPING_CONFIG {
  return config.rules.scraping ?? DEFAULT_SCRAPING_CONFIG;
}

// ── Phase B: Pre-filter & Queue Building ────────────────────────────

function phaseB_buildQueue(
  db: Database,
  config: FullConfig,
  region: string,
): { preFiltered: number; queued: number } {
  const filters = getFiltersForRegion(config.rules, region);

  // Get all products with their latest snapshots for pre-filtering
  const rows = db
    .prepare(
      `SELECT p.product_id, p.product_name, p.category,
              COALESCE(ps.units_sold, 0) as units_sold,
              COALESCE(ps.growth_rate, 0) as growth_rate
       FROM products p
       LEFT JOIN product_snapshots ps ON p.product_id = ps.product_id
         AND ps.snapshot_id = (
           SELECT MAX(ps2.snapshot_id)
           FROM product_snapshots ps2
           WHERE ps2.product_id = p.product_id
         )`,
    )
    .all() as Array<{
    product_id: number;
    product_name: string;
    category: string | null;
    units_sold: number;
    growth_rate: number;
  }>;

  // Map to PreFilterProduct shape
  const preFilterProducts: (PreFilterProduct & { productId: number })[] =
    rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      category: row.category,
      unitsSold: row.units_sold,
      growthRate: row.growth_rate,
    }));

  const totalBefore = preFilterProducts.length;
  const filtered = preFilter(preFilterProducts, filters);
  const preFiltered = totalBefore - filtered.length;

  logger.info(
    `Phase B: pre-filter ${String(totalBefore)} → ${String(filtered.length)} (removed ${String(preFiltered)})`,
  );

  // Build scrape queue only for products that passed pre-filter
  const scrapingConfig = getScrapingConfig(config);
  const passedProductIds = new Set(filtered.map((p) => p.productId));

  const queued = buildScrapeQueue(
    db,
    scrapingConfig.dailyDetailBudget,
    scrapingConfig.freshness,
    passedProductIds,
  );

  logger.info(`Phase B: queued ${String(queued)} items for deep mining`);
  return { preFiltered, queued };
}

// ── Phase C: Deep Mining ────────────────────────────────────────────

async function phaseC_deepMine(
  db: Database,
  secrets: Secrets,
  config: FullConfig,
  region: string,
): Promise<{ detailed: number; enriched: number }> {
  const scrapingConfig = getScrapingConfig(config);

  // Get pending items from scrape queue
  const queueItems = dequeueNextTargets(db, scrapingConfig.dailyDetailBudget);

  let detailed = 0;
  let enriched = 0;

  for (const item of queueItems) {
    if (item.target_type !== "product_detail") {
      continue;
    }

    const productId = Number(item.target_id);
    if (Number.isNaN(productId)) {
      consumeQuota(db, item.queue_id, "failed");
      continue;
    }

    // Look up fastmoss_id and product_name from DB
    const productRow = db
      .prepare(
        "SELECT fastmoss_id, product_name FROM products WHERE product_id = ?",
      )
      .get(productId) as
      | { fastmoss_id: string | null; product_name: string }
      | undefined;

    if (!productRow) {
      consumeQuota(db, item.queue_id, "failed");
      continue;
    }

    try {
      // Scrape product detail page (only if fastmoss_id is available)
      if (productRow.fastmoss_id) {
        const detail = await scrapeProductDetail(
          productRow.fastmoss_id,
          productId,
        );
        if (detail) {
          upsertProductDetail(db, {
            productId,
            fastmossId: detail.fastmossId,
            hotIndex: detail.hotIndex,
            popularityIndex: detail.popularityIndex,
            price: detail.price,
            priceUsd: detail.priceUsd,
            commissionRate: detail.commissionRate,
            rating: detail.rating,
            reviewCount: detail.reviewCount,
            listedAt: detail.listedAt,
            stockStatus: detail.stockStatus,
            creatorCount: detail.creatorCount,
            videoCount: detail.videoCount,
            liveCount: detail.liveCount,
            channelVideoPct: detail.channelVideoPct,
            channelLivePct: detail.channelLivePct,
            channelOtherPct: detail.channelOtherPct,
            vocPositive: detail.vocPositive,
            vocNegative: detail.vocNegative,
            similarProductCount: detail.similarProductCount,
            scrapedAt: detail.scrapedAt,
          });
          detailed += 1;
        }
      }

      // Enrich with Shopee data
      let shopeePrice: number | undefined;
      try {
        const shopeeResults = await searchShopee({
          keyword: productRow.product_name,
          region,
          limit: 1,
        });
        const shopeeProduct = shopeeResults[0];
        if (shopeeProduct) {
          shopeePrice = shopeeProduct.price;
          insertProductEnrichment(
            db,
            shopeeToEnrichment(shopeeProduct, productId),
          );
          enriched += 1;
        }
      } catch (shopeeError) {
        logger.error("Phase C: Shopee enrichment failed", shopeeError);
      }

      // Enrich with CJ data (only if Shopee price is available)
      if (shopeePrice) {
        try {
          const cjResult = await searchCjProduct(
            productRow.product_name,
            shopeePrice,
            secrets.cjApiKey,
          );
          if (cjResult) {
            const today = new Date().toISOString().slice(0, 10);
            insertProductEnrichment(
              db,
              cjToEnrichment(cjResult, productId, today),
            );
          }
        } catch (cjError) {
          logger.error("Phase C: CJ enrichment failed", cjError);
        }
      }

      // Enrich with Google Trends data
      try {
        const trendStatus = await getTrendStatus(
          productRow.product_name,
          region,
        );
        const today = new Date().toISOString().slice(0, 10);
        insertProductEnrichment(db, {
          productId,
          source: "google-trends",
          price: null,
          soldCount: null,
          rating: null,
          profitMargin: null,
          extra: JSON.stringify({ trendStatus }),
          scrapedAt: today,
        });
      } catch (trendsError) {
        logger.error("Phase C: Google Trends failed", trendsError);
      }

      consumeQuota(db, item.queue_id, "done");
    } catch (error) {
      logger.error(
        `Phase C: Failed to process product ${String(productId)}`,
        error,
      );
      consumeQuota(db, item.queue_id, "failed");
    }
  }

  logger.info("Phase C complete", { detailed, enriched });
  return { detailed, enriched };
}

// ── Phase D: Post-filter + Label + Score ────────────────────────────

function phaseD_labelAndScore(
  db: Database,
  config: FullConfig,
  region: string,
  options: PipelineOptions,
): { postFiltered: number; labeled: number; scored: number } {
  const filters = getFiltersForRegion(config.rules, region);

  // Get products that were in the scrape queue (passed pre-filter)
  // Only these products should be scored
  const allProducts = db
    .prepare(
      `SELECT DISTINCT p.product_id,
              se.price as shopee_price,
              ce.profit_margin as cj_profit_margin
       FROM products p
       INNER JOIN scrape_queue sq
         ON sq.target_type = 'product_detail'
         AND sq.target_id = CAST(p.product_id AS TEXT)
       LEFT JOIN product_enrichments se
         ON p.product_id = se.product_id AND se.source = 'shopee'
         AND se.enrichment_id = (
           SELECT MAX(se2.enrichment_id) FROM product_enrichments se2
           WHERE se2.product_id = p.product_id AND se2.source = 'shopee'
         )
       LEFT JOIN product_enrichments ce
         ON p.product_id = ce.product_id AND ce.source = 'cj'
         AND ce.enrichment_id = (
           SELECT MAX(ce2.enrichment_id) FROM product_enrichments ce2
           WHERE ce2.product_id = p.product_id AND ce2.source = 'cj'
         )`,
    )
    .all() as Array<{
    product_id: number;
    shopee_price: number | null;
    cj_profit_margin: number | null;
  }>;

  // Map to PostFilterProduct shape
  const postFilterProducts: PostFilterProduct[] = allProducts.map((row) => ({
    productId: row.product_id,
    shopeePrice: row.shopee_price ?? undefined,
    profitMargin: row.cj_profit_margin ?? undefined,
  }));

  const totalBefore = postFilterProducts.length;
  const filtered = postFilter(postFilterProducts, filters);
  const postFiltered = totalBefore - filtered.length;

  logger.info(
    `Phase D: post-filter ${String(totalBefore)} → ${String(filtered.length)} (removed ${String(postFiltered)})`,
  );

  const filteredProductIds = new Set(filtered.map((p) => p.productId));

  // Score and label each passing product
  let labeled = 0;
  let scored = 0;

  // Find max sales volume for relative scoring
  const maxSalesRow = db
    .prepare(`SELECT MAX(units_sold) as max_sales FROM product_snapshots`)
    .get() as { max_sales: number | null } | undefined;
  const maxSalesVolume = maxSalesRow?.max_sales ?? 0;

  for (const productId of filteredProductIds) {
    // Gather all data for scoring
    const scoringInput = buildScoringInput(db, productId, maxSalesVolume);

    // Compute multi-strategy scores
    const scoreResult = computeMultiScore(scoringInput, config.scoring);

    // Upsert candidate with scores
    const candidateId = upsertCandidate(db, {
      productId,
      defaultScore: scoreResult.scores.default ?? null,
      trendingScore: scoreResult.scores.trending ?? null,
      blueOceanScore: scoreResult.scores.blueOcean ?? null,
      highMarginScore: scoreResult.scores.highMargin ?? null,
      shopCopyScore: scoreResult.scores.shopCopy ?? null,
    });
    scored += 1;

    // Store score details
    for (const detail of scoreResult.details) {
      insertCandidateScoreDetail(db, {
        candidateId,
        profile: detail.profile,
        dimension: detail.dimension,
        rawValue: detail.rawValue,
        normalizedValue: detail.normalizedValue,
        weight: detail.weight,
        weightedScore: detail.weightedScore,
      });
    }

    // ── Tagging ──────────────────────────────────────────────────

    // Discovery tags (based on which sources the product appeared in)
    const sources = db
      .prepare(
        "SELECT DISTINCT source FROM product_snapshots WHERE product_id = ?",
      )
      .all(productId) as Array<{ source: string }>;
    const sourceNames = sources.map((s) => s.source);
    const discoveryTags = applyDiscoveryTags(sourceNames);

    // Signal tags
    const signalData = buildSignalData(db, productId);
    const signalTags = applySignalTags(signalData, config.signals);

    // Strategy tags
    const nonNullScores: Record<string, number> = {};
    for (const [profile, score] of Object.entries(scoreResult.scores)) {
      if (score !== null) {
        nonNullScores[profile] = score;
      }
    }
    const strategyThreshold = options.strategyThreshold ?? 50;
    const strategyTags = applyStrategyTags(nonNullScores, strategyThreshold);

    // Store all tags
    const allTags = [...discoveryTags, ...signalTags, ...strategyTags];
    for (const tag of allTags) {
      const tagId = upsertTag(db, {
        tagType: tag.tagType,
        tagName: tag.tagName,
      });
      addCandidateTag(db, candidateId, tagId);
    }
    labeled += allTags.length;
  }

  logger.info("Phase D complete", { postFiltered, labeled, scored });
  return { postFiltered, labeled, scored };
}

// ── Phase D helper: build ScoringInput from DB data ─────────────────

function buildScoringInput(
  db: Database,
  productId: number,
  maxSalesVolume: number,
): ScoringInput {
  // Latest snapshot
  const snapshot = db
    .prepare(
      `SELECT units_sold, growth_rate, creator_count, video_views,
              creator_conversion_rate, commission_rate
       FROM product_snapshots
       WHERE product_id = ?
       ORDER BY snapshot_id DESC
       LIMIT 1`,
    )
    .get(productId) as SnapshotRow | undefined;

  // Product details
  const detail = db
    .prepare(
      `SELECT hot_index, price_usd, commission_rate, rating,
              listed_at, creator_count, similar_product_count,
              voc_positive, voc_negative
       FROM product_details
       WHERE product_id = ?`,
    )
    .get(productId) as DetailRow | undefined;

  // Latest Shopee enrichment
  const shopee = db
    .prepare(
      `SELECT price, sold_count, profit_margin
       FROM product_enrichments
       WHERE product_id = ? AND source = 'shopee'
       ORDER BY enrichment_id DESC
       LIMIT 1`,
    )
    .get(productId) as EnrichmentRow | undefined;

  // Latest CJ enrichment
  const cj = db
    .prepare(
      `SELECT profit_margin
       FROM product_enrichments
       WHERE product_id = ? AND source = 'cj'
       ORDER BY enrichment_id DESC
       LIMIT 1`,
    )
    .get(productId) as EnrichmentRow | undefined;

  // Compute days since listed
  let daysSinceListed: number | undefined;
  if (detail?.listed_at) {
    const listedDate = new Date(detail.listed_at);
    const now = new Date();
    daysSinceListed = Math.floor(
      (now.getTime() - listedDate.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // Competition score: use similar_product_count, normalized to 0-100
  let competitionScore: number | undefined;
  if (
    detail?.similar_product_count !== undefined &&
    detail.similar_product_count !== null
  ) {
    competitionScore = Math.min(100, detail.similar_product_count);
  }

  // VOC positive rate: count positive vs negative points
  let vocPositiveRate: number | undefined;
  const hasPositive =
    detail?.voc_positive !== null && detail?.voc_positive !== undefined;
  const hasNegative =
    detail?.voc_negative !== null && detail?.voc_negative !== undefined;

  if (hasPositive || hasNegative) {
    try {
      const positiveCount = hasPositive
        ? (JSON.parse(detail.voc_positive) as string[]).length
        : 0;
      const negativeCount = hasNegative
        ? (JSON.parse(detail.voc_negative) as string[]).length
        : 0;
      const totalCount = positiveCount + negativeCount;

      if (totalCount > 0) {
        vocPositiveRate = positiveCount / totalCount;
      } else if (hasPositive && !hasNegative) {
        vocPositiveRate = 1.0;
      } else if (!hasPositive && hasNegative) {
        vocPositiveRate = 0.0;
      }
    } catch {
      // Ignore parse errors — leave vocPositiveRate as undefined
    }
  }

  // Google Trends: read from product_enrichments
  let googleTrends: "rising" | "stable" | "declining" | undefined;
  const trendsRow = db
    .prepare(
      `SELECT extra
       FROM product_enrichments
       WHERE product_id = ? AND source = 'google-trends'
       ORDER BY enrichment_id DESC
       LIMIT 1`,
    )
    .get(productId) as { extra: string | null } | undefined;

  if (trendsRow?.extra) {
    try {
      const parsed = JSON.parse(trendsRow.extra) as {
        trendStatus?: string;
      };
      if (
        parsed.trendStatus === "rising" ||
        parsed.trendStatus === "stable" ||
        parsed.trendStatus === "declining"
      ) {
        googleTrends = parsed.trendStatus;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return {
    salesVolume: snapshot?.units_sold ?? undefined,
    salesGrowthRate: snapshot?.growth_rate ?? undefined,
    creatorCount: snapshot?.creator_count ?? undefined,
    videoViews: snapshot?.video_views ?? undefined,
    creatorConversionRate: snapshot?.creator_conversion_rate ?? undefined,
    hotIndex: detail?.hot_index ?? undefined,
    vocPositiveRate,
    daysSinceListed,
    competitionScore,
    shopeeValidation: shopee?.sold_count ?? undefined,
    profitMargin: cj?.profit_margin ?? undefined,
    commissionRate: snapshot?.commission_rate ?? undefined,
    pricePoint: shopee?.price ?? detail?.price_usd ?? undefined,
    googleTrends,
    maxSalesVolume,
  };
}

// ── Phase D helper: build signal data from DB ───────────────────────

function buildSignalData(
  db: Database,
  productId: number,
): Record<string, string | number> {
  const data: Record<string, string | number> = {};

  // Latest snapshot data
  const snapshot = db
    .prepare(
      `SELECT units_sold, growth_rate, creator_count, video_views,
              commission_rate, creator_conversion_rate
       FROM product_snapshots
       WHERE product_id = ?
       ORDER BY snapshot_id DESC
       LIMIT 1`,
    )
    .get(productId) as SnapshotRow | undefined;

  if (snapshot) {
    if (snapshot.units_sold !== null) {
      data.salesVolume = snapshot.units_sold;
    }
    if (snapshot.growth_rate !== null) {
      data.salesGrowthRate = snapshot.growth_rate;
    }
    if (snapshot.creator_count !== null) {
      data.creatorCount = snapshot.creator_count;
    }
    if (snapshot.video_views !== null) {
      data.videoViews = snapshot.video_views;
    }
    if (snapshot.commission_rate !== null) {
      data.commissionRate = snapshot.commission_rate;
    }
  }

  // Product details
  const detail = db
    .prepare(
      `SELECT hot_index, price_usd, rating
       FROM product_details
       WHERE product_id = ?`,
    )
    .get(productId) as DetailRow | undefined;

  if (detail) {
    if (detail.hot_index !== null) {
      data.hotIndex = detail.hot_index;
    }
    if (detail.price_usd !== null) {
      data.priceUsd = detail.price_usd;
    }
    if (detail.rating !== null) {
      data.rating = detail.rating;
    }
  }

  // Shopee enrichment
  const shopee = db
    .prepare(
      `SELECT sold_count, price
       FROM product_enrichments
       WHERE product_id = ? AND source = 'shopee'
       ORDER BY enrichment_id DESC
       LIMIT 1`,
    )
    .get(productId) as EnrichmentRow | undefined;

  if (shopee) {
    if (shopee.sold_count !== null) {
      data.shopeeSoldCount = shopee.sold_count;
    }
    if (shopee.price !== null) {
      data.shopeePrice = shopee.price;
    }
  }

  // CJ enrichment
  const cj = db
    .prepare(
      `SELECT profit_margin
       FROM product_enrichments
       WHERE product_id = ? AND source = 'cj'
       ORDER BY enrichment_id DESC
       LIMIT 1`,
    )
    .get(productId) as EnrichmentRow | undefined;

  if (cj?.profit_margin !== null && cj?.profit_margin !== undefined) {
    data.profitMargin = cj.profit_margin;
  }

  return data;
}

// ── Phase E: Output ─────────────────────────────────────────────────

async function phaseE_output(
  db: Database,
  secrets: Secrets,
): Promise<{ synced: number }> {
  const synced = await syncToNotion(db, secrets.notionKey, secrets.notionDbId);
  logger.info(`Phase E: synced ${String(synced)} candidates to Notion`);
  return { synced };
}

// ── Main: runPipeline ───────────────────────────────────────────────

export async function runPipeline(
  db: Database,
  options: PipelineOptions,
  secrets: Secrets,
  config: FullConfig,
): Promise<PipelineResult> {
  logger.info("Starting pipeline", {
    region: options.region,
    category: options.category,
  });

  // Phase A: Data Collection
  const phaseA = await phaseA_collect(db, options, config);

  // Phase B: Pre-filter & Queue Building
  const phaseB = phaseB_buildQueue(db, config, options.region);

  // Phase C: Deep Mining
  const phaseC = await phaseC_deepMine(db, secrets, config, options.region);

  // Phase D: Post-filter + Label + Score
  const phaseD = phaseD_labelAndScore(db, config, options.region, options);

  // Phase E: Output
  let phaseE = { synced: 0 };
  if (!options.dryRun) {
    phaseE = await phaseE_output(db, secrets);
  }

  const result: PipelineResult = {
    phaseA,
    phaseB,
    phaseC,
    phaseD,
    phaseE,
  };

  logger.info("Pipeline complete", result);
  return result;
}
