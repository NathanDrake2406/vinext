import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  NAVIGATION_RUNTIME_KEY,
  getNavigationRuntime,
  registerNavigationRuntimeBootstrap,
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
});
