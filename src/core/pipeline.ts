import type { Database } from "bun:sqlite";

import { searchCjProduct } from "@/api/cj";
import { getTrendStatus } from "@/api/google-trends";
import { postFilter, preFilter } from "@/core/filter";
import type { EnrichedProduct } from "@/core/filter";
import { computeScore } from "@/core/scorer";
import type { ScoreInput } from "@/core/scorer";
import { syncToNotion } from "@/core/sync";
import {
  insertCandidate,
  insertCostData,
  insertProducts,
  insertShopeeProduct,
} from "@/db/queries";
import type { Filter } from "@/schemas/config";
import type { FastmossProduct } from "@/schemas/product";
import { scrapeFastmoss } from "@/scrapers/fastmoss";
import { searchShopee } from "@/scrapers/shopee";
import { logger } from "@/utils/logger";

export type PipelineOptions = {
  region: string;
  category?: string;
  limit?: number;
  dryRun?: boolean;
};

export type PipelineResult = {
  scraped: number;
  preFiltered: number;
  enriched: number;
  postFiltered: number;
  scored: number;
  synced: number;
};

type Secrets = {
  cjApiKey: string;
  notionKey: string;
  notionDbId: string;
};

type EnrichedItem = {
  product: FastmossProduct;
  shopeePrice?: number;
  shopeeSoldCount?: number;
  profitMargin?: number;
  trendStatus: "rising" | "stable" | "declining";
  cjPrice?: number;
  shippingCost?: number;
  cjUrl?: string;
};

/**
 * Look up the product ID from the database by unique key.
 */
function findProductId(
  db: Database,
  productName: string,
  shopName: string,
  country: string,
  scrapedAt: string,
): number | undefined {
  const row: unknown = db
    .prepare(
      "SELECT id FROM products WHERE product_name = ? AND shop_name = ? AND country = ? AND scraped_at = ?",
    )
    .get(productName, shopName, country, scrapedAt);
  if (
    row &&
    typeof row === "object" &&
    "id" in row &&
    typeof row.id === "number"
  ) {
    return row.id;
  }
  return undefined;
}

export async function runPipeline(
  db: Database,
  options: PipelineOptions,
  secrets: Secrets,
  filters: Filter,
): Promise<PipelineResult> {
  const result: PipelineResult = {
    scraped: 0,
    preFiltered: 0,
    enriched: 0,
    postFiltered: 0,
    scored: 0,
    synced: 0,
  };

  // ① Scrape FastMoss
  logger.info("Starting pipeline", {
    region: options.region,
    category: options.category,
  });
  const products = await scrapeFastmoss({
    region: options.region,
    category: options.category,
    limit: options.limit,
  });
  result.scraped = products.length;

  if (products.length === 0) {
    logger.warn("No products scraped, aborting pipeline");
    return result;
  }

  // ② Store raw products
  insertProducts(db, products);

  // ③ Pre-filter
  const preFiltered = preFilter(products, filters);
  result.preFiltered = preFiltered.length;
  logger.info(
    `Pre-filter: ${String(products.length)} → ${String(preFiltered.length)}`,
  );

  // ④⑤⑥ Enrich each product with Shopee, Trends, CJ data
  const maxUnits = Math.max(...preFiltered.map((p) => p.unitsSold));
  const enriched: EnrichedItem[] = [];

  for (const product of preFiltered) {
    const productId = findProductId(
      db,
      product.productName,
      product.shopName,
      product.country,
      product.scrapedAt,
    );

    // ④ Shopee validation
    const shopeeResults = await searchShopee({
      keyword: product.productName,
      region: options.region,
      limit: 1,
    });
    const shopeeProduct = shopeeResults[0];
    let shopeePrice: number | undefined;
    let shopeeSoldCount: number | undefined;

    if (shopeeProduct && productId) {
      shopeePrice = shopeeProduct.price;
      shopeeSoldCount = shopeeProduct.soldCount;
      insertShopeeProduct(db, productId, {
        title: shopeeProduct.title,
        price: shopeeProduct.price,
        soldCount: shopeeProduct.soldCount,
        rating: shopeeProduct.rating,
        shopeeUrl: shopeeProduct.shopeeUrl,
        updatedAt: shopeeProduct.updatedAt,
      });
    }

    // ⑤ Google Trends
    const trendStatus = await getTrendStatus(
      product.productName,
      options.region,
    );

    // ⑥ CJ cost lookup
    let profitMargin: number | undefined;
    let cjPrice: number | undefined;
    let shippingCost: number | undefined;
    let cjUrl: string | undefined;

    if (shopeePrice) {
      const cjResult = await searchCjProduct(
        product.productName,
        shopeePrice,
        secrets.cjApiKey,
      );
      if (cjResult && productId) {
        profitMargin = cjResult.profitMargin;
        cjPrice = cjResult.cjPrice;
        shippingCost = cjResult.shippingCost;
        cjUrl = cjResult.cjUrl;
        insertCostData(db, productId, {
          cjPrice: cjResult.cjPrice,
          shippingCost: cjResult.shippingCost,
          profitMargin: cjResult.profitMargin,
          cjUrl: cjResult.cjUrl,
          updatedAt: new Date().toISOString().slice(0, 10),
        });
      }
    }

    enriched.push({
      product,
      shopeePrice,
      shopeeSoldCount,
      profitMargin,
      trendStatus,
      cjPrice,
      shippingCost,
      cjUrl,
    });
  }
  result.enriched = enriched.length;

  // ⑦ Post-filter
  const enrichedForFilter: EnrichedProduct[] = enriched.map((e) => ({
    product: e.product,
    shopeePrice: e.shopeePrice,
    profitMargin: e.profitMargin,
  }));
  const postFiltered = postFilter(enrichedForFilter, filters);
  result.postFiltered = postFiltered.length;
  logger.info(
    `Post-filter: ${String(enriched.length)} → ${String(postFiltered.length)}`,
  );

  // Map back to enriched data for scoring
  const postFilteredSet = new Set(
    postFiltered.map((p) => p.product.productName),
  );

  // ⑧⑨ Score and store candidates
  for (const item of enriched) {
    if (!postFilteredSet.has(item.product.productName)) {
      continue;
    }

    const productId = findProductId(
      db,
      item.product.productName,
      item.product.shopName,
      item.product.country,
      item.product.scrapedAt,
    );

    const scoreInput: ScoreInput = {
      unitsSold: item.product.unitsSold,
      maxUnits,
      growthRate: item.product.orderGrowthRate,
      shopeeSoldCount: item.shopeeSoldCount,
      profitMargin: item.profitMargin ?? 0,
      trendStatus: item.trendStatus,
    };
    const score = computeScore(scoreInput);

    if (productId) {
      insertCandidate(db, productId, {
        score,
        trendStatus: item.trendStatus,
        createdAt: new Date().toISOString().slice(0, 10),
      });
      result.scored += 1;
    }
  }

  // ⑩ Sync to Notion
  if (!options.dryRun) {
    result.synced = await syncToNotion(
      db,
      secrets.notionKey,
      secrets.notionDbId,
    );
  }

  logger.info("Pipeline complete", result);
  return result;
}
