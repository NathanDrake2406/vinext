import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cacheLife,
  MemoryCacheHandler,
  setCacheHandler,
  unstable_cache,
} from "../packages/vinext/src/shims/cache.js";
import { registerCachedFunction } from "../packages/vinext/src/shims/cache-runtime.js";
import { setFunctionCacheRevalidationMode } from "../packages/vinext/src/shims/cache-request-state.js";
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
