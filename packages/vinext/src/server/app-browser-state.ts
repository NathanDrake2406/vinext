import type { ReactNode } from "react";
import { mergeElementsPromise } from "../shims/slot.js";
import { readAppElementsMetadata, type AppElements } from "./app-elements.js";
import type { ClientNavigationRenderSnapshot } from "../shims/navigation.js";

export type AppRouterState = {
  elements: Promise<AppElements>;
  renderId: number;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  rootLayoutTreePath: string | null;
  routeId: string;
};

export type AppRouterAction = {
  elements: Promise<AppElements>;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  renderId: number;
  rootLayoutTreePath: string | null;
  routeId: string;
  type: "navigate" | "replace";
};

export type PendingNavigationCommit = {
  action: AppRouterAction;
  rootLayoutTreePath: string | null;
  routeId: string;
};

export function routerReducer(state: AppRouterState, action: AppRouterAction): AppRouterState {
  switch (action.type) {
    case "navigate":
      return {
        elements: mergeElementsPromise(state.elements, action.elements),
        navigationSnapshot: action.navigationSnapshot,
        renderId: action.renderId,
        rootLayoutTreePath: action.rootLayoutTreePath,
        routeId: action.routeId,
      };
    case "replace":
      return {
        elements: action.elements,
        navigationSnapshot: action.navigationSnapshot,
        renderId: action.renderId,
        rootLayoutTreePath: action.rootLayoutTreePath,
        routeId: action.routeId,
      };
  }
}

export function shouldHardNavigate(
  currentRootLayoutTreePath: string | null,
  nextRootLayoutTreePath: string | null,
): boolean {
  return (
    currentRootLayoutTreePath !== null &&
    nextRootLayoutTreePath !== null &&
    currentRootLayoutTreePath !== nextRootLayoutTreePath
  );
}

export async function createPendingNavigationCommit(options: {
  currentState: AppRouterState;
  nextElements: Promise<AppElements>;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  renderId?: number;
  type: "navigate" | "replace";
}): Promise<PendingNavigationCommit> {
  const elements = await options.nextElements;
  const metadata = readAppElementsMetadata(elements);

  return {
    action: {
      elements: Promise.resolve(elements),
      navigationSnapshot: options.navigationSnapshot,
      renderId: options.renderId ?? options.currentState.renderId + 1,
      rootLayoutTreePath: metadata.rootLayoutTreePath,
      routeId: metadata.routeId,
      type: options.type,
    },
    rootLayoutTreePath: metadata.rootLayoutTreePath,
    routeId: metadata.routeId,
  };
}

export async function applyAppRouterStateUpdate(options: {
  commit: () => void;
  currentState: AppRouterState;
  dispatch: (action: AppRouterAction) => void;
  nextElements: Promise<AppElements>;
  navigationSnapshot?: ClientNavigationRenderSnapshot;
  onHardNavigate: (href: string) => void;
  targetHref: string;
  transition: (callback: () => void) => void;
  type?: "navigate" | "replace";
}): Promise<{ type: "dispatched" | "hard-navigate" }> {
  const pending = await createPendingNavigationCommit({
    currentState: options.currentState,
    nextElements: options.nextElements,
    navigationSnapshot: options.navigationSnapshot ?? options.currentState.navigationSnapshot,
    type: options.type ?? "navigate",
  });

  if (shouldHardNavigate(options.currentState.rootLayoutTreePath, pending.rootLayoutTreePath)) {
    options.onHardNavigate(options.targetHref);
    return { type: "hard-navigate" };
  }

  options.transition(() => {
    options.commit();
    options.dispatch(pending.action);
  });

  return { type: "dispatched" };
}

export function createRouteNodeSnapshot(
  elements: Promise<AppElements>,
  routeId: string,
): { elements: Promise<AppElements>; routeId: string } {
  return { elements, routeId };
}

export type AppRouteNodeSnapshot = ReturnType<typeof createRouteNodeSnapshot>;
export type AppRouteNodeValue = ReactNode;
