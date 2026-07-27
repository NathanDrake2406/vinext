import type { CachedAppPageValue } from "vinext/shims/cache";
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
import { buildAppPageCacheValue } from "./isr-cache.js";
import type { RenderObservation } from "./cache-proof.js";
import { readStreamAsText } from "../utils/text-stream.js";

type AppPageDebugLogger = (event: string, detail: string) => void;
type AppPageCacheSetter = (
  key: string,
  data: CachedAppPageValue,
  revalidateSeconds: number,
  tags: string[],
  expireSeconds?: number,
) => Promise<void>;
type AppPageRscCacheKeyBuilder = (
  pathname: string,
  mountedSlotsHeader?: string | null,
  renderMode?: AppRscRenderMode,
  interceptionContext?: string | null,
) => string;
type AppPageRequestCacheLife = {
  revalidate?: number;
  expire?: number;
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
  mountedSlotsHeader?: string | null;
  omitPendingDynamicCacheState?: boolean;
  renderMode?: AppRscRenderMode;
  preserveClientResponseHeaders?: boolean;
  expireSeconds?: number;
  revalidateSeconds: number | null;
  waitUntil?: (promise: Promise<void>) => void;
};

type ResolvedAppPageCachePolicy = { expireSeconds?: number; revalidateSeconds: number };

/**
 * What a streamed render turned out to be, once its stream drained: whether it
 * touched a request API, and the cache lifetime that actually applied. The
 * lifetime can differ from the one computed before the stream — a late
 * `cacheLife()` or cacheable fetch can shorten it, or drop it entirely.
 */
type AppPageCacheWriteOutcome = {
  dynamicUsed: boolean;
  cachePolicy: ResolvedAppPageCachePolicy | null;
};

/** Fail closed: a render we could not resolve must not reach a shared cache. */
const UNPROVEN_OUTCOME: AppPageCacheWriteOutcome = { dynamicUsed: true, cachePolicy: null };

/**
 * The `Cache-Control` implied by the lifetime the render actually resolved to.
 * A render with no cache policy left is not cacheable by anyone.
 */
function buildProvenCacheControl(outcome: AppPageCacheWriteOutcome): string {
  if (outcome.dynamicUsed || !outcome.cachePolicy) return NO_STORE_CACHE_CONTROL;
  const { revalidateSeconds, expireSeconds } = outcome.cachePolicy;
  // `revalidate = false` reaches the finalizer as Infinity; it means "cache
  // indefinitely", which is the static policy rather than an `s-maxage` value.
  if (revalidateSeconds === Infinity) return STATIC_CACHE_CONTROL;
  return buildRevalidateCacheControl(revalidateSeconds, expireSeconds);
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

/**
 * Stamp the *final* cache policy, once the render has proven whether it used a
 * request API. A dynamic render is demoted to `no-store` so no shared cache can
 * store a personalized response; a proven-static render gets the real policy
 * with no `pendingDynamicCheck` caveat attached.
 */
function applyProvenCdnHeaders(
  headers: Headers,
  outcome: AppPageCacheWriteOutcome,
  tags?: readonly string[],
  options: { omitCacheState?: boolean } = {},
): void {
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

function resolveAppPageCacheWritePolicy(options: {
  expireSeconds?: number;
  requestCacheLife?: AppPageRequestCacheLife | null;
  revalidateSeconds: number | null;
}): { expireSeconds?: number; revalidateSeconds: number } | null {
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

  return { expireSeconds, revalidateSeconds };
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

    const cachePolicy = resolveAppPageCacheWritePolicy({
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
        cachePolicy.revalidateSeconds,
        pageTags,
        cachePolicy.expireSeconds,
      ),
    ];

    if (options.capturedRscDataPromise) {
      writes.push(
        options.capturedRscDataPromise.then((rscData) =>
          options.isrSet(
            rscKey,
            buildAppPageCacheValue("", rscData, 200, rscRenderObservation),
            cachePolicy.revalidateSeconds,
            pageTags,
            cachePolicy.expireSeconds,
          ),
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

      const cachePolicy = resolveAppPageCacheWritePolicy({
        expireSeconds: options.expireSeconds,
        requestCacheLife: options.getRequestCacheLife?.(),
        revalidateSeconds: options.revalidateSeconds,
      });
      if (!cachePolicy) {
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
      await options.isrSet(
        rscKey,
        buildAppPageCacheValue("", rscData, 200, rscRenderObservation),
        cachePolicy.revalidateSeconds,
        pageTags,
        cachePolicy.expireSeconds,
      );
      options.isrDebug?.("RSC cache written", rscKey);
      return { dynamicUsed: false, cachePolicy };
    } catch (cacheError) {
      console.error("[vinext] ISR RSC cache write error:", cacheError);
      return UNPROVEN_OUTCOME;
    }
  })();

  options.waitUntil?.(cachePromise.then(() => undefined));
  return cachePromise;
}
