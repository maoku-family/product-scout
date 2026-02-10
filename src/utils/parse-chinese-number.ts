/**
 * Parse a Chinese-formatted number string into a numeric value.
 *
 * Handles:
 * - Plain numbers: "1234" → 1234
 * - 万 suffix (10,000): "2.28万" → 22800
 * - 亿 suffix (100,000,000): "7.63亿" → 763000000
 * - Currency prefixes: "RM15.00万" → 150000
 * - Comma separators: "1,234" → 1234
 *
 * Returns 0 for unparseable strings.
 */
export function parseChineseNumber(raw: string): number {
  if (!raw || raw.trim() === "") {
    return 0;
  }

  // Remove currency prefixes (RM, Rp, ₱, $, etc.) and whitespace
  let cleaned = raw.trim().replace(/^[A-Za-z₱$¥€£]+/, "");

  // Remove comma separators
  cleaned = cleaned.replace(/,/g, "");

  // Check for Chinese multiplier suffixes
  let multiplier = 1;
  if (cleaned.endsWith("亿")) {
    multiplier = 100_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("万")) {
    multiplier = 10_000;
    cleaned = cleaned.slice(0, -1);
  }

  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * multiplier);
}
