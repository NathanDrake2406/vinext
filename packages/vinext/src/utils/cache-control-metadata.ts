import { isUnknownRecord } from "./record.js";

function readRecordField(
  ctx: Record<string, unknown> | undefined,
  field: string,
): Record<string, unknown> | undefined {
  const value = ctx?.[field];
  return isUnknownRecord(value) ? value : undefined;
}

export function readCacheControlNumberField(
  ctx: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  const cacheControl = readRecordField(ctx, "cacheControl");
  const value = cacheControl?.[field] ?? ctx?.[field];
  return typeof value === "number" ? value : undefined;
}

export function readCacheControlRevalidateField(
  ctx: Record<string, unknown> | undefined,
): number | false | undefined {
  const cacheControl = readRecordField(ctx, "cacheControl");
  const value = cacheControl?.revalidate ?? ctx?.revalidate;
  return typeof value === "number" || value === false ? value : undefined;
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Project a resolved `cacheLife` onto the single number the client router needs:
 * how many seconds it may reuse this output without asking the server again.
 *
 * Shared by the three places that must agree on the value — the ISR cache
 * write, the cache-hit replay, and the prerender seed — so a warm hit cannot
 * advertise a different client-freshness claim than the render that produced
 * it.
 *
 * Two deliberate rules:
 *
 * 1. An absent `stale` is *not* synthesized from `revalidate` or `expire`. The
 *    `default` profile has no `stale` and an `expire` of ~136 years, so deriving
 *    one would license session-long reuse without a refresh. Absent `stale`
 *    means "this render makes no client-freshness claim", and the client falls
 *    back to its configured `experimental.staleTimes` value.
 * 2. The three numbers are *not* assumed to be ordered. `seconds` is
 *    `{ stale: 30, revalidate: 1, expire: 60 }` — `stale` exceeds `revalidate`,
 *    and that is intentional, so `revalidate` never constrains `stale`. Only the
 *    hard `expire` ceiling does: reuse past `expire` would hand back output the
 *    server considers gone.
 */
export function resolveClientStaleTimeSeconds(
  cacheLife: { expire?: number; stale?: number } | null | undefined,
): number | undefined {
  const stale = cacheLife?.stale;
  if (!isFiniteNonNegative(stale)) return undefined;
  const expire = cacheLife?.expire;
  return isFiniteNonNegative(expire) ? Math.min(stale, expire) : stale;
}
