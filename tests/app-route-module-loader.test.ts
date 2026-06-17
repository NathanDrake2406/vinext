import { describe, expect, it, vi } from "vitest";
import {
  ensureAppRouteModulesLoaded,
  type LazyLoadableRoute,
} from "../packages/vinext/src/server/app-route-module-loader.js";

describe("ensureAppRouteModulesLoaded", () => {
  it("returns the route synchronously when there are no lazy thunks (eager route)", () => {
    const pageModule = { default: () => null };
    const route: LazyLoadableRoute = { page: pageModule };

    const result = ensureAppRouteModulesLoaded(route);

    // No promise — eager routes resolve synchronously.
    expect(result).toBe(route);
    expect(route.page).toBe(pageModule);
    expect(route.__loaded).toBe(true);
  });

  it("hydrates a lazy page module onto route.page", async () => {
    const pageModule = { default: () => null, generateMetadata: () => ({}) };
    const __loadPage = vi.fn(async () => pageModule);
    const route: LazyLoadableRoute = { page: null, __loadPage };

    const loaded = await ensureAppRouteModulesLoaded(route);

    expect(loaded).toBe(route);
    expect(route.page).toBe(pageModule);
    expect(route.routeHandler).toBeUndefined();
    expect(__loadPage).toHaveBeenCalledTimes(1);
  });

  it("hydrates a lazy route-handler module onto route.routeHandler", async () => {
    const handlerModule = { GET: () => new Response("ok") };
    const __loadRouteHandler = vi.fn(async () => handlerModule);
    const route: LazyLoadableRoute = { routeHandler: null, __loadRouteHandler };

    await ensureAppRouteModulesLoaded(route);

    expect(route.routeHandler).toBe(handlerModule);
  });

  it("loads both page and route handler in parallel", async () => {
    const pageModule = { default: () => null };
    const handlerModule = { POST: () => new Response() };
    const route: LazyLoadableRoute = {
      page: null,
      routeHandler: null,
      __loadPage: async () => pageModule,
      __loadRouteHandler: async () => handlerModule,
    };

    await ensureAppRouteModulesLoaded(route);

    expect(route.page).toBe(pageModule);
    expect(route.routeHandler).toBe(handlerModule);
  });

  it("hydrates lazy parallel slot page modules onto slot.page", async () => {
    const pageModule = { default: () => null };
    const slotPageModule = { default: () => null, unstable_dynamicStaleTime: 30 };
    const __loadPage = vi.fn(async () => slotPageModule);
    const route: LazyLoadableRoute = {
      page: pageModule,
      slots: {
        "modal:/dashboard/@modal": {
          page: null,
          __loadPage,
        },
      },
    };

    await ensureAppRouteModulesLoaded(route);

    expect(route.page).toBe(pageModule);
    expect(route.slots?.["modal:/dashboard/@modal"]?.page).toBe(slotPageModule);
    expect(__loadPage).toHaveBeenCalledTimes(1);
  });

  it("can hydrate route entry modules without evaluating parallel slot pages", async () => {
    const handlerModule = { GET: () => new Response("ok") };
    const slotPageModule = { default: () => null };
    const __loadRouteHandler = vi.fn(async () => handlerModule);
    const __loadSlotPage = vi.fn(async () => slotPageModule);
    const route: LazyLoadableRoute = {
      routeHandler: null,
      slots: {
        "panel:/dashboard/@panel": {
          page: null,
          __loadPage: __loadSlotPage,
        },
      },
      __loadRouteHandler,
    };

    await ensureAppRouteModulesLoaded(route, { includeParallelSlotPages: false });

    expect(route.routeHandler).toBe(handlerModule);
    expect(route.slots?.["panel:/dashboard/@panel"]?.page).toBeNull();
    expect(__loadRouteHandler).toHaveBeenCalledTimes(1);
    expect(__loadSlotPage).not.toHaveBeenCalled();
  });

  it("hydrates skipped slot pages when a later full page-route load requests them", async () => {
    const pageModule = { default: () => null };
    const slotPageModule = { default: () => null };
    const __loadPage = vi.fn(async () => pageModule);
    const __loadSlotPage = vi.fn(async () => slotPageModule);
    const route: LazyLoadableRoute = {
      page: null,
      slots: {
        "panel:/dashboard/@panel": {
          page: null,
          __loadPage: __loadSlotPage,
        },
      },
      __loadPage,
    };

    await ensureAppRouteModulesLoaded(route, { includeParallelSlotPages: false });
    await ensureAppRouteModulesLoaded(route);

    expect(route.page).toBe(pageModule);
    expect(route.slots?.["panel:/dashboard/@panel"]?.page).toBe(slotPageModule);
    expect(__loadPage).toHaveBeenCalledTimes(1);
    expect(__loadSlotPage).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a second call does not re-import", async () => {
    const pageModule = { default: () => null };
    const __loadPage = vi.fn(async () => pageModule);
    const route: LazyLoadableRoute = { page: null, __loadPage };

    await ensureAppRouteModulesLoaded(route);
    const second = ensureAppRouteModulesLoaded(route);

    // Already loaded → returns the route synchronously (not a promise).
    expect(second).toBe(route);
    expect(__loadPage).toHaveBeenCalledTimes(1);
  });

  it("dedups concurrent calls into a single import", async () => {
    let resolveImport: (mod: unknown) => void = () => {};
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve;
    });
    const pageModule = { default: () => null };
    const __loadPage = vi.fn(() => importPromise);
    const route: LazyLoadableRoute = { page: null, __loadPage };

    const a = ensureAppRouteModulesLoaded(route);
    const b = ensureAppRouteModulesLoaded(route);

    // Both callers observe the same in-flight promise.
    expect(a).toBe(b);
    resolveImport(pageModule);
    await Promise.all([a, b]);

    expect(__loadPage).toHaveBeenCalledTimes(1);
    expect(route.page).toBe(pageModule);
  });

  it("does not cache a failed import: re-throws and retries on the next call", async () => {
    const pageModule = { default: () => null };
    const __loadPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk load failed"))
      .mockResolvedValueOnce(pageModule);
    const route: LazyLoadableRoute = { page: null, __loadPage };

    // First call rejects and the rejection propagates to the caller.
    await expect(ensureAppRouteModulesLoaded(route)).rejects.toThrow("chunk load failed");
    // The failure is not stuck: state is reset for a retry.
    expect(route.__loaded).toBeFalsy();
    expect(route.__loading).toBeNull();

    // Next call retries the import and succeeds.
    await ensureAppRouteModulesLoaded(route);
    expect(route.page).toBe(pageModule);
    expect(__loadPage).toHaveBeenCalledTimes(2);
  });

  it("tolerates null / undefined routes", () => {
    expect(ensureAppRouteModulesLoaded(null)).toBeNull();
    expect(ensureAppRouteModulesLoaded(undefined)).toBeUndefined();
  });
});
