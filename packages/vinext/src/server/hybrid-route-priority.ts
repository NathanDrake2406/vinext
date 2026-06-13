import { compareHybridRoutePatterns } from "../routing/utils.js";

export type HybridRoutePriorityRoute = {
  isDynamic: boolean;
  pattern: string;
};

export type HybridOwner = "app" | "pages";

export type HybridRouteMatch<R extends HybridRoutePriorityRoute> = {
  route: R;
  params: Record<string, string | string[]>;
};

function normalizeHybridRouteStructure(pattern: string): string {
  return pattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      if (segment.endsWith("*")) return ":*";
      if (segment.endsWith("+")) return ":+";
      return ":";
    })
    .join("/");
}

export function validateHybridRouteConflicts(
  pagesRoutes: readonly HybridRoutePriorityRoute[],
  appRoutes: readonly HybridRoutePriorityRoute[],
): void {
  const pagesByStructure = new Map(
    pagesRoutes.map((route) => [normalizeHybridRouteStructure(route.pattern), route.pattern]),
  );
  const conflicts = appRoutes.flatMap((route) => {
    const pagesPattern = pagesByStructure.get(normalizeHybridRouteStructure(route.pattern));
    return pagesPattern === undefined ? [] : [[pagesPattern, route.pattern] as const];
  });
  if (conflicts.length === 0) return;

  const message = `Conflicting app and page file${conflicts.length === 1 ? " was" : "s were"} found, please remove the conflicting files to continue:`;
  throw new Error(
    `${message}\n${conflicts
      .map(([pagesPattern, appPattern]) => `  pages "${pagesPattern}" - app "${appPattern}"`)
      .join("\n")}`,
  );
}

/**
 * Return whether a matched Pages Router route should own the request instead
 * of a matched App Router route.
 *
 * Next.js registers Pages providers before App providers, then sorts all
 * dynamic route pathnames together in DefaultRouteMatcherManager. Vinext keeps
 * separate route tries for each router, so the hybrid boundary needs to apply
 * that same cross-router ordering after both routers have produced their best
 * local match. The decision itself lives in
 * `routing/utils.ts#compareHybridRoutePatterns` so the server and client
 * always reach the same answer.
 */
export function pagesRouteHasPriorityOverAppRoute(
  pagesRoute: HybridRoutePriorityRoute,
  appRoute: HybridRoutePriorityRoute | null,
): boolean {
  if (appRoute === null) return true;
  return (
    compareHybridRoutePatterns(
      pagesRoute.pattern,
      pagesRoute.isDynamic,
      appRoute.pattern,
      appRoute.isDynamic,
    ) === "pages"
  );
}

/**
 * Compare two already-matched routes (one from each router) and decide which
 * router should own the request.
 *
 * Returns the owning router, or `null` when both routers missed. This is the
 * shape the client-side link/prefetch pipeline needs: a single answer it can
 * switch on to choose between an RSC navigation (App) and a document/Pages
 * navigation (Pages).
 *
 * Centralises the same `pagesRouteHasPriorityOverAppRoute` comparison the
 * server uses so client navigations, prefetch detection, and direct document
 * loads all reach the same answer for the same route pair.
 */
export function resolveHybridRouteOwner<R extends HybridRoutePriorityRoute>(
  appMatch: HybridRouteMatch<R> | null,
  pagesMatch: HybridRouteMatch<R> | null,
): HybridOwner | null {
  if (appMatch === null && pagesMatch === null) return null;
  if (appMatch === null) return "pages";
  if (pagesMatch === null) return "app";
  return compareHybridRoutePatterns(
    pagesMatch.route.pattern,
    pagesMatch.route.isDynamic,
    appMatch.route.pattern,
    appMatch.route.isDynamic,
  );
}
