import { sortRoutes } from "../routing/utils.js";

export type HybridRoutePriorityRoute = {
  isDynamic: boolean;
  pattern: string;
};

type PrioritizedRoute = HybridRoutePriorityRoute & {
  owner: "app" | "pages";
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
