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
 * Three deliberate rules:
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
 * 3. The `expire` ceiling is measured from when the output was *produced*, not
 *    from when it is served. A serve path replaying an entry already
 *    `ageSeconds` old has only `expire - ageSeconds` of licensed reuse left;
 *    without the subtraction, an entry hit just before its expire boundary
 *    would advertise a full reuse window reaching well past it. Write and seed
 *    paths run at age 0 and may omit the argument.
 */
export function resolveClientStaleTimeSeconds(
  cacheLife: { expire?: number; stale?: number } | null | undefined,
  ageSeconds = 0,
): number | undefined {
  const stale = cacheLife?.stale;
  if (!isFiniteNonNegative(stale)) return undefined;
  const expire = cacheLife?.expire;
  if (!isFiniteNonNegative(expire)) return stale;
  return Math.min(stale, Math.max(expire - ageSeconds, 0));
}
