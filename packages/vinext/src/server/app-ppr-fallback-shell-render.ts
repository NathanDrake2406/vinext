import type { ReactNode } from "react";
import type { NavigationContext } from "vinext/shims/navigation";
import type { RootParams } from "vinext/shims/root-params";
import {
  consumeDynamicUsage,
  consumeInvalidDynamicUsageError,
  consumeRenderRequestApiUsage,
} from "vinext/shims/headers";
import { _consumeRequestScopedCacheLife } from "vinext/shims/cache";
import {
  consumeDynamicFetchObservations,
  type FetchCacheMode,
  getCollectedFetchTags,
} from "vinext/shims/fetch-cache";
import {
  createPprFallbackShellState,
  isPprFallbackShellAbortError,
  preparePprFallbackShellFinalRender,
  runWithPprFallbackShellState,
  waitForPprFallbackShellCacheReady,
  type PprFallbackShellState,
} from "vinext/shims/ppr-fallback-shell";
import type { AppPagePprFallbackCacheShell } from "./app-ppr-fallback-shell.js";
import { buildPageCacheTags } from "./implicit-tags.js";
import { readStreamAsText } from "../utils/text-stream.js";
import {
  readAppPageBinaryStream,
  teeAppPageRscStreamForCapture,
  type AppPageFontPreload,
} from "./app-page-execution.js";
import {
  createAppPageHtmlOutputScope,
  createAppPageRenderObservation,
} from "./app-page-render-observation.js";
import { isAppSsrRenderResult, type AppPageSsrHandler } from "./app-page-stream.js";
import type { AppPageFallbackShellCacheRenderResult } from "./app-page-cache.js";

type AppPageParams = Record<string, string | string[]>;

type AppPageBoundaryOnError = (
  error: unknown,
  requestInfo: unknown,
  errorContext: unknown,
) => unknown;

type AppPageRenderableElement = ReactNode | Record<string, ReactNode>;
type RequestScopedCacheLife = ReturnType<typeof _consumeRequestScopedCacheLife>;
type FallbackShellRoute = {
  pattern: string;
  routeSegments: readonly string[];
};
type FallbackShellRevalidationOptions = {
  cleanPathname: string;
  currentFetchCacheMode?: FetchCacheMode | null;
  draftModeSecret: string;
  dynamicConfig?: string;
  params: AppPageParams;
  routePattern: string;
  routeSegments: readonly string[];
  setNavigationContext: (context: {
    params: AppPageParams;
    pathname: string;
    searchParams: URLSearchParams;
  }) => void;
};
type RunFallbackShellRevalidationContext = <
  TResult extends {
    html: string;
    tags: string[];
  },
>(
  options: FallbackShellRevalidationOptions,
  renderFn: () => Promise<TResult>,
) => Promise<TResult>;

/** Dependencies needed to render a fresh PPR fallback shell for cache storage. */
export type FallbackShellRenderDeps = {
  basePath?: string;
  buildPageElement: (
    route: FallbackShellRoute,
    params: AppPageParams,
    opts: unknown,
    searchParams: URLSearchParams,
  ) => Promise<ReactNode | Readonly<Record<string, ReactNode>>>;
  clearRequestContext: () => void;
  clientTraceMetadata?: readonly string[];
  createRscOnErrorHandler: (pathname: string, routePath: string) => AppPageBoundaryOnError;
  draftModeSecret: string;
  dynamicConfig?: string;
  fetchCache?: FetchCacheMode | null;
  getFontLinks: () => string[];
  getFontPreloads: () => AppPageFontPreload[];
  getFontStyles: () => string[];
  getNavigationContext: () => NavigationContext | null;
  loadSsrHandler: () => Promise<AppPageSsrHandler>;
  renderToReadableStream: (
    element: AppPageRenderableElement,
    options: { onError: AppPageBoundaryOnError },
  ) => ReadableStream<Uint8Array>;
  resolveRouteFetchCacheMode?: (route: FallbackShellRoute) => FetchCacheMode | null;
  rootParams?: RootParams;
  route: FallbackShellRoute;
  setNavigationContext: (context: {
    params: AppPageParams;
    pathname: string;
    searchParams: URLSearchParams;
  }) => void;
};

function buildAppPageTags(
  cleanPathname: string,
  extraTags: string[],
  routeSegments: readonly string[],
): string[] {
  return buildPageCacheTags(cleanPathname, extraTags, [...routeSegments], "page");
}

export async function warmPprFallbackShellCaches(options: {
  element: AppPageRenderableElement;
  onError: AppPageBoundaryOnError;
  renderToReadableStream: FallbackShellRenderDeps["renderToReadableStream"];
  state: PprFallbackShellState;
}): Promise<void> {
  let warmupError: unknown = null;
  const warmupStream = options.renderToReadableStream(options.element, {
    onError(error, requestInfo, errorContext) {
      if (options.state.abortController.signal.aborted || isPprFallbackShellAbortError(error)) {
        return undefined;
      }

      return options.onError(error, requestInfo, errorContext);
    },
  });
  const warmupDrain = readAppPageBinaryStream(warmupStream).catch((error: unknown) => {
    if (options.state.abortController.signal.aborted || isPprFallbackShellAbortError(error)) {
      return;
    }
    warmupError = error;
  });

  try {
    await waitForPprFallbackShellCacheReady(options.state);
  } finally {
    options.state.abortController.abort();
    await warmupDrain;
    preparePprFallbackShellFinalRender(options.state);
  }

  if (warmupError) {
    throw warmupError;
  }
}

function discardPprFallbackShellRenderState(): void {
  _consumeRequestScopedCacheLife();
  consumeDynamicFetchObservations();
  consumeRenderRequestApiUsage();
  consumeInvalidDynamicUsageError();
  consumeDynamicUsage();
}

async function renderFinalPprFallbackShellHtml({
  deps,
  element,
  onError,
}: {
  deps: FallbackShellRenderDeps;
  element: AppPageRenderableElement;
  onError: AppPageBoundaryOnError;
}): Promise<string> {
  const finalRscStream = deps.renderToReadableStream(element, {
    onError,
  });
  const finalRscCapture = teeAppPageRscStreamForCapture(finalRscStream, true);
  const capturedRscDataRef: { value: Promise<ArrayBuffer> | null } = {
    value: null,
  };
  const ssrHandler = await deps.loadSsrHandler();
  const htmlStream = await ssrHandler.handleSsr(
    finalRscCapture.ssrStream,
    deps.getNavigationContext(),
    {
      links: deps.getFontLinks(),
      styles: deps.getFontStyles(),
      preloads: deps.getFontPreloads(),
    },
    {
      basePath: deps.basePath,
      clientTraceMetadata: deps.clientTraceMetadata,
      rootParams: deps.rootParams,
      ...(finalRscCapture.sideStream
        ? {
            sideStream: finalRscCapture.sideStream,
            capturedRscDataRef,
          }
        : {}),
    },
  );
  const htmlStreamNormalized = isAppSsrRenderResult(htmlStream)
    ? htmlStream.htmlStream
    : htmlStream;
  const html = await readStreamAsText(htmlStreamNormalized);
  try {
    await capturedRscDataRef.value;
  } catch {
    // HTML rendering owns the user-visible error path. The fallback-shell
    // regeneration only writes HTML, but observing the capture promise
    // prevents a secondary unhandled rejection from the tee side stream.
  }
  return html;
}

function buildPprFallbackShellCacheResult({
  cacheLife,
  deps,
  element,
  fallbackShell,
  html,
}: {
  cacheLife: RequestScopedCacheLife;
  deps: FallbackShellRenderDeps;
  element: AppPageRenderableElement;
  fallbackShell: AppPagePprFallbackCacheShell;
  html: string;
}): AppPageFallbackShellCacheRenderResult {
  const tags = buildAppPageTags(
    fallbackShell.pathname,
    getCollectedFetchTags(),
    deps.route.routeSegments,
  );
  const observationState = {
    dynamicFetches: consumeDynamicFetchObservations(),
    requestApis: consumeRenderRequestApiUsage(),
  };
  consumeInvalidDynamicUsageError();
  consumeDynamicUsage();

  return {
    html,
    htmlRenderObservation: createAppPageRenderObservation({
      boundaryOutcome: { kind: "success" },
      cacheability: "public",
      cacheTags: tags,
      cleanPathname: fallbackShell.pathname,
      completeness: "complete",
      output: createAppPageHtmlOutputScope({
        element,
        renderEpoch: null,
        rootBoundaryId: null,
        routePattern: deps.route.pattern,
      }),
      params: fallbackShell.params,
      state: observationState,
    }),
    tags,
    cacheControl:
      typeof cacheLife?.revalidate === "number"
        ? { revalidate: cacheLife.revalidate, expire: cacheLife.expire }
        : undefined,
  };
}

function createPprFallbackShellRevalidationOptions(
  deps: FallbackShellRenderDeps,
  fallbackShell: AppPagePprFallbackCacheShell,
): FallbackShellRevalidationOptions {
  return {
    cleanPathname: fallbackShell.pathname,
    currentFetchCacheMode: deps.resolveRouteFetchCacheMode?.(deps.route) ?? deps.fetchCache ?? null,
    draftModeSecret: deps.draftModeSecret,
    dynamicConfig: deps.dynamicConfig,
    params: fallbackShell.params,
    routePattern: deps.route.pattern,
    routeSegments: deps.route.routeSegments,
    setNavigationContext: deps.setNavigationContext,
  };
}

function setPprFallbackShellNavigationContext(
  deps: FallbackShellRenderDeps,
  fallbackShell: AppPagePprFallbackCacheShell,
  fallbackSearchParams: URLSearchParams,
): void {
  deps.setNavigationContext({
    pathname: fallbackShell.pathname,
    searchParams: fallbackSearchParams,
    params: fallbackShell.params,
  });
}

function buildPprFallbackShellElement(
  deps: FallbackShellRenderDeps,
  fallbackShell: AppPagePprFallbackCacheShell,
  fallbackSearchParams: URLSearchParams,
): Promise<AppPageRenderableElement> {
  return deps.buildPageElement(deps.route, fallbackShell.params, undefined, fallbackSearchParams);
}

async function renderPprFallbackShellCacheEntry({
  deps,
  fallbackSearchParams,
  fallbackShell,
}: {
  deps: FallbackShellRenderDeps;
  fallbackSearchParams: URLSearchParams;
  fallbackShell: AppPagePprFallbackCacheShell;
}): Promise<AppPageFallbackShellCacheRenderResult> {
  const fallbackShellState = createPprFallbackShellState({
    fallbackParamNames: fallbackShell.fallbackParamNames,
    routePattern: deps.route.pattern,
  });

  return await runWithPprFallbackShellState(fallbackShellState, async () => {
    try {
      const onError = deps.createRscOnErrorHandler(fallbackShell.pathname, deps.route.pattern);
      const warmupElement = await buildPprFallbackShellElement(
        deps,
        fallbackShell,
        fallbackSearchParams,
      );
      await warmPprFallbackShellCaches({
        element: warmupElement,
        onError,
        renderToReadableStream: deps.renderToReadableStream,
        state: fallbackShellState,
      });
      discardPprFallbackShellRenderState();

      setPprFallbackShellNavigationContext(deps, fallbackShell, fallbackSearchParams);
      const finalElement = await buildPprFallbackShellElement(
        deps,
        fallbackShell,
        fallbackSearchParams,
      );
      const html = await renderFinalPprFallbackShellHtml({
        deps,
        element: finalElement,
        onError,
      });
      const cacheLife = _consumeRequestScopedCacheLife();
      return buildPprFallbackShellCacheResult({
        cacheLife,
        deps,
        element: finalElement,
        fallbackShell,
        html,
      });
    } finally {
      discardPprFallbackShellRenderState();
      deps.clearRequestContext();
    }
  });
}

/**
 * Render a fresh PPR fallback shell for cache storage.
 *
 * This is the fallback-shell counterpart to the regular ISR revalidation
 * path in `dispatchAppPageInner`. It runs the full RSC→SSR→HTML pipeline
 * with placeholder params (e.g. `[slug]`) so the resulting HTML can be
 * cached and later served for any unknown child param value.
 *
 * Extracted from `app-page-dispatch.ts` so the dispatch orchestrator stays
 * focused on routing decisions rather than render pipeline construction.
 */
export async function renderFreshPprFallbackShellForCache(
  deps: FallbackShellRenderDeps,
  runRevalidationContext: RunFallbackShellRevalidationContext,
  fallbackShell: AppPagePprFallbackCacheShell,
): Promise<AppPageFallbackShellCacheRenderResult> {
  const fallbackSearchParams = new URLSearchParams();
  return runRevalidationContext(
    createPprFallbackShellRevalidationOptions(deps, fallbackShell),
    () => renderPprFallbackShellCacheEntry({ deps, fallbackSearchParams, fallbackShell }),
  );
}
