export const NEVER_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

export const STATIC_CACHE_CONTROL = "s-maxage=31536000, stale-while-revalidate";

export const STALE_REVALIDATE_CACHE_CONTROL = "s-maxage=0, stale-while-revalidate";

export const NO_STORE_CACHE_CONTROL = "no-store, must-revalidate";

/**
 * Matches Next.js's `getCacheControlHeader` stale window semantics while
 * preserving vinext's legacy unbounded SWR header when no expire ceiling is
 * available yet.
 *
 * Next.js source:
 * https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-control.ts
 */
export function buildRevalidateCacheControl(
  revalidateSeconds: number,
  expireSeconds?: number,
): string {
  const staleWhileRevalidate =
    expireSeconds === undefined
      ? ", stale-while-revalidate"
      : revalidateSeconds < expireSeconds
        ? `, stale-while-revalidate=${expireSeconds - revalidateSeconds}`
        : "";

  return `s-maxage=${revalidateSeconds}${staleWhileRevalidate}`;
}
