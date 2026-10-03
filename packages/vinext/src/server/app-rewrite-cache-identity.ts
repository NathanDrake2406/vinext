import { VINEXT_PRERENDER_CACHE_IDENTITY_HEADER } from "./headers.js";

const REWRITE_MARKER = "?__vinext_rewrite=";

/**
 * Cache pathname of an App request that a rewrite resolved to another page.
 *
 * Next.js keys App ISR by the resolved pathname:
 * packages/next/src/build/templates/app-route.ts
 * Keep that resolved identity while also partitioning by the public source
 * pathname that user code observes through usePathname().
 *
 * The request handler and the prerender must agree on this value, or a seeded
 * entry is never read. This module is the only owner of its format.
 */
export function appRewriteCachePathname(sourcePathname: string, resolvedPathname: string): string {
  return `${sourcePathname}${REWRITE_MARKER}${encodeURIComponent(resolvedPathname)}`;
}

/** The parts of a rewritten cache pathname, or null for the pathname of an unrewritten request. */
export function parseAppRewriteCachePathname(
  cachePathname: string,
): { sourcePathname: string; resolvedPathname: string } | null {
  const markerIndex = cachePathname.indexOf(REWRITE_MARKER);
  if (markerIndex === -1) return null;
  try {
    return {
      sourcePathname: cachePathname.slice(0, markerIndex),
      resolvedPathname: decodeURIComponent(
        cachePathname.slice(markerIndex + REWRITE_MARKER.length),
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Tell the prerender which cache pathname the request handler gave a rewritten
 * page render. Only the handler knows how redirects, middleware and the rewrite
 * phases resolve a URL, so the build asks instead of predicting.
 */
export function applyPrerenderCacheIdentityHeader(headers: Headers, cachePathname: string): void {
  // A pathname can hold characters that a header value cannot.
  headers.set(VINEXT_PRERENDER_CACHE_IDENTITY_HEADER, encodeURIComponent(cachePathname));
}

export function readPrerenderCacheIdentityHeader(headers: Headers): string | null {
  const raw = headers.get(VINEXT_PRERENDER_CACHE_IDENTITY_HEADER);
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
