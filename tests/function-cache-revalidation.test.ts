import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cacheLife,
  cacheTag,
  revalidateTag,
  MemoryCacheHandler,
  setCacheHandler,
  unstable_cache,
} from "../packages/vinext/src/shims/cache.js";
import { registerCachedFunction } from "../packages/vinext/src/shims/cache-runtime.js";
import {
  setFunctionCacheRevalidationMode,
  _drainPendingRevalidations,
} from "../packages/vinext/src/shims/cache-request-state.js";
import { cookies } from "../packages/vinext/src/shims/headers.js";
import { getRootParam } from "../packages/vinext/src/shims/root-params.js";
import {
  createRequestContext,
  runWithRequestContext,
} from "../packages/vinext/src/shims/unified-request-context.js";

afterEach(() => {
  setCacheHandler(new MemoryCacheHandler());
  vi.restoreAllMocks();
});

describe("function cache revalidation", () => {
  it.each(["fresh", "hit", undefined])(
    "accepts custom handler hit state %s for both cache APIs",
    async (cacheState) => {
      const handler = new MemoryCacheHandler();
      setCacheHandler({
        async get(key, ctx) {
          const entry = await handler.get(key, ctx);
          return entry ? { ...entry, cacheState } : null;
        },
        set: handler.set.bind(handler),
        revalidateTag: handler.revalidateTag.bind(handler),
      });
      for (const api of ["use-cache", "unstable-cache"]) {
        const source = vi.fn(async () => "fresh");
        const cached =
          api === "use-cache"
            ? registerCachedFunction(source, `custom-hit:${cacheState}`)
            : unstable_cache(source, [`custom-hit:${cacheState}`]);
        await runWithRequestContext(createRequestContext(), async () => {
          expect(await cached()).toBe("fresh");
          expect(await cached()).toBe("fresh");
        });
        expect(source).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(["foreground", "background"] as const)(
    "preserves %s requirements after a dynamic API read",
    async (initialMode) => {
      const pending: Promise<unknown>[] = [];
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      setCacheHandler({
        async get(key) {
          return {
            lastModified: 1,
            cacheState: "stale",
            value: {
              kind: "FETCH",
              data: {
                headers: {},
                body: JSON.stringify(key.startsWith("unstable_cache:") ? { v: "stale" } : "stale"),
                url: key,
              },
              revalidate: 60,
            },
          };
        },
        async set() {},
        async revalidateTag() {},
      });
      try {
        for (const api of ["use-cache", "unstable-cache"]) {
          const source = async () => {
            if (initialMode === "background") throw new Error("refresh unavailable");
            return "fresh";
          };
          const cached =
            api === "use-cache"
              ? registerCachedFunction(source, `dynamic-read:${initialMode}`)
              : unstable_cache(source, [`dynamic-read:${initialMode}`]);
          const value = await runWithRequestContext(
            createRequestContext({
              functionCacheRevalidationMode: initialMode,
              headersContext: { headers: new Headers(), cookies: new Map() },
              executionContext: {
                waitUntil(promise) {
                  pending.push(promise);
                },
              },
            }),
            async () => {
              setFunctionCacheRevalidationMode("auto");
              await cookies();
              return cached();
            },
          );
          expect(value).toBe(initialMode === "foreground" ? "fresh" : "stale");
        }
        await Promise.all(pending);
        if (initialMode === "background") expect(errorLog).toHaveBeenCalledTimes(2);
        else expect(errorLog).not.toHaveBeenCalled();
      } finally {
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(["fresh", "stale"])(
    "disables a persisted %s unstable_cache entry when revalidate becomes zero",
    async (state) => {
      const handler = new MemoryCacheHandler();
      setCacheHandler(handler);
      const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
      const keyParts = [`disabled-unstable:${state}`];
      const pending: Promise<unknown>[] = [];
      const read = (fn: () => Promise<number>) =>
        runWithRequestContext(
          createRequestContext({
            functionCacheRevalidationMode: "background",
            executionContext: {
              waitUntil(promise) {
                pending.push(promise);
              },
            },
          }),
          fn,
        );
      const old = unstable_cache(async () => 1, keyParts, { revalidate: 1 });
      expect(await read(old)).toBe(1);
      if (state === "stale") clock.mockReturnValue(102_000);
      let value = 1;
      const uncached = unstable_cache(async () => ++value, keyParts, { revalidate: 0 });
      try {
        expect(await read(uncached)).toBe(2);
        const writes = vi.spyOn(handler, "set");
        expect(await read(uncached)).toBe(3);
        expect(writes).not.toHaveBeenCalled();
        expect(pending).toHaveLength(0);
      } finally {
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(["use-cache", "unstable-cache", "new-tag", "soft-tag"])(
    "does not resurrect a tag invalidated during a %s refresh",
    async (api) => {
      setCacheHandler(new MemoryCacheHandler());
      const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
      const tag = `inflight-invalidation:${api}`;
      let source = "initial";
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = () => {};
      const refreshStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const fn = async () => {
        const value = source;
        if (api !== "unstable-cache") {
          cacheLife({ revalidate: 1, expire: 60 });
          if (api !== "soft-tag" && (api !== "new-tag" || value !== "initial")) cacheTag(tag);
        }
        if (value === "obsolete") {
          started();
          await gate;
        }
        return value;
      };
      const cached =
        api !== "unstable-cache"
          ? registerCachedFunction(fn, tag)
          : unstable_cache(fn, [tag], { revalidate: 1, tags: [tag] });
      const pending: Promise<unknown>[] = [];
      const read = () =>
        runWithRequestContext(
          createRequestContext({
            functionCacheRevalidationMode: "background",
            currentFetchSoftTags: api === "soft-tag" ? [tag] : [],
            executionContext: {
              waitUntil(promise) {
                pending.push(promise);
              },
            },
          }),
          cached,
        );
      expect(await read()).toBe("initial");
      clock.mockReturnValue(102_000);
      source = "obsolete";
      expect(await read()).toBe("initial");
      await refreshStarted;
      try {
        source = "current";
        clock.mockReturnValue(103_000);
        await runWithRequestContext(createRequestContext(), async () => {
          revalidateTag(tag);
          await _drainPendingRevalidations();
        });
        clock.mockReturnValue(104_000);
        release();
        await Promise.all(pending);
        expect(await read()).toBe("current");
      } finally {
        release();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(["use-cache", "unstable-cache"])(
    "repairs a superseded background %s write that completes late",
    async (api) => {
      const handler = new MemoryCacheHandler();
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = () => {};
      const backgroundStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const set = handler.set.bind(handler);
      vi.spyOn(handler, "set").mockImplementation(async (key, data, ctx) => {
        if (data?.kind === "FETCH" && data.data.body.includes("background")) {
          started();
          await gate;
        }
        await set(key, data, ctx);
      });
      setCacheHandler(handler);
      const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
      let value = "initial";
      const source = async () => {
        const captured = value;
        if (api === "use-cache") cacheLife({ revalidate: 1, expire: 60 });
        return captured;
      };
      const cached =
        api === "use-cache"
          ? registerCachedFunction(source, `ordered-refresh:${api}`)
          : unstable_cache(source, [`ordered-refresh:${api}`], { revalidate: 1 });
      const pending: Promise<unknown>[] = [];
      const read = (mode: "foreground" | "background") =>
        runWithRequestContext(
          createRequestContext({
            functionCacheRevalidationMode: mode,
            executionContext: {
              waitUntil(promise) {
                pending.push(promise);
              },
            },
          }),
          cached,
        );

      expect(await read("background")).toBe("initial");
      clock.mockReturnValue(102_000);
      value = "background";
      expect(await read("background")).toBe("initial");
      await backgroundStarted;
      value = "foreground";
      clock.mockReturnValue(103_000);
      const foreground = read("foreground");
      try {
        expect(await foreground).toBe("foreground");
        release();
        await Promise.all(pending);
        expect(await read("background")).toBe("foreground");
      } finally {
        release();
        await Promise.allSettled([...pending, foreground]);
      }
    },
  );

  it.each(["use-cache", "unstable-cache"])(
    "allows another background %s refresh after a foreground fill supersedes a hung refresh",
    async (api) => {
      const handler = new MemoryCacheHandler();
      setCacheHandler(handler);
      const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
      let value = "initial";
      let releaseOrphan = () => {};
      const orphanGate = new Promise<void>((resolve) => {
        releaseOrphan = resolve;
      });
      let markOrphanStarted = () => {};
      const orphanStarted = new Promise<void>((resolve) => {
        markOrphanStarted = resolve;
      });
      let markLatestStarted = () => {};
      const latestStarted = new Promise<void>((resolve) => {
        markLatestStarted = resolve;
      });
      const source = async () => {
        const captured = value;
        if (api === "use-cache") cacheLife({ revalidate: 1, expire: 60 });
        if (captured === "orphan") {
          markOrphanStarted();
          await orphanGate;
        } else if (captured === "latest") {
          markLatestStarted();
        }
        return captured;
      };
      const cached =
        api === "use-cache"
          ? registerCachedFunction(source, `hung-refresh:${api}`)
          : unstable_cache(source, [`hung-refresh:${api}`], { revalidate: 1 });
      const pending: Promise<unknown>[] = [];
      const read = (mode: "foreground" | "background") =>
        runWithRequestContext(
          createRequestContext({
            functionCacheRevalidationMode: mode,
            executionContext: {
              waitUntil(promise) {
                pending.push(promise);
              },
            },
          }),
          cached,
        );

      expect(await read("background")).toBe("initial");
      clock.mockReturnValue(102_000);
      value = "orphan";
      expect(await read("background")).toBe("initial");
      await orphanStarted;

      value = "foreground";
      clock.mockReturnValue(103_000);
      expect(await read("foreground")).toBe("foreground");

      value = "latest";
      clock.mockReturnValue(105_000);
      try {
        expect(await read("background")).toBe("foreground");
        expect(
          await Promise.race([
            latestStarted.then(() => "started"),
            new Promise((resolve) => setImmediate(() => resolve("blocked"))),
          ]),
        ).toBe("started");
      } finally {
        releaseOrphan();
        await Promise.allSettled(pending);
      }
    },
  );

  it("replays a joined foreground use-cache fill's metadata in every caller context", async () => {
    setCacheHandler({
      async get(key) {
        return {
          lastModified: 1,
          cacheState: "expired",
          value: {
            kind: "FETCH",
            data: { headers: {}, body: JSON.stringify("expired"), url: key },
            tags: [],
            revalidate: 1,
          },
        };
      },
      async set() {},
      async revalidateTag() {},
    });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const source = vi.fn(async () => {
      cacheLife({ stale: 3, revalidate: 7, expire: 70 });
      cacheTag("joined-fill");
      markStarted();
      await gate;
      return "fresh";
    });
    const cached = registerCachedFunction(source, "joined-foreground-metadata");
    const contexts = [createRequestContext(), createRequestContext()];
    const first = runWithRequestContext(contexts[0], cached);
    await started;
    const second = runWithRequestContext(contexts[1], cached);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["fresh", "fresh"]);
    expect(source).toHaveBeenCalledTimes(1);
    for (const context of contexts) {
      expect(context.requestScopedCacheLife).toEqual({ stale: 3, revalidate: 7, expire: 70 });
      expect(context.currentRequestTags).toEqual(["joined-fill"]);
    }
  });

  it("prevents an older root-param refresh from overwriting a newer expanded-key fill", async () => {
    const memory = new MemoryCacheHandler();
    const coarseKey = "use-cache:root-param-generation-family";
    const langKey = coarseKey + ':root-params:[["lang","en"]]';
    const expandedKey = coarseKey + ':root-params:[["lang","en"],["tenant","acme"]]';
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    await memory.set(
      coarseKey,
      {
        kind: "FETCH",
        data: { headers: { "x-vinext-use-cache-root-params": "1" }, body: "", url: coarseKey },
        tags: ["__vinext_use_cache_root_param__:lang"],
        revalidate: 1,
      },
      { cacheControl: { revalidate: 1, expire: 60 } },
    );
    await memory.set(
      langKey,
      {
        kind: "FETCH",
        data: { headers: {}, body: JSON.stringify("initial"), url: langKey },
        revalidate: 1,
      },
      { cacheControl: { revalidate: 1, expire: 60 } },
    );
    let delayObsoleteRedirect = false;
    let releaseObsoleteWrite = () => {};
    const obsoleteWriteGate = new Promise<void>((resolve) => {
      releaseObsoleteWrite = resolve;
    });
    let markObsoleteWriteStarted = () => {};
    const obsoleteWriteStarted = new Promise<void>((resolve) => {
      markObsoleteWriteStarted = resolve;
    });
    setCacheHandler({
      get: (key, context) => memory.get(key, context),
      async set(key, data, context) {
        if (key === coarseKey && delayObsoleteRedirect) {
          delayObsoleteRedirect = false;
          markObsoleteWriteStarted();
          await obsoleteWriteGate;
        }
        await memory.set(key, data, context);
      },
      revalidateTag: (tags) => memory.revalidateTag(tags),
    });
    const known = Reflect.get(
      globalThis,
      Symbol.for("vinext.cacheRuntime.knownRootParamsByFunctionId"),
    ) as Map<string, Set<string>>;
    known.delete("root-param-generation-family");
    let value = "obsolete";
    const source = async () => {
      await getRootParam("lang");
      await getRootParam("tenant");
      cacheLife({ revalidate: 1, expire: 60 });
      const captured = value;
      if (captured === "obsolete") delayObsoleteRedirect = true;
      return captured;
    };
    const cached = registerCachedFunction(source, "root-param-generation-family");
    const pending: Promise<unknown>[] = [];
    const read = (mode: "foreground" | "background") =>
      runWithRequestContext(
        createRequestContext({
          rootParams: { lang: "en", tenant: "acme" },
          functionCacheRevalidationMode: mode,
          executionContext: {
            waitUntil(promise) {
              pending.push(promise);
            },
          },
        }),
        cached,
      );

    clock.mockReturnValue(102_000);
    expect(await read("background")).toBe("initial");
    await obsoleteWriteStarted;
    value = "current";
    clock.mockReturnValue(103_000);
    expect(await read("foreground")).toBe("current");
    releaseObsoleteWrite();
    await Promise.all(pending);
    const finalEntry = await memory.get(expandedKey, { kind: "FETCH" });
    expect(finalEntry?.value?.kind).toBe("FETCH");
    expect(finalEntry?.value?.kind === "FETCH" && JSON.parse(finalEntry.value.data.body)).toBe(
      "current",
    );
  });

  it("follows a persisted stale root-param redirect and deduplicates refreshes", async () => {
    const handler = new MemoryCacheHandler();
    setCacheHandler(handler);
    const coarseKey = "use-cache:persisted-stale-root-redirect";
    const specificKey = coarseKey + ':root-params:[["lang","en"]]';
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    await handler.set(
      coarseKey,
      {
        kind: "FETCH",
        data: { headers: { "x-vinext-use-cache-root-params": "1" }, body: "", url: coarseKey },
        tags: ["__vinext_use_cache_root_param__:lang"],
        revalidate: 1,
      },
      { cacheControl: { revalidate: 1, expire: 60 } },
    );
    await handler.set(
      specificKey,
      {
        kind: "FETCH",
        data: { headers: {}, body: JSON.stringify("stale-en"), url: specificKey },
        revalidate: 1,
      },
      { cacheControl: { revalidate: 1, expire: 60 } },
    );
    clock.mockReturnValue(102_000);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = vi.fn(async () => {
      const lang = await getRootParam("lang");
      await gate;
      return `fresh-${String(lang)}`;
    });
    const cached = registerCachedFunction(source, "persisted-stale-root-redirect");
    const pending: Promise<unknown>[] = [];
    const read = () =>
      runWithRequestContext(
        createRequestContext({
          rootParams: { lang: "en" },
          functionCacheRevalidationMode: "background",
          executionContext: {
            waitUntil(promise) {
              pending.push(promise);
            },
          },
        }),
        cached,
      );
    const reads = [read(), read()];
    try {
      expect(
        await Promise.race([
          Promise.all(reads),
          new Promise((resolve) => setImmediate(() => resolve("blocked"))),
        ]),
      ).toEqual(["stale-en", "stale-en"]);
      expect(source).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await Promise.allSettled([...reads, ...pending]);
    }
    expect(await read()).toBe("fresh-en");
  });

  it.each([false, true])(
    "discards a stale value when refresh changes to revalidate zero (root params: %s)",
    async (rootParams) => {
      const handler = new MemoryCacheHandler();
      setCacheHandler(handler);
      const writes = vi.spyOn(handler, "set");
      const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
      let dynamic = false;
      let calls = 0;
      const cached = registerCachedFunction(async () => {
        if (rootParams) await getRootParam("lang");
        cacheLife({ revalidate: dynamic ? 0 : 1, expire: 60 });
        return ++calls;
      }, `becomes-dynamic:${rootParams}`);
      const pending: Promise<unknown>[] = [];
      const read = () =>
        runWithRequestContext(
          createRequestContext({
            rootParams: { lang: "en" },
            functionCacheRevalidationMode: "background",
            executionContext: {
              waitUntil(promise) {
                pending.push(promise);
              },
            },
          }),
          cached,
        );
      expect(await read()).toBe(1);
      clock.mockReturnValue(102_000);
      dynamic = true;
      try {
        expect(await read()).toBe(1);
        await Promise.all(pending);
        writes.mockClear();
        expect(await read()).toBe(3);
        expect(await read()).toBe(4);
        expect(writes).not.toHaveBeenCalled();
      } finally {
        await Promise.allSettled(pending);
      }
    },
  );
});
