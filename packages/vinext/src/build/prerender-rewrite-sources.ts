import {
  isExternalUrl,
  matchRewrite,
  rewriteSourceForDestination,
  type RequestContext,
} from "../config/config-matchers.js";
import type { ResolvedNextConfig } from "../config/next-config.js";

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
 * These are candidates only. A redirect, a route that owns the pathname,
 * middleware, or an earlier rule can take a candidate first, and only the
 * request handler knows that. The prerender requests each candidate and keeps
 * the render only when the handler confirms that it resolved to the page.
 *
 * A candidate is left out when the first rule that takes the build's request
 * for it is an external rewrite: that request would go to another origin, and
 * its response cannot be a render of the page. A request that reaches another
 * origin through a chain of rules is not found here. The build then sends it,
 * as it does for a prerendered page URL with such rules.
 */
export function collectRewriteSourcePathnames(
  pagePathname: string,
  config: Pick<ResolvedNextConfig, "basePath" | "rewrites">,
): string[] {
  const { rewrites } = config;
  const rules = [...rewrites.beforeFiles, ...rewrites.afterFiles, ...rewrites.fallback];
  // The build requests every URL below basePath.
  const basePathState = { basePath: config.basePath, hadBasePath: true };
  const sourcePathnames = new Set<string>();
  for (const rule of rules) {
    const sourcePathname = rewriteSourceForDestination(rule, pagePathname);
    if (sourcePathname === null || sourcePathnames.has(sourcePathname)) continue;
    const firstDestination = matchRewrite(
      sourcePathname,
      rules,
      BUILD_REQUEST_CONTEXT,
      basePathState,
    );
    if (firstDestination !== null && isExternalUrl(firstDestination)) continue;
    sourcePathnames.add(sourcePathname);
  }
  return [...sourcePathnames];
}
