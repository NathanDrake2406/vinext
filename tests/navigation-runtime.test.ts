import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  NAVIGATION_RUNTIME_KEY,
  getNavigationRuntime,
  registerNavigationRuntimeBootstrap,
  subscribeNavigationRuntimeRscChunk,
  type NavigationRuntime,
  type NavigationRuntimeBootstrap,
  type NavigationRuntimeFunctions,
  type NavigationRuntimeRscBootstrap,
  type NavigationRuntimeRscChunk,
} from "../packages/vinext/src/client/navigation-runtime.js";

const originalWindow = Reflect.get(globalThis, "window");
const hadWindow = Reflect.has(globalThis, "window");

afterEach(() => {
  if (hadWindow) {
    Reflect.set(globalThis, "window", originalWindow);
    return;
  }
  Reflect.deleteProperty(globalThis, "window");
});

describe("navigation runtime contract", () => {
  it("merges bootstrap data without clobbering independently registered RSC payloads", () => {
    Reflect.set(globalThis, "window", {});

    const chunk: NavigationRuntimeRscChunk = "flight";
    const rscBootstrap: NavigationRuntimeRscBootstrap = {
      params: { id: "123" },
      rsc: [chunk],
    };
    const bootstrap: Partial<NavigationRuntimeBootstrap> = { rsc: rscBootstrap };

    registerNavigationRuntimeBootstrap(bootstrap);
    registerNavigationRuntimeBootstrap({ routeManifest: null });

    expect(getNavigationRuntime()?.bootstrap.rsc?.params?.id).toBe("123");
    expect(getNavigationRuntime()?.bootstrap.routeManifest).toBeNull();
  });

  it("creates the RSC bootstrap buffer when subscribing the first chunk", () => {
    Reflect.set(globalThis, "window", {});

    subscribeNavigationRuntimeRscChunk("chunk");

    expect(getNavigationRuntime()?.bootstrap.rsc?.rsc).toEqual(["chunk"]);
  });

  it("rejects runtime objects with non-function capability slots", () => {
    const runtimeWindow = {};
    const functions: NavigationRuntimeFunctions = {};
    const runtime: NavigationRuntime = {
      bootstrap: {
        routeManifest: null,
        rsc: undefined,
      },
      functions,
    };
    Reflect.set(globalThis, "window", runtimeWindow);
    Reflect.set(runtimeWindow, NAVIGATION_RUNTIME_KEY, runtime);
    Reflect.set(runtimeWindow, NAVIGATION_RUNTIME_KEY, {
      bootstrap: {
        routeManifest: null,
        rsc: undefined,
      },
      functions: {
        navigate: "not callable",
      },
    });

    expect(getNavigationRuntime()).toBeNull();
  });

  it("rejects route manifests without the map-backed segment graph contract", () => {
    const runtimeWindow = {};
    Reflect.set(globalThis, "window", runtimeWindow);
    Reflect.set(runtimeWindow, NAVIGATION_RUNTIME_KEY, {
      bootstrap: {
        routeManifest: {
          graphVersion: "test",
          segmentGraph: {
            interceptions: {
              values: () => [],
            },
          },
        },
        rsc: undefined,
      },
      functions: {},
    });

    expect(getNavigationRuntime()).toBeNull();
  });

  it("rejects route manifests with malformed interception entries", () => {
    const runtimeWindow = {};
    const segmentGraphMaps = {
      boundaries: new Map(),
      defaults: new Map(),
      interceptions: new Map([["bad", {}]]),
      interceptionsBySlotId: new Map(),
      layouts: new Map(),
      pages: new Map(),
      rootBoundaries: new Map(),
      routeHandlers: new Map(),
      routes: new Map(),
      slotBindings: new Map(),
      slots: new Map(),
      templates: new Map(),
    };
    Reflect.set(globalThis, "window", runtimeWindow);
    Reflect.set(runtimeWindow, NAVIGATION_RUNTIME_KEY, {
      bootstrap: {
        routeManifest: {
          graphVersion: "test",
          segmentGraph: segmentGraphMaps,
        },
        rsc: undefined,
      },
      functions: {},
    });

    expect(getNavigationRuntime()).toBeNull();
  });
});
