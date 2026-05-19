import type { RouteManifest } from "../routing/app-route-graph.js";

export type NavigationRuntimeSnapshot = {
  pathname: string;
  searchParams: [string, string][];
};

export type NavigationRuntimeRscChunk = string | [3, string];

export type NavigationRuntimeRscBootstrap = {
  nav?: NavigationRuntimeSnapshot;
  params?: Record<string, string | string[]>;
  rsc: NavigationRuntimeRscChunk[];
};

export type NavigationRuntimeKind = "navigate" | "traverse" | "refresh";

export type NavigationRuntimeHistoryUpdateMode = "push" | "replace";

export type NavigationRuntimeTraversalIntent = {
  direction: "back" | "forward" | "unknown";
  historyState: unknown;
  targetHistoryIndex: number | null;
};

export type NavigationRuntimeNavigate = (
  href: string,
  redirectDepth?: number,
  navigationKind?: NavigationRuntimeKind,
  historyUpdateMode?: NavigationRuntimeHistoryUpdateMode,
  previousNextUrlOverride?: string | null,
  programmaticTransition?: boolean,
  traversalIntent?: NavigationRuntimeTraversalIntent,
) => Promise<void>;

export type NavigationRuntimeFunctions = {
  clearNavigationCaches?: () => void;
  commitHashNavigation?: (
    href: string,
    historyUpdateMode: NavigationRuntimeHistoryUpdateMode,
    scroll: boolean,
  ) => void;
  navigate?: NavigationRuntimeNavigate;
  pingVisibleLinks?: () => void;
};

export type NavigationRuntimeBootstrap = {
  routeManifest: RouteManifest | null;
  rsc: NavigationRuntimeRscBootstrap | undefined;
};

export type NavigationRuntime = {
  bootstrap: NavigationRuntimeBootstrap;
  functions: NavigationRuntimeFunctions;
};

export const NAVIGATION_RUNTIME_KEY = Symbol.for("vinext.navigationRuntime");

function createNavigationRuntime(): NavigationRuntime {
  return {
    bootstrap: {
      routeManifest: null,
      rsc: undefined,
    },
    functions: {},
  };
}

function readRuntimeWindow(): Window | null {
  if (typeof window === "undefined") return null;
  return window;
}

function isNavigationRuntimeFunctions(value: unknown): value is NavigationRuntimeFunctions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    isOptionalRuntimeFunction(Reflect.get(value, "clearNavigationCaches")) &&
    isOptionalRuntimeFunction(Reflect.get(value, "commitHashNavigation")) &&
    isOptionalRuntimeFunction(Reflect.get(value, "navigate")) &&
    isOptionalRuntimeFunction(Reflect.get(value, "pingVisibleLinks"))
  );
}

function isNavigationRuntimeBootstrap(value: unknown): value is NavigationRuntimeBootstrap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNavigationRuntime(value: unknown): value is NavigationRuntime {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!("bootstrap" in value) || !("functions" in value)) return false;
  const { bootstrap, functions } = value;
  return isNavigationRuntimeBootstrap(bootstrap) && isNavigationRuntimeFunctions(functions);
}

function isOptionalRuntimeFunction(value: unknown): boolean {
  return value === undefined || typeof value === "function";
}

export function getNavigationRuntime(): NavigationRuntime | null {
  const runtimeWindow = readRuntimeWindow();
  if (runtimeWindow === null) return null;

  const runtime: unknown = Reflect.get(runtimeWindow, NAVIGATION_RUNTIME_KEY);
  return isNavigationRuntime(runtime) ? runtime : null;
}

function ensureNavigationRuntime(): NavigationRuntime {
  const runtimeWindow = readRuntimeWindow();
  if (runtimeWindow === null) {
    return createNavigationRuntime();
  }

  const existingRuntime: unknown = Reflect.get(runtimeWindow, NAVIGATION_RUNTIME_KEY);
  const runtime = isNavigationRuntime(existingRuntime)
    ? existingRuntime
    : createNavigationRuntime();
  Reflect.set(runtimeWindow, NAVIGATION_RUNTIME_KEY, runtime);
  return runtime;
}

export function registerNavigationRuntimeBootstrap(
  bootstrap: Partial<NavigationRuntimeBootstrap>,
): NavigationRuntime {
  const runtime = ensureNavigationRuntime();
  runtime.bootstrap = {
    ...runtime.bootstrap,
    ...bootstrap,
  };
  return runtime;
}

export function registerNavigationRuntimeFunctions(
  functions: Partial<NavigationRuntimeFunctions>,
): NavigationRuntime {
  const runtime = ensureNavigationRuntime();
  runtime.functions = {
    ...runtime.functions,
    ...functions,
  };
  return runtime;
}

export function hasAppNavigationRuntime(): boolean {
  return typeof getNavigationRuntime()?.functions.navigate === "function";
}
