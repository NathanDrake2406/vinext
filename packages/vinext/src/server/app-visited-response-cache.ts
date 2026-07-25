import { resolveCachedRscResponseExpiresAt, type CachedRscResponse } from "vinext/shims/navigation";
import { AppElementsWire, type AppElements } from "./app-elements.js";
import { stripRscCacheBustingSearchParam } from "./app-rsc-cache-busting.js";

type VisitedResponseCacheNavigationKind = "navigate" | "refresh" | "traverse";

export type VisitedResponseCacheEntry = {
  createdAt: number;
  elements?: AppElements;
  expiresAt: number;
  mountedSlotsHeader: string | null;
  params: Record<string, string | string[]>;
  response: CachedRscResponse;
};

export const VISITED_RESPONSE_CACHE_TTL = 5 * 60_000;
export const MAX_TRAVERSAL_CACHE_TTL = 30 * 60_000;

export function createVisitedResponseCacheEntry(options: {
  elements?: AppElements;
  fallbackTtlMs?: number;
  now: number;
  mountedSlotsHeader?: string | null;
  params: Record<string, string | string[]>;
  response: CachedRscResponse;
}): VisitedResponseCacheEntry {
  return {
    createdAt: options.now,
    ...(options.elements ? { elements: options.elements } : {}),
    expiresAt: resolveCachedRscResponseExpiresAt(
      options.now,
      options.response,
      options.fallbackTtlMs ?? VISITED_RESPONSE_CACHE_TTL,
    ),
    mountedSlotsHeader: options.mountedSlotsHeader ?? null,
    params: options.params,
    response: options.response,
  };
}

export function isVisitedResponseCacheEntryFresh(
  entry: VisitedResponseCacheEntry,
  options: {
    navigationKind: VisitedResponseCacheNavigationKind;
    now: number;
  },
): boolean {
  if (options.navigationKind === "refresh") {
    return false;
  }

  if (options.navigationKind === "traverse") {
    return options.now - entry.createdAt < MAX_TRAVERSAL_CACHE_TTL;
  }

  return entry.expiresAt > options.now;
}

function normalizeVisitedResponseCacheLookupUrl(rscUrl: string): string | null {
  try {
    const url = new URL(rscUrl, "http://vinext.local");
    stripRscCacheBustingSearchParam(url);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function parseVisitedResponseCacheKey(cacheKey: string): {
  interceptionContext: string | null;
  rscUrl: string;
} {
  const separatorIndex = cacheKey.indexOf("\0");
  if (separatorIndex === -1) {
    return { interceptionContext: null, rscUrl: cacheKey };
  }
  return {
    interceptionContext: cacheKey.slice(separatorIndex + 1),
    rscUrl: cacheKey.slice(0, separatorIndex),
  };
}

/**
 * Group key for entries that a normalized lookup treats as interchangeable:
 * the stored URL with the internal RSC cache-busting param stripped, plus the
 * interception context. `encodeCacheKey`/`parseVisitedResponseCacheKey` are
 * exact inverses (a normalized `pathname + search` can never contain a raw NUL,
 * since `new URL()` percent-encodes it), so this encoding is injective over
 * (normalized url, interception context) and grouping never conflates two
 * contexts — including the `null` vs `""` distinction the previous linear scan
 * compared strictly.
 */
function encodeNormalizedGroupKey(
  rscUrl: string,
  interceptionContext: string | null,
): string | null {
  const normalized = normalizeVisitedResponseCacheLookupUrl(rscUrl);
  if (normalized === null) return null;
  return AppElementsWire.encodeCacheKey(normalized, interceptionContext);
}

/**
 * Visited-response snapshots keyed by the exact RSC request URL, with a
 * normalized secondary index so a lookup never has to scan.
 *
 * Entries are stored under the URL the request actually used, which carries the
 * `_rsc` cache-busting digest of the variant headers. The same target path
 * therefore lands under different keys depending on where the navigation came
 * from (mounted parallel slots feed the digest) or on whether the payload was
 * consumed from a prefetch. Lookups must still find those siblings, so the
 * index maps the cache-busting-stripped form to the exact keys in it.
 *
 * The index is owned by this class precisely because it must never drift from
 * the entry map: FIFO eviction, LRU promotion (delete + re-set), and cache
 * clearing all live in the caller, and a bare `Map` plus a sidecar index would
 * leak index rows on every eviction. Per-group key sets are insertion-ordered
 * and empty groups are dropped, so the index mirrors `Map` insertion order and
 * stays bounded by the entry count.
 *
 * The exposed surface is deliberately the `Map` subset callers already use;
 * `keys()` yields insertion order, which the caller's FIFO eviction depends on.
 */
export class VisitedResponseCache {
  readonly #entries = new Map<string, VisitedResponseCacheEntry>();
  readonly #normalizedGroups = new Map<string, Set<string>>();

  get size(): number {
    return this.#entries.size;
  }

  keys(): IterableIterator<string> {
    return this.#entries.keys();
  }

  get(cacheKey: string): VisitedResponseCacheEntry | undefined {
    return this.#entries.get(cacheKey);
  }

  has(cacheKey: string): boolean {
    return this.#entries.has(cacheKey);
  }

  set(cacheKey: string, entry: VisitedResponseCacheEntry): void {
    // Re-setting an existing key keeps its `Map` insertion position, so the
    // group must not be reordered either — only genuinely new keys are indexed.
    if (!this.#entries.has(cacheKey)) {
      const source = parseVisitedResponseCacheKey(cacheKey);
      const groupKey = encodeNormalizedGroupKey(source.rscUrl, source.interceptionContext);
      if (groupKey !== null) {
        const group = this.#normalizedGroups.get(groupKey);
        if (group === undefined) {
          this.#normalizedGroups.set(groupKey, new Set([cacheKey]));
        } else {
          group.add(cacheKey);
        }
      }
    }
    this.#entries.set(cacheKey, entry);
  }

  delete(cacheKey: string): boolean {
    if (!this.#entries.delete(cacheKey)) return false;

    const source = parseVisitedResponseCacheKey(cacheKey);
    const groupKey = encodeNormalizedGroupKey(source.rscUrl, source.interceptionContext);
    if (groupKey === null) return true;

    const group = this.#normalizedGroups.get(groupKey);
    if (group === undefined) return true;
    group.delete(cacheKey);
    if (group.size === 0) {
      this.#normalizedGroups.delete(groupKey);
    }
    return true;
  }

  clear(): void {
    this.#entries.clear();
    this.#normalizedGroups.clear();
  }

  /**
   * Exact key first, then the oldest sibling sharing the normalized form —
   * the same preference order (and the same "first match in insertion order")
   * the previous linear scan produced.
   */
  find(
    rscUrl: string,
    interceptionContext: string | null,
  ): { cacheKey: string; entry: VisitedResponseCacheEntry } | null {
    const exactCacheKey = AppElementsWire.encodeCacheKey(rscUrl, interceptionContext);
    const exactEntry = this.#entries.get(exactCacheKey);
    if (exactEntry) {
      return { cacheKey: exactCacheKey, entry: exactEntry };
    }

    const groupKey = encodeNormalizedGroupKey(rscUrl, interceptionContext);
    if (groupKey === null) return null;

    const group = this.#normalizedGroups.get(groupKey);
    if (group === undefined) return null;

    for (const cacheKey of group) {
      const entry = this.#entries.get(cacheKey);
      // Group membership is maintained alongside `#entries`, so the first
      // member is always live; the guard keeps the return type honest.
      if (entry !== undefined) {
        return { cacheKey, entry };
      }
    }

    return null;
  }

  /** Delete whatever `find` would return for this lookup, if anything. */
  deleteMatch(rscUrl: string, interceptionContext: string | null): boolean {
    const match = this.find(rscUrl, interceptionContext);
    if (!match) return false;
    return this.delete(match.cacheKey);
  }
}
