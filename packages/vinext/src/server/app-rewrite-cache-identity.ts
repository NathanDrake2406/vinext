import { VINEXT_PRERENDER_CACHE_IDENTITY_HEADER } from "./headers.js";
import { normalizePregeneratedPathname } from "./pregenerated-concrete-paths.js";

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

/** A trailing slash does not change which page a pathname names. */
function pageIdentityPathname(pathname: string): string {
  const normalized = normalizePregeneratedPathname(pathname);
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

/**
 * Whether `cachePathname` is the identity that the request handler gives a
 * request for `requestPathname` that a rewrite resolved to the page at
 * `pagePathname`.
 *
 * The handler keeps the percent-encoding of the request and the trailing slash
 * of the rewrite destination in the resolved part. The parts are therefore
 * compared in normalized form. A caller that accepts the value must store the
 * handler's own spelling: that spelling is the key that a runtime request reads.
 */
export function isRewriteCachePathnameOf(
  cachePathname: string,
  requestPathname: string,
  pagePathname: string,
): boolean {
  const markerIndex = cachePathname.indexOf(REWRITE_MARKER);
  if (markerIndex === -1) return false;
  let resolvedPathname: string;
  try {
    resolvedPathname = decodeURIComponent(cachePathname.slice(markerIndex + REWRITE_MARKER.length));
  } catch {
    return false;
  }
  return (
    cachePathname.slice(0, markerIndex) === normalizePregeneratedPathname(requestPathname) &&
    pageIdentityPathname(resolvedPathname) === pageIdentityPathname(pagePathname)
  );
}

/**
 * Node's fetch rejects a response whose headers are larger than about 16 KB.
 * The limit leaves room for the other headers of a page response.
 */
const MAX_IDENTITY_HEADER_LENGTH = 4096;

/**
 * Tell the prerender which cache pathname the request handler gave a rewritten
 * page render. Only the handler knows how redirects, middleware and the rewrite
 * phases resolve a URL, so the build asks instead of predicting.
 *
 * A very long pathname gets no header: the build then does not seed that URL,
 * which is better than a response that the build cannot read at all.
 */
export function applyPrerenderCacheIdentityHeader(headers: Headers, cachePathname: string): void {
  // A pathname can hold characters that a header value cannot.
  const value = encodeURIComponent(cachePathname);
  if (value.length > MAX_IDENTITY_HEADER_LENGTH) return;
  headers.set(VINEXT_PRERENDER_CACHE_IDENTITY_HEADER, value);
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
