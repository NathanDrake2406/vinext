import { sortRoutes } from "../routing/utils.js";

export type HybridRoutePriorityRoute = {
  isDynamic: boolean;
  pattern: string;
};

type PrioritizedRoute = HybridRoutePriorityRoute & {
  owner: "app" | "pages";
};

export type HybridOwner = "app" | "pages";

export type HybridRouteMatch<R extends HybridRoutePriorityRoute> = {
  route: R;
  params: Record<string, string | string[]>;
};

/**
 * Return whether a matched Pages Router route should own the request instead
 * of a matched App Router route.
 *
 * Next.js registers Pages providers before App providers, then sorts all
 * dynamic route pathnames together in DefaultRouteMatcherManager. Vinext keeps
 * separate route tries for each router, so the hybrid boundary needs to apply
 * that same cross-router ordering after both routers have produced their best
 * local match.
 */
export function pagesRouteHasPriorityOverAppRoute(
  pagesRoute: HybridRoutePriorityRoute,
  appRoute: HybridRoutePriorityRoute | null,
): boolean {
  if (appRoute === null) return true;

  if (!pagesRoute.isDynamic) return appRoute.isDynamic;
  if (!appRoute.isDynamic) return false;

  const routes: PrioritizedRoute[] = [
    { owner: "pages", isDynamic: true, pattern: pagesRoute.pattern },
    { owner: "app", isDynamic: true, pattern: appRoute.pattern },
  ];

  sortRoutes(routes);
  return routes[0].owner === "pages";
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
  return pagesRouteHasPriorityOverAppRoute(pagesMatch.route, appMatch.route) ? "pages" : "app";
}
