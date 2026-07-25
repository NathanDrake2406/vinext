import { describe, expect, it } from "vite-plus/test";
import {
  MAX_TRAVERSAL_CACHE_TTL,
  VISITED_RESPONSE_CACHE_TTL,
  createVisitedResponseCacheEntry,
  isVisitedResponseCacheEntryFresh,
  VisitedResponseCache,
} from "../packages/vinext/src/server/app-visited-response-cache.js";
import { AppElementsWire } from "../packages/vinext/src/server/app-elements.js";
import type { CachedRscResponse } from "../packages/vinext/src/shims/navigation.js";
import type { AppElements } from "../packages/vinext/src/server/app-elements.js";

function createCachedResponse(overrides: Partial<CachedRscResponse> = {}): CachedRscResponse {
  return {
    buffer: new TextEncoder().encode("flight").buffer,
    contentType: "text/x-component",
    paramsHeader: null,
    renderedPathAndSearch: null,
    url: "/dynamic.rsc",
    ...overrides,
  };
}

describe("visited response cache freshness", () => {
  it("uses per-response dynamic stale time for regular navigations", () => {
    // Ported from Next.js: test/e2e/app-dir/segment-cache/staleness/segment-cache-per-page-dynamic-stale-time.test.ts
    const now = 1_000_000;
    const entry = createVisitedResponseCacheEntry({
      now,
      mountedSlotsHeader: "slot:source",
      params: {},
      response: createCachedResponse({ dynamicStaleTimeSeconds: 10 }),
    });

    expect(entry.expiresAt).toBe(now + 10_000);
    expect(entry.mountedSlotsHeader).toBe("slot:source");
    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "navigate",
        now: now + 9_999,
      }),
    ).toBe(true);
    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "navigate",
        now: now + 10_000,
      }),
    ).toBe(false);
  });

  it("falls back to the default visited response TTL without server metadata", () => {
    const now = 1_000_000;
    const entry = createVisitedResponseCacheEntry({
      now,
      params: {},
      response: createCachedResponse(),
    });

    expect(entry.expiresAt).toBe(now + VISITED_RESPONSE_CACHE_TTL);
  });

  it("uses the configured dynamic fallback without server metadata", () => {
    const now = 1_000_000;
    const entry = createVisitedResponseCacheEntry({
      fallbackTtlMs: 0,
      now,
      params: {},
      response: createCachedResponse(),
    });

    expect(entry.expiresAt).toBe(now);
    expect(isVisitedResponseCacheEntryFresh(entry, { navigationKind: "navigate", now })).toBe(
      false,
    );
  });

  it("inherits the expiry carried by a consumed prefetch snapshot", () => {
    const now = 1_000_000;
    const prefetchedExpiresAt = now + 30_000;
    const entry = createVisitedResponseCacheEntry({
      fallbackTtlMs: 0,
      now,
      params: {},
      response: createCachedResponse({
        dynamicStaleTimeSeconds: 0,
        expiresAt: prefetchedExpiresAt,
      }),
    });

    expect(entry.expiresAt).toBe(prefetchedExpiresAt);
    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "navigate",
        now: now + 29_999,
      }),
    ).toBe(true);
  });

  it("retains decoded committed elements for partial Flight payload reuse", () => {
    // Ported from Next.js: test/e2e/app-dir/app-client-cache/client-cache.original.test.ts
    const elements = { "page:/dynamic": "cached page" } satisfies AppElements;
    const entry = createVisitedResponseCacheEntry({
      elements,
      now: 1_000_000,
      params: {},
      response: createCachedResponse(),
    });

    expect(entry.elements).toBe(elements);
  });

  it("keeps traversal restores independent from dynamic stale expiry", () => {
    const now = 1_000_000;
    const entry = createVisitedResponseCacheEntry({
      now,
      params: {},
      response: createCachedResponse({ dynamicStaleTimeSeconds: 10 }),
    });

    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "traverse",
        now: now + 20_000,
      }),
    ).toBe(true);
    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "traverse",
        now: now + MAX_TRAVERSAL_CACHE_TTL,
      }),
    ).toBe(false);
  });

  it("never reuses visited responses for refresh navigations", () => {
    const now = 1_000_000;
    const entry = createVisitedResponseCacheEntry({
      now,
      params: {},
      response: createCachedResponse({ dynamicStaleTimeSeconds: 60 }),
    });

    expect(
      isVisitedResponseCacheEntryFresh(entry, {
        navigationKind: "refresh",
        now,
      }),
    ).toBe(false);
  });

  it("deletes a normalized _rsc variant after failed visited reuse so navigation can fall through", () => {
    const cache = new VisitedResponseCache();
    const entry = createVisitedResponseCacheEntry({
      now: 1_000_000,
      params: {},
      response: createCachedResponse(),
    });
    const storedKey = AppElementsWire.encodeCacheKey(
      "/nextjs-compat/client-cache/1?tab=latest&_rsc=old",
      null,
    );
    cache.set(storedKey, entry);

    expect(cache.find("/nextjs-compat/client-cache/1?tab=latest&_rsc=new", null)).toEqual({
      cacheKey: storedKey,
      entry,
    });

    expect(cache.deleteMatch("/nextjs-compat/client-cache/1?tab=latest&_rsc=new", null)).toBe(true);
    expect(cache.has(storedKey)).toBe(false);
    expect(cache.find("/nextjs-compat/client-cache/1?tab=latest&_rsc=new", null)).toBeNull();
  });
});

/**
 * Count `new URL(...)` constructions while `run` executes. The visited-response
 * cache only parses URLs to normalize away the `_rsc` cache-busting param, so
 * this counter is a direct probe for "did the lookup re-normalize every stored
 * key" — the linear scan this index replaced normalized once per entry.
 */
function countUrlConstructions<T>(run: () => T): { result: T; urlConstructions: number } {
  const NativeURL = globalThis.URL;
  let urlConstructions = 0;
  class CountingURL extends NativeURL {
    constructor(url: string | URL, base?: string | URL) {
      super(url, base);
      urlConstructions += 1;
    }
  }

  globalThis.URL = CountingURL as unknown as typeof URL;
  try {
    return { result: run(), urlConstructions };
  } finally {
    globalThis.URL = NativeURL;
  }
}

describe("visited response cache lookup", () => {
  function storeEntry(
    cache: VisitedResponseCache,
    rscUrl: string,
    interceptionContext: string | null = null,
  ): ReturnType<typeof createVisitedResponseCacheEntry> {
    const entry = createVisitedResponseCacheEntry({
      now: 1_000_000,
      params: {},
      response: createCachedResponse({ url: rscUrl }),
    });
    cache.set(AppElementsWire.encodeCacheKey(rscUrl, interceptionContext), entry);
    return entry;
  }

  it("resolves a cache-busted entry from a clean-URL lookup without scanning the cache", () => {
    const cache = new VisitedResponseCache();
    // Unrelated entries. Stored URLs carry the `_rsc` digest of the variant
    // headers, so the removed fallback had to re-normalize every one of these
    // to decide they do not match.
    for (let index = 0; index < 200; index += 1) {
      storeEntry(cache, `/feed/${index}?_rsc=${index}`);
    }
    const target = storeEntry(cache, "/photos/42?tab=latest&_rsc=stored");

    const { result, urlConstructions } = countUrlConstructions(() =>
      cache.find("/photos/42?tab=latest", null),
    );

    expect(result).toEqual({
      cacheKey: "/photos/42?tab=latest&_rsc=stored",
      entry: target,
    });
    // Exactly one: the lookup URL itself. The removed scan measured 202 here
    // (the lookup URL plus all 201 stored keys).
    expect(urlConstructions).toBe(1);
  });

  it("returns null for a genuine miss without scanning the cache", () => {
    const cache = new VisitedResponseCache();
    for (let index = 0; index < 200; index += 1) {
      storeEntry(cache, `/feed/${index}?_rsc=${index}`);
    }

    const { result, urlConstructions } = countUrlConstructions(() =>
      cache.find("/photos/42?tab=latest", null),
    );

    expect(result).toBeNull();
    expect(urlConstructions).toBe(1);
  });

  it("keeps normalized siblings separated by interception context", () => {
    const cache = new VisitedResponseCache();
    const feedEntry = storeEntry(cache, "/photos/42?_rsc=feed", "/feed");
    const galleryEntry = storeEntry(cache, "/photos/42?_rsc=gallery", "/gallery");

    expect(cache.find("/photos/42", "/feed")).toEqual({
      cacheKey: AppElementsWire.encodeCacheKey("/photos/42?_rsc=feed", "/feed"),
      entry: feedEntry,
    });
    expect(cache.find("/photos/42", "/gallery")).toEqual({
      cacheKey: AppElementsWire.encodeCacheKey("/photos/42?_rsc=gallery", "/gallery"),
      entry: galleryEntry,
    });
    expect(cache.find("/photos/42", null)).toBeNull();
  });

  it("prefers the exact key over a normalized sibling, then the oldest sibling", () => {
    const cache = new VisitedResponseCache();
    const oldest = storeEntry(cache, "/photos/42?_rsc=old");
    const exact = storeEntry(cache, "/photos/42?_rsc=exact");

    expect(cache.find("/photos/42?_rsc=exact", null)?.entry).toBe(exact);
    // No exact key for this digest, so the oldest sibling wins — the same entry
    // the previous insertion-order scan returned.
    expect(cache.find("/photos/42?_rsc=other", null)?.entry).toBe(oldest);
  });

  it("follows insertion order after an LRU promotion", () => {
    const cache = new VisitedResponseCache();
    const first = storeEntry(cache, "/photos/42?_rsc=first");
    const second = storeEntry(cache, "/photos/42?_rsc=second");

    // LRU promotion is delete + re-set, which moves the key to the end of both
    // the entry map and the normalized group.
    cache.delete("/photos/42?_rsc=first");
    cache.set("/photos/42?_rsc=first", first);

    expect([...cache.keys()]).toEqual(["/photos/42?_rsc=second", "/photos/42?_rsc=first"]);
    expect(cache.find("/photos/42?_rsc=other", null)?.entry).toBe(second);
  });

  it("re-setting an existing key keeps its FIFO position", () => {
    const cache = new VisitedResponseCache();
    storeEntry(cache, "/a?_rsc=1");
    storeEntry(cache, "/b?_rsc=1");
    const replacement = storeEntry(cache, "/a?_rsc=1");

    expect([...cache.keys()]).toEqual(["/a?_rsc=1", "/b?_rsc=1"]);
    expect(cache.get("/a?_rsc=1")).toBe(replacement);
    expect(cache.find("/a", null)?.entry).toBe(replacement);
  });

  it("drops normalized index rows when entries are evicted or cleared", () => {
    const cache = new VisitedResponseCache();
    storeEntry(cache, "/photos/42?_rsc=stored");

    // FIFO eviction in the caller deletes by key; the index must follow.
    const oldest = cache.keys().next().value;
    expect(oldest).toBe("/photos/42?_rsc=stored");
    expect(cache.delete("/photos/42?_rsc=stored")).toBe(true);
    expect(cache.size).toBe(0);
    expect(cache.find("/photos/42", null)).toBeNull();
    expect(cache.delete("/photos/42?_rsc=stored")).toBe(false);

    storeEntry(cache, "/photos/42?_rsc=stored");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.find("/photos/42", null)).toBeNull();
  });

  it("still matches keys that cannot be normalized only by their exact form", () => {
    const cache = new VisitedResponseCache();
    // `new URL()` rejects this, so it is indexed nowhere and only an exact
    // lookup can find it — matching the pre-index scan, which skipped keys that
    // failed to normalize.
    const entry = storeEntry(cache, "http://");

    expect(cache.find("http://", null)?.entry).toBe(entry);
    expect(cache.find("/photos/42", null)).toBeNull();
    expect(cache.deleteMatch("http://", null)).toBe(true);
    expect(cache.size).toBe(0);
  });
});
