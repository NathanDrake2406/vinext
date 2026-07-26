/**
 * App Router prefetch policy resolution, shared by `<Link>` (`link.tsx`) and
 * `router.prefetch()` (`navigation.ts`).
 *
 * Decides, from the client prefetch route manifest
 * (`__VINEXT_LINK_PREFETCH_ROUTES__`), whether a prefetched RSC payload can be
 * cached for navigation reuse or must stay a learning-only / loading-shell
 * prefetch. Lives in `shims/internal/` because `link.tsx` is a `"use client"`
 * React module while `navigation.ts` must stay importable without React —
 * mirrors the layering of `internal/app-route-detection.ts`.
 */
import type { VinextLinkPrefetchRoute } from "../../client/vinext-next-data.js";
import { createRouteTrieCache, matchRouteWithTrie } from "../../routing/route-matching.js";
import { stripBasePath } from "../../utils/base-path.js";

declare global {
  // Window is an ambient interface from lib.dom; interface merging is required
  // for this global browser hook.
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions
  interface Window {
    __VINEXT_LINK_PREFETCH_ROUTES__?: VinextLinkPrefetchRoute[];
  }
}

/** basePath from next.config.js, injected by the plugin at build time */
const __basePath: string = process.env.__NEXT_ROUTER_BASEPATH ?? "";

const linkPrefetchRouteTrieCache = createRouteTrieCache<VinextLinkPrefetchRoute>();

/**
 * How an App Router prefetch for a given href should behave: whether to issue
 * it at all, whether the response is reusable by a later navigation, and which
 * cache TTL family applies.
 */
export type AppRoutePrefetchPolicy = {
  cacheForNavigation: boolean;
  fallbackTtl: "dynamic" | "static";
  minimumTtlMs: number | undefined;
  prefetchShellFirst: boolean;
  shouldPrefetch: boolean;
};

function toSameOriginRouteHref(href: string): string | null {
  if (typeof window === "undefined") return null;

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;

  return `${stripBasePath(url.pathname, __basePath)}${url.search}`;
}

function resolveMatchedAutoAppRoutePrefetch(
  route: VinextLinkPrefetchRoute,
): AppRoutePrefetchPolicy {
  const hasLoadingShell = route.canPrefetchLoadingShell;
  const shouldCacheForNavigation =
    !hasLoadingShell && route.requiresDynamicNavigationRequest !== true;
  return {
    // Vinext does not yet have Next.js's per-segment runtime-prefetch hints.
    // Routes with loading boundaries prefetch a shell first so navigation can
    // commit loading.js immediately. Dynamic routes without loading-shell
    // fallbacks can be cached for navigation unless their active parallel
    // branches must be derived from the click-time target tree.
    cacheForNavigation: shouldCacheForNavigation,
    fallbackTtl: "static",
    minimumTtlMs: route.isDynamic ? 0 : undefined,
    prefetchShellFirst: !route.isDynamic,
    shouldPrefetch: true,
  };
}

export function canAutoPrefetchFullAppRoute(href: string): boolean {
  if (typeof window === "undefined") return false;

  const routes = window.__VINEXT_LINK_PREFETCH_ROUTES__;
  if (!routes) return false;

  const routeHref = toSameOriginRouteHref(href);
  if (routeHref === null) return false;

  const match = matchRouteWithTrie(routeHref, routes, linkPrefetchRouteTrieCache);
  if (!match) return false;

  return resolveAutoAppRoutePrefetch(href).cacheForNavigation;
}

export function resolveAutoAppRoutePrefetch(href: string): AppRoutePrefetchPolicy {
  if (typeof window === "undefined") {
    return {
      cacheForNavigation: false,
      fallbackTtl: "static",
      minimumTtlMs: undefined,
      prefetchShellFirst: false,
      shouldPrefetch: false,
    };
  }

  const routes = window.__VINEXT_LINK_PREFETCH_ROUTES__;
  if (!routes) {
    return {
      cacheForNavigation: false,
      fallbackTtl: "static",
      minimumTtlMs: undefined,
      prefetchShellFirst: false,
      shouldPrefetch: false,
    };
  }

  const routeHref = toSameOriginRouteHref(href);
  if (routeHref === null) {
    return {
      cacheForNavigation: false,
      fallbackTtl: "static",
      minimumTtlMs: undefined,
      prefetchShellFirst: false,
      shouldPrefetch: false,
    };
  }

  const match = matchRouteWithTrie(routeHref, routes, linkPrefetchRouteTrieCache);
  if (!match) {
    return {
      cacheForNavigation: false,
      fallbackTtl: "static",
      minimumTtlMs: undefined,
      prefetchShellFirst: false,
      shouldPrefetch: false,
    };
  }

  const prefetch = resolveMatchedAutoAppRoutePrefetch(match.route);
  const url = new URL(routeHref, "http://vinext.local");
  if (url.search !== "") {
    return {
      ...prefetch,
      cacheForNavigation: false,
      prefetchShellFirst: true,
    };
  }

  return prefetch;
}

export function resolveFullAppRoutePrefetch(): AppRoutePrefetchPolicy & {
  cacheForNavigation: true;
  fallbackTtl: "static";
  minimumTtlMs: undefined;
  shouldPrefetch: true;
} {
  return {
    cacheForNavigation: true,
    fallbackTtl: "static",
    minimumTtlMs: undefined,
    prefetchShellFirst: true,
    shouldPrefetch: true,
  };
}
