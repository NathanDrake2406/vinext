import { matchesRewriteSource, rewriteSourceForDestination } from "../config/config-matchers.js";
import type { ResolvedNextConfig } from "../config/next-config.js";
import type { AppRoute } from "../routing/app-router.js";

type RewriteSourceConfig = Pick<ResolvedNextConfig, "basePath" | "i18n" | "rewrites">;
type RouteOwner = Pick<AppRoute, "pattern" | "isDynamic">;

/**
 * Public pathnames that a next.config rewrite resolves to the page at
 * `pagePathname`, as far as the config alone can tell.
 *
 * The prerender requests each of these pathnames, and a request runs what owns
 * the pathname. That owner must be the page: a route handler, a Pages Router
 * data function, or another origin must not get a request that the prerender
 * did not send before. A pathname is therefore left out whenever the config
 * does not prove that the rule takes it:
 *
 * - A rule with `has` / `missing` is not inverted, and an earlier rule whose
 *   source matches the pathname can take the request, with or without
 *   conditions. The rule must be the first rule that matches.
 * - An `afterFiles` rule cannot take a pathname that a route without params
 *   owns. It runs before dynamic routes, so those do not matter.
 * - A `fallback` rule runs after dynamic routes. This module cannot tell which
 *   pathnames they match, so `fallback` rules give no pathnames.
 * - With `i18n`, a pathname has locale forms that this module does not model.
 *
 * Redirects and middleware are not modeled. They run for a prerendered page
 * URL too, and the request handler has the last word: the prerender keeps a
 * render only when the handler confirms that it resolved to the page.
 */
export function collectRewriteSourcePathnames(
  pagePathname: string,
  config: RewriteSourceConfig,
  routes: readonly RouteOwner[],
): string[] {
  if (config.i18n) return [];

  const { beforeFiles, afterFiles } = config.rewrites;
  const rules = [...beforeFiles, ...afterFiles];
  // The build requests every URL below basePath.
  const basePathState = { basePath: config.basePath, hadBasePath: true };
  const ownedByNonDynamicRoute = (pathname: string) =>
    routes.some((route) => !route.isDynamic && route.pattern === pathname);

  const sourcePathnames: string[] = [];
  for (const rule of rules) {
    const sourcePathname = rewriteSourceForDestination(rule, pagePathname);
    if (sourcePathname === null) continue;
    if (
      rules.find((other) => matchesRewriteSource(sourcePathname, other, basePathState)) !== rule
    ) {
      continue;
    }
    if (afterFiles.includes(rule) && ownedByNonDynamicRoute(sourcePathname)) continue;
    sourcePathnames.push(sourcePathname);
  }
  return sourcePathnames;
}

/**
 * The rewrite source URLs to render for a list of prerendered pages.
 *
 * The source pathname names the artifact files. On a file system that ignores
 * letter case, two source pathnames that differ only by case share one file,
 * so only the first of them is rendered.
 */
export function collectRewriteSources<Page extends { urlPath: string }>(
  pages: readonly Page[],
  config: RewriteSourceConfig,
  routes: readonly RouteOwner[],
): Array<{ page: Page; sourcePathname: string }> {
  const sources: Array<{ page: Page; sourcePathname: string }> = [];
  const foldedPathnames = new Set<string>();
  for (const page of pages) {
    for (const sourcePathname of collectRewriteSourcePathnames(page.urlPath, config, routes)) {
      const foldedPathname = sourcePathname.toLowerCase();
      if (foldedPathnames.has(foldedPathname)) continue;
      foldedPathnames.add(foldedPathname);
      sources.push({ page, sourcePathname });
    }
  }
  return sources;
}
