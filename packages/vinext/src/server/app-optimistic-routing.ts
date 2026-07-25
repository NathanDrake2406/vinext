import { createElement, isValidElement, Suspense } from "react";
import { isUnknownRecord } from "../utils/record.js";
import { stripBasePath } from "../utils/base-path.js";
import { buildParams, decodeMatchedParams, splitPathnameForRouteMatch } from "../routing/utils.js";
import type { RouteManifest, RouteManifestRoute } from "../routing/app-route-graph.js";
import { matchRoutePattern } from "../routing/route-pattern.js";
import { stripRscCacheBustingSearchParam, stripRscSuffix } from "./app-rsc-cache-busting.js";
import {
  AppElementsWire,
  APP_PREFETCH_LOADING_SHELL_MARKER_KEY,
  type AppElementValue,
  type AppElements,
} from "./app-elements.js";

type OptimisticRouteTrieNode = {
  catchAllChild: { paramName: string; route: RouteManifestRoute } | null;
  dynamicChild: { node: OptimisticRouteTrieNode; paramName: string } | null;
  optionalCatchAllChild: { paramName: string; route: RouteManifestRoute } | null;
  route: RouteManifestRoute | null;
  staticChildren: Map<string, OptimisticRouteTrieNode>;
};

type OptimisticRouteMatch = {
  params: Record<string, string | string[]>;
  route: RouteManifestRoute;
};

export type OptimisticRouteTemplate = {
  elements: AppElements;
  mountedSlotsHeader: string | null;
  pageElementIds: readonly string[];
  routeId: string;
};

type OptimisticNavigationPayload = {
  elements: AppElements;
  params: Record<string, string | string[]>;
  template: OptimisticRouteTemplate;
};

const routeTrieCache = new WeakMap<RouteManifest, OptimisticRouteTrieNode>();
// Shared never-settling thenable used to suspend optimistic page segments until
// the real RSC payload replaces them.
const OPTIMISTIC_ROUTE_SEGMENT_SUSPENSE_TRIGGER = new Promise<never>(() => {});

export function getOptimisticRouteTemplateKey(options: {
  interceptionContext: string | null;
  mountedSlotsHeader: string | null;
  routeId: string;
}): string {
  return `${options.routeId}\0${options.interceptionContext ?? ""}\0${options.mountedSlotsHeader ?? ""}`;
}

export function getOptimisticPrefetchSourceKey(options: {
  cacheKey: string;
  interceptionContext: string | null;
  mountedSlotsHeader: string | null;
}): string {
  return `${options.cacheKey}\0${options.interceptionContext ?? ""}\0${options.mountedSlotsHeader ?? ""}`;
}

function createNode(): OptimisticRouteTrieNode {
  return {
    catchAllChild: null,
    dynamicChild: null,
    optionalCatchAllChild: null,
    route: null,
    staticChildren: new Map(),
  };
}

function buildRouteTrie(routeManifest: RouteManifest): OptimisticRouteTrieNode {
  const root = createNode();

  for (const route of routeManifest.segmentGraph.routes.values()) {
    let node = root;
    const parts = route.patternParts;

    if (parts.length === 0) {
      node.route ??= route;
      continue;
    }

    for (const [index, part] of parts.entries()) {
      const isTerminal = index === parts.length - 1;
      if (part.startsWith(":") && part.endsWith("+")) {
        if (isTerminal && node.catchAllChild === null) {
          node.catchAllChild = { paramName: part.slice(1, -1), route };
        }
        break;
      }

      if (part.startsWith(":") && part.endsWith("*")) {
        if (isTerminal && node.optionalCatchAllChild === null) {
          node.optionalCatchAllChild = { paramName: part.slice(1, -1), route };
        }
        break;
      }

      if (part.startsWith(":")) {
        const paramName = part.slice(1);
        if (node.dynamicChild === null) {
          node.dynamicChild = { node: createNode(), paramName };
        } else if (node.dynamicChild.paramName !== paramName && import.meta.env.DEV) {
          console.warn(
            `[vinext] Optimistic route trie found conflicting dynamic segments at the same level: :${node.dynamicChild.paramName} vs ${part}`,
          );
        }
        node = node.dynamicChild.node;
        if (isTerminal) node.route ??= route;
        continue;
      }

      let staticChild = node.staticChildren.get(part);
      if (staticChild === undefined) {
        staticChild = createNode();
        node.staticChildren.set(part, staticChild);
      }
      node = staticChild;
      if (isTerminal) node.route ??= route;
    }
  }

  return root;
}

function getRouteTrie(routeManifest: RouteManifest): OptimisticRouteTrieNode {
  const existing = routeTrieCache.get(routeManifest);
  if (existing) return existing;

  const trie = buildRouteTrie(routeManifest);
  routeTrieCache.set(routeManifest, trie);
  return trie;
}

function matchNode(
  node: OptimisticRouteTrieNode,
  urlParts: readonly string[],
  index: number,
  entries: Array<[string, string | string[]]>,
): OptimisticRouteMatch | null {
  if (index === urlParts.length) {
    if (node.route !== null) {
      return { route: node.route, params: buildParams(entries) };
    }
    if (node.optionalCatchAllChild !== null) {
      return {
        route: node.optionalCatchAllChild.route,
        params: buildParams(entries),
      };
    }
    return null;
  }

  const segment = urlParts[index];
  const staticChild = node.staticChildren.get(segment);
  if (staticChild !== undefined) {
    // Static children are authoritative for optimistic routing. If a known
    // static subtree does not contain the remaining URL, do not fall through to
    // a catch-all sibling and render the wrong loading boundary.
    return matchNode(staticChild, urlParts, index + 1, entries);
  }

  if (node.dynamicChild !== null) {
    entries.push([node.dynamicChild.paramName, segment]);
    const match = matchNode(node.dynamicChild.node, urlParts, index + 1, entries);
    if (match !== null) return match;
    entries.pop();
  }

  if (node.catchAllChild !== null) {
    const params = buildParams(entries);
    params[node.catchAllChild.paramName] = urlParts.slice(index);
    return { route: node.catchAllChild.route, params };
  }

  // At this point index < urlParts.length, so remaining always has ≥1 segment.
  if (node.optionalCatchAllChild !== null) {
    const params = buildParams(entries);
    params[node.optionalCatchAllChild.paramName] = urlParts.slice(index);
    return { route: node.optionalCatchAllChild.route, params };
  }

  return null;
}

function hrefToRouteParts(href: string, basePath: string): string[] | null {
  let url: URL;
  try {
    url = new URL(href, "https://vinext.local");
  } catch {
    return null;
  }

  stripRscCacheBustingSearchParam(url);
  const withoutRscSuffix = stripRscSuffix(url.pathname);
  const appPathname = stripBasePath(withoutRscSuffix, basePath);
  return splitPathnameForRouteMatch(appPathname === "" ? "/" : appPathname);
}

export function matchOptimisticRouteManifestRoute(options: {
  basePath: string;
  href: string;
  routeManifest: RouteManifest;
}): OptimisticRouteMatch | null {
  const urlParts = hrefToRouteParts(options.href, options.basePath);
  if (urlParts === null) return null;

  const match = matchNode(getRouteTrie(options.routeManifest), urlParts, 0, []);
  if (match === null) return null;

  decodeMatchedParams(match.params);
  return match;
}

function mergeParams(
  target: Record<string, string | string[]>,
  source: Record<string, string | string[]>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function resolveOptimisticNavigationParams(options: {
  match: OptimisticRouteMatch;
  routeManifest: RouteManifest;
  urlParts: readonly string[];
}): Record<string, string | string[]> {
  const navigationParams: Record<string, string | string[]> = { ...options.match.params };

  for (const binding of options.routeManifest.segmentGraph.slotBindings.values()) {
    // Unlike the server-side resolveSlotParamOverrides, this loop doesn't skip
    // slots whose slotParamNames are all already route params. That's a no-op
    // merge in practice (identical values) but keeps client-side logic simpler.
    if (binding.routeId !== options.match.route.id || binding.state !== "active") {
      continue;
    }

    const patternParts = binding.slotPatternParts;
    if (!patternParts) {
      continue;
    }

    // Slot params are decoded once (from urlParts via splitPathnameForRouteMatch),
    // matching the server-side resolveSlotParamOverrides decode pass. Route params
    // are decoded a second time via decodeMatchedParams(match.params) above — a
    // pre-existing asymmetry that has no practical effect for normal segments but
    // means an encoded catch-all (%25/%2F) could differ between route and slot
    // params in the same payload. TODO: converge the decode passes.
    const matched = matchRoutePattern(options.urlParts, patternParts);
    if (matched) {
      mergeParams(navigationParams, matched);
    }
  }

  return navigationParams;
}

function elementHasSuspenseFallback(value: unknown, depth = 0): boolean {
  if (depth > 100) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => elementHasSuspenseFallback(entry, depth + 1));
  }
  if (!isValidElement(value)) return false;

  const props = Reflect.get(value, "props");
  if (value.type === Suspense && isUnknownRecord(props)) {
    const fallback = Reflect.get(props, "fallback");
    if (fallback !== null && fallback !== undefined) return true;
  }

  if (!isUnknownRecord(props)) return false;
  return elementHasSuspenseFallback(Reflect.get(props, "children"), depth + 1);
}

function getPageElementIds(
  elements: AppElements,
  route: Pick<RouteManifestRoute, "pageId" | "slotIds">,
): string[] {
  const pageElementIds = new Set<string>();
  if (route.pageId && Object.hasOwn(elements, route.pageId)) {
    pageElementIds.add(route.pageId);
  }
  for (const slotId of route.slotIds) {
    const parsed = AppElementsWire.parseElementKey(slotId);
    if (parsed?.kind === "slot" && parsed.name === "children" && Object.hasOwn(elements, slotId)) {
      pageElementIds.add(slotId);
    }
  }
  for (const key of Object.keys(elements)) {
    if (AppElementsWire.parseElementKey(key)?.kind === "page") {
      pageElementIds.add(key);
    }
  }
  return Array.from(pageElementIds).sort();
}

function OptimisticRouteSegment(): null {
  throw OPTIMISTIC_ROUTE_SEGMENT_SUSPENSE_TRIGGER;
}

export function createOptimisticRouteTemplate(options: {
  allowLoadingShell?: boolean;
  basePath: string;
  elements: AppElements;
  href: string;
  interceptionContext: string | null;
  mountedSlotsHeader: string | null;
  routeManifest: RouteManifest;
}): OptimisticRouteTemplate | null {
  const match = matchOptimisticRouteManifestRoute({
    basePath: options.basePath,
    href: options.href,
    routeManifest: options.routeManifest,
  });
  if (match === null || (!options.allowLoadingShell && !match.route.isDynamic)) return null;
  if (options.interceptionContext !== null) return null;

  const metadata = AppElementsWire.readMetadata(options.elements);
  if (metadata.interception !== null || metadata.interceptionContext !== null) return null;

  const routeElement = options.elements[metadata.routeId];
  // Full-prefetch learning is intentionally heuristic: legacy full prefetches
  // are accepted only when the serialized route subtree still contains a
  // Suspense fallback. Authoritative loading-shell prefetches use the marker
  // check below instead.
  if (!options.allowLoadingShell && !elementHasSuspenseFallback(routeElement)) return null;
  if (
    options.allowLoadingShell &&
    options.elements[APP_PREFETCH_LOADING_SHELL_MARKER_KEY] !== "LoadingBoundary"
  ) {
    return null;
  }
  // Shell prefetches must include the eagerly-rendered loading component. A
  // null route element means the server had no route loading boundary.
  if (options.allowLoadingShell && (routeElement === undefined || routeElement === null))
    return null;

  const pageElementIds = getPageElementIds(options.elements, match.route);
  if (pageElementIds.length === 0) return null;

  return {
    elements: options.elements,
    mountedSlotsHeader: options.mountedSlotsHeader,
    pageElementIds,
    routeId: match.route.id,
  };
}

export function createOptimisticRouteElements(template: OptimisticRouteTemplate): AppElements {
  const elements: Record<string, AppElementValue> = { ...template.elements };
  for (const pageElementId of template.pageElementIds) {
    elements[pageElementId] = createElement(OptimisticRouteSegment);
  }
  return elements;
}

export function resolveOptimisticNavigationPayload(options: {
  basePath: string;
  href: string;
  interceptionContext: string | null;
  mountedSlotsHeader: string | null;
  routeManifest: RouteManifest;
  templates: ReadonlyMap<string, OptimisticRouteTemplate>;
}): OptimisticNavigationPayload | null {
  if (options.interceptionContext !== null) return null;

  const urlParts = hrefToRouteParts(options.href, options.basePath);
  if (urlParts === null) return null;

  const match = matchOptimisticRouteManifestRoute({
    basePath: options.basePath,
    href: options.href,
    routeManifest: options.routeManifest,
  });
  if (match === null) return null;

  const template = options.templates.get(
    getOptimisticRouteTemplateKey({
      interceptionContext: options.interceptionContext,
      mountedSlotsHeader: options.mountedSlotsHeader,
      routeId: match.route.id,
    }),
  );
  if (template === undefined) return null;
  if (template.mountedSlotsHeader !== options.mountedSlotsHeader) return null;

  return {
    elements: createOptimisticRouteElements(template),
    params: resolveOptimisticNavigationParams({
      match,
      routeManifest: options.routeManifest,
      urlParts,
    }),
    template,
  };
}

// An optimistic route template retains a decoded RSC element tree: React
// elements holding closures over the prefetch response and over client
// references. Its retained heap is not derivable from the value, and the wire
// size of the prefetch payload it came from says nothing about it, so the
// prefetch cache's byte budget has no honest analogue here. Bound by entry
// count instead.
//
// 50 matches the sibling client-side count bounds in the app browser entry
// (MAX_VISITED_RESPONSE_CACHE_SIZE, MAX_HISTORY_STATE_SNAPSHOTS). It buys much
// more coverage here than it does there, because templates are keyed by route id
// and mounted-slot header rather than by URL: every `/blog/[slug]` visit in a
// session shares a single entry. 50 distinct route patterns therefore covers the
// reachable-shell working set of a realistic session, while capping the amount
// of decoded RSC material a long-lived tab can retain.
export const MAX_OPTIMISTIC_ROUTE_TEMPLATES = 50;

// Source records are short strings ("this prefetch cache entry already produced
// a template"), so they are individually cheap — but they are keyed per prefetch
// cache key, i.e. per URL, so unlike the templates they really do grow with
// every distinct URL a session prefetches.
//
// A record stops being useful the moment its prefetch entry is evicted from the
// byte-bounded prefetch cache, but a source key cannot be parsed back to its
// cache key unambiguously (the cache key itself embeds the `\0` separator), so
// an LRU count bound approximates that lifetime rather than tracking it exactly.
// Held roughly 10x the template bound because many URLs collapse onto one route
// id: dropping a record costs at most one redundant local re-decode of an
// already-fetched payload — never a network request — but churning records would
// pay that cost on every navigation.
export const MAX_OPTIMISTIC_ROUTE_TEMPLATE_SOURCES = 512;

/**
 * Owns the three collections behind optimistic route shells and the invariant
 * that couples them: a source record may only exist while the template it
 * produced is still present. The learning pass skips any prefetch source
 * already recorded here, so a source record left behind after its template was
 * evicted would permanently suppress relearning for that route.
 *
 * Losing a template is safe: the navigation falls through to the authoritative
 * fetch with no optimistic paint, which is the same path taken before any
 * template has been learned.
 */
export class OptimisticRouteTemplateStore {
  readonly #templates = new Map<string, OptimisticRouteTemplate>();
  // sourceKey -> the template key that source produced.
  readonly #sources = new Map<string, string>();
  // In-flight learning promises, deduped by source key. Deliberately unbounded:
  // every entry deletes itself when its promise settles, and a pass can only
  // add one entry per live prefetch cache entry, so size is already bounded by
  // the byte-bounded prefetch cache. Evicting one would also be unsafe — it
  // would let a concurrent pass start a duplicate decode and stop it from
  // awaiting the in-flight one, and the dropped promise's settle handler would
  // then delete the newer entry registered under the same key.
  readonly #learning = new Map<string, Promise<void>>();

  get templates(): ReadonlyMap<string, OptimisticRouteTemplate> {
    return this.#templates;
  }

  get sources(): ReadonlyMap<string, string> {
    return this.#sources;
  }

  get pendingLearningCount(): number {
    return this.#learning.size;
  }

  /** True when this prefetch source has already been learned or is in flight. */
  hasLearnedOrPendingSource(sourceKey: string): boolean {
    return this.#sources.has(sourceKey) || this.#learning.has(sourceKey);
  }

  pendingLearning(): Promise<void>[] {
    return [...this.#learning.values()];
  }

  trackLearning(sourceKey: string, promise: Promise<void>): void {
    this.#learning.set(sourceKey, promise);
  }

  settleLearning(sourceKey: string): void {
    this.#learning.delete(sourceKey);
  }

  /** Records a learned template together with the prefetch source that produced it. */
  learn(options: {
    interceptionContext: string | null;
    mountedSlotsHeader: string | null;
    sourceKey: string;
    template: OptimisticRouteTemplate;
  }): void {
    const templateKey = getOptimisticRouteTemplateKey({
      interceptionContext: options.interceptionContext,
      mountedSlotsHeader: options.mountedSlotsHeader,
      routeId: options.template.routeId,
    });
    // Delete-then-set moves the key to the end of Map insertion order, which is
    // how the prefetch cache tracks recency too (see touchPrefetchCacheEntry).
    this.#templates.delete(templateKey);
    this.#templates.set(templateKey, options.template);
    this.#sources.delete(options.sourceKey);
    this.#sources.set(options.sourceKey, templateKey);
    this.#evict();
  }

  resolveNavigationPayload(options: {
    basePath: string;
    href: string;
    interceptionContext: string | null;
    mountedSlotsHeader: string | null;
    routeManifest: RouteManifest;
  }): OptimisticNavigationPayload | null {
    const payload = resolveOptimisticNavigationPayload({
      ...options,
      templates: this.#templates,
    });
    if (payload === null) return null;

    const templateKey = getOptimisticRouteTemplateKey({
      interceptionContext: options.interceptionContext,
      mountedSlotsHeader: options.mountedSlotsHeader,
      routeId: payload.template.routeId,
    });
    if (this.#templates.delete(templateKey)) {
      this.#templates.set(templateKey, payload.template);
    }
    return payload;
  }

  clear(): void {
    this.#templates.clear();
    this.#sources.clear();
    this.#learning.clear();
  }

  #evict(): void {
    while (this.#templates.size > MAX_OPTIMISTIC_ROUTE_TEMPLATES) {
      const oldestTemplateKey = this.#templates.keys().next().value;
      if (oldestTemplateKey === undefined) break;
      this.#templates.delete(oldestTemplateKey);
      // Drop the source records that produced the evicted template so the route
      // stays relearnable from the prefetch cache.
      for (const [sourceKey, templateKey] of this.#sources) {
        if (templateKey === oldestTemplateKey) this.#sources.delete(sourceKey);
      }
    }

    // Sources outlive their templates N:1 (many URLs, one route id), so they
    // need their own bound. Dropping one only risks a redundant re-decode; it
    // can never leave a template unreachable.
    while (this.#sources.size > MAX_OPTIMISTIC_ROUTE_TEMPLATE_SOURCES) {
      const oldestSourceKey = this.#sources.keys().next().value;
      if (oldestSourceKey === undefined) break;
      this.#sources.delete(oldestSourceKey);
    }
  }
}
