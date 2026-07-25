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
 * Shared by every emitter — the ISR cache write, the cache-hit replay, the
 * prerender seed, and the initial-HTML done-script — so a warm hit cannot
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
 * 2. The other cacheLife fields never constrain `stale`. `seconds` is
 *    `{ stale: 30, revalidate: 1, expire: 60 }` — `stale` exceeds `revalidate`
 *    on purpose. `expire` is a shared-cache serve ceiling enforced server-side
 *    (entries past it become blocking misses), not a client-reuse clamp:
 *    Next.js stores this header at generation, replays it verbatim on every
 *    hit, and floors it at 30s client-side, so client reuse may overshoot
 *    `expire` by up to `stale` seconds. vinext matches that contract; an
 *    age-aware clamp here would be re-widened by the client floor anyway and
 *    could never reach the value embedded in cached HTML done-scripts.
 */
export function resolveClientStaleTimeSeconds(
  cacheLife: { stale?: number } | null | undefined,
): number | undefined {
  const stale = cacheLife?.stale;
  return isFiniteNonNegative(stale) ? stale : undefined;
}
