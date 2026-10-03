import {
  isExternalUrl,
  matchConfigPattern,
  matchRewrite,
  rewriteSourceForDestination,
  type RequestContext,
} from "../config/config-matchers.js";
import type { ResolvedNextConfig } from "../config/next-config.js";
import type { AppRoute } from "../routing/app-router.js";

type RewriteSourceConfig = Pick<ResolvedNextConfig, "basePath" | "rewrites">;
type RouteOwner = Pick<AppRoute, "pattern" | "isDynamic">;

/**
 * What a rewrite condition sees in a build request: no cookies, no query, no
 * headers of its own, and the loopback host of the prerender server.
 */
const BUILD_REQUEST_CONTEXT: RequestContext = {
  headers: new Headers(),
  cookies: {},
  query: new URLSearchParams(),
  host: "127.0.0.1",
};

/**
 * Public pathnames that a next.config rewrite can resolve to the page at
 * `pagePathname`.
 *
 * These are candidates only. A redirect, middleware, or an earlier rule can
 * take a candidate first, and only the request handler knows that. The
 * prerender requests each candidate and keeps the render only when the handler
 * confirms that it resolved to the page.
 *
 * The build must not request a pathname that it can tell is not a candidate,
 * because the request runs what owns the pathname:
 *
 * - A rule that runs after the filesystem cannot take a pathname that a route
 *   owns. That route can be a route handler, which the prerender never runs.
 *   `afterFiles` rules run before dynamic routes, `fallback` rules after them.
 * - When the first rule that takes the build's request is an external rewrite,
 *   the request goes to another origin.
 *
 * A request that reaches another origin through a chain of rules is not found
 * here. The build then sends it, as it does for a prerendered page URL with
 * such rules.
 */
export function collectRewriteSourcePathnames(
  pagePathname: string,
  config: RewriteSourceConfig,
  routes: readonly RouteOwner[],
): string[] {
  const { rewrites } = config;
  const rules = [...rewrites.beforeFiles, ...rewrites.afterFiles, ...rewrites.fallback];
  // The build requests every URL below basePath.
  const basePathState = { basePath: config.basePath, hadBasePath: true };

  const ownedByNonDynamicRoute = (pathname: string) =>
    routes.some((route) => !route.isDynamic && route.pattern === pathname);
  const matchedByDynamicRoute = (pathname: string) =>
    routes.some((route) => route.isDynamic && matchConfigPattern(pathname, route.pattern) !== null);
  const phases = [
    { rules: rewrites.beforeFiles, routeOwns: () => false },
    { rules: rewrites.afterFiles, routeOwns: ownedByNonDynamicRoute },
    {
      rules: rewrites.fallback,
      routeOwns: (pathname: string) =>
        ownedByNonDynamicRoute(pathname) || matchedByDynamicRoute(pathname),
    },
  ];

  const sourcePathnames = new Set<string>();
  for (const phase of phases) {
    for (const rule of phase.rules) {
      const sourcePathname = rewriteSourceForDestination(rule, pagePathname);
      if (sourcePathname === null || sourcePathnames.has(sourcePathname)) continue;
      if (phase.routeOwns(sourcePathname)) continue;
      const firstDestination = matchRewrite(
        sourcePathname,
        rules,
        BUILD_REQUEST_CONTEXT,
        basePathState,
      );
      if (firstDestination !== null && isExternalUrl(firstDestination)) continue;
      sourcePathnames.add(sourcePathname);
    }
  }
  return [...sourcePathnames];
}

/**
 * The rewrite source URLs to render for a list of prerendered pages.
 *
 * The source pathname names the artifact files. On a file system that ignores
 * letter case, two source pathnames that differ only by case share one file,
 * so only the first of them is rendered. One source pathname can be a
 * candidate of more than one page: the handler resolves it to one of them.
 */
export function collectRewriteSources<Page extends { urlPath: string }>(
  pages: readonly Page[],
  config: RewriteSourceConfig,
  routes: readonly RouteOwner[],
): Array<{ page: Page; sourcePathname: string }> {
  const sources: Array<{ page: Page; sourcePathname: string }> = [];
  const pathnameByFoldedPathname = new Map<string, string>();
  for (const page of pages) {
    for (const sourcePathname of collectRewriteSourcePathnames(page.urlPath, config, routes)) {
      const foldedPathname = sourcePathname.toLowerCase();
      const queuedPathname = pathnameByFoldedPathname.get(foldedPathname);
      if (queuedPathname !== undefined && queuedPathname !== sourcePathname) continue;
      pathnameByFoldedPathname.set(foldedPathname, sourcePathname);
      sources.push({ page, sourcePathname });
    }
  }
  return sources;
}
