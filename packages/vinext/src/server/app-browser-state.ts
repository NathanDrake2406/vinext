import { stripBasePath } from "../utils/base-path.js";
import {
  AppElementsWire,
  getMountedSlotIdsHeader,
  type AppElements,
  type LayoutFlags,
} from "./app-elements.js";
import { createRscRequestHeaders } from "./app-rsc-cache-busting.js";
import {
  NavigationTraceReasonCodes,
  createNavigationTrace,
  type NavigationTrace,
  type NavigationTraceReasonCode,
} from "./navigation-trace.js";
import type { ClientNavigationRenderSnapshot } from "vinext/shims/navigation";

const VINEXT_PREVIOUS_NEXT_URL_HISTORY_STATE_KEY = "__vinext_previousNextUrl";

type HistoryStateRecord = {
  [key: string]: unknown;
};

export type OperationLane = "navigation" | "refresh" | "traverse" | "server-action" | "hmr";

type OperationRecordBase = {
  id: number;
  lane: OperationLane;
  startedVisibleCommitVersion: number;
};

export type PendingOperationRecord = OperationRecordBase & {
  state: "pending";
};

export type CommittedOperationRecord = OperationRecordBase & {
  state: "committed";
  visibleCommitVersion: number;
};

export type OperationRecord = PendingOperationRecord | CommittedOperationRecord;

export type AppRouterState = {
  activeOperation: OperationRecord | null;
  elements: AppElements;
  interceptionContext: string | null;
  layoutFlags: LayoutFlags;
  previousNextUrl: string | null;
  renderId: number;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  rootLayoutTreePath: string | null;
  routeId: string;
  visibleCommitVersion: number;
};

export type AppRouterAction = {
  elements: AppElements;
  interceptionContext: string | null;
  layoutFlags: LayoutFlags;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  operation: PendingOperationRecord;
  previousNextUrl: string | null;
  renderId: number;
  rootLayoutTreePath: string | null;
  routeId: string;
  type: "navigate" | "replace" | "traverse";
};

export type PendingNavigationCommit = {
  action: AppRouterAction;
  interceptionContext: string | null;
  previousNextUrl: string | null;
  rootLayoutTreePath: string | null;
  routeId: string;
};

type PendingNavigationCommitDisposition = "dispatch" | "hard-navigate" | "skip";
type PendingNavigationCommitDispositionDecision = {
  disposition: PendingNavigationCommitDisposition;
  trace: NavigationTrace;
};

function cloneHistoryState(state: unknown): HistoryStateRecord {
  if (!state || typeof state !== "object") {
    return {};
  }

  const nextState: HistoryStateRecord = {};
  for (const [key, value] of Object.entries(state)) {
    nextState[key] = value;
  }
  return nextState;
}

export function createHistoryStateWithPreviousNextUrl(
  state: unknown,
  previousNextUrl: string | null,
): HistoryStateRecord | null {
  const nextState = cloneHistoryState(state);

  if (previousNextUrl === null) {
    delete nextState[VINEXT_PREVIOUS_NEXT_URL_HISTORY_STATE_KEY];
  } else {
    nextState[VINEXT_PREVIOUS_NEXT_URL_HISTORY_STATE_KEY] = previousNextUrl;
  }

  return Object.keys(nextState).length > 0 ? nextState : null;
}

export function readHistoryStatePreviousNextUrl(state: unknown): string | null {
  const value = cloneHistoryState(state)[VINEXT_PREVIOUS_NEXT_URL_HISTORY_STATE_KEY];
  return typeof value === "string" ? value : null;
}

function createOperationRecord(options: {
  id: number;
  lane: OperationLane;
  startedVisibleCommitVersion: number;
}): PendingOperationRecord {
  return {
    id: options.id,
    lane: options.lane,
    startedVisibleCommitVersion: options.startedVisibleCommitVersion,
    state: "pending",
  };
}

export function resolveInterceptionContextFromPreviousNextUrl(
  previousNextUrl: string | null,
  basePath: string = "",
): string | null {
  if (previousNextUrl === null) {
    return null;
  }

  const parsedUrl = new URL(previousNextUrl, "http://localhost");
  return stripBasePath(parsedUrl.pathname, basePath);
}

type ResolveServerActionRequestStateOptions = {
  actionId: string;
  basePath: string;
  elements: AppElements;
  previousNextUrl: string | null;
};

type ResolveServerActionRequestStateResult = {
  headers: Headers;
};

/**
 * Pure: builds the fetch Headers for a server-action POST. Carries the same
 * interception-context and mounted-slots headers the refresh path already
 * sends, so the server-action re-render can rebuild the intercepted tree
 * instead of replacing it with the direct route.
 *
 * Next.js sends `Next-URL: state.previousNextUrl || state.nextUrl` on action
 * POSTs when `hasInterceptionRouteInCurrentTree(state.tree)`. Vinext's
 * X-Vinext-Interception-Context is the equivalent signal for the server-side
 * `findIntercept` lookup.
 */
export function resolveServerActionRequestState(
  options: ResolveServerActionRequestStateOptions,
): ResolveServerActionRequestStateResult {
  const headers = createRscRequestHeaders();
  headers.set("x-rsc-action", options.actionId);

  const interceptionContext = resolveInterceptionContextFromPreviousNextUrl(
    options.previousNextUrl,
    options.basePath,
  );
  if (interceptionContext !== null) {
    headers.set("X-Vinext-Interception-Context", interceptionContext);
  }

  const mountedSlotsHeader = getMountedSlotIdsHeader(options.elements);
  if (mountedSlotsHeader !== null) {
    headers.set("X-Vinext-Mounted-Slots", mountedSlotsHeader);
  }

  return { headers };
}

export function shouldHardNavigate(
  currentRootLayoutTreePath: string | null,
  nextRootLayoutTreePath: string | null,
): boolean {
  // `null` means the payload could not identify an enclosing root layout
  // boundary. Treat that as soft-navigation compatible so fallback payloads
  // do not force a hard reload purely because metadata is absent.
  return (
    currentRootLayoutTreePath !== null &&
    nextRootLayoutTreePath !== null &&
    currentRootLayoutTreePath !== nextRootLayoutTreePath
  );
}

export function resolvePendingNavigationCommitDisposition(options: {
  activeNavigationId: number;
  currentVisibleCommitVersion: number;
  currentRootLayoutTreePath: string | null;
  nextRootLayoutTreePath: string | null;
  startedNavigationId: number;
  startedVisibleCommitVersion: number;
}): PendingNavigationCommitDisposition {
  if (options.startedNavigationId !== options.activeNavigationId) {
    return "skip";
  }

  if (options.startedVisibleCommitVersion !== options.currentVisibleCommitVersion) {
    return "skip";
  }

  if (shouldHardNavigate(options.currentRootLayoutTreePath, options.nextRootLayoutTreePath)) {
    return "hard-navigate";
  }

  return "dispatch";
}

export function resolvePendingNavigationCommitDispositionDecision(options: {
  activeNavigationId: number;
  currentVisibleCommitVersion: number;
  currentRootLayoutTreePath: string | null;
  nextRootLayoutTreePath: string | null;
  startedNavigationId: number;
  startedVisibleCommitVersion: number;
}): PendingNavigationCommitDispositionDecision {
  const disposition = resolvePendingNavigationCommitDisposition(options);
  const traceFields = {
    activeNavigationId: options.activeNavigationId,
    currentVisibleCommitVersion: options.currentVisibleCommitVersion,
    currentRootLayoutTreePath: options.currentRootLayoutTreePath,
    nextRootLayoutTreePath: options.nextRootLayoutTreePath,
    startedNavigationId: options.startedNavigationId,
    startedVisibleCommitVersion: options.startedVisibleCommitVersion,
  };

  return {
    disposition,
    trace: createNavigationTrace(
      getPendingNavigationCommitDispositionTraceCode({
        currentRootLayoutTreePath: options.currentRootLayoutTreePath,
        disposition,
        nextRootLayoutTreePath: options.nextRootLayoutTreePath,
      }),
      traceFields,
    ),
  };
}

function getPendingNavigationCommitDispositionTraceCode(options: {
  currentRootLayoutTreePath: string | null;
  disposition: PendingNavigationCommitDisposition;
  nextRootLayoutTreePath: string | null;
}): NavigationTraceReasonCode {
  switch (options.disposition) {
    case "skip":
      return NavigationTraceReasonCodes.staleOperation;
    case "hard-navigate":
      return NavigationTraceReasonCodes.rootBoundaryChanged;
    case "dispatch":
      return options.currentRootLayoutTreePath === null || options.nextRootLayoutTreePath === null
        ? NavigationTraceReasonCodes.rootBoundaryUnknown
        : NavigationTraceReasonCodes.commitCurrent;
    default: {
      const _exhaustive: never = options.disposition;
      throw new Error("[vinext] Unknown navigation commit disposition: " + String(_exhaustive));
    }
  }
}

export async function createPendingNavigationCommit(options: {
  currentState: AppRouterState;
  nextElements: Promise<AppElements>;
  navigationSnapshot: ClientNavigationRenderSnapshot;
  operationLane: OperationLane;
  previousNextUrl?: string | null;
  renderId: number;
  type: "navigate" | "replace" | "traverse";
}): Promise<PendingNavigationCommit> {
  const elements = await options.nextElements;
  const metadata = AppElementsWire.readMetadata(elements);
  const previousNextUrl =
    options.previousNextUrl !== undefined
      ? options.previousNextUrl
      : options.currentState.previousNextUrl;

  return {
    action: {
      elements,
      interceptionContext: metadata.interceptionContext,
      layoutFlags: metadata.layoutFlags,
      navigationSnapshot: options.navigationSnapshot,
      operation: createOperationRecord({
        id: options.renderId,
        lane: options.operationLane,
        startedVisibleCommitVersion: options.currentState.visibleCommitVersion,
      }),
      previousNextUrl,
      renderId: options.renderId,
      rootLayoutTreePath: metadata.rootLayoutTreePath,
      routeId: metadata.routeId,
      type: options.type,
    },
    // Convenience aliases — always equal action.interceptionContext / action.rootLayoutTreePath / action.routeId.
    interceptionContext: metadata.interceptionContext,
    previousNextUrl,
    rootLayoutTreePath: metadata.rootLayoutTreePath,
    routeId: metadata.routeId,
  };
}
