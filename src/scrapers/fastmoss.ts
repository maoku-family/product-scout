import { FastmossProductSchema } from "@/schemas/product";
import type { FastmossProduct } from "@/schemas/product";
import { logger } from "@/utils/logger";

/**
 * Extract text content from an HTML element matched by class name within a row.
 * Returns the trimmed text content between the opening and closing tags.
 */
function extractCellText(rowHtml: string, className: string): string {
  const pattern = new RegExp(
    `<td\\s[^>]*class="${className}"[^>]*>([^<]*)</td>`,
  );
  const match = pattern.exec(rowHtml);
  return match?.[1]?.trim() ?? "";
}

/**
 * Parse a percentage string like "25.5%" or "-5.2%" into a decimal number.
 * Returns 0 if the string cannot be parsed.
 */
function parsePercentage(raw: string): number {
  const cleaned = raw.replace("%", "").trim();
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return 0;
  }
  return value / 100;
}

/**
 * Parse FastMoss ranking page HTML into validated products.
 * Pure function — no Playwright dependency, fully testable.
 */
export function parseFastmossRanking(
  html: string,
  country: string,
  scrapedAt: string,
): FastmossProduct[] {
  const products: FastmossProduct[] = [];

  // Match all product rows
  const rowPattern = /<tr\s[^>]*class="product-row"[^>]*>[\s\S]*?<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[0];

    const productName = extractCellText(rowHtml, "product-name");
    const shopName = extractCellText(rowHtml, "shop-name");
    const categoryRaw = extractCellText(rowHtml, "category");
    const unitsSoldRaw = extractCellText(rowHtml, "units-sold");
    const gmvRaw = extractCellText(rowHtml, "gmv");
    const growthRateRaw = extractCellText(rowHtml, "growth-rate");
    const commissionRateRaw = extractCellText(rowHtml, "commission-rate");

    const raw = {
      productName,
      shopName,
      country,
      category: categoryRaw === "" ? null : categoryRaw,
      unitsSold: Number.parseInt(unitsSoldRaw, 10),
      gmv: Number.parseFloat(gmvRaw),
      orderGrowthRate: parsePercentage(growthRateRaw),
      commissionRate: parsePercentage(commissionRateRaw),
      scrapedAt,
    };

    const result = FastmossProductSchema.safeParse(raw);
    if (result.success) {
      products.push(result.data);
    } else {
      logger.warn(
        `[fastmoss] Skipping invalid product "${productName}"`,
        result.error.issues,
      );
    }
  }

  return products;
}
