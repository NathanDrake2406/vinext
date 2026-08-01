/**
 * Race-condition tests for the cache-invalidation write guard.
 *
 * These cover the window where a cache producer (patched fetch, unstable_cache,
 * "use cache", or an ISR regeneration) is in flight while revalidateTag /
 * updateTag / revalidatePath completes: the older producer's write must not
 * restore the invalidated entry, post-invalidation callers must not join
 * pre-invalidation in-flight producers, and handler writes that land late must
 * be refused by the handler boundary itself.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { KVCacheHandler } from "../packages/cloudflare/src/cache/kv-data-adapter.runtime.js";

let requestCount = 0;
const defaultFetchMockImplementation = async (input: string | URL | Request) => {
  requestCount++;
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return new Response(JSON.stringify({ url, count: requestCount }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const fetchMock = vi.fn(defaultFetchMockImplementation);

// Stub globalThis.fetch BEFORE importing modules that capture it
vi.stubGlobal("fetch", fetchMock);

const {
  withFetchCache,
  setCurrentFetchSoftTags,
  setRefreshStaleFetchesInForeground,
  _resetPendingRefetches,
} = await import("../packages/vinext/src/shims/fetch-cache.js");
const {
  getCacheHandler,
  revalidatePath,
  revalidateTag,
  MemoryCacheHandler,
  setCacheHandler,
  unstable_cache,
  cacheTag,
} = await import("../packages/vinext/src/shims/cache.js");
const { registerCachedFunction } = await import("../packages/vinext/src/shims/cache-runtime.js");
const {
  isrSet,
  buildPagesCacheValue,
  triggerBackgroundRegeneration,
  coalesceOnDemandRevalidation,
} = await import("../packages/vinext/src/server/isr-cache.js");
const { createRequestContext, runWithRequestContext } =
  await import("../packages/vinext/src/shims/unified-request-context.js");
const { _markIsrRenderStart } = await import("../packages/vinext/src/shims/cache-request-state.js");

function memoryStoreSize(): number {
  const handler = getCacheHandler() as unknown as { store?: Map<string, unknown> };
  return handler.store?.size ?? 0;
}

function expireAllEntries(): void {
  const handler = getCacheHandler() as unknown as { store?: Map<string, unknown> };
  if (!handler.store) return;
  for (const entry of handler.store.values()) {
    (entry as { revalidateAt: number | null }).revalidateAt = Date.now() - 1000;
  }
}

async function waitUntil(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Minimal KV namespace mock backed by a shared store. */
function createSharedMockKV(store: Map<string, string>) {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true }),
  };
}

describe("cache invalidation race guards", () => {
  let cleanup: (() => void) | null = null;

  function startNewFetchCacheScope(): void {
    cleanup?.();
    cleanup = withFetchCache();
  }

  beforeEach(() => {
    requestCount = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(defaultFetchMockImplementation);
    setCacheHandler(new MemoryCacheHandler());
    _resetPendingRefetches();
    cleanup = withFetchCache();
  });

  it("wraps legacy cache handlers with same-process invalidation fencing", async () => {
    const set = vi.fn(async () => {});
    const unsupported = {
      async get() {
        return null;
      },
      set,
      async revalidateTag() {},
    } satisfies Parameters<typeof setCacheHandler>[0];

    setCacheHandler(unsupported);
    const guardSince = Date.now();
    await getCacheHandler().revalidateTag("posts");
    await getCacheHandler().set(
      "legacy-guarded-entry",
      {
        kind: "FETCH",
        data: { headers: {}, body: "stale", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { tags: ["posts"], guardSince },
    );

    expect(set).not.toHaveBeenCalled();
  });

  it("re-invalidates a legacy handler when its write commits after invalidation", async () => {
    let markSetStarted!: () => void;
    const setStarted = new Promise<void>((resolve) => (markSetStarted = resolve));
    let releaseSet!: () => void;
    const setGate = new Promise<void>((resolve) => (releaseSet = resolve));
    const revalidateTag = vi.fn(async () => {});
    setCacheHandler({
      async get() {
        return null;
      },
      async set() {
        markSetStarted();
        await setGate;
      },
      revalidateTag,
    });
    const guardSince = Date.now();

    const write = getCacheHandler().set(
      "legacy-late-entry",
      {
        kind: "FETCH",
        data: { headers: {}, body: "stale", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { tags: ["posts"], guardSince },
    );
    await setStarted;
    await getCacheHandler().revalidateTag("posts");
    releaseSet();
    await write;

    expect(revalidateTag).toHaveBeenNthCalledWith(1, "posts", undefined);
    expect(revalidateTag).toHaveBeenNthCalledWith(2, ["posts"]);
  });

  it("rolls back a legacy fallback marker when backend invalidation fails", async () => {
    const set = vi.fn(async () => {});
    const invalidationError = new Error("invalidation failed");
    setCacheHandler({
      async get() {
        return null;
      },
      set,
      async revalidateTag() {
        throw invalidationError;
      },
    });
    const guardSince = Date.now();

    await expect(getCacheHandler().revalidateTag("posts")).rejects.toBe(invalidationError);
    await getCacheHandler().set(
      "legacy-after-failed-invalidation",
      {
        kind: "FETCH",
        data: { headers: {}, body: "fresh", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { tags: ["posts"], guardSince },
    );

    expect(set).toHaveBeenCalledOnce();
  });

  it("keeps memory entry age at commit time while retaining the producer guard", async () => {
    const guardSince = Date.now() - 1_000;
    await getCacheHandler().set(
      "guarded-memory-entry",
      {
        kind: "FETCH",
        data: { headers: {}, body: "fresh", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { tags: ["posts"], guardSince },
    );

    await expect(getCacheHandler().get("guarded-memory-entry")).resolves.toMatchObject({
      lastModified: expect.any(Number),
    });
    expect((await getCacheHandler().get("guarded-memory-entry"))!.lastModified).toBeGreaterThan(
      guardSince,
    );
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  // ── Fetch writes ────────────────────────────────────────────────────

  it("suppresses the cache write from a fetch that started before revalidateTag completed", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );

    const inFlight = fetch("https://api.example.com/race-tagged", {
      next: { tags: ["posts"] },
    });
    await waitUntil(() => fetchMock.mock.calls.length === 1);

    await Promise.resolve(revalidateTag("posts"));

    resolveFetch(new Response(JSON.stringify({ count: 42 }), { status: 200 }));
    const response = await inFlight;
    expect((await response.json()).count).toBe(42);

    // The pre-invalidation producer's write must have been suppressed.
    expect(memoryStoreSize()).toBe(0);

    // A later request must not see the restored entry — it refetches.
    fetchMock.mockImplementation(defaultFetchMockImplementation);
    startNewFetchCacheScope();
    const res2 = await fetch("https://api.example.com/race-tagged", {
      next: { tags: ["posts"] },
    });
    expect((await res2.json()).count).toBe(1);
  });

  it("suppresses the write from an untagged fetch when revalidatePath completes mid-flight", async () => {
    setCurrentFetchSoftTags(["_N_T_/posts/hello"]);
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );

    const inFlight = fetch("https://api.example.com/race-untagged", {
      next: { revalidate: 3600 },
    });
    await waitUntil(() => fetchMock.mock.calls.length === 1);

    await Promise.resolve(revalidatePath("/posts/hello"));

    resolveFetch(new Response(JSON.stringify({ count: 42 }), { status: 200 }));
    await inFlight;

    expect(memoryStoreSize()).toBe(0);

    // A later request with the same soft tag refetches instead of hitting
    // the restored entry.
    fetchMock.mockImplementation(defaultFetchMockImplementation);
    startNewFetchCacheScope();
    setCurrentFetchSoftTags(["_N_T_/posts/hello"]);
    const res2 = await fetch("https://api.example.com/race-untagged", {
      next: { revalidate: 3600 },
    });
    expect((await res2.json()).count).toBe(1);
  });

  it("uses the original producer start when a cacheable fetch joins request memoization", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );

    const originalProducer = fetch("https://api.example.com/race-deduped");
    await waitUntil(() => fetchMock.mock.calls.length === 1);

    await Promise.resolve(revalidateTag("posts"));
    const cacheableJoin = fetch("https://api.example.com/race-deduped", {
      next: { tags: ["posts"] },
    });

    resolveFetch(new Response("fresh response"));
    await Promise.all([originalProducer, cacheableJoin]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(memoryStoreSize()).toBe(0);
  });

  it("suppresses on overlapping invalidations but allows disjoint ones", async () => {
    // Overlapping invalidation suppresses the write.
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );

    const inFlight = fetch("https://api.example.com/race-overlap", {
      next: { tags: ["posts"] },
    });
    await waitUntil(() => fetchMock.mock.calls.length === 1);

    await Promise.resolve(revalidateTag("users"));
    await Promise.resolve(revalidateTag("posts"));
    const postsInvalidatedAt = await getCacheHandler().getInvalidationVersion?.(["posts"]);
    if (postsInvalidatedAt !== undefined) {
      await waitUntil(() => Date.now() > postsInvalidatedAt);
    }

    resolveFetch(new Response(JSON.stringify({ count: 42 }), { status: 200 }));
    await inFlight;
    expect(memoryStoreSize()).toBe(0);

    // Disjoint-only invalidation must NOT suppress the write.
    let resolveFetch2!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch2 = resolve)),
    );
    const inFlight2 = fetch("https://api.example.com/race-disjoint", {
      next: { tags: ["posts"] },
    });
    await waitUntil(() => fetchMock.mock.calls.length === 2);

    await Promise.resolve(revalidateTag("users"));

    resolveFetch2(new Response(JSON.stringify({ count: 7 }), { status: 200 }));
    const res2 = await inFlight2;
    expect((await res2.json()).count).toBe(7);

    // The entry survived the disjoint invalidation: the next fetch is a HIT.
    fetchMock.mockImplementation(defaultFetchMockImplementation);
    startNewFetchCacheScope();
    const res3 = await fetch("https://api.example.com/race-disjoint", {
      next: { tags: ["posts"] },
    });
    expect((await res3.json()).count).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses the write when the handler's delayed set lands after the invalidation", async () => {
    const inner = new MemoryCacheHandler();
    let setStarted!: () => void;
    const setStartedPromise = new Promise<void>((resolve) => (setStarted = resolve));
    let releaseSet!: () => void;
    const setGate = new Promise<void>((resolve) => (releaseSet = resolve));

    setCacheHandler({
      get: (key, ctx) => inner.get(key, ctx),
      set: async (key, value, ctx) => {
        setStarted();
        await setGate;
        await inner.set(key, value, ctx);
      },
      getInvalidationVersion: (tags) => inner.getInvalidationVersion(tags),
      revalidateTag: (tags) => inner.revalidateTag(tags),
    });

    // The upstream fetch resolves, but the handler's write is still gated when
    // the invalidation completes.
    const res = await fetch("https://api.example.com/race-slowset", {
      next: { revalidate: 60, tags: ["posts"] },
    });
    expect((await res.json()).count).toBe(1);
    await setStartedPromise;

    await Promise.resolve(revalidateTag("posts"));

    releaseSet();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The guard runs inside the handler after the gate, sees the marker, and
    // refuses: the next fetch refetches fresh data.
    startNewFetchCacheScope();
    const res2 = await fetch("https://api.example.com/race-slowset", {
      next: { revalidate: 60, tags: ["posts"] },
    });
    expect((await res2.json()).count).toBe(2);
  });

  it("suppresses a foreground stale refresh whose fetch completed after the invalidation", async () => {
    // Populate the cache.
    await fetch("https://api.example.com/race-foreground", {
      next: { revalidate: 1, tags: ["posts"] },
    });
    expireAllEntries();
    startNewFetchCacheScope();
    setRefreshStaleFetchesInForeground(true);

    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );

    const staleRes = fetch("https://api.example.com/race-foreground", {
      next: { revalidate: 1, tags: ["posts"] },
    });
    await waitUntil(() => fetchMock.mock.calls.length === 2);

    await Promise.resolve(revalidateTag("posts"));

    resolveFetch(new Response(JSON.stringify({ count: 42 }), { status: 200 }));
    const response = await staleRes;
    expect((await response.json()).count).toBe(42);

    // The pre-invalidation refresh must not restore the entry: a later
    // request refetches fresh data instead of hitting {count: 42}.
    fetchMock.mockImplementation(defaultFetchMockImplementation);
    startNewFetchCacheScope();
    const res2 = await fetch("https://api.example.com/race-foreground", {
      next: { revalidate: 1, tags: ["posts"] },
    });
    expect((await res2.json()).count).toBe(2);
  });

  it("joins an in-flight refetch on disjoint invalidation but replaces it on intersecting", async () => {
    // Populate the cache with an untagged entry (revalidate: 1): the refetch
    // below carries its tags via the request's soft tags, so an intersecting
    // invalidation disqualifies the refetch without deleting the entry.
    await fetch("https://api.example.com/race-join", { next: { revalidate: 1 } });
    expireAllEntries();
    startNewFetchCacheScope();

    const gates: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          gates.push(resolve);
        }),
    );

    // First stale hit starts a background refetch (gated), tagged via the
    // request's soft tags.
    setCurrentFetchSoftTags(["posts"]);
    const stale1 = await fetch("https://api.example.com/race-join", {
      next: { revalidate: 1 },
    });
    expect((await stale1.json()).count).toBe(1);
    await waitUntil(() => gates.length === 1);

    // Disjoint invalidation: the refetch survives and a post-invalidation
    // stale hit joins it instead of starting fresh work.
    await Promise.resolve(revalidateTag("users"));
    startNewFetchCacheScope();

    const stale2 = await fetch("https://api.example.com/race-join", {
      next: { revalidate: 1 },
    });
    expect((await stale2.json()).count).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gates.length).toBe(1);

    // Intersecting invalidation disqualifies the in-flight refetch: the next
    // stale hit replaces it with fresh work.
    await Promise.resolve(revalidateTag("posts"));
    startNewFetchCacheScope();

    const stale3 = await fetch("https://api.example.com/race-join", {
      next: { revalidate: 1 },
    });
    expect((await stale3.json()).count).toBe(1);
    await waitUntil(() => gates.length === 2);

    // The pre-invalidation refetch's write is refused; the replacement's
    // write lands.
    gates[0]!(new Response(JSON.stringify({ count: 11 }), { status: 200 }));
    gates[1]!(new Response(JSON.stringify({ count: 22 }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    startNewFetchCacheScope();
    const res = await fetch("https://api.example.com/race-join", {
      next: { revalidate: 1 },
    });
    expect((await res.json()).count).toBe(22);
  });

  it("propagates producer failures even when an invalidation completes mid-flight", async () => {
    // The producer fails while the invalidation completes. Attach the
    // rejection handler immediately so the failure is not reported as an
    // unhandled rejection while we wait for the invalidation.
    fetchMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    const failing = fetch("https://api.example.com/race-fail", {
      next: { revalidate: 60, tags: ["posts"] },
    }).then(
      () => "resolved",
      (err: unknown) => err,
    );
    await waitUntil(() => fetchMock.mock.calls.length === 1);

    await Promise.resolve(revalidateTag("posts"));

    const outcome = await failing;
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toBe("network down");

    // The failure must not leave any partial entry behind.
    expect(memoryStoreSize()).toBe(0);

    fetchMock.mockImplementation(defaultFetchMockImplementation);
    startNewFetchCacheScope();
    const res = await fetch("https://api.example.com/race-fail", {
      next: { revalidate: 60, tags: ["posts"] },
    });
    expect((await res.json()).count).toBe(1);
  });

  // ── unstable_cache / "use cache" writes ─────────────────────────────

  it("suppresses the write from an unstable_cache execution that started before revalidateTag completed", async () => {
    let callCount = 0;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    let resolveFn!: () => void;
    const fnGate = new Promise<void>((resolve) => (resolveFn = resolve));

    const cachedFn = unstable_cache(
      async () => {
        callCount++;
        started();
        await fnGate;
        return { count: callCount };
      },
      ["race"],
      { tags: ["posts"], revalidate: 60 },
    );

    const run = cachedFn();
    await startedPromise;

    await Promise.resolve(revalidateTag("posts"));

    resolveFn();
    const result = await run;
    expect(result).toEqual({ count: 1 });

    // The pre-invalidation write must have been suppressed.
    expect(memoryStoreSize()).toBe(0);

    // The next call re-executes instead of hitting a restored entry.
    const res2 = await cachedFn();
    expect(res2).toEqual({ count: 2 });
  });

  it('suppresses the write from a "use cache" execution that started before revalidateTag completed', async () => {
    let callCount = 0;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    let resolveFn!: () => void;
    const fnGate = new Promise<void>((resolve) => (resolveFn = resolve));

    const cached = registerCachedFunction(async () => {
      cacheTag("race-posts");
      callCount++;
      started();
      await fnGate;
      return { count: callCount };
    }, "race:use-cache");

    const run = cached();
    await startedPromise;

    await Promise.resolve(revalidateTag("race-posts"));

    resolveFn();
    const result = await run;
    expect(result).toEqual({ count: 1 });

    expect(memoryStoreSize()).toBe(0);

    const res2 = await cached();
    expect(res2).toEqual({ count: 2 });
  });

  // ── ISR writes and regeneration joins ───────────────────────────────

  it("suppresses isrSet from a request that began before the invalidation", async () => {
    await runWithRequestContext(createRequestContext(), async () => {
      // The render begins before any invalidation.
      _markIsrRenderStart();

      // A disjoint invalidation does not suppress the write.
      await Promise.resolve(revalidateTag("unrelated"));
      await isrSet("pages:/race-isr", buildPagesCacheValue("html1", {}), 60, ["race-page"]);
      expect(memoryStoreSize()).toBe(1);

      // An intersecting invalidation after the render start suppresses the
      // write: the request's render-start timestamp predates it.
      await Promise.resolve(revalidateTag("race-page"));
      await isrSet("pages:/race-isr2", buildPagesCacheValue("html2", {}), 60, ["race-page"]);
      expect(memoryStoreSize()).toBe(1);
    });
  });

  it("replaces a pre-invalidation background regeneration from a post-invalidation trigger", async () => {
    // The regeneration's disqualifier set is the request's soft tags.
    setCurrentFetchSoftTags(["race-page"]);

    let renderCount = 0;
    let releaseRender1!: () => void;
    const gate1 = new Promise<void>((resolve) => (releaseRender1 = resolve));
    const renderFn = async () => {
      renderCount++;
      await gate1;
    };

    triggerBackgroundRegeneration("race-regen", renderFn);
    await waitUntil(() => renderCount === 1);

    // Same-side trigger joins (coalescing unchanged).
    triggerBackgroundRegeneration("race-regen", renderFn);
    expect(renderCount).toBe(1);

    // A post-invalidation trigger must replace the stale in-flight
    // regeneration instead of joining it.
    await Promise.resolve(revalidateTag("race-page"));
    triggerBackgroundRegeneration("race-regen", renderFn);
    await waitUntil(() => renderCount === 2);

    releaseRender1();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("replaces a pre-invalidation on-demand regeneration from a post-invalidation call", async () => {
    let renderCount = 0;
    let releaseRender1!: () => void;
    const gate1 = new Promise<void>((resolve) => (releaseRender1 = resolve));
    const renderFn = async () => {
      const id = ++renderCount;
      await gate1;
      return id;
    };

    const first = coalesceOnDemandRevalidation("race-ondemand", renderFn, ["race-page"]);
    await waitUntil(() => renderCount === 1);

    // Same-side call joins: it resolves with the in-flight render's result.
    const joined = coalesceOnDemandRevalidation("race-ondemand", renderFn, ["race-page"]);

    // A post-invalidation call must get fresh work, not the stale join.
    await Promise.resolve(revalidateTag("race-page"));
    const second = coalesceOnDemandRevalidation("race-ondemand", renderFn, ["race-page"]);
    await waitUntil(() => renderCount === 2);

    releaseRender1();
    expect(await first).toBe(1);
    expect(await joined).toBe(1);
    expect(await second).toBe(2);
  });

  it("replaces a background regeneration when version lookup fails", async () => {
    const previousHandler = getCacheHandler();
    const lookupError = new Error("version lookup failed");
    setCacheHandler({
      get: previousHandler.get.bind(previousHandler),
      set: previousHandler.set.bind(previousHandler),
      revalidateTag: previousHandler.revalidateTag.bind(previousHandler),
      async getInvalidationVersion() {
        throw lookupError;
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setCurrentFetchSoftTags(["race-page"]);

    let renderCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const renderFn = async () => {
      renderCount++;
      await gate;
    };

    triggerBackgroundRegeneration("race-version-error", renderFn);
    await waitUntil(() => renderCount === 1);
    triggerBackgroundRegeneration("race-version-error", renderFn);
    await waitUntil(() => renderCount === 2);

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("replacing the in-flight producer"),
      lookupError,
    );
    consoleError.mockRestore();
  });

  // ── Cross-isolate KV writes ─────────────────────────────────────────

  it("refuses a producer write in one isolate after an invalidation in another", async () => {
    // Two handler instances over one KV namespace simulate two Worker
    // isolates sharing backend storage.
    const store = new Map<string, string>();
    const kv = createSharedMockKV(store);
    const handlerA = new KVCacheHandler(kv as never, { appPrefix: "race" });
    const handlerB = new KVCacheHandler(kv as never, { appPrefix: "race" });

    // Producer B began its work before the invalidation.
    const guardSince = Date.now() - 50;

    // The invalidation lands in isolate A, writing the marker to shared KV.
    await handlerA.revalidateTag("posts");

    // B's write must be refused: its guard reads the marker fresh from KV,
    // bypassing its (empty) local tag cache.
    await handlerB.set(
      "race-posts-value",
      {
        kind: "FETCH",
        data: { headers: {}, body: "42", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { fetchCache: true, tags: ["posts"], guardSince },
    );
    expect(await handlerB.get("race-posts-value")).toBeNull();

    // A producer that begins after the invalidation writes normally. Wait a
    // tick so its guard timestamp strictly exceeds the marker (equal
    // timestamps are conservatively treated as pre-invalidation).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await handlerB.set(
      "race-posts-value",
      {
        kind: "FETCH",
        data: { headers: {}, body: "43", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { fetchCache: true, tags: ["posts"], guardSince: Date.now() },
    );
    const entry = await handlerB.get("race-posts-value");
    expect(entry?.value?.kind).toBe("FETCH");
  });

  it("reads shared KV invalidation markers before joining producers", async () => {
    const store = new Map<string, string>();
    const kv = createSharedMockKV(store);
    const handlerA = new KVCacheHandler(kv as never, { appPrefix: "race" });
    const handlerB = new KVCacheHandler(kv as never, { appPrefix: "race" });

    await expect(handlerB.getInvalidationVersion(["posts"])).resolves.toBe(0);
    await handlerA.revalidateTag("posts");
    await expect(handlerB.getInvalidationVersion(["posts"])).resolves.toBeGreaterThan(0);
  });

  it("preserves a same-isolate invalidation that lands during a KV marker read", async () => {
    const store = new Map<string, string>();
    store.set(
      "cache:race-read",
      JSON.stringify({
        value: {
          kind: "FETCH",
          data: { headers: {}, body: "stale", url: "https://api.example.com/posts" },
          tags: ["posts"],
          revalidate: 60,
        },
        tags: ["posts"],
        lastModified: Date.now() - 1_000,
        revalidateAt: null,
      }),
    );
    const baseKv = createSharedMockKV(store);
    let markMarkerRead!: () => void;
    const markerRead = new Promise<void>((resolve) => (markMarkerRead = resolve));
    let releaseMarkerRead!: () => void;
    const markerReadGate = new Promise<void>((resolve) => (releaseMarkerRead = resolve));
    const kv = {
      ...baseKv,
      async get(key: string) {
        const value = await baseKv.get(key);
        if (key === "__tag:posts") {
          markMarkerRead();
          await markerReadGate;
        }
        return value;
      },
    };
    const handler = new KVCacheHandler(kv as never);

    const read = handler.get("race-read");
    await markerRead;
    await handler.revalidateTag("posts");
    releaseMarkerRead();

    await expect(read).resolves.toBeNull();
  });

  it("ages guarded KV entries from commit time rather than producer start", async () => {
    vi.useFakeTimers();
    try {
      const store = new Map<string, string>();
      const handler = new KVCacheHandler(createSharedMockKV(store) as never);
      vi.setSystemTime(1_000);
      const guardSince = Date.now();

      // Simulate a producer whose one-second revalidation window elapsed while
      // the upstream response was still being produced.
      vi.setSystemTime(3_000);
      await handler.set(
        "slow-fetch",
        {
          kind: "FETCH",
          data: { headers: {}, body: "fresh", url: "https://api.example.com/slow" },
          tags: ["posts"],
          revalidate: 1,
        },
        { tags: ["posts"], guardSince, revalidate: 1 },
      );

      const entry = await handler.get("slow-fetch", { revalidate: 1 });
      expect(entry?.cacheState).toBeUndefined();
      expect(entry?.lastModified).toBe(3_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a late KV put at read time when invalidation races the marker check", async () => {
    const store = new Map<string, string>();
    const baseKv = createSharedMockKV(store);
    let markerRead!: () => void;
    const markerReadPromise = new Promise<void>((resolve) => (markerRead = resolve));
    let releaseMarkerRead!: () => void;
    const markerReadGate = new Promise<void>((resolve) => (releaseMarkerRead = resolve));
    let blockMarkerRead = true;

    const kv = {
      ...baseKv,
      get: async (key: string) => {
        const value = await baseKv.get(key);
        if (key === "__tag:posts" && blockMarkerRead) {
          blockMarkerRead = false;
          markerRead();
          await markerReadGate;
        }
        return value;
      },
    };
    const writer = new KVCacheHandler(kv as never);
    const reader = new KVCacheHandler(kv as never);
    const guardSince = Date.now() - 1_000;

    const write = writer.set(
      "race-check-to-put",
      {
        kind: "FETCH",
        data: { headers: {}, body: "stale", url: "https://api.example.com/posts" },
        tags: ["posts"],
        revalidate: 60,
      },
      { tags: ["posts"], guardSince },
    );

    // The handler has observed no marker. Invalidate before releasing its
    // marker read so the entry put lands after the invalidation.
    await markerReadPromise;
    await writer.revalidateTag("posts");
    releaseMarkerRead();
    await write;

    const stored = JSON.parse(store.get("cache:race-check-to-put")!);
    expect(stored.lastModified).toBeGreaterThan(guardSince);
    expect(stored.invalidationGuardSince).toBe(guardSince);

    // A fresh handler must reject the late entry through ordinary read-time
    // validation against the persisted invalidation marker.
    await expect(reader.get("race-check-to-put")).resolves.toBeNull();
  });
});
