import { readFileSync } from "node:fs";

import { parse } from "yaml";
import type { z } from "zod";

export function loadConfig<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(filePath, "utf-8");
  const parsed: unknown = parse(raw);
  return schema.parse(parsed);
}
