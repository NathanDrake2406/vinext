/**
 * Lazy route-module hydration for the App Router RSC entry.
 *
 * The generated route table (see `entries/app-rsc-manifest.ts`) emits page,
 * parallel-slot page, and route-handler modules as lazy `() => import()` thunks
 * instead of eager `import * as mod_N` namespaces. This keeps those modules out
 * of the RSC entry's top-level evaluation, so an app with many routes — or
 * routes with expensive module-level initialization — does not pay to evaluate
 * every route module at Worker startup. Only the module(s) for the matched route
 * are evaluated, on demand.
 *
 * `ensureAppRouteModulesLoaded` resolves a route's lazy thunks and populates
 * the synchronous `page` / `routeHandler` / `slot.page` fields that the rest of
 * the request pipeline reads directly. It can load only route-entry modules
 * (page + route handler) for pre-dispatch branching, or the full page render
 * tree when parallel slot pages are needed. It is:
 *
 *  - idempotent: once a route is loaded it returns immediately;
 *  - dedup'd: concurrent calls for the same route share one in-flight promise,
 *    so a burst of requests to the same route triggers a single import.
 *
 * Callers must `await` it before any synchronous read of `route.page` or
 * `route.routeHandler` (segment config, fetch-cache mode, runtime resolution,
 * dispatch branch, element building, etc.).
 */

type LazyModuleThunk = () => Promise<unknown>;

export type LazyLoadableSlot = {
  page?: unknown;
  /** Lazy loader for the parallel slot's page module; `null`/absent when none. */
  __loadPage?: LazyModuleThunk | null;
};

export type LazyLoadableRoute = {
  page?: unknown;
  routeHandler?: unknown;
  slots?: Readonly<Record<string, LazyLoadableSlot>> | null;
  /** Lazy loader for the page module; `null`/absent when the page is eager. */
  __loadPage?: LazyModuleThunk | null;
  /** Lazy loader for the route-handler module; `null`/absent when none. */
  __loadRouteHandler?: LazyModuleThunk | null;
  /** Set once the lazy modules have been resolved onto `page`/`routeHandler`. */
  __entryLoaded?: boolean;
  /** In-flight entry-module hydration promise, used to dedup concurrent loads. */
  __entryLoading?: Promise<unknown> | null;
  /** Set once all lazy modules have been resolved. */
  __loaded?: boolean;
  /** In-flight full route hydration promise, used to dedup concurrent loads. */
  __loading?: Promise<unknown> | null;
};

export type EnsureAppRouteModulesLoadedOptions = {
  /**
   * Include parallel-slot page modules. Disable this for the pre-dispatch
   * route-handler branch check, where route handlers need `route.routeHandler`
   * loaded but must not evaluate unrelated UI slot pages.
   */
  includeParallelSlotPages?: boolean;
};

/**
 * Resolve a route's lazy page/route-handler/parallel-slot page modules and
 * assign them onto the route's synchronous `page` / `routeHandler` / `slot.page`
 * fields. Returns the same route reference (synchronously when already loaded,
 * otherwise after the in-flight import resolves). Safe to call on
 * `null`/`undefined` routes and on eager routes that have no lazy thunks.
 */
export function ensureAppRouteModulesLoaded<TRoute extends LazyLoadableRoute>(
  route: TRoute | null | undefined,
  options?: EnsureAppRouteModulesLoadedOptions,
): TRoute | Promise<TRoute> {
  if (!route || route.__loaded) return route as TRoute;
  const includeParallelSlotPages = options?.includeParallelSlotPages !== false;
  if (!includeParallelSlotPages) return ensureRouteEntryModulesLoaded(route);
  if (route.__loading) return route.__loading as Promise<TRoute>;

  const slotLoaders = collectSlotLoaders(route);
  const entryResult = ensureRouteEntryModulesLoaded(route);
  if (slotLoaders.length === 0) {
    if (entryResult instanceof Promise) {
      route.__loading = entryResult
        .then((loadedRoute) => {
          loadedRoute.__loaded = true;
          loadedRoute.__loading = null;
          return loadedRoute;
        })
        .catch((error: unknown) => {
          route.__loading = null;
          throw error;
        });
      return route.__loading as Promise<TRoute>;
    }
    route.__loaded = true;
    route.__loading = null;
    return route;
  }

  const loading = Promise.resolve(entryResult)
    .then(async () => {
      const slotModules = await Promise.all(slotLoaders.map((entry) => entry.loadPage()));
      for (const [index, module] of slotModules.entries()) {
        slotLoaders[index]!.slot.page = module;
      }
      route.__loaded = true;
      route.__loading = null;
      return route;
    })
    .catch((error: unknown) => {
      route.__loading = null;
      throw error;
    });

  route.__loading = loading;
  return loading;
}

function ensureRouteEntryModulesLoaded<TRoute extends LazyLoadableRoute>(
  route: TRoute,
): TRoute | Promise<TRoute> {
  if (route.__entryLoaded) return route;
  if (route.__entryLoading) return route.__entryLoading as Promise<TRoute>;

  const loadPage = route.__loadPage;
  const loadRouteHandler = route.__loadRouteHandler;

  if (!loadPage && !loadRouteHandler) {
    route.__entryLoaded = true;
    return route;
  }

  const loading = Promise.all([
    loadPage ? loadPage() : undefined,
    loadRouteHandler ? loadRouteHandler() : undefined,
  ])
    .then(([pageModule, routeHandlerModule]) => {
      if (loadPage) route.page = pageModule;
      if (loadRouteHandler) route.routeHandler = routeHandlerModule;
      route.__entryLoaded = true;
      route.__entryLoading = null;
      return route;
    })
    .catch((error: unknown) => {
      // A rejected dynamic import() must not be cached: clearing `__entryLoading`
      // (and leaving `__entryLoaded` false) lets the next request retry instead
      // of wedging the route into a permanent failure for the isolate's lifetime.
      // Re-throw so the current request still observes the error. This mirrors
      // the eager model, where a module-eval failure is retried per isolate
      // rather than stuck on a stored rejected promise.
      route.__entryLoading = null;
      throw error;
    });

  route.__entryLoading = loading;
  return loading;
}

function collectSlotLoaders(route: LazyLoadableRoute): {
  slot: LazyLoadableSlot;
  loadPage: LazyModuleThunk;
}[] {
  return Object.values(route.slots ?? {})
    .map((slot) => ({ slot, loadPage: slot.__loadPage }))
    .filter(
      (entry): entry is { slot: LazyLoadableSlot; loadPage: LazyModuleThunk } =>
        typeof entry.loadPage === "function",
    );
}
