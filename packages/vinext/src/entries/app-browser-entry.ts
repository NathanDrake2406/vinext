import { resolveRuntimeEntryModule } from "./runtime-entry-module.js";
import type { VinextLinkPrefetchRoute } from "../client/vinext-next-data.js";
import type { AppRoute } from "../routing/app-router.js";

/**
 * Generate the virtual browser entry module.
 *
 * This runs in the client (browser). It hydrates the page from the
 * embedded RSC payload and handles client-side navigation by re-fetching
 * RSC streams.
 */
export function generateBrowserEntry(routes: readonly AppRoute[] = []): string {
  const entryPath = resolveRuntimeEntryModule("app-browser-entry");
  const prefetchRoutes: VinextLinkPrefetchRoute[] = routes
    .filter((route) => isLinkPrefetchRoute(route))
    .map((route) => ({
      patternParts: [...route.patternParts],
      isDynamic: route.isDynamic,
    }));

  return `window.__VINEXT_LINK_PREFETCH_ROUTES__ = ${JSON.stringify(prefetchRoutes)};
import ${JSON.stringify(entryPath)};`;
}

function isLinkPrefetchRoute(route: AppRoute): boolean {
  if (route.pagePath !== null) return true;
  return route.routePath === null && route.layouts.length > 0;
}
