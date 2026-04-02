import { Suspense, type ComponentType, type ReactNode } from "react";
import {
  APP_ROOT_LAYOUT_KEY,
  APP_ROUTE_KEY,
  APP_UNMATCHED_SLOT_WIRE_VALUE,
  type AppElements,
} from "./app-elements.js";
import { ErrorBoundary, NotFoundBoundary } from "../shims/error-boundary.js";
import { LayoutSegmentProvider } from "../shims/layout-segment-context.js";
import { MetadataHead, ViewportHead, type Metadata, type Viewport } from "../shims/metadata.js";
import { Children, ParallelSlot, Slot } from "../shims/slot.js";
import type { AppPageParams } from "./app-page-boundary.js";

type AppPageComponentProps = {
  children?: ReactNode;
  error?: Error;
  params?: unknown;
  reset?: () => void;
} & Record<string, unknown>;

type AppPageComponent = ComponentType<AppPageComponentProps>;
type AppPageErrorComponent = ComponentType<{ error: Error; reset: () => void }>;

export type AppPageModule = Record<string, unknown> & {
  default?: AppPageComponent | null | undefined;
};

export type AppPageErrorModule = Record<string, unknown> & {
  default?: AppPageErrorComponent | null | undefined;
};

export type AppPageRouteWiringSlot<
  TModule extends AppPageModule = AppPageModule,
  TErrorModule extends AppPageErrorModule = AppPageErrorModule,
> = {
  default?: TModule | null;
  error?: TErrorModule | null;
  layout?: TModule | null;
  layoutIndex: number;
  loading?: TModule | null;
  page?: TModule | null;
};

export type AppPageRouteWiringRoute<
  TModule extends AppPageModule = AppPageModule,
  TErrorModule extends AppPageErrorModule = AppPageErrorModule,
> = {
  error?: TErrorModule | null;
  errors?: readonly (TErrorModule | null | undefined)[] | null;
  layoutTreePositions?: readonly number[] | null;
  layouts: readonly (TModule | null | undefined)[];
  loading?: TModule | null;
  notFound?: TModule | null;
  notFounds?: readonly (TModule | null | undefined)[] | null;
  routeSegments?: readonly string[];
  slots?: Readonly<Record<string, AppPageRouteWiringSlot<TModule, TErrorModule>>> | null;
  templateTreePositions?: readonly number[] | null;
  templates?: readonly (TModule | null | undefined)[] | null;
};

export type AppPageSlotOverride<TModule extends AppPageModule = AppPageModule> = {
  pageModule: TModule;
  params?: AppPageParams;
  props?: Readonly<Record<string, unknown>>;
};

export type AppPageLayoutEntry<
  TModule extends AppPageModule = AppPageModule,
  TErrorModule extends AppPageErrorModule = AppPageErrorModule,
> = {
  errorModule?: TErrorModule | null | undefined;
  id: string;
  layoutModule?: TModule | null | undefined;
  notFoundModule?: TModule | null | undefined;
  treePath: string;
  treePosition: number;
};

export type BuildAppPageRouteElementOptions<
  TModule extends AppPageModule = AppPageModule,
  TErrorModule extends AppPageErrorModule = AppPageErrorModule,
> = {
  element: ReactNode;
  globalErrorModule?: TErrorModule | null;
  makeThenableParams: (params: AppPageParams) => unknown;
  matchedParams: AppPageParams;
  resolvedMetadata: Metadata | null;
  resolvedViewport: Viewport;
  rootNotFoundModule?: TModule | null;
  route: AppPageRouteWiringRoute<TModule, TErrorModule>;
  slotOverrides?: Readonly<Record<string, AppPageSlotOverride<TModule>>> | null;
};

export type BuildAppPageElementsOptions<
  TModule extends AppPageModule = AppPageModule,
  TErrorModule extends AppPageErrorModule = AppPageErrorModule,
> = Omit<BuildAppPageRouteElementOptions<TModule, TErrorModule>, "globalErrorModule"> & {
  routePath: string;
};

type AppPageTemplateEntry<TModule extends AppPageModule = AppPageModule> = {
  id: string;
  templateModule?: TModule | null | undefined;
  treePath: string;
  treePosition: number;
};

function getDefaultExport<TModule extends AppPageModule>(
  module: TModule | null | undefined,
): AppPageComponent | null {
  return module?.default ?? null;
}

function getErrorBoundaryExport<TModule extends AppPageErrorModule>(
  module: TModule | null | undefined,
): AppPageErrorComponent | null {
  return module?.default ?? null;
}

export function createAppPageTreePath(
  routeSegments: readonly string[] | null | undefined,
  treePosition: number,
): string {
  const treePathSegments = routeSegments?.slice(0, treePosition) ?? [];
  if (treePathSegments.length === 0) {
    return "/";
  }
  return `/${treePathSegments.join("/")}`;
}

export function createAppPageLayoutEntries<
  TModule extends AppPageModule,
  TErrorModule extends AppPageErrorModule,
>(
  route: Pick<
    AppPageRouteWiringRoute<TModule, TErrorModule>,
    "errors" | "layoutTreePositions" | "layouts" | "notFounds" | "routeSegments"
  >,
): AppPageLayoutEntry<TModule, TErrorModule>[] {
  return route.layouts.map((layoutModule, index) => {
    const treePosition = route.layoutTreePositions?.[index] ?? 0;
    const treePath = createAppPageTreePath(route.routeSegments, treePosition);
    return {
      errorModule: route.errors?.[index] ?? null,
      id: `layout:${treePath}`,
      layoutModule,
      notFoundModule: route.notFounds?.[index] ?? null,
      treePath,
      treePosition,
    };
  });
}

export function createAppPageTemplateEntries<TModule extends AppPageModule>(
  route: Pick<
    AppPageRouteWiringRoute<TModule>,
    "routeSegments" | "templateTreePositions" | "templates"
  >,
): AppPageTemplateEntry<TModule>[] {
  return (route.templates ?? []).map((templateModule, index) => {
    const treePosition = route.templateTreePositions?.[index] ?? 0;
    const treePath = createAppPageTreePath(route.routeSegments, treePosition);
    return {
      id: `template:${treePath}`,
      templateModule,
      treePath,
      treePosition,
    };
  });
}

export function resolveAppPageChildSegments(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string[] {
  const rawSegments = routeSegments.slice(treePosition);
  const resolvedSegments: string[] = [];

  for (const segment of rawSegments) {
    if (
      segment.startsWith("[[...") &&
      segment.endsWith("]]") &&
      segment.length > "[[...x]]".length - 1
    ) {
      const paramName = segment.slice(5, -2);
      const paramValue = params[paramName];
      if (Array.isArray(paramValue) && paramValue.length === 0) {
        continue;
      }
      if (paramValue === undefined) {
        continue;
      }
      resolvedSegments.push(Array.isArray(paramValue) ? paramValue.join("/") : paramValue);
      continue;
    }

    if (segment.startsWith("[...") && segment.endsWith("]")) {
      const paramName = segment.slice(4, -1);
      const paramValue = params[paramName];
      if (Array.isArray(paramValue)) {
        resolvedSegments.push(paramValue.join("/"));
        continue;
      }
      resolvedSegments.push(paramValue ?? segment);
      continue;
    }

    if (segment.startsWith("[") && segment.endsWith("]") && !segment.includes(".")) {
      const paramName = segment.slice(1, -1);
      const paramValue = params[paramName];
      resolvedSegments.push(
        Array.isArray(paramValue) ? paramValue.join("/") : (paramValue ?? segment),
      );
      continue;
    }

    resolvedSegments.push(segment);
  }

  return resolvedSegments;
}

function resolveAppPageVisibleSegments(
  routeSegments: readonly string[],
  params: AppPageParams,
): string[] {
  const resolvedSegments = resolveAppPageChildSegments(routeSegments, 0, params);
  return resolvedSegments.filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
}

function resolveAppPageTemplateKey(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string {
  const visibleSegments = resolveAppPageVisibleSegments(routeSegments.slice(treePosition), params);
  return visibleSegments[0] ?? "";
}

function createAppPageParallelSlotEntries<
  TModule extends AppPageModule,
  TErrorModule extends AppPageErrorModule,
>(
  layoutIndex: number,
  layoutEntries: readonly AppPageLayoutEntry<TModule, TErrorModule>[],
  route: AppPageRouteWiringRoute<TModule, TErrorModule>,
): Readonly<Record<string, ReactNode>> | undefined {
  const parallelSlots: Record<string, ReactNode> = {};

  for (const [slotName, slot] of Object.entries(route.slots ?? {})) {
    const targetIndex = slot.layoutIndex >= 0 ? slot.layoutIndex : layoutEntries.length - 1;
    if (targetIndex !== layoutIndex) {
      continue;
    }

    const layoutEntry = layoutEntries[targetIndex];
    const treePath = layoutEntry?.treePath ?? "/";
    parallelSlots[slotName] = (
      <LayoutSegmentProvider segmentMap={{ children: [] }}>
        <Slot id={`slot:${slotName}:${treePath}`} />
      </LayoutSegmentProvider>
    );
  }

  return Object.keys(parallelSlots).length > 0 ? parallelSlots : undefined;
}

function createAppPageRouteHead(metadata: Metadata | null, viewport: Viewport): ReactNode {
  return (
    <>
      <meta charSet="utf-8" />
      {metadata ? <MetadataHead metadata={metadata} /> : null}
      <ViewportHead viewport={viewport} />
    </>
  );
}

export function buildAppPageElements<
  TModule extends AppPageModule,
  TErrorModule extends AppPageErrorModule,
>(options: BuildAppPageElementsOptions<TModule, TErrorModule>): AppElements {
  const elements: Record<string, ReactNode | string | null> = {};
  const routeId = `route:${options.routePath}`;
  const pageId = `page:${options.routePath}`;
  const layoutEntries = createAppPageLayoutEntries(options.route);
  const templateEntries = createAppPageTemplateEntries(options.route);
  const routeThenableParams = options.makeThenableParams(options.matchedParams);
  const rootLayoutTreePath = layoutEntries[0]?.treePath ?? null;

  elements[APP_ROUTE_KEY] = routeId;
  elements[APP_ROOT_LAYOUT_KEY] = rootLayoutTreePath;
  elements[pageId] = options.element;

  for (const templateEntry of templateEntries) {
    const templateComponent = getDefaultExport(templateEntry.templateModule);
    if (!templateComponent) {
      continue;
    }
    const TemplateComponent = templateComponent;
    elements[templateEntry.id] = (
      <TemplateComponent params={options.matchedParams}>{<Children />}</TemplateComponent>
    );
  }

  for (let index = 0; index < layoutEntries.length; index++) {
    const layoutEntry = layoutEntries[index];
    const layoutComponent = getDefaultExport(layoutEntry.layoutModule);
    if (!layoutComponent) {
      continue;
    }

    const layoutProps: Record<string, unknown> = {
      params: routeThenableParams,
    };

    for (const [slotName, slot] of Object.entries(options.route.slots ?? {})) {
      const targetIndex = slot.layoutIndex >= 0 ? slot.layoutIndex : layoutEntries.length - 1;
      if (targetIndex !== index) {
        continue;
      }
      layoutProps[slotName] = <ParallelSlot name={slotName} />;
    }

    const LayoutComponent = layoutComponent;
    elements[layoutEntry.id] = (
      <LayoutComponent {...layoutProps}>
        <Children />
      </LayoutComponent>
    );
  }

  for (const [slotName, slot] of Object.entries(options.route.slots ?? {})) {
    const targetIndex = slot.layoutIndex >= 0 ? slot.layoutIndex : layoutEntries.length - 1;
    const treePath = layoutEntries[targetIndex]?.treePath ?? "/";
    const slotId = `slot:${slotName}:${treePath}`;
    const slotOverride = options.slotOverrides?.[slotName];
    const slotParams = slotOverride?.params ?? options.matchedParams;
    const slotComponent =
      getDefaultExport(slotOverride?.pageModule) ??
      getDefaultExport(slot.page) ??
      getDefaultExport(slot.default);

    if (!slotComponent) {
      elements[slotId] = APP_UNMATCHED_SLOT_WIRE_VALUE;
      continue;
    }

    const slotProps: Record<string, unknown> = {
      params: options.makeThenableParams(slotParams),
    };
    if (slotOverride?.props) {
      Object.assign(slotProps, slotOverride.props);
    }

    const SlotComponent = slotComponent;
    let slotElement: ReactNode = <SlotComponent {...slotProps} />;

    const slotLayoutComponent = getDefaultExport(slot.layout);
    if (slotLayoutComponent) {
      const SlotLayoutComponent = slotLayoutComponent;
      slotElement = (
        <SlotLayoutComponent params={options.makeThenableParams(slotParams)}>
          {slotElement}
        </SlotLayoutComponent>
      );
    }

    const slotLoadingComponent = getDefaultExport(slot.loading);
    if (slotLoadingComponent) {
      const SlotLoadingComponent = slotLoadingComponent;
      slotElement = <Suspense fallback={<SlotLoadingComponent />}>{slotElement}</Suspense>;
    }

    const slotErrorComponent = getErrorBoundaryExport(slot.error);
    if (slotErrorComponent) {
      slotElement = <ErrorBoundary fallback={slotErrorComponent}>{slotElement}</ErrorBoundary>;
    }

    elements[slotId] = slotElement;
  }

  let routeChildren: ReactNode = (
    <LayoutSegmentProvider segmentMap={{ children: [] }}>
      <Slot id={pageId} />
    </LayoutSegmentProvider>
  );

  const routeLoadingComponent = getDefaultExport(options.route.loading);
  if (routeLoadingComponent) {
    const RouteLoadingComponent = routeLoadingComponent;
    routeChildren = <Suspense fallback={<RouteLoadingComponent />}>{routeChildren}</Suspense>;
  }

  const lastLayoutErrorModule =
    options.route.errors && options.route.errors.length > 0
      ? options.route.errors[options.route.errors.length - 1]
      : null;
  const pageErrorComponent = getErrorBoundaryExport(options.route.error);
  if (pageErrorComponent && options.route.error !== lastLayoutErrorModule) {
    routeChildren = <ErrorBoundary fallback={pageErrorComponent}>{routeChildren}</ErrorBoundary>;
  }

  const notFoundComponent =
    getDefaultExport(options.route.notFound) ?? getDefaultExport(options.rootNotFoundModule);
  if (notFoundComponent) {
    const NotFoundComponent = notFoundComponent;
    routeChildren = (
      <NotFoundBoundary fallback={<NotFoundComponent />}>{routeChildren}</NotFoundBoundary>
    );
  }

  for (let index = layoutEntries.length - 1; index >= 0; index--) {
    const layoutEntry = layoutEntries[index];
    let layoutChildren = routeChildren;
    const templateEntry = templateEntries.find(
      (entry) => entry.treePosition === layoutEntry.treePosition,
    );
    if (templateEntry) {
      layoutChildren = (
        <Slot
          id={templateEntry.id}
          key={resolveAppPageTemplateKey(
            options.route.routeSegments ?? [],
            templateEntry.treePosition,
            options.matchedParams,
          )}
        >
          {layoutChildren}
        </Slot>
      );
    }

    const layoutErrorComponent = getErrorBoundaryExport(layoutEntry.errorModule);
    if (layoutErrorComponent) {
      layoutChildren = (
        <ErrorBoundary fallback={layoutErrorComponent}>{layoutChildren}</ErrorBoundary>
      );
    }

    const layoutNotFoundComponent = getDefaultExport(layoutEntry.notFoundModule);
    if (layoutNotFoundComponent) {
      const LayoutNotFoundComponent = layoutNotFoundComponent;
      layoutChildren = (
        <NotFoundBoundary fallback={<LayoutNotFoundComponent />}>{layoutChildren}</NotFoundBoundary>
      );
    }

    routeChildren = (
      <LayoutSegmentProvider
        segmentMap={{
          children: resolveAppPageChildSegments(
            options.route.routeSegments ?? [],
            layoutEntry.treePosition,
            options.matchedParams,
          ),
          ...Object.fromEntries(
            Object.entries(options.route.slots ?? {})
              .filter(([, slot]) => {
                const targetIndex =
                  slot.layoutIndex >= 0 ? slot.layoutIndex : layoutEntries.length - 1;
                return targetIndex === index;
              })
              .map(([slotName]) => [slotName, []]),
          ),
        }}
      >
        <Slot
          id={layoutEntry.id}
          parallelSlots={createAppPageParallelSlotEntries(index, layoutEntries, options.route)}
        >
          {layoutChildren}
        </Slot>
      </LayoutSegmentProvider>
    );
  }

  elements[routeId] = (
    <>
      {createAppPageRouteHead(options.resolvedMetadata, options.resolvedViewport)}
      {routeChildren}
    </>
  );

  return elements;
}

export function buildAppPageRouteElement<
  TModule extends AppPageModule,
  TErrorModule extends AppPageErrorModule,
>(options: BuildAppPageRouteElementOptions<TModule, TErrorModule>): ReactNode {
  /**
   * @deprecated PR 2c introduces buildAppPageElements() for the flat payload
   * cutover. Keep this helper during the transition so intermediate test runs
   * remain stable, then delete it only after all call sites have switched.
   */
  let element: ReactNode = (
    <LayoutSegmentProvider segmentMap={{ children: [] }}>{options.element}</LayoutSegmentProvider>
  );

  element = (
    <>
      <meta charSet="utf-8" />
      {options.resolvedMetadata ? <MetadataHead metadata={options.resolvedMetadata} /> : null}
      <ViewportHead viewport={options.resolvedViewport} />
      {element}
    </>
  );

  const loadingComponent = getDefaultExport(options.route.loading);
  if (loadingComponent) {
    const LoadingComponent = loadingComponent;
    element = <Suspense fallback={<LoadingComponent />}>{element}</Suspense>;
  }

  const lastLayoutErrorModule =
    options.route.errors && options.route.errors.length > 0
      ? options.route.errors[options.route.errors.length - 1]
      : null;
  const pageErrorComponent = getErrorBoundaryExport(options.route.error);
  if (pageErrorComponent && options.route.error !== lastLayoutErrorModule) {
    element = <ErrorBoundary fallback={pageErrorComponent}>{element}</ErrorBoundary>;
  }

  const notFoundComponent =
    getDefaultExport(options.route.notFound) ?? getDefaultExport(options.rootNotFoundModule);
  if (notFoundComponent) {
    const NotFoundComponent = notFoundComponent;
    element = <NotFoundBoundary fallback={<NotFoundComponent />}>{element}</NotFoundBoundary>;
  }

  const templates = options.route.templates ?? [];
  for (let index = templates.length - 1; index >= 0; index--) {
    const templateComponent = getDefaultExport(templates[index]);
    if (!templateComponent) {
      continue;
    }
    const TemplateComponent = templateComponent;
    element = <TemplateComponent params={options.matchedParams}>{element}</TemplateComponent>;
  }

  const routeSlots = options.route.slots ?? {};
  const layoutEntries = createAppPageLayoutEntries(options.route);
  const routeThenableParams = options.makeThenableParams(options.matchedParams);

  for (let index = layoutEntries.length - 1; index >= 0; index--) {
    const layoutEntry = layoutEntries[index];
    const layoutErrorComponent = getErrorBoundaryExport(layoutEntry.errorModule);
    if (layoutErrorComponent) {
      element = <ErrorBoundary fallback={layoutErrorComponent}>{element}</ErrorBoundary>;
    }

    const layoutComponent = getDefaultExport(layoutEntry.layoutModule);
    if (!layoutComponent) {
      continue;
    }

    const layoutNotFoundComponent = getDefaultExport(layoutEntry.notFoundModule);
    if (layoutNotFoundComponent) {
      const LayoutNotFoundComponent = layoutNotFoundComponent;
      element = (
        <NotFoundBoundary fallback={<LayoutNotFoundComponent />}>{element}</NotFoundBoundary>
      );
    }

    const layoutProps: Record<string, unknown> = {
      params: routeThenableParams,
    };

    for (const [slotName, slot] of Object.entries(routeSlots)) {
      const targetIndex = slot.layoutIndex >= 0 ? slot.layoutIndex : layoutEntries.length - 1;
      if (index !== targetIndex) {
        continue;
      }

      const slotOverride = options.slotOverrides?.[slotName];
      const slotParams = slotOverride?.params ?? options.matchedParams;
      const slotComponent =
        getDefaultExport(slotOverride?.pageModule) ??
        getDefaultExport(slot.page) ??
        getDefaultExport(slot.default);
      if (!slotComponent) {
        continue;
      }

      const slotProps: Record<string, unknown> = {
        params: options.makeThenableParams(slotParams),
      };
      if (slotOverride?.props) {
        Object.assign(slotProps, slotOverride.props);
      }

      const SlotComponent = slotComponent;
      let slotElement: ReactNode = <SlotComponent {...slotProps} />;

      const slotLayoutComponent = getDefaultExport(slot.layout);
      if (slotLayoutComponent) {
        const SlotLayoutComponent = slotLayoutComponent;
        slotElement = (
          <SlotLayoutComponent params={options.makeThenableParams(slotParams)}>
            {slotElement}
          </SlotLayoutComponent>
        );
      }

      const slotLoadingComponent = getDefaultExport(slot.loading);
      if (slotLoadingComponent) {
        const SlotLoadingComponent = slotLoadingComponent;
        slotElement = <Suspense fallback={<SlotLoadingComponent />}>{slotElement}</Suspense>;
      }

      const slotErrorComponent = getErrorBoundaryExport(slot.error);
      if (slotErrorComponent) {
        slotElement = <ErrorBoundary fallback={slotErrorComponent}>{slotElement}</ErrorBoundary>;
      }

      layoutProps[slotName] = slotElement;
    }

    const LayoutComponent = layoutComponent;
    element = <LayoutComponent {...layoutProps}>{element}</LayoutComponent>;
    element = (
      <LayoutSegmentProvider
        segmentMap={{
          children: resolveAppPageChildSegments(
            options.route.routeSegments ?? [],
            layoutEntry.treePosition,
            options.matchedParams,
          ),
        }}
      >
        {element}
      </LayoutSegmentProvider>
    );
  }

  const globalErrorComponent = getErrorBoundaryExport(options.globalErrorModule);
  if (globalErrorComponent) {
    element = <ErrorBoundary fallback={globalErrorComponent}>{element}</ErrorBoundary>;
  }

  return element;
}
