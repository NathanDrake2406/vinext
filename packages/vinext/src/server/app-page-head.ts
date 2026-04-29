import {
  mergeMetadata,
  mergeViewport,
  resolveModuleMetadata,
  resolveModuleViewport,
  type Metadata,
  type Viewport,
} from "../shims/metadata.js";
import { applyFileBasedMetadata } from "./file-based-metadata.js";
import type { AppPageParams } from "./app-page-boundary.js";
import type { MetadataFileRoute } from "./metadata-routes.js";

type AppPageSearchParams = Record<string, string | string[]>;

type AppPageHeadModule = Record<string, unknown>;

type AppPageHeadSource = {
  metadata: Metadata | null;
  routeSegments: readonly string[];
};

type AppPageHeadParallelRoute<TModule extends AppPageHeadModule = AppPageHeadModule> = {
  layoutModule?: TModule | null;
  pageModule?: TModule | null;
  params?: AppPageParams | null;
  routeSegments?: readonly string[] | null;
};

type ResolveAppPageHeadOptions<TModule extends AppPageHeadModule = AppPageHeadModule> = {
  fallbackOnFileMetadataError?: boolean;
  layoutModules: readonly (TModule | null | undefined)[];
  layoutTreePositions?: readonly number[] | null;
  metadataRoutes: readonly MetadataFileRoute[];
  pageModule?: TModule | null;
  parallelRoutes?: readonly AppPageHeadParallelRoute<TModule>[] | null;
  params: AppPageParams;
  routePath: string;
  routeSegments?: readonly string[] | null;
  searchParams?: URLSearchParams | null;
};

type ResolveAppPageHeadResult = {
  hasSearchParams: boolean;
  metadata: Metadata | null;
  pageSearchParams: AppPageSearchParams;
  viewport: Viewport;
};

type ResolvedParallelRouteHead = {
  metadataResults: (Metadata | null)[];
  metadataSources: AppPageHeadSource[];
  viewportResults: (Viewport | null)[];
};

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function createAppPageSearchParams(searchParams: URLSearchParams | null | undefined): {
  hasSearchParams: boolean;
  pageSearchParams: AppPageSearchParams;
} {
  const pageSearchParams: AppPageSearchParams = Object.create(null);
  let hasSearchParams = false;

  searchParams?.forEach((value, key) => {
    hasSearchParams = true;
    const currentValue = pageSearchParams[key];
    if (Array.isArray(currentValue)) {
      pageSearchParams[key] = [...currentValue, value];
      return;
    }
    if (currentValue !== undefined) {
      pageSearchParams[key] = [currentValue, value];
      return;
    }
    pageSearchParams[key] = value;
  });

  return { hasSearchParams, pageSearchParams };
}

function createMetadataSources(
  metadataResults: readonly (Metadata | null)[],
  routeSegments: readonly string[],
  layoutTreePositions: readonly number[],
  pageMetadata: Metadata | null,
  includePageSource: boolean,
): AppPageHeadSource[] {
  const metadataSources: AppPageHeadSource[] = metadataResults.map((metadata, index) => ({
    routeSegments: routeSegments.slice(0, layoutTreePositions[index] ?? 0),
    metadata,
  }));

  if (includePageSource) {
    metadataSources.push({
      routeSegments,
      metadata: pageMetadata,
    });
  }

  return metadataSources;
}

function getParamNameForSegment(segment: string): string | null {
  if (segment.startsWith("[[...") && segment.endsWith("]]")) {
    return segment.slice(5, -2);
  }
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    return segment.slice(4, -1);
  }
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return segment.slice(1, -1);
  }
  return null;
}

function filterParamsForRouteSegments(
  params: AppPageParams,
  routeSegments: readonly string[],
  segmentCount: number,
): AppPageParams {
  const scopedParams: AppPageParams = {};
  for (const segment of routeSegments.slice(0, segmentCount)) {
    const paramName = getParamNameForSegment(segment);
    if (paramName && params[paramName] !== undefined) {
      scopedParams[paramName] = params[paramName];
    }
  }
  return scopedParams;
}

async function resolveLayoutMetadata<TModule extends AppPageHeadModule>(
  layoutModules: readonly TModule[],
  params: AppPageParams,
  routeSegments: readonly string[],
  layoutTreePositions: readonly number[],
): Promise<(Metadata | null)[]> {
  const layoutMetadataPromises: Promise<Metadata | null>[] = [];
  let accumulatedMetadata = Promise.resolve<Metadata>({});

  for (let index = 0; index < layoutModules.length; index++) {
    const layoutModule = layoutModules[index];
    const parentForLayout = accumulatedMetadata;
    const layoutParams = filterParamsForRouteSegments(
      params,
      routeSegments,
      layoutTreePositions[index] ?? 0,
    );
    const metadataPromise = resolveModuleMetadata(
      layoutModule,
      layoutParams,
      undefined,
      parentForLayout,
    ).catch((error) => {
      console.error("[vinext] Layout generateMetadata() failed:", error);
      return null;
    });
    layoutMetadataPromises.push(metadataPromise);

    accumulatedMetadata = metadataPromise.then(async (metadataResult) => {
      if (metadataResult) {
        return mergeMetadata([await parentForLayout, metadataResult]);
      }
      return parentForLayout;
    });
  }

  return Promise.all(layoutMetadataPromises);
}

async function resolveLayoutViewport<TModule extends AppPageHeadModule>(
  layoutModules: readonly TModule[],
  params: AppPageParams,
  routeSegments: readonly string[],
  layoutTreePositions: readonly number[],
): Promise<(Viewport | null)[]> {
  return Promise.all(
    layoutModules.map((layoutModule, index) => {
      const layoutParams = filterParamsForRouteSegments(
        params,
        routeSegments,
        layoutTreePositions[index] ?? 0,
      );
      return resolveModuleViewport(layoutModule, layoutParams).catch((error) => {
        console.error("[vinext] Layout generateViewport() failed:", error);
        return null;
      });
    }),
  );
}

async function resolveParallelRouteHead<TModule extends AppPageHeadModule>(
  parallelRoute: AppPageHeadParallelRoute<TModule>,
  fallbackParams: AppPageParams,
  fallbackRouteSegments: readonly string[],
  pageSearchParams: AppPageSearchParams,
  parent: Promise<Metadata>,
): Promise<ResolvedParallelRouteHead> {
  const params = parallelRoute.params ?? fallbackParams;
  const routeSegments = parallelRoute.routeSegments ?? fallbackRouteSegments;
  const metadataResults: (Metadata | null)[] = [];
  const viewportResults: (Viewport | null)[] = [];
  const metadataSources: AppPageHeadSource[] = [];
  let accumulatedMetadata = parent;

  if (parallelRoute.layoutModule) {
    const layoutMetadata = await resolveModuleMetadata(
      parallelRoute.layoutModule,
      params,
      undefined,
      accumulatedMetadata,
    ).catch((error) => {
      console.error("[vinext] Parallel route layout generateMetadata() failed:", error);
      return null;
    });
    metadataResults.push(layoutMetadata);
    metadataSources.push({ metadata: layoutMetadata, routeSegments });
    if (layoutMetadata) {
      const parentForLayout = accumulatedMetadata;
      accumulatedMetadata = parentForLayout.then(async (parentMetadata) =>
        mergeMetadata([parentMetadata, layoutMetadata]),
      );
    }

    const layoutViewport = await resolveModuleViewport(parallelRoute.layoutModule, params).catch(
      (error) => {
        console.error("[vinext] Parallel route layout generateViewport() failed:", error);
        return null;
      },
    );
    viewportResults.push(layoutViewport);
  }

  if (parallelRoute.pageModule) {
    const pageMetadata = await resolveModuleMetadata(
      parallelRoute.pageModule,
      params,
      pageSearchParams,
      accumulatedMetadata,
    ).catch((error) => {
      console.error("[vinext] Parallel route page generateMetadata() failed:", error);
      return null;
    });
    metadataResults.push(pageMetadata);
    metadataSources.push({ metadata: pageMetadata, routeSegments });

    const pageViewport = await resolveModuleViewport(parallelRoute.pageModule, params).catch(
      (error) => {
        console.error("[vinext] Parallel route page generateViewport() failed:", error);
        return null;
      },
    );
    viewportResults.push(pageViewport);
  }

  return { metadataResults, metadataSources, viewportResults };
}

export async function resolveAppPageHead<TModule extends AppPageHeadModule>(
  options: ResolveAppPageHeadOptions<TModule>,
): Promise<ResolveAppPageHeadResult> {
  const layoutModules = options.layoutModules.filter(isPresent);
  const routeSegments = options.routeSegments ?? [];
  const layoutTreePositions = options.layoutTreePositions ?? [];
  const { hasSearchParams, pageSearchParams } = createAppPageSearchParams(options.searchParams);
  const layoutMetadataPromise = resolveLayoutMetadata(
    layoutModules,
    options.params,
    routeSegments,
    layoutTreePositions,
  );
  const layoutViewportPromise = resolveLayoutViewport(
    layoutModules,
    options.params,
    routeSegments,
    layoutTreePositions,
  );

  const layoutMetadataResultsForParent = layoutMetadataPromise.then((metadataResults) =>
    metadataResults.filter(isPresent),
  );
  const pageParentPromise = layoutMetadataResultsForParent.then((metadataResults) =>
    metadataResults.length > 0 ? mergeMetadata(metadataResults) : {},
  );
  const pageMetadataPromise = options.pageModule
    ? resolveModuleMetadata(options.pageModule, options.params, pageSearchParams, pageParentPromise)
    : Promise.resolve(null);
  const pageViewportPromise = options.pageModule
    ? resolveModuleViewport(options.pageModule, options.params)
    : Promise.resolve(null);
  const parallelRouteHeadPromise = Promise.all(
    (options.parallelRoutes ?? []).map((parallelRoute) =>
      resolveParallelRouteHead(
        parallelRoute,
        options.params,
        routeSegments,
        pageSearchParams,
        pageParentPromise,
      ),
    ),
  );

  const [
    layoutMetadataResults,
    layoutViewportResults,
    pageMetadata,
    pageViewport,
    parallelRouteHeads,
  ] = await Promise.all([
    layoutMetadataPromise,
    layoutViewportPromise,
    pageMetadataPromise,
    pageViewportPromise,
    parallelRouteHeadPromise,
  ]);
  const parallelMetadataResults = parallelRouteHeads.flatMap((head) => head.metadataResults);
  const parallelViewportResults = parallelRouteHeads.flatMap((head) => head.viewportResults);
  const parallelMetadataSources = parallelRouteHeads.flatMap((head) => head.metadataSources);

  const metadataList = [
    ...layoutMetadataResults.filter(isPresent),
    ...(pageMetadata ? [pageMetadata] : []),
    ...parallelMetadataResults.filter(isPresent),
  ];
  const viewportList = [
    ...layoutViewportResults.filter(isPresent),
    ...(pageViewport ? [pageViewport] : []),
    ...parallelViewportResults.filter(isPresent),
  ];

  const resolvedMetadataBase = metadataList.length > 0 ? mergeMetadata(metadataList) : null;
  const metadataSources = createMetadataSources(
    layoutMetadataResults,
    routeSegments,
    layoutTreePositions,
    pageMetadata,
    Boolean(options.pageModule),
  );
  metadataSources.push(...parallelMetadataSources);
  let metadata = resolvedMetadataBase;

  try {
    metadata = await applyFileBasedMetadata(
      resolvedMetadataBase,
      options.routePath,
      options.params,
      options.metadataRoutes,
      {
        routeSegments,
        metadataSources,
      },
    );
  } catch (error) {
    if (!options.fallbackOnFileMetadataError) {
      throw error;
    }
    console.error(
      `[vinext] File-based metadata resolution failed while rendering error boundary for ${options.routePath}:`,
      error,
    );
  }

  return {
    hasSearchParams,
    metadata,
    pageSearchParams,
    viewport: mergeViewport(viewportList),
  };
}
