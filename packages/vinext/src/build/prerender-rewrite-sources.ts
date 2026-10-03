import {
  isExternalUrl,
  matchesRewriteSource,
  rewriteSourceForDestination,
} from "../config/config-matchers.js";
import type { ResolvedNextConfig } from "../config/next-config.js";

/**
 * Public pathnames that a next.config rewrite can resolve to the page at
 * `pagePathname`.
 *
 * These are candidates only. A redirect, a route that owns the pathname,
 * middleware, or an earlier rule can take a candidate first, and only the
 * request handler knows that. The prerender requests each candidate and keeps
 * the render only when the handler confirms that it resolved to the page.
 *
 * A pathname that an external rewrite can take is not a candidate: the build
 * must not send requests for these extra URLs to another origin.
 */
export function collectRewriteSourcePathnames(
  pagePathname: string,
  rewrites: ResolvedNextConfig["rewrites"],
): string[] {
  const rules = [...rewrites.beforeFiles, ...rewrites.afterFiles, ...rewrites.fallback];
  const externalRules = rules.filter((rule) => isExternalUrl(rule.destination));
  const sourcePathnames = new Set<string>();
  for (const rule of rules) {
    const sourcePathname = rewriteSourceForDestination(rule, pagePathname);
    if (sourcePathname === null) continue;
    if (externalRules.some((external) => matchesRewriteSource(sourcePathname, external))) continue;
    sourcePathnames.add(sourcePathname);
  }
  return [...sourcePathnames];
}
