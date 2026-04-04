import { mergeElements } from "../shims/slot.js";
import { readAppElementsMetadata, type AppElements } from "./app-elements.js";
import type { ClientNavigationRenderSnapshot } from "../shims/navigation.js";

export type AppRouterState = {
  elements: AppElements;
  renderId: number;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  rootLayoutTreePath: string | null;
  routeId: string;
};

export type AppRouterAction = {
  elements: AppElements;
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
        elements: mergeElements(state.elements, action.elements),
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
    default: {
      const _exhaustive: never = action.type;
      throw new Error("[vinext] Unknown router action: " + String(_exhaustive));
    }
  }
}

/**
 * Returns true when a full-page (hard) navigation is required.
 *
 * A hard navigate is needed whenever the root layout tree path changes,
 * including when one side is null (no root layout) and the other is non-null
 * (has a root layout). In that case the component tree structure changes
 * fundamentally and React cannot reconcile in-place.
 *
 * The only case that does NOT require a hard navigate is when both sides
 * share the same root layout path (including both being null).
 */
export function shouldHardNavigate(
  currentRootLayoutTreePath: string | null,
  nextRootLayoutTreePath: string | null,
): boolean {
  return currentRootLayoutTreePath !== nextRootLayoutTreePath;
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
      elements,
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
