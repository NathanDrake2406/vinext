import path from "node:path";
import type { AppRouteGraphRoute } from "./app-route-graph.js";
import { appRouteGraph } from "./app-router.js";
import { findFileWithExts, type ValidFileMatcher } from "./file-matcher.js";
import { normalizePathSeparators } from "../utils/path.js";

/** The root URL whose render decides the startup optimizer entries. */
const ROOT_PATTERN = "/";

// Boundary conventions that live at app/ root and are resolved by filename
// rather than attached to a route in the graph (see index.ts's global-error /
// global-not-found discovery). They wrap the very first render, so they belong
// in the startup set even though no route object carries them.
const ROOT_LEVEL_CONVENTIONS = Object.freeze(["global-error", "global-not-found"]);

export type CollectAppRouterStartupOptimizeEntriesOptions = {
  root: string;
  appDir: string;
  matcher: ValidFileMatcher;
};

/**
 * Compute the App Router dev-server `optimizeDeps.entries` as a projection of
 * the canonical route graph: exactly the convention modules that rendering the
 * root URL ("/") loads, made relative to the project root.
 *
 * Why a projection and not a bespoke filesystem walk: App Router startup
 * semantics (transparent `@children`, slot root pages discovered through route
 * groups, which route-group branch actually resolves to "/", which slot layout
 * the renderer wraps with) already live in `appRouteGraph`. Re-deriving a
 * subset by hand drifts from those facts — it both misses real startup modules
 * (an `app/@children/page.tsx` root page) and over-includes non-startup ones (an
 * `app/(admin)/layout.tsx` that only wraps `/dashboard`). Deriving the set from
 * the graph keeps a single source of truth: whatever the graph loads to render
 * "/" is precisely what we pre-optimize, and nothing else.
 *
 * Route modules below "/" stay out of the set on purpose — they are lazy
 * `import()` thunks in the generated RSC manifest, discovered when their route
 * is first requested, so the first dev response no longer scales with total
 * route count.
 */
export async function collectAppRouterStartupOptimizeEntries({
  root,
  appDir,
  matcher,
}: CollectAppRouterStartupOptimizeEntriesOptions): Promise<string[]> {
  const entries = new Set<string>();
  const add = (absPath: string | null | undefined): void => {
    if (absPath) entries.add(normalizePathSeparators(path.relative(root, absPath)));
  };

  for (const convention of ROOT_LEVEL_CONVENTIONS) {
    add(findFileWithExts(appDir, convention, matcher));
  }

  const { routes } = await appRouteGraph(appDir, undefined, matcher);
  for (const route of routes) {
    if (route.pattern !== ROOT_PATTERN) continue;
    addRouteConventionFiles(route, add);
  }

  return [...entries];
}

function addRouteConventionFiles(
  route: AppRouteGraphRoute,
  add: (absPath: string | null | undefined) => void,
): void {
  add(route.pagePath);
  add(route.routePath);
  route.layouts.forEach(add);
  route.templates.forEach(add);
  add(route.loadingPath);
  add(route.errorPath);
  route.layoutErrorPaths.forEach(add);
  route.errorPaths?.forEach(add);
  add(route.notFoundPath);
  route.notFoundPaths.forEach(add);
  add(route.forbiddenPath);
  route.forbiddenPaths.forEach(add);
  add(route.unauthorizedPath);
  route.unauthorizedPaths.forEach(add);

  // Parallel slots render alongside the root page. Only the convention files the
  // renderer actually loads for the slot's root content are startup modules; the
  // slot's intercepting routes load on interception navigations, not on "/".
  for (const slot of route.parallelSlots) {
    add(slot.layoutPath);
    slot.configLayoutPaths?.forEach(add);
    add(slot.pagePath);
    add(slot.defaultPath);
    add(slot.loadingPath);
    add(slot.errorPath);
  }
}
