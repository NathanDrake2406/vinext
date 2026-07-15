import type { Metadata } from "vinext/shims/metadata";
import type { ThenableParamsObserver } from "vinext/shims/thenable-params";
import type { AppPageParams } from "./app-page-boundary.js";
import {
  resolveOrderedAppPageMetadata,
  type ActiveParallelRouteHeadInput,
  type AppPageHeadModule,
  type AppPageSearchParams,
  type ApplyAppPageFileBasedMetadata,
  type OrderedAppPageMetadataSource,
} from "./app-page-head.js";
import { resolveAppPageBranchParams, resolveAppPageSegmentParams } from "./app-page-params.js";
import type { MetadataFileRoute } from "./metadata-routes.js";

type HttpAccessFallbackBoundaryOwner =
  | { kind: "layout" }
  | {
      kind: "page";
      searchParams: AppPageSearchParams;
      searchParamsObserver?: ThenableParamsObserver;
    };

type AppPageNotFoundBoundaryRoute<TModule> = {
  notFound?: TModule | null;
  notFoundTreePosition?: number | null;
  routeSegments?: readonly string[] | null;
};

export function isPageOwnedNotFoundBoundary<TModule>(
  route: AppPageNotFoundBoundaryRoute<TModule> | null | undefined,
  boundaryModule: TModule | null | undefined,
): boolean {
  return (
    boundaryModule != null &&
    boundaryModule === route?.notFound &&
    route.notFoundTreePosition === (route.routeSegments?.length ?? 0)
  );
}

type HttpAccessFallbackMetadataPlanOptions<TModule extends AppPageHeadModule = AppPageHeadModule> =
  {
    boundaryModule?: TModule | null;
    boundaryOwner: HttpAccessFallbackBoundaryOwner;
    boundaryParams: AppPageParams;
    layoutModules: readonly (TModule | null | undefined)[];
    layoutTreePositions?: readonly number[] | null;
    parallelBranches?: readonly ActiveParallelRouteHeadInput<TModule>[] | null;
    params: AppPageParams;
    primaryParallelBranch?: ActiveParallelRouteHeadInput<TModule> | null;
    routeSegments?: readonly string[] | null;
  };

type ResolveHttpAccessFallbackMetadataOptions<
  TModule extends AppPageHeadModule = AppPageHeadModule,
> = HttpAccessFallbackMetadataPlanOptions<TModule> & {
  applyFileBasedMetadata?: ApplyAppPageFileBasedMetadata;
  basePath?: string;
  fallbackOnFileMetadataError?: boolean;
  metadataRoutes: readonly MetadataFileRoute[];
  routePath: string;
};

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Translate HTTP-access boundary semantics into the exact metadata source
 * order used by Next.js's loader-tree walk.
 *
 * The not-found convention is appended at every active leaf. A sibling
 * intercept is the primary leaf and therefore precedes the ordinary slot
 * branches; otherwise the convention also represents the primary page leaf.
 */
export function createHttpAccessFallbackMetadataPlan<TModule extends AppPageHeadModule>(
  options: HttpAccessFallbackMetadataPlanOptions<TModule>,
): OrderedAppPageMetadataSource<TModule>[] {
  const routeSegments = options.routeSegments ?? [];
  const sources: OrderedAppPageMetadataSource<TModule>[] = [];

  for (const [index, layoutModule] of options.layoutModules.entries()) {
    if (!isPresent(layoutModule)) continue;

    const treePosition = options.layoutTreePositions?.[index] ?? 0;
    sources.push({
      includeWhenEmpty: true,
      module: layoutModule,
      params: resolveAppPageSegmentParams(routeSegments, treePosition, options.params),
      routeSegments: routeSegments.slice(0, treePosition),
    });
  }

  const appendBoundary = () => {
    if (!options.boundaryModule) return;
    sources.push({
      module: options.boundaryModule,
      params: options.boundaryParams,
      routeSegments,
      ...(options.boundaryOwner.kind === "page"
        ? {
            searchParams: options.boundaryOwner.searchParams,
            searchParamsObserver: options.boundaryOwner.searchParamsObserver,
          }
        : {}),
    });
  };

  if (!options.primaryParallelBranch) {
    appendBoundary();
  }

  const parallelBranches = [
    ...(options.primaryParallelBranch ? [options.primaryParallelBranch] : []),
    ...[...(options.parallelBranches ?? [])].sort(
      (left, right) => right.ownerTreePosition - left.ownerTreePosition,
    ),
  ];

  for (const branch of parallelBranches) {
    const parallelRoute = branch.head;
    const parallelParams = parallelRoute.params ?? options.params;
    const parallelRouteSegments = parallelRoute.routeSegments ?? routeSegments;
    const layoutModules = [
      ...(parallelRoute.layoutModules ?? []),
      parallelRoute.layoutModule,
    ].filter(isPresent);
    const layoutTreePositions = parallelRoute.layoutTreePositions ?? [];
    const layoutParams = parallelRoute.layoutParams ?? [];

    for (const [index, layoutModule] of layoutModules.entries()) {
      sources.push({
        module: layoutModule,
        params:
          layoutParams[index] ??
          resolveAppPageBranchParams(
            parallelRouteSegments,
            layoutTreePositions[index] ?? 0,
            parallelParams,
          ),
        routeSegments: parallelRouteSegments,
      });
    }
    appendBoundary();
  }

  return sources;
}

export function resolveHttpAccessFallbackMetadata<TModule extends AppPageHeadModule>(
  options: ResolveHttpAccessFallbackMetadataOptions<TModule>,
): Promise<Metadata | null> {
  return resolveOrderedAppPageMetadata({
    applyFileBasedMetadata: options.applyFileBasedMetadata,
    basePath: options.basePath,
    fallbackOnFileMetadataError: options.fallbackOnFileMetadataError,
    metadataRoutes: options.metadataRoutes,
    params: options.params,
    routePath: options.routePath,
    routeSegments: options.routeSegments,
    sources: createHttpAccessFallbackMetadataPlan(options),
  });
}
