/**
 * Client-side resolver that decides whether a URL should be soft-navigated
 * (App Router / RSC) or hard-navigated (Pages Router / document). Mirrors
 * the server-side `pagesRouteHasPriorityOverAppRoute` priority check so the
 * click handler, hover/intent prefetch, and direct document load all reach
 * the same owner for the same (URL, route pair).
 *
 * Lives in `shims/internal/` because both `link.tsx` and the App Router
 * browser entry import it without pulling in the server route graph.
 *
 * The App + Pages route manifests are emitted once per page load by the
 * Vite plugin onto the matching `__VINEXT_*_PREFETCH_ROUTES__` window
 * globals (see `entries/app-browser-entry.ts` and
 * `entries/pages-client-entry.ts`). Hybrid builds expose both globals; a
 * single-router build only sets its own.
 */
import { createRouteTrieCache, matchRouteWithTrie } from "../../routing/route-matching.js";
import { stripBasePath } from "../../utils/base-path.js";
import { getLocalePathPrefix } from "../../utils/domain-locale.js";
import type {
  VinextLinkPrefetchRoute,
  VinextPagesLinkPrefetchRoute,
} from "../../client/vinext-next-data.js";

type HybridClientRoute = VinextLinkPrefetchRoute | VinextPagesLinkPrefetchRoute;

export type HybridClientOwner = "app" | "pages";

declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions
  interface Window {
    __VINEXT_LINK_PREFETCH_ROUTES__?: VinextLinkPrefetchRoute[];
    __VINEXT_PAGES_LINK_PREFETCH_ROUTES__?: VinextPagesLinkPrefetchRoute[];
  }
}

const appRouteTrieCache = createRouteTrieCache<VinextLinkPrefetchRoute>();
const pagesRouteTrieCache = createRouteTrieCache<VinextPagesLinkPrefetchRoute>();

/**
 * Pure: compare two matched routes and return the owner. Mirrors the
 * server-side `pagesRouteHasPriorityOverAppRoute` rules. Centralising the
 * rules here keeps the link click, prefetch, and direct document load
 * paths agreeing on the same owner.
 */
function pagesWins(pagesRoute: HybridClientRoute, appRoute: HybridClientRoute): boolean {
  // Static routes never match a dynamic catch-all on the other router.
  if (!pagesRoute.isDynamic) return appRoute.isDynamic;
  if (!appRoute.isDynamic) return false;

  // Both dynamic. Apply Next.js's merged dynamic-route sorting: routes are
  // compared by their pattern specificity. A path with more static segments
  // (or static segments closer to the start) wins. We rebuild the pattern
  // from patternParts because the client manifest is segment-shaped — the
  // server-side `sortRoutes` works on `{ pattern: string }` shape.
  // The trie match guarantees both routes are present, so each has at
  // least one segment; an empty patternParts would be a "/" static match
  // and the isDynamic guards above would have already short-circuited.
  const pagesPattern = "/" + pagesRoute.patternParts.join("/");
  const appPattern = "/" + appRoute.patternParts.join("/");
  return routePrecedence(pagesPattern) < routePrecedence(appPattern);
}

/**
 * Inline copy of `routePrecedence` from `routing/utils.ts`. Kept in sync
 * by hand to avoid pulling the entire `utils.ts` module (which transitively
 * depends on Node-only helpers) into the client bundle. The function is
 * pure and self-contained.
 *
 * Matches `packages/vinext/src/routing/utils.ts` `routePrecedence`:
 *   1. Static routes first (scored by segment count, more = more specific)
 *   2. Dynamic segments penalized by position
 *   3. Catch-all comes after dynamic
 *   4. Optional catch-all last
 *   5. Lexicographic tiebreaker for determinism
 */
function routePrecedence(pattern: string): number {
  const parts = pattern.split("/").filter(Boolean);
  let score = 0;
  let staticPrefixCount = 0;
  for (const p of parts) {
    if (p.startsWith(":") || p.endsWith("+") || p.endsWith("*")) break;
    staticPrefixCount++;
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.endsWith("+")) {
      score += 1000 + i; // catch-all
    } else if (p.endsWith("*")) {
      score += 2000 + i; // optional catch-all
    } else if (p.startsWith(":")) {
      score += 100 + i; // dynamic
    } else if (i >= staticPrefixCount) {
      score -= 500; // infix static
    }
  }
  return score;
}

function resolveSameOriginPathname(href: string, basePath: string): string | null {
  if (typeof window === "undefined") return null;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  const pathname = stripBasePath(url.pathname, basePath);
  const locale = getLocalePathPrefix(pathname, window.__VINEXT_LOCALES__);
  if (!locale) return pathname;
  const localePrefixLength = locale.length + 1;
  return pathname.length === localePrefixLength ? "/" : pathname.slice(localePrefixLength);
}

function matchAppRoute(
  href: string,
  basePath: string,
  routes: readonly VinextLinkPrefetchRoute[],
): VinextLinkPrefetchRoute | null {
  const pathname = resolveSameOriginPathname(href, basePath);
  if (pathname === null) return null;
  return (
    matchRouteWithTrie(pathname, routes as VinextLinkPrefetchRoute[], appRouteTrieCache)?.route ??
    null
  );
}

function matchPagesRoute(
  href: string,
  basePath: string,
  routes: readonly VinextPagesLinkPrefetchRoute[],
): VinextPagesLinkPrefetchRoute | null {
  const pathname = resolveSameOriginPathname(href, basePath);
  if (pathname === null) return null;
  return (
    matchRouteWithTrie(pathname, routes as VinextPagesLinkPrefetchRoute[], pagesRouteTrieCache)
      ?.route ?? null
  );
}

/**
 * Decide which router should own a soft-navigated URL. Returns:
 *   - "app"    → the App Router runtime handles the navigation (RSC fetch).
 *   - "pages"  → Pages owns the URL; the caller must hard-navigate instead.
 *   - null     → no router matched (preserves the existing 404 path).
 *
 * `basePath` must match what the page uses (typically `process.env.__NEXT_ROUTER_BASEPATH`).
 *
 * The lookup uses the App and Pages manifests on `window` so the same
 * matcher trie produces the same result the server will see when the
 * request lands.
 */
export function resolveHybridClientRouteOwner(
  href: string,
  basePath: string,
): HybridClientOwner | null {
  if (typeof window === "undefined") return null;

  const appRoutes = window.__VINEXT_LINK_PREFETCH_ROUTES__;
  const pagesRoutes = window.__VINEXT_PAGES_LINK_PREFETCH_ROUTES__;

  const appMatch = appRoutes ? matchAppRoute(href, basePath, appRoutes) : null;
  const pagesMatch = pagesRoutes ? matchPagesRoute(href, basePath, pagesRoutes) : null;

  if (appMatch === null && pagesMatch === null) return null;
  if (pagesMatch === null) return "app";
  if (appMatch === null) return "pages";
  return pagesWins(pagesMatch, appMatch) ? "pages" : "app";
}
