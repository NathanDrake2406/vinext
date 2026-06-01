/**
 * Pregenerated concrete URL paths — build-semantic data decoupled from
 * memory-cache seeding.
 *
 * Stores the set of concrete URL paths that were pre-rendered at build time
 * for each route pattern. This is a build-time fact (not a cache state) and
 * is used by the PPR fallback-shell guard in `app-page-dispatch.ts` to avoid
 * serving the fallback shell for known pregenerated routes when the exact
 * cache entry is temporarily absent (eviction, cold start, stale-empty).
 *
 * Layout:
 *   route pattern (e.g. "/en/blog/[slug]")
 *     → set of normalised concrete paths (e.g. {"/en/blog/hello", "/en/blog/world"})
 *
 * Populated at runtime from the prerender manifest (`vinext-prerender.json`)
 * by `seed-cache.ts` on the Node prod-server path, or by deploy-time wiring
 * for the Cloudflare Workers path (via TPR or embedded manifest data).
 *
 * The module-level map is safe for repeated initialisation because every
 * populating call site calls `clearPregeneratedConcretePaths` first.
 */

const concreteUrlPathsByRoute = new Map<string, Set<string>>();

/**
 * Remove all entries. Must be called before re-population to prevent stale
 * paths from a previous build from incorrectly suppressing fallback-shell
 * reuse in a new server process.
 */
export function clearPregeneratedConcretePaths(): void {
  concreteUrlPathsByRoute.clear();
}

/**
 * Register a single normalised concrete URL path for a route pattern.
 * Pathnames must be normalised (decoded, collapsed, stripped) to match the
 * same form used by runtime request handling — typically via
 * `normalizePrerenderCachePathname`.
 */
export function addPregeneratedConcretePath(routePattern: string, pathname: string): void {
  let paths = concreteUrlPathsByRoute.get(routePattern);
  if (!paths) {
    paths = new Set();
    concreteUrlPathsByRoute.set(routePattern, paths);
  }
  paths.add(pathname);
}

/**
 * Returns the set of concrete URL paths that were pre-rendered for the given
 * route pattern, or `undefined` if the route pattern has no pre-rendered paths.
 *
 * Lookups are O(1). The returned set is read-only; mutations must go through
 * `addPregeneratedConcretePath` + `clearPregeneratedConcretePaths`.
 */
export function getRenderedConcreteUrlPathsForRoute(
  routePattern: string,
): ReadonlySet<string> | undefined {
  return concreteUrlPathsByRoute.get(routePattern);
}
