import { describe, expect, it } from "vite-plus/test";
import { createElement, Suspense } from "react";
import {
  AppElementsWire,
  APP_PREFETCH_LOADING_SHELL_MARKER_KEY,
  type AppElements,
} from "../packages/vinext/src/server/app-elements.js";
import {
  MAX_OPTIMISTIC_ROUTE_TEMPLATES,
  MAX_OPTIMISTIC_ROUTE_TEMPLATE_SOURCES,
  OptimisticRouteTemplateStore,
  createOptimisticRouteElements,
  createOptimisticRouteTemplate,
  getOptimisticPrefetchSourceKey,
  getOptimisticRouteTemplateKey,
  matchOptimisticRouteManifestRoute,
  resolveOptimisticNavigationPayload,
  type OptimisticRouteTemplate,
} from "../packages/vinext/src/server/app-optimistic-routing.js";
import type {
  GraphVersion,
  RouteManifest,
  RouteManifestRoute,
  RouteManifestSlotBinding,
} from "../packages/vinext/src/routing/app-route-graph.js";

function route(input: {
  id: string;
  isDynamic: boolean;
  paramNames?: readonly string[];
  pattern: string;
  patternParts: readonly string[];
  slotIds?: readonly string[];
}): RouteManifestRoute {
  return {
    id: input.id,
    isDynamic: input.isDynamic,
    layoutIds: ["layout:/"],
    pageId: `page:${input.pattern}`,
    paramNames: [...(input.paramNames ?? [])],
    pattern: input.pattern,
    patternParts: [...input.patternParts],
    rootBoundaryId: null,
    rootParamNames: [],
    routeHandlerId: null,
    slotIds: [...(input.slotIds ?? [])],
    templateIds: [],
  };
}

function manifest(
  routes: readonly RouteManifestRoute[],
  slotBindings: readonly RouteManifestSlotBinding[] = [],
): RouteManifest {
  return {
    graphVersion: "graph:test" as GraphVersion,
    segmentGraph: {
      boundaries: new Map(),
      defaults: new Map(),
      interceptions: new Map(),
      interceptionsBySlotId: new Map(),
      layouts: new Map(),
      pages: new Map(),
      rootBoundaries: new Map(),
      routeHandlers: new Map(),
      routes: new Map(routes.map((entry) => [entry.id, entry])),
      slotBindings: new Map(slotBindings.map((entry) => [entry.id, entry])),
      slots: new Map(),
      templates: new Map(),
    },
  };
}

function blogManifest(): RouteManifest {
  return manifest([
    route({
      id: "route:/blog/featured",
      isDynamic: false,
      pattern: "/blog/featured",
      patternParts: ["blog", "featured"],
    }),
    route({
      id: "route:/blog/:slug",
      isDynamic: true,
      paramNames: ["slug"],
      pattern: "/blog/:slug",
      patternParts: ["blog", ":slug"],
    }),
  ]);
}

function dashboardManifestWithoutProfile(): RouteManifest {
  return manifest([
    route({
      id: "route:/dashboard/settings",
      isDynamic: false,
      pattern: "/dashboard/settings",
      patternParts: ["dashboard", "settings"],
    }),
    route({
      id: "route:/dashboard/:catchall+",
      isDynamic: true,
      paramNames: ["catchall"],
      pattern: "/dashboard/:catchall+",
      patternParts: ["dashboard", ":catchall+"],
    }),
  ]);
}

function createBlogElements(): AppElements {
  const routeId = AppElementsWire.encodeRouteId("/blog/post-1", null);
  const pageId = AppElementsWire.encodePageId("/blog/post-1", null);
  return {
    ...AppElementsWire.createMetadataEntries({
      interceptionContext: null,
      layoutIds: ["layout:/"],
      rootLayoutTreePath: "/",
      routeId,
    }),
    [pageId]: createElement("article", null, "Post 1"),
    [routeId]: createElement(
      Suspense,
      { fallback: createElement("p", { id: "loading-message" }, "Loading...") },
      createElement("main", null, "Page slot"),
    ),
  };
}

function createBlogLoadingShellElements(): AppElements {
  const routeId = AppElementsWire.encodeRouteId("/blog/post-1", null);
  const pageId = AppElementsWire.encodePageId("/blog/post-1", null);
  return {
    ...AppElementsWire.createMetadataEntries({
      interceptionContext: null,
      layoutIds: ["layout:/"],
      rootLayoutTreePath: "/",
      routeId,
    }),
    [APP_PREFETCH_LOADING_SHELL_MARKER_KEY]: "LoadingBoundary",
    [pageId]: null,
    [routeId]: createElement("p", { id: "loading-message" }, "Loading post-1..."),
  };
}

function staticSettingsManifest(): RouteManifest {
  return manifest([
    route({
      id: "route:/settings",
      isDynamic: false,
      pattern: "/settings",
      patternParts: ["settings"],
    }),
  ]);
}

function createSettingsLoadingShellElements(): AppElements {
  const routeId = AppElementsWire.encodeRouteId("/settings", null);
  const pageId = AppElementsWire.encodePageId("/settings", null);
  return {
    ...AppElementsWire.createMetadataEntries({
      interceptionContext: null,
      layoutIds: ["layout:/"],
      rootLayoutTreePath: "/",
      routeId,
    }),
    [APP_PREFETCH_LOADING_SHELL_MARKER_KEY]: "LoadingBoundary",
    [pageId]: null,
    [routeId]: createElement("p", { id: "loading-message" }, "Loading settings..."),
  };
}

describe("App Router optimistic routing", () => {
  it("matches dynamic route params while keeping static siblings authoritative", () => {
    const routes = blogManifest();

    expect(
      matchOptimisticRouteManifestRoute({
        basePath: "",
        href: "/blog/post-1.rsc?_rsc=abc",
        routeManifest: routes,
      }),
    ).toMatchObject({
      params: { slug: "post-1" },
      route: { id: "route:/blog/:slug" },
    });

    expect(
      matchOptimisticRouteManifestRoute({
        basePath: "",
        href: "/blog/featured",
        routeManifest: routes,
      })?.route.id,
    ).toBe("route:/blog/featured");
  });

  it("preserves dynamic route param key order", () => {
    const twoSegment = manifest([
      route({
        id: "route:/:category/:id",
        isDynamic: true,
        paramNames: ["category", "id"],
        pattern: "/:category/:id",
        patternParts: [":category", ":id"],
      }),
    ]);

    const twoMatch = matchOptimisticRouteManifestRoute({
      basePath: "",
      href: "/electronics/123",
      routeManifest: twoSegment,
    });
    expect(twoMatch).not.toBeNull();
    expect(Object.keys(twoMatch!.params)).toEqual(["category", "id"]);

    const threeSegment = manifest([
      route({
        id: "route:/:a/:b/:c",
        isDynamic: true,
        paramNames: ["a", "b", "c"],
        pattern: "/:a/:b/:c",
        patternParts: [":a", ":b", ":c"],
      }),
    ]);

    const threeMatch = matchOptimisticRouteManifestRoute({
      basePath: "",
      href: "/x/y/z",
      routeManifest: threeSegment,
    });
    expect(threeMatch).not.toBeNull();
    expect(Object.keys(threeMatch!.params)).toEqual(["a", "b", "c"]);
  });

  it("does not fall through from a known static subtree to a catch-all sibling", () => {
    expect(
      matchOptimisticRouteManifestRoute({
        basePath: "",
        href: "/dashboard/settings/profile",
        routeManifest: dashboardManifestWithoutProfile(),
      }),
    ).toBeNull();
  });

  it("creates loading-only optimistic elements from a learned dynamic route template", () => {
    const routeManifest = blogManifest();
    const elements = createBlogElements();
    const template = createOptimisticRouteTemplate({
      basePath: "",
      elements,
      href: "/blog/post-1.rsc?_rsc=abc",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
    });

    expect(template).toMatchObject<Partial<OptimisticRouteTemplate>>({
      routeId: "route:/blog/:slug",
    });
    if (template === null) {
      throw new Error("Expected optimistic route template");
    }

    const pageId = AppElementsWire.encodePageId("/blog/post-1", null);
    const optimisticElements = createOptimisticRouteElements(template);
    expect(optimisticElements[pageId]).not.toBe(elements[pageId]);

    const navigationPayload = resolveOptimisticNavigationPayload({
      basePath: "",
      href: "/blog/post-2",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
      templates: new Map([
        [
          getOptimisticRouteTemplateKey({
            interceptionContext: null,
            mountedSlotsHeader: null,
            routeId: template.routeId,
          }),
          template,
        ],
      ]),
    });

    expect(navigationPayload?.params).toEqual({ slug: "post-2" });
    expect(navigationPayload?.elements[pageId]).not.toBe(elements[pageId]);
  });

  it("includes active parallel slot params in optimistic navigation payloads", () => {
    // Mirrors the immediate pre-dynamic-render assertion in Next.js:
    // test/e2e/app-dir/parallel-route-navigations/parallel-route-navigations.test.ts
    // https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/parallel-route-navigations/parallel-route-navigations.test.ts
    const slotId = "slot:/[teamID]/@slot";
    const routeManifest = manifest(
      [
        route({
          id: "route:/:teamID/sub/:folder",
          isDynamic: true,
          paramNames: ["teamID", "folder"],
          pattern: "/:teamID/sub/:folder",
          patternParts: [":teamID", "sub", ":folder"],
          slotIds: [slotId],
        }),
      ],
      [
        {
          defaultId: null,
          id: "route:/:teamID/sub/:folder::slot:/[teamID]/@slot",
          ownerLayoutId: "layout:/[teamID]",
          routeId: "route:/:teamID/sub/:folder",
          routeSegments: ["[...catchAll]"],
          slotId,
          slotParamNames: ["teamID", "catchAll"],
          slotPatternParts: [":teamID", ":catchAll+"],
          state: "active",
        },
      ],
    );
    const elements = createBlogLoadingShellElements();
    const template = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements,
      href: "/vercel/sub/folder.rsc",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
    });

    if (template === null) {
      throw new Error("Expected optimistic route template");
    }

    const navigationPayload = resolveOptimisticNavigationPayload({
      basePath: "",
      href: "/vercel/sub/other-folder",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
      templates: new Map([
        [
          getOptimisticRouteTemplateKey({
            interceptionContext: null,
            mountedSlotsHeader: null,
            routeId: template.routeId,
          }),
          template,
        ],
      ]),
    });

    expect(navigationPayload?.params).toEqual({
      teamID: "vercel",
      folder: "other-folder",
      catchAll: ["sub", "other-folder"],
    });
  });

  it("learns optimistic templates from an implicit children slot", () => {
    const childrenSlotId = "slot:children:/blog";
    const routeManifest = manifest([
      route({
        id: "route:/blog/:slug",
        isDynamic: true,
        paramNames: ["slug"],
        pattern: "/blog/:slug",
        patternParts: ["blog", ":slug"],
        slotIds: [childrenSlotId],
      }),
    ]);
    const routeId = AppElementsWire.encodeRouteId("/blog/post-1", null);
    const elements: AppElements = {
      ...AppElementsWire.createMetadataEntries({
        interceptionContext: null,
        layoutIds: ["layout:/", "layout:/blog"],
        rootLayoutTreePath: "/",
        routeId,
      }),
      [childrenSlotId]: createElement("article", null, "Post 1"),
      [routeId]: createElement(
        Suspense,
        { fallback: createElement("p", null, "Loading") },
        createElement("main", null, "Route"),
      ),
    };

    const template = createOptimisticRouteTemplate({
      basePath: "",
      elements,
      href: "/blog/post-1.rsc",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
    });

    expect(template?.pageElementIds).toEqual([childrenSlotId]);
    expect(createOptimisticRouteElements(template!)[childrenSlotId]).not.toBe(
      elements[childrenSlotId],
    );
  });

  it("does not learn routes without a loading boundary", () => {
    const routeManifest = blogManifest();
    const routeId = AppElementsWire.encodeRouteId("/blog/post-1", null);
    const elements: AppElements = {
      ...AppElementsWire.createMetadataEntries({
        interceptionContext: null,
        layoutIds: ["layout:/"],
        rootLayoutTreePath: "/",
        routeId,
      }),
      [routeId]: createElement("main", null, "No loading boundary"),
    };

    expect(
      createOptimisticRouteTemplate({
        basePath: "",
        elements,
        href: "/blog/post-1.rsc",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).toBeNull();

    expect(
      createOptimisticRouteTemplate({
        allowLoadingShell: true,
        basePath: "",
        elements: { ...elements, [routeId]: null },
        href: "/blog/post-1.rsc",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).toBeNull();

    expect(
      createOptimisticRouteTemplate({
        allowLoadingShell: true,
        basePath: "",
        elements: { ...elements, [AppElementsWire.encodePageId("/blog/post-1", null)]: null },
        href: "/blog/post-1.rsc",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).toBeNull();
  });

  it("learns dynamic route templates from loading-shell prefetch payloads only when allowed", () => {
    const routeManifest = blogManifest();
    const elements = createBlogLoadingShellElements();

    expect(
      createOptimisticRouteTemplate({
        basePath: "",
        elements,
        href: "/blog/post-1.rsc",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).toBeNull();

    const template = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements,
      href: "/blog/post-1.rsc",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
    });

    expect(template).toMatchObject<Partial<OptimisticRouteTemplate>>({
      pageElementIds: [AppElementsWire.encodePageId("/blog/post-1", null)],
      routeId: "route:/blog/:slug",
    });
  });

  it("learns static route templates from loading-shell prefetch payloads", () => {
    const routeManifest = staticSettingsManifest();
    const template = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements: createSettingsLoadingShellElements(),
      href: "/settings.rsc",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
    });

    expect(template).toMatchObject<Partial<OptimisticRouteTemplate>>({
      pageElementIds: [AppElementsWire.encodePageId("/settings", null)],
      routeId: "route:/settings",
    });
    if (template === null) {
      throw new Error("Expected optimistic route template");
    }

    const navigationPayload = resolveOptimisticNavigationPayload({
      basePath: "",
      href: "/settings?tab=billing",
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeManifest,
      templates: new Map([
        [
          getOptimisticRouteTemplateKey({
            interceptionContext: null,
            mountedSlotsHeader: null,
            routeId: template.routeId,
          }),
          template,
        ],
      ]),
    });

    expect(navigationPayload?.params).toEqual({});
    expect(navigationPayload?.template).toBe(template);
  });

  it("keeps learned templates distinct across mounted slot headers", () => {
    const routeManifest = blogManifest();
    const slotATemplate = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements: createBlogLoadingShellElements(),
      href: "/blog/post-1.rsc",
      interceptionContext: null,
      mountedSlotsHeader: "modal",
      routeManifest,
    });
    const slotBTemplate = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements: createBlogLoadingShellElements(),
      href: "/blog/post-2.rsc",
      interceptionContext: null,
      mountedSlotsHeader: "drawer",
      routeManifest,
    });

    if (slotATemplate === null || slotBTemplate === null) {
      throw new Error("Expected optimistic route templates");
    }

    const templates = new Map([
      [
        getOptimisticRouteTemplateKey({
          interceptionContext: null,
          mountedSlotsHeader: "modal",
          routeId: slotATemplate.routeId,
        }),
        slotATemplate,
      ],
      [
        getOptimisticRouteTemplateKey({
          interceptionContext: null,
          mountedSlotsHeader: "drawer",
          routeId: slotBTemplate.routeId,
        }),
        slotBTemplate,
      ],
    ]);

    expect(
      resolveOptimisticNavigationPayload({
        basePath: "",
        href: "/blog/post-3",
        interceptionContext: null,
        mountedSlotsHeader: "modal",
        routeManifest,
        templates,
      })?.template,
    ).toBe(slotATemplate);
    expect(
      resolveOptimisticNavigationPayload({
        basePath: "",
        href: "/blog/post-3",
        interceptionContext: null,
        mountedSlotsHeader: "drawer",
        routeManifest,
        templates,
      })?.template,
    ).toBe(slotBTemplate);
  });

  it("scopes prefetch source learning by current router context", () => {
    const cacheKey = "/blog/post-1.rsc\0/feed";

    expect(
      getOptimisticPrefetchSourceKey({
        cacheKey,
        interceptionContext: "/feed",
        mountedSlotsHeader: "modal",
      }),
    ).not.toBe(
      getOptimisticPrefetchSourceKey({
        cacheKey,
        interceptionContext: "/gallery",
        mountedSlotsHeader: "modal",
      }),
    );
    expect(
      getOptimisticPrefetchSourceKey({
        cacheKey,
        interceptionContext: "/feed",
        mountedSlotsHeader: "modal",
      }),
    ).not.toBe(
      getOptimisticPrefetchSourceKey({
        cacheKey,
        interceptionContext: "/feed",
        mountedSlotsHeader: "drawer",
      }),
    );
  });

  it("does not learn or resolve optimistic payloads for intercepted contexts", () => {
    const routeManifest = blogManifest();
    const elements = createBlogLoadingShellElements();

    const template = createOptimisticRouteTemplate({
      allowLoadingShell: true,
      basePath: "",
      elements,
      href: "/blog/post-1.rsc",
      interceptionContext: "/feed",
      mountedSlotsHeader: null,
      routeManifest,
    });

    expect(template).toBeNull();
    expect(
      resolveOptimisticNavigationPayload({
        basePath: "",
        href: "/blog/post-2",
        interceptionContext: "/feed",
        mountedSlotsHeader: null,
        routeManifest,
        templates: new Map(),
      }),
    ).toBeNull();
  });
});

function numberedDynamicRouteManifest(count: number): RouteManifest {
  return manifest(
    Array.from({ length: count }, (_unused, index) =>
      route({
        id: `route:/r${index}/:id`,
        isDynamic: true,
        paramNames: ["id"],
        pattern: `/r${index}/:id`,
        patternParts: [`r${index}`, ":id"],
      }),
    ),
  );
}

function createSuspenseShellElements(pathname: string): AppElements {
  const routeId = AppElementsWire.encodeRouteId(pathname, null);
  const pageId = AppElementsWire.encodePageId(pathname, null);
  return {
    ...AppElementsWire.createMetadataEntries({
      interceptionContext: null,
      layoutIds: ["layout:/"],
      rootLayoutTreePath: "/",
      routeId,
    }),
    [pageId]: createElement("article", null, pathname),
    [routeId]: createElement(
      Suspense,
      { fallback: createElement("p", null, "Loading...") },
      createElement("main", null, "Page slot"),
    ),
  };
}

/**
 * Learns route `/r{index}/:id` from a synthetic prefetch source, mirroring what
 * learnOptimisticRouteTemplateFromPrefetch hands the store in the browser entry.
 * `sourceVariant` produces distinct source keys for the same route id, which is
 * the real N:1 shape: many prefetched URLs collapse onto one route.
 */
function learnNumberedRoute(
  store: OptimisticRouteTemplateStore,
  routeManifest: RouteManifest,
  index: number,
  sourceVariant = "",
): { sourceKey: string; templateKey: string } {
  const pathname = `/r${index}/a`;
  const template = createOptimisticRouteTemplate({
    basePath: "",
    elements: createSuspenseShellElements(pathname),
    href: pathname,
    interceptionContext: null,
    mountedSlotsHeader: null,
    routeManifest,
  });
  if (template === null) {
    throw new Error(`Expected optimistic route template for ${pathname}`);
  }

  const sourceKey = getOptimisticPrefetchSourceKey({
    cacheKey: `${pathname}${sourceVariant}.rsc?_rsc=abc `,
    interceptionContext: null,
    mountedSlotsHeader: null,
  });
  store.learn({ interceptionContext: null, mountedSlotsHeader: null, sourceKey, template });

  return {
    sourceKey,
    templateKey: getOptimisticRouteTemplateKey({
      interceptionContext: null,
      mountedSlotsHeader: null,
      routeId: template.routeId,
    }),
  };
}

describe("App Router optimistic route template store bounds", () => {
  it("evicts the least recently used template and the source records that produced it", () => {
    const overflow = 3;
    const routeCount = MAX_OPTIMISTIC_ROUTE_TEMPLATES + overflow;
    const routeManifest = numberedDynamicRouteManifest(routeCount);
    const store = new OptimisticRouteTemplateStore();

    const learned = Array.from({ length: routeCount }, (_unused, index) =>
      learnNumberedRoute(store, routeManifest, index),
    );

    expect(store.templates.size).toBe(MAX_OPTIMISTIC_ROUTE_TEMPLATES);
    // Insertion order is recency order, so the first `overflow` routes go first.
    for (const evicted of learned.slice(0, overflow)) {
      expect(store.templates.has(evicted.templateKey)).toBe(false);
    }
    for (const retained of learned.slice(overflow)) {
      expect(store.templates.has(retained.templateKey)).toBe(true);
    }

    // Consistency: no source record may outlive the template it produced,
    // otherwise the learning pass would skip that prefetch source forever and
    // the route could never regain an optimistic shell.
    expect(store.sources.size).toBe(MAX_OPTIMISTIC_ROUTE_TEMPLATES);
    for (const [sourceKey, templateKey] of store.sources) {
      expect(store.templates.has(templateKey)).toBe(true);
      expect(store.hasLearnedOrPendingSource(sourceKey)).toBe(true);
    }
    for (const evicted of learned.slice(0, overflow)) {
      expect(store.hasLearnedOrPendingSource(evicted.sourceKey)).toBe(false);
    }
  });

  it("degrades an evicted route to no optimistic paint and stays relearnable", () => {
    const routeCount = MAX_OPTIMISTIC_ROUTE_TEMPLATES + 1;
    const routeManifest = numberedDynamicRouteManifest(routeCount);
    const store = new OptimisticRouteTemplateStore();
    for (let index = 0; index < routeCount; index += 1) {
      learnNumberedRoute(store, routeManifest, index);
    }

    // A null payload is exactly what the browser entry reads as "no optimistic
    // shell available": it leaves detachedNavigationCommits false and falls
    // through to the authoritative RSC fetch, the same path a never-learned
    // route takes. Losing a template must therefore not throw.
    expect(
      store.resolveNavigationPayload({
        basePath: "",
        href: "/r0/b",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).toBeNull();

    // Because the evicted template's source record went with it, the next
    // learning pass is free to relearn the route from the prefetch cache.
    const relearned = learnNumberedRoute(store, routeManifest, 0);
    expect(store.templates.has(relearned.templateKey)).toBe(true);
    expect(
      store.resolveNavigationPayload({
        basePath: "",
        href: "/r0/b",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      })?.params,
    ).toEqual({ id: "b" });
  });

  it("keeps a resolved template alive across later learning", () => {
    const routeManifest = numberedDynamicRouteManifest(MAX_OPTIMISTIC_ROUTE_TEMPLATES + 1);
    const store = new OptimisticRouteTemplateStore();
    const learned = Array.from({ length: MAX_OPTIMISTIC_ROUTE_TEMPLATES }, (_unused, index) =>
      learnNumberedRoute(store, routeManifest, index),
    );

    // Resolving route 0 makes it the most recent, so learning one more route
    // must evict route 1 instead. Without recency-on-read a route that is
    // navigated to repeatedly but never relearned would age out.
    expect(
      store.resolveNavigationPayload({
        basePath: "",
        href: "/r0/b",
        interceptionContext: null,
        mountedSlotsHeader: null,
        routeManifest,
      }),
    ).not.toBeNull();

    learnNumberedRoute(store, routeManifest, MAX_OPTIMISTIC_ROUTE_TEMPLATES);

    expect(store.templates.has(learned[0]!.templateKey)).toBe(true);
    expect(store.templates.has(learned[1]!.templateKey)).toBe(false);
  });

  it("bounds source records that collapse onto a single route id", () => {
    const routeManifest = numberedDynamicRouteManifest(1);
    const store = new OptimisticRouteTemplateStore();

    const overflow = 2;
    const total = MAX_OPTIMISTIC_ROUTE_TEMPLATE_SOURCES + overflow;
    const learned = Array.from({ length: total }, (_unused, index) =>
      learnNumberedRoute(store, routeManifest, 0, `-${index}`),
    );

    // One route id, so one template, but one source record per prefetched URL —
    // this is the collection that actually grows per URL in a long session.
    expect(store.templates.size).toBe(1);
    expect(store.sources.size).toBe(MAX_OPTIMISTIC_ROUTE_TEMPLATE_SOURCES);
    expect(store.hasLearnedOrPendingSource(learned[0]!.sourceKey)).toBe(false);
    expect(store.hasLearnedOrPendingSource(learned[total - 1]!.sourceKey)).toBe(true);
    // Dropping a source record must never strand the template it points at; the
    // worst case is one redundant local re-decode.
    expect(store.templates.has(learned[0]!.templateKey)).toBe(true);
  });

  it("never evicts in-flight learning entries", () => {
    const routeCount = MAX_OPTIMISTIC_ROUTE_TEMPLATES + 1;
    const routeManifest = numberedDynamicRouteManifest(routeCount);
    const store = new OptimisticRouteTemplateStore();

    const pending = Promise.resolve();
    store.trackLearning("in-flight", pending);

    for (let index = 0; index < routeCount; index += 1) {
      learnNumberedRoute(store, routeManifest, index);
    }

    // Eviction must not touch the in-flight map: dropping a tracked promise
    // would let a concurrent pass start a duplicate decode and stop it from
    // awaiting the one already running.
    expect(store.pendingLearningCount).toBe(1);
    expect(store.pendingLearning()).toEqual([pending]);
    expect(store.hasLearnedOrPendingSource("in-flight")).toBe(true);

    store.settleLearning("in-flight");
    expect(store.pendingLearningCount).toBe(0);
  });
});
