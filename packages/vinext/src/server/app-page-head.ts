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

type ResolveAppPageHeadOptions<TModule extends AppPageHeadModule = AppPageHeadModule> = {
  fallbackOnFileMetadataError?: boolean;
  layoutModules: readonly (TModule | null | undefined)[];
  layoutTreePositions?: readonly number[] | null;
  metadataRoutes: readonly MetadataFileRoute[];
  pageModule?: TModule | null;
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

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function createAppPageSearchParams(searchParams: URLSearchParams | null | undefined): {
  hasSearchParams: boolean;
  pageSearchParams: AppPageSearchParams;
} {
  const pageSearchParams: AppPageSearchParams = {};
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

async function resolveLayoutMetadata<TModule extends AppPageHeadModule>(
  layoutModules: readonly TModule[],
  params: AppPageParams,
): Promise<(Metadata | null)[]> {
  const layoutMetadataPromises: Promise<Metadata | null>[] = [];
  let accumulatedMetadata = Promise.resolve<Metadata>({});

  for (const layoutModule of layoutModules) {
    const parentForLayout = accumulatedMetadata;
    const metadataPromise = resolveModuleMetadata(
      layoutModule,
      params,
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
): Promise<(Viewport | null)[]> {
  return Promise.all(
    layoutModules.map((layoutModule) =>
      resolveModuleViewport(layoutModule, params).catch((error) => {
        console.error("[vinext] Layout generateViewport() failed:", error);
        return null;
      }),
    ),
  );
}

export async function resolveAppPageHead<TModule extends AppPageHeadModule>(
  options: ResolveAppPageHeadOptions<TModule>,
): Promise<ResolveAppPageHeadResult> {
  const layoutModules = options.layoutModules.filter(isPresent);
  const routeSegments = options.routeSegments ?? [];
  const layoutTreePositions = options.layoutTreePositions ?? [];
  const { hasSearchParams, pageSearchParams } = createAppPageSearchParams(options.searchParams);
  const layoutMetadataPromise = resolveLayoutMetadata(layoutModules, options.params);
  const layoutViewportPromise = resolveLayoutViewport(layoutModules, options.params);

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

  const [layoutMetadataResults, layoutViewportResults, pageMetadata, pageViewport] =
    await Promise.all([
      layoutMetadataPromise,
      layoutViewportPromise,
      pageMetadataPromise,
      pageViewportPromise,
    ]);

  const metadataList = [
    ...layoutMetadataResults.filter(isPresent),
    ...(pageMetadata ? [pageMetadata] : []),
  ];
  const viewportList = [
    ...layoutViewportResults.filter(isPresent),
    ...(pageViewport ? [pageViewport] : []),
  ];

  const resolvedMetadataBase = metadataList.length > 0 ? mergeMetadata(metadataList) : null;
  const metadataSources = createMetadataSources(
    layoutMetadataResults,
    routeSegments,
    layoutTreePositions,
    pageMetadata,
    Boolean(options.pageModule),
  );
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
