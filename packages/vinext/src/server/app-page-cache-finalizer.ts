import type { CacheControlMetadata } from "vinext/shims/cache-handler";
import type { AppRscRenderMode } from "./app-rsc-render-mode.js";
import {
  applyCdnResponseHeaders,
  buildRevalidateCacheControl,
  cdnRequiresProvenCachePolicy,
  NO_STORE_CACHE_CONTROL,
  STATIC_CACHE_CONTROL,
} from "./cache-control.js";
import { setCacheStateHeaders } from "./cache-headers.js";
import { NEXTJS_CACHE_HEADER, VINEXT_CACHE_HEADER } from "./headers.js";
import {
  createEmptyAppPageRenderObservationState,
  type AppPageRenderObservationState,
} from "./app-page-render-observation.js";
import { buildAppPageCacheValue, isrCacheControl, type AppPageCacheSetter } from "./isr-cache.js";
import type { RenderObservation } from "./cache-proof.js";
import { resolveClientStaleTimeSeconds } from "../utils/cache-control-metadata.js";
import { readStreamAsText } from "../utils/text-stream.js";

type AppPageDebugLogger = (event: string, detail: string) => void;
type AppPageRscCacheKeyBuilder = (
  pathname: string,
  mountedSlotsHeader?: string | null,
  renderMode?: AppRscRenderMode,
  interceptionContext?: string | null,
) => string;
type AppPageRequestCacheLife = {
  revalidate?: number;
  expire?: number;
  stale?: number;
};
type BuildAppPageCacheRenderObservation = (input: {
  cacheTags: readonly string[];
  state: AppPageRenderObservationState;
}) => RenderObservation;

type FinalizeAppPageHtmlCacheResponseOptions = {
  capturedDynamicUsageBeforeContextCleanup?: () => boolean;
  capturedRscDataPromise: Promise<ArrayBuffer> | null;
  cleanPathname: string;
  consumeDynamicUsage: () => boolean;
  consumeRenderObservationState?: () => AppPageRenderObservationState;
  createHtmlRenderObservation?: BuildAppPageCacheRenderObservation;
  createRscRenderObservation?: BuildAppPageCacheRenderObservation;
  getPageTags: () => string[];
  getRequestCacheLife?: () => AppPageRequestCacheLife | null;
  isrDebug?: AppPageDebugLogger;
  isrHtmlKey: (pathname: string) => string;
  isrRscKey: AppPageRscCacheKeyBuilder;
  isrSet: AppPageCacheSetter;
  interceptionContext?: string | null;
  /**
   * The `Cache-Control` middleware set on the response, if any. Middleware owns
   * the header, so a proven-path finalizer must not replace it with the
   * render's resolved policy — only demote it for a dynamic render.
   */
  middlewareCacheControl?: string | null;
  omitPendingDynamicCacheState?: boolean;
  preserveClientResponseHeaders?: boolean;
  expireSeconds?: number;
  revalidateSeconds: number | null;
  waitUntil?: (promise: Promise<void>) => void;
};

type ScheduleAppPageRscCacheWriteOptions = {
  capturedRscDataPromise: Promise<ArrayBuffer> | null;
  cleanPathname: string;
  consumeDynamicUsage: () => boolean;
  consumeRenderObservationState?: () => AppPageRenderObservationState;
  createRscRenderObservation?: BuildAppPageCacheRenderObservation;
  dynamicUsedDuringBuild: boolean;
  getPageTags: () => string[];
  getRequestCacheLife?: () => AppPageRequestCacheLife | null;
  isrDebug?: AppPageDebugLogger;
  isrRscKey: AppPageRscCacheKeyBuilder;
  isrSet: AppPageCacheSetter;
  interceptionContext?: string | null;
  /** See {@link FinalizeAppPageHtmlCacheResponseOptions.middlewareCacheControl}. */
  middlewareCacheControl?: string | null;
  mountedSlotsHeader?: string | null;
  omitPendingDynamicCacheState?: boolean;
  renderMode?: AppRscRenderMode;
  preserveClientResponseHeaders?: boolean;
  expireSeconds?: number;
  revalidateSeconds: number | null;
  waitUntil?: (promise: Promise<void>) => void;
};

/**
 * What a streamed render turned out to be, once its stream drained: whether it
 * touched a request API, and the cache lifetime that actually applied. The
 * lifetime can differ from the one computed before the stream — a late
 * `cacheLife()` or cacheable fetch can shorten it, or drop it entirely.
 */
type AppPageCacheWriteOutcome = {
  dynamicUsed: boolean;
  cachePolicy: CacheControlMetadata | null;
};

/** Fail closed: a render we could not resolve must not reach a shared cache. */
const UNPROVEN_OUTCOME: AppPageCacheWriteOutcome = { dynamicUsed: true, cachePolicy: null };

/**
 * The `Cache-Control` implied by the lifetime the render actually resolved to.
 * A render with no cache policy left is not cacheable by anyone.
 */
function buildProvenCacheControl(outcome: AppPageCacheWriteOutcome): string {
  if (outcome.dynamicUsed || !outcome.cachePolicy) return NO_STORE_CACHE_CONTROL;
  const { revalidate, expire } = outcome.cachePolicy;
  // `revalidate = false` or the legacy Infinity sentinel means "cache
  // indefinitely", which is the static policy rather than an `s-maxage` value.
  if (revalidate === false || revalidate === Infinity) return STATIC_CACHE_CONTROL;
  return buildRevalidateCacheControl(revalidate, expire);
}

function applyPendingDynamicCdnHeaders(
  headers: Headers,
  tags?: readonly string[],
  options: { omitCacheState?: boolean } = {},
): void {
  const cacheable = headers.get("Cache-Control") ?? "";
  applyCdnResponseHeaders(headers, { cacheControl: cacheable, pendingDynamicCheck: true, tags });
  applyCacheState(headers, options);
}

/** A policy that forbids shared caches from storing the response. */
const NON_SHARED_CACHEABLE_RE = /\b(?:no-store|no-cache|private)\b/i;

/**
 * Stamp the *final* cache policy, once the render has proven whether it used a
 * request API. A dynamic render is demoted to `no-store` so no shared cache can
 * store a personalized response; a proven-static render gets the real policy
 * with no `pendingDynamicCheck` caveat attached.
 *
 * The most restrictive authority wins: middleware owns singular response
 * headers, so a `Cache-Control` it set to private/no-cache/no-store must veto
 * edge caching no matter what lifetime the render itself resolved to. A
 * *cacheable* middleware override is likewise preserved for a proven-static
 * render — only a dynamic render overrules it, because a personalized response
 * must never reach a shared cache regardless of who asked for caching.
 */
function applyProvenCdnHeaders(
  headers: Headers,
  outcome: AppPageCacheWriteOutcome,
  tags?: readonly string[],
  options: { middlewareCacheControl?: string | null; omitCacheState?: boolean } = {},
): void {
  const existingCacheControl = headers.get("Cache-Control");
  if (existingCacheControl !== null && NON_SHARED_CACHEABLE_RE.test(existingCacheControl)) {
    applyCdnResponseHeaders(headers, { cacheControl: existingCacheControl });
    applyCacheState(headers, options);
    return;
  }
  // Middleware's cacheable policy wins over the render's resolved lifetime —
  // it owns the header, and only its value can be distinguished here from the
  // provisional policy the resolved one replaces. A non-cacheable middleware
  // value never reaches this branch (it is the existing header, vetoed above).
  const middlewareCacheControl = options.middlewareCacheControl ?? null;
  if (outcome.dynamicUsed === false && middlewareCacheControl !== null) {
    applyCdnResponseHeaders(headers, { cacheControl: middlewareCacheControl, tags });
    applyCacheState(headers, options);
    return;
  }
  const cacheControl = buildProvenCacheControl(outcome);
  const cacheable = outcome.dynamicUsed === false && outcome.cachePolicy !== null;
  applyCdnResponseHeaders(headers, cacheable ? { cacheControl, tags } : { cacheControl });
  applyCacheState(headers, options);
}

function applyCacheState(headers: Headers, options: { omitCacheState?: boolean }): void {
  if (options.omitCacheState === true) {
    headers.delete(VINEXT_CACHE_HEADER);
    headers.delete(NEXTJS_CACHE_HEADER);
    return;
  }
  setCacheStateHeaders(headers, "MISS");
}

function resolveAppPageCacheControl(options: {
  expireSeconds?: number;
  requestCacheLife?: AppPageRequestCacheLife | null;
  revalidateSeconds: number | null;
}): CacheControlMetadata | null {
  let revalidateSeconds = options.revalidateSeconds;
  let expireSeconds = options.expireSeconds;
  const requestCacheLife = options.requestCacheLife;

  if (requestCacheLife?.revalidate !== undefined) {
    revalidateSeconds =
      revalidateSeconds === null
        ? requestCacheLife.revalidate
        : Math.min(revalidateSeconds, requestCacheLife.revalidate);
  }
  if (requestCacheLife?.expire !== undefined) {
    expireSeconds = requestCacheLife.expire;
  }

  if (revalidateSeconds === null || Number.isNaN(revalidateSeconds) || revalidateSeconds <= 0) {
    return null;
  }

  // Callers reach this only after the render's stream drained, so the
  // request-scoped accumulation is the completed render's minimum.
  return isrCacheControl(revalidateSeconds, {
    expireSeconds,
    staleSeconds: resolveClientStaleTimeSeconds(requestCacheLife),
  });
}

/**
 * Persist a rendered page, unless the drained stream showed the render was
 * dynamic or left no cache lifetime. Reports back what actually applied so a
 * caller emitting a final cache policy can build headers from it.
 */
async function writeAppPageHtmlCacheEntry(
  cachedHtml: string,
  response: Response,
  options: FinalizeAppPageHtmlCacheResponseOptions,
): Promise<AppPageCacheWriteOutcome> {
  const htmlKey = options.isrHtmlKey(options.cleanPathname);
  try {
    if (
      options.capturedDynamicUsageBeforeContextCleanup?.() === true ||
      options.consumeDynamicUsage()
    ) {
      options.isrDebug?.("HTML cache write skipped (dynamic usage during render)", htmlKey);
      return { dynamicUsed: true, cachePolicy: null };
    }

    const cachePolicy = resolveAppPageCacheControl({
      expireSeconds: options.expireSeconds,
      requestCacheLife: options.getRequestCacheLife?.(),
      revalidateSeconds: options.revalidateSeconds,
    });
    if (!cachePolicy) {
      options.isrDebug?.("HTML cache write skipped (no cache policy)", htmlKey);
      return { dynamicUsed: false, cachePolicy: null };
    }

    const rscKey = options.isrRscKey(
      options.cleanPathname,
      null,
      undefined,
      options.interceptionContext,
    );
    const pageTags = options.getPageTags();
    const observationState =
      options.consumeRenderObservationState?.() ?? createEmptyAppPageRenderObservationState();
    const htmlRenderObservation = options.createHtmlRenderObservation?.({
      cacheTags: pageTags,
      state: observationState,
    });
    const rscRenderObservation = options.createRscRenderObservation?.({
      cacheTags: pageTags,
      state: observationState,
    });
    const linkHeader = response.headers.get("link");
    const writes = [
      options.isrSet(
        htmlKey,
        buildAppPageCacheValue(
          cachedHtml,
          undefined,
          200,
          htmlRenderObservation,
          linkHeader ? { link: linkHeader } : undefined,
        ),
        { cacheControl: cachePolicy, tags: pageTags },
      ),
    ];

    if (options.capturedRscDataPromise) {
      writes.push(
        options.capturedRscDataPromise.then((rscData) =>
          options.isrSet(rscKey, buildAppPageCacheValue("", rscData, 200, rscRenderObservation), {
            cacheControl: cachePolicy,
            tags: pageTags,
          }),
        ),
      );
    }

    await Promise.all(writes);
    options.isrDebug?.("HTML cache written", htmlKey);
    return { dynamicUsed: false, cachePolicy };
  } catch (cacheError) {
    console.error("[vinext] ISR cache write error:", cacheError);
    return UNPROVEN_OUTCOME;
  }
}

/**
 * Buffer the render, resolve what it actually was, then answer with a single
 * final cache policy. Used when the active CDN adapter cannot retract a policy
 * it has already advertised to a shared cache.
 */
async function finalizeProvenAppPageHtmlResponse(
  response: Response,
  body: ReadableStream<Uint8Array>,
  options: FinalizeAppPageHtmlCacheResponseOptions,
): Promise<Response> {
  const html = await readStreamAsText(body);
  const cachePromise = writeAppPageHtmlCacheEntry(html, response, options);
  options.waitUntil?.(cachePromise.then(() => undefined));

  const headers = new Headers(response.headers);
  applyProvenCdnHeaders(headers, await cachePromise, options.getPageTags(), {
    middlewareCacheControl: options.middlewareCacheControl,
    omitCacheState: options.omitPendingDynamicCacheState === true,
  });

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function finalizeAppPageHtmlCacheResponse(
  response: Response,
  options: FinalizeAppPageHtmlCacheResponseOptions,
): Response | Promise<Response> {
  if (!response.body) {
    return response;
  }

  // The proven path buffers the body anyway, so it skips the tee entirely and
  // reuses the single copy for both the cache write and the client response.
  if (options.preserveClientResponseHeaders !== true && cdnRequiresProvenCachePolicy()) {
    return finalizeProvenAppPageHtmlResponse(response, response.body, options);
  }

  const [streamForClient, streamForCache] = response.body.tee();

  const cachePromise = (async (): Promise<AppPageCacheWriteOutcome> => {
    const cachedHtml = await readStreamAsText(streamForCache);
    return writeAppPageHtmlCacheEntry(cachedHtml, response, options);
  })();

  options.waitUntil?.(cachePromise.then(() => undefined));

  if (options.preserveClientResponseHeaders === true) {
    return new Response(streamForClient, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const clientHeaders = new Headers(response.headers);
  applyPendingDynamicCdnHeaders(clientHeaders, options.getPageTags(), {
    omitCacheState: options.omitPendingDynamicCacheState === true,
  });

  return new Response(streamForClient, {
    status: response.status,
    statusText: response.statusText,
    headers: clientHeaders,
  });
}

export function finalizeAppPageRscCacheResponse(
  response: Response,
  options: ScheduleAppPageRscCacheWriteOptions,
): Response | Promise<Response> {
  const cachePromise = startAppPageRscCacheWrite(options);
  if (!cachePromise) {
    return response;
  }

  if (options.preserveClientResponseHeaders === true) {
    return response;
  }

  if (cdnRequiresProvenCachePolicy()) {
    // Same shared-cache hazard as the HTML path: buffer the RSC payload so only
    // a final, proven policy ever reaches the edge.
    return (async () => {
      const [outcome, body] = await Promise.all([cachePromise, response.arrayBuffer()]);
      const headers = new Headers(response.headers);
      applyProvenCdnHeaders(headers, outcome, options.getPageTags(), {
        middlewareCacheControl: options.middlewareCacheControl,
        omitCacheState: options.omitPendingDynamicCacheState === true,
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })();
  }

  const clientHeaders = new Headers(response.headers);
  applyPendingDynamicCdnHeaders(clientHeaders, options.getPageTags(), {
    omitCacheState: options.omitPendingDynamicCacheState === true,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: clientHeaders,
  });
}

export function scheduleAppPageRscCacheWrite(
  options: ScheduleAppPageRscCacheWriteOptions,
): boolean {
  return startAppPageRscCacheWrite(options) !== null;
}

/**
 * Schedule the RSC cache write and report back whether the render turned out to
 * be dynamic, so callers that must emit a final cache policy can wait for it.
 * Returns `null` when there is nothing to write.
 */
function startAppPageRscCacheWrite(
  options: ScheduleAppPageRscCacheWriteOptions,
): Promise<AppPageCacheWriteOutcome> | null {
  const capturedRscDataPromise = options.capturedRscDataPromise;
  if (!capturedRscDataPromise || options.dynamicUsedDuringBuild || options.mountedSlotsHeader) {
    return null;
  }

  const rscKey = options.isrRscKey(
    options.cleanPathname,
    null,
    options.renderMode,
    options.interceptionContext,
  );
  const cachePromise = (async (): Promise<AppPageCacheWriteOutcome> => {
    try {
      const rscData = await capturedRscDataPromise;

      if (options.consumeDynamicUsage()) {
        options.isrDebug?.("RSC cache write skipped (dynamic usage during render)", rscKey);
        return { dynamicUsed: true, cachePolicy: null };
      }

      const cacheControl = resolveAppPageCacheControl({
        expireSeconds: options.expireSeconds,
        requestCacheLife: options.getRequestCacheLife?.(),
        revalidateSeconds: options.revalidateSeconds,
      });
      if (!cacheControl) {
        options.isrDebug?.("RSC cache write skipped (no cache policy)", rscKey);
        return { dynamicUsed: false, cachePolicy: null };
      }

      const pageTags = options.getPageTags();
      const observationState =
        options.consumeRenderObservationState?.() ?? createEmptyAppPageRenderObservationState();
      const rscRenderObservation = options.createRscRenderObservation?.({
        cacheTags: pageTags,
        state: observationState,
      });
      await options.isrSet(rscKey, buildAppPageCacheValue("", rscData, 200, rscRenderObservation), {
        cacheControl,
        tags: pageTags,
      });
      options.isrDebug?.("RSC cache written", rscKey);
      return { dynamicUsed: false, cachePolicy: cacheControl };
    } catch (cacheError) {
      console.error("[vinext] ISR RSC cache write error:", cacheError);
      return UNPROVEN_OUTCOME;
    }
  })();

  options.waitUntil?.(cachePromise.then(() => undefined));
  return cachePromise;
}
