/**
 * CloudflareCdnCacheAdapter tests.
 *
 * Covers the edge-managed adapter backed by the Workers Cache (ctx.cache):
 *  - get null / set no-op / ownsBackgroundRevalidation false
 *  - buildResponseHeaders emits a cacheable Cache-Control + Cache-Tag
 *  - revalidateTag purges via ctx.cache.purge({ tags })
 *  - getCdnCacheAdapter() only selects the Cloudflare adapter when it is
 *    explicitly configured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { CloudflareCdnCacheAdapter } from "../packages/cloudflare/src/cache/cdn-adapter.runtime.js";
import {
  getCdnCacheAdapter,
  setCdnCacheAdapter,
  DefaultCdnCacheAdapter,
} from "../packages/vinext/src/shims/cdn-cache.js";
import { runWithExecutionContext } from "../packages/vinext/src/shims/request-context.js";
import { finalizeAppPageHtmlCacheResponse } from "../packages/vinext/src/server/app-page-cache.js";

const CDN_KEY = Symbol.for("vinext.cdnCacheAdapter");

function resetActiveAdapter(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[CDN_KEY];
}

beforeEach(resetActiveAdapter);
afterEach(resetActiveAdapter);

// ─── Adapter behavior ────────────────────────────────────────────────────

describe("CloudflareCdnCacheAdapter", () => {
  const adapter = new CloudflareCdnCacheAdapter();

  it("does not own background revalidation (the edge re-requests origin)", () => {
    expect(adapter.ownsBackgroundRevalidation).toBe(false);
  });

  it("get returns null so the origin always renders fresh", async () => {
    expect(await adapter.get()).toBeNull();
  });

  it("set is a no-op (platform caches the response, not an origin store)", async () => {
    await expect(adapter.set("k", null)).resolves.toBeUndefined();
  });

  it("carries SWR on CDN-Cache-Control (public + max-age) and revalidates the browser", () => {
    // A value-less `stale-while-revalidate` is normalized to an explicit window
    // (Cloudflare ignores the bare directive — RFC 5861 requires a value).
    expect(
      adapter.buildResponseHeaders({ cacheControl: "s-maxage=60, stale-while-revalidate" }),
    ).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=31536000",
    });
  });

  it("adds a Cache-Tag header from the page tags", () => {
    const headers = adapter.buildResponseHeaders({
      cacheControl: "s-maxage=60",
      tags: ["/blog", "_N_T_/blog", "posts"],
    });
    expect(headers["Cache-Tag"]).toBe("/blog,_N_T_/blog,posts");
    expect(headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
    expect(headers["CDN-Cache-Control"]).toBe("public, max-age=60");
  });

  it("skips tags containing the comma separator or that are too long", () => {
    const headers = adapter.buildResponseHeaders({
      cacheControl: "s-maxage=60",
      tags: ["a,b", "x".repeat(2000), "ok"],
    });
    expect(headers["Cache-Tag"]).toBe("ok");
  });

  it("returns only no-store (no CDN-Cache-Control) when there is no cacheable policy", () => {
    expect(adapter.buildResponseHeaders({ cacheControl: "" })).toEqual({
      "Cache-Control": "no-store",
    });
  });

  it("passes a non-cacheable policy through without promoting it to the edge", () => {
    // revalidate=0 / gssp paths produce no-store / private — must never become
    // a CDN-Cache-Control directive (which would cache an uncacheable response).
    for (const cc of [
      "no-store, must-revalidate",
      "private, no-cache, no-store, max-age=0, must-revalidate",
    ]) {
      const headers = adapter.buildResponseHeaders({ cacheControl: cc, tags: ["x"] });
      expect(headers).toEqual({
        "Cache-Control": cc,
        "CDN-Cache-Control": null,
        "Cloudflare-CDN-Cache-Control": null,
        "Cache-Tag": null,
      });
    }
  });

  it("revalidateTag purges the Workers Cache by tag via ctx.cache.purge", async () => {
    const purge = vi.fn(async () => {});
    await runWithExecutionContext({ waitUntil() {}, cache: { purge } }, async () => {
      await adapter.revalidateTag(["posts", "_N_T_/blog"]);
    });
    expect(purge).toHaveBeenCalledWith({ tags: ["posts", "_N_T_/blog"] });
  });

  it("revalidateTag normalizes a single tag to an array", async () => {
    const purge = vi.fn(async () => {});
    await runWithExecutionContext({ waitUntil() {}, cache: { purge } }, async () => {
      await adapter.revalidateTag("posts");
    });
    expect(purge).toHaveBeenCalledWith({ tags: ["posts"] });
  });

  it("revalidateTag is a no-op when the Workers Cache is absent (e.g. Node dev)", async () => {
    // No runWithExecutionContext scope → getRequestExecutionContext() is null.
    await expect(adapter.revalidateTag("posts")).resolves.toBeUndefined();
  });

  it("revalidateTag does not purge for an empty tag set", async () => {
    const purge = vi.fn(async () => {});
    await runWithExecutionContext({ waitUntil() {}, cache: { purge } }, async () => {
      await adapter.revalidateTag([]);
    });
    expect(purge).not.toHaveBeenCalled();
  });
});

// ─── Adapter selection ────────────────────────────────────────────────────

describe("CDN cache adapter selection", () => {
  it("uses the default adapter even when ctx.cache exists", async () => {
    resetActiveAdapter();

    const adapter = await runWithExecutionContext(
      { waitUntil() {}, cache: { async purge() {} } },
      async () => getCdnCacheAdapter(),
    );
    expect(adapter).toBeInstanceOf(DefaultCdnCacheAdapter);
  });

  it("uses the default adapter when ctx.cache is absent", () => {
    resetActiveAdapter();
    expect(getCdnCacheAdapter()).toBeInstanceOf(DefaultCdnCacheAdapter);
  });

  it("uses an explicitly configured adapter", async () => {
    resetActiveAdapter();
    const explicit = new CloudflareCdnCacheAdapter();
    setCdnCacheAdapter(explicit);

    const adapter = await runWithExecutionContext(
      { waitUntil() {}, cache: { async purge() {} } },
      async () => getCdnCacheAdapter(),
    );
    expect(adapter).toBe(explicit);
  });
});

// ─── Shared-cache safety for streamed App Router renders ─────────────────

/**
 * An App Router page can only be proven non-dynamic after its stream drains: a
 * Suspended server component may read cookies()/headers() long after the shell
 * has flushed. The Cloudflare adapter has no origin store, so its response
 * headers alone decide whether the *shared* edge cache stores the page — and a
 * header already sent cannot be taken back.
 *
 * The behaviour under test is therefore the response contract: a render that
 * turns out dynamic must never leave the origin advertising itself as
 * edge-cacheable, because the edge keys on URL and would replay one user's
 * personalized HTML to the next.
 */
describe("streamed App Router responses under the Cloudflare CDN adapter", () => {
  function finalize(options: {
    dynamicUsed: boolean;
    /** A `cacheLife()` resolved while the stream was still draining. */
    lateCacheLife?: { revalidate?: number; expire?: number };
    /**
     * Simulates middleware overriding the provisional policy: the merge stamps
     * its value on the response, and the render lifecycle threads the same
     * value to the finalizer (middleware owns Cache-Control).
     */
    middlewareCacheControl?: string;
  }): Promise<Response> {
    return Promise.resolve(
      finalizeAppPageHtmlCacheResponse(
        new Response("<h1>user=alice</h1>", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            // The provisional ISR policy, computed before the stream drained.
            "Cache-Control":
              options.middlewareCacheControl ?? "s-maxage=60, stale-while-revalidate=540",
          },
        }),
        {
          capturedRscDataPromise: null,
          cleanPathname: "/account",
          // Both resolve only once the stream has been consumed.
          consumeDynamicUsage: () => options.dynamicUsed,
          getRequestCacheLife: () => options.lateCacheLife ?? null,
          getPageTags: () => ["/account"],
          isrHtmlKey: (pathname) => `html:${pathname}`,
          isrRscKey: (pathname) => `rsc:${pathname}`,
          async isrSet() {},
          middlewareCacheControl: options.middlewareCacheControl ?? null,
          revalidateSeconds: 60,
          expireSeconds: 600,
        },
      ),
    );
  }

  beforeEach(() => setCdnCacheAdapter(new CloudflareCdnCacheAdapter()));

  it("does not advertise a late-dynamic render as edge-cacheable", async () => {
    const response = await finalize({ dynamicUsed: true });

    // Nothing shared may store this: it contains one user's session data.
    expect(response.headers.get("CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store, must-revalidate");
    // The body is still delivered to the user who requested it.
    await expect(response.text()).resolves.toBe("<h1>user=alice</h1>");
  });

  it("still lets a proven-static render be cached by the edge", async () => {
    const response = await finalize({ dynamicUsed: false });

    expect(response.headers.get("CDN-Cache-Control")).toBe(
      "public, max-age=60, stale-while-revalidate=540",
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    await expect(response.text()).resolves.toBe("<h1>user=alice</h1>");
  });

  it("advertises the lifetime the render resolved to, not the one it started with", async () => {
    // The route declared 60s, but a cacheLife() during the stream tightened it
    // to 10s. Advertising 60s would let the edge serve stale bytes 50s longer
    // than the page asked for.
    const response = await finalize({
      dynamicUsed: false,
      lateCacheLife: { revalidate: 10, expire: 100 },
    });

    expect(response.headers.get("CDN-Cache-Control")).toBe(
      "public, max-age=10, stale-while-revalidate=90",
    );
  });

  it("keeps a middleware no-store even when the render proves static", async () => {
    // Middleware owns Cache-Control (mergeMiddlewareResponseHeaders). A page it
    // marked non-cacheable must not be promoted to the shared edge cache just
    // because the render itself never touched a request API.
    const response = await finalize({ dynamicUsed: false, middlewareCacheControl: "no-store" });

    expect(response.headers.get("CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("<h1>user=alice</h1>");
  });

  it("retains a middleware private policy verbatim for a dynamic render", async () => {
    // Both authorities forbid shared caching; middleware's header wins verbatim
    // rather than being rewritten to the framework's no-store.
    const response = await finalize({
      dynamicUsed: true,
      middlewareCacheControl: "private, max-age=30",
    });

    expect(response.headers.get("CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
  });

  it("advertises a cacheable middleware override, not the route lifetime", async () => {
    // Middleware tightened the policy to 5s. Rebuilding from the route's 60s
    // would serve content 55s staler than middleware asked for.
    const response = await finalize({
      dynamicUsed: false,
      middlewareCacheControl: "s-maxage=5, stale-while-revalidate=55",
    });

    expect(response.headers.get("CDN-Cache-Control")).toBe(
      "public, max-age=5, stale-while-revalidate=55",
    );
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });

  it("does not advertise a policy the render dropped mid-stream", async () => {
    // revalidate = 0 means "never cache". The origin already skips its write;
    // the edge must not be told to store the page either.
    const response = await finalize({ dynamicUsed: false, lateCacheLife: { revalidate: 0 } });

    expect(response.headers.get("CDN-Cache-Control")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store, must-revalidate");
  });
});
