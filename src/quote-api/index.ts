import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { generate } from "./generate.ts";
import type { QuoteParams, QuoteResult } from "./types.ts";

export type * from "./types.ts";

// Identical requests within 45 minutes are served from memory, capped at ~1 GB
const cache = new LRUCache<string, QuoteResult>({
  maxSize: 1000 * 1000 * 1000,
  sizeCalculation: ({ image }) => (typeof image === "string" ? image.length * 2 : (image?.byteLength ?? 0)) + 1,
  ttl: 1000 * 60 * 45,
});

export default async function quoteApi(params: QuoteParams): Promise<QuoteResult> {
  const cacheString = createHash("md5").update(JSON.stringify(params)).digest("hex");

  const cached = cache.get(cacheString);
  if (cached) return cached;

  const result = await generate(params);
  if (!result.error) cache.set(cacheString, result);
  return result;
}
