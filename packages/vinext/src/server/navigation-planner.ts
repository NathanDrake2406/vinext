import type { RouteManifest } from "../routing/app-route-graph.js";
import {
  NavigationTraceReasonCodes,
  createNavigationLifecycleTraceFields,
  createNavigationTrace,
  type NavigationTrace,
  type NavigationTraceFields,
} from "./navigation-trace.js";

export type OperationLane =
  | "hmr"
  | "navigation"
  | "prefetch"
  | "refresh"
  | "server-action"
  | "traverse";

export type OperationToken = {
  operationId: number;
  lane: OperationLane;
  baseVisibleCommitVersion: number;
  graphVersion: string | null;
  deploymentVersion: string | null;
  targetSnapshotFingerprint: string;
  cacheVariantFingerprint?: string;
};

export type RouteSnapshotV0 = {
  routeId: string;
  rootBoundaryId: string | null;
  displayUrl: string;
  matchedUrl: string;
};

export type NavigationPlannerStateV0 = {
  nextOperationToken: OperationToken;
  // Callers that have lifecycle authority should pass the complete trace
  // context. When absent, the planner emits the stable root-boundary facts it
  // can derive from the event and visible snapshot.
  traceFields?: NavigationTraceFields;
  visibleCommitVersion: number;
  visibleSnapshot: RouteSnapshotV0;
};

export type RefreshScope = "visible";

export type NavigationEvent =
  | { kind: "navigate"; href: string; mode: "push" | "replace" }
  | { kind: "refresh"; scope: RefreshScope }
  | { kind: "traverse"; direction: "back" | "forward"; historyState: unknown }
  | { kind: "prefetch"; href: string }
  | { kind: "flightResponseArrived"; token: OperationToken; result: FlightResultV0 };

export type RequestedWork =
  | { kind: "flight"; href: string; mode: "push" | "replace" | "refresh" }
  | { direction: "back" | "forward"; historyState: unknown; kind: "traverseFlight" }
  | { kind: "prefetch"; href: string };

export type CommitProposal = {
  reason: "currentRootBoundary" | "rootBoundaryUnknownFallback";
  targetSnapshot: RouteSnapshotV0;
};

export type NoCommitReason = "prefetchOnly";
export type HardNavigationReason = "rootBoundaryChanged";
export type RootBoundaryTransition =
  | "currentRootBoundary"
  | "rootBoundaryChanged"
  | "rootBoundaryUnknownFallback";

export type NavigationDecisionV0 =
  | {
      kind: "requestWork";
      token: OperationToken;
      work: RequestedWork;
      trace: NavigationTrace;
    }
  | {
      kind: "proposeCommit";
      token: OperationToken;
      proposal: CommitProposal;
      trace: NavigationTrace;
    }
  | {
      kind: "noCommit";
      token: OperationToken;
      reason: NoCommitReason;
      trace: NavigationTrace;
    }
  | {
      kind: "hardNavigate";
      token: OperationToken;
      url: string;
      reason: HardNavigationReason;
      trace: NavigationTrace;
    };

export type FlightResultV0 = {
  href: string;
  targetSnapshot: RouteSnapshotV0;
};

export type NavigationPlannerInput = {
  routeManifest: RouteManifest | null;
  state: NavigationPlannerStateV0;
  event: NavigationEvent;
};

function createRequestWorkDecision(options: {
  eventKind: NavigationEvent["kind"];
  state: NavigationPlannerStateV0;
  work: RequestedWork;
}): NavigationDecisionV0 {
  return {
    kind: "requestWork",
    token: options.state.nextOperationToken,
    work: options.work,
    trace: createNavigationTrace(NavigationTraceReasonCodes.requestWork, {
      eventKind: options.eventKind,
      targetHref: getRequestedWorkTargetHref(options.work),
    }),
  };
}

function getRequestedWorkTargetHref(work: RequestedWork): string | null {
  switch (work.kind) {
    case "flight":
    case "prefetch":
      return work.href;
    case "traverseFlight":
      return null;
    default: {
      const _exhaustive: never = work;
      throw new Error("[vinext] Unknown requested navigation work: " + String(_exhaustive));
    }
  }
}

function createRootBoundaryTraceFields(options: {
  event: Extract<NavigationEvent, { kind: "flightResponseArrived" }>;
  state: NavigationPlannerStateV0;
}): NavigationTraceFields {
  return (
    options.state.traceFields ??
    createNavigationLifecycleTraceFields({
      currentRootLayoutTreePath: options.state.visibleSnapshot.rootBoundaryId,
      currentVisibleCommitVersion: options.state.visibleCommitVersion,
      nextRootLayoutTreePath: options.event.result.targetSnapshot.rootBoundaryId,
      startedVisibleCommitVersion: options.event.token.baseVisibleCommitVersion,
    })
  );
}

function classifyRootBoundaryTransition(
  currentRootBoundaryId: string | null,
  nextRootBoundaryId: string | null,
): RootBoundaryTransition {
  if (currentRootBoundaryId === null || nextRootBoundaryId === null) {
    return "rootBoundaryUnknownFallback";
  }

  return currentRootBoundaryId === nextRootBoundaryId
    ? "currentRootBoundary"
    : "rootBoundaryChanged";
}

function planFlightResponseArrived(options: {
  event: Extract<NavigationEvent, { kind: "flightResponseArrived" }>;
  state: NavigationPlannerStateV0;
}): NavigationDecisionV0 {
  const traceFields = createRootBoundaryTraceFields(options);

  if (options.event.token.lane === "prefetch") {
    return {
      kind: "noCommit",
      reason: "prefetchOnly",
      token: options.event.token,
      trace: createNavigationTrace(NavigationTraceReasonCodes.prefetchOnly, traceFields),
    };
  }

  const transition = classifyRootBoundaryTransition(
    options.state.visibleSnapshot.rootBoundaryId,
    options.event.result.targetSnapshot.rootBoundaryId,
  );

  if (transition === "rootBoundaryChanged") {
    return {
      kind: "hardNavigate",
      reason: "rootBoundaryChanged",
      token: options.event.token,
      trace: createNavigationTrace(NavigationTraceReasonCodes.rootBoundaryChanged, traceFields),
      url: options.event.result.href,
    };
  }

  if (transition === "rootBoundaryUnknownFallback") {
    // Unknown root identity is an uncertainty fallback, not evidence that
    // reuse is safe. #726-CORE-09 can delete the legacy soft-commit writer
    // once every promoted caller supplies graph-owned root boundary IDs from
    // the route graph read model documented in routing/app-router.ts.
    return {
      kind: "proposeCommit",
      proposal: {
        reason: "rootBoundaryUnknownFallback",
        targetSnapshot: options.event.result.targetSnapshot,
      },
      token: options.event.token,
      trace: createNavigationTrace(NavigationTraceReasonCodes.rootBoundaryUnknown, traceFields),
    };
  }

  return {
    kind: "proposeCommit",
    proposal: {
      reason: "currentRootBoundary",
      targetSnapshot: options.event.result.targetSnapshot,
    },
    token: options.event.token,
    trace: createNavigationTrace(NavigationTraceReasonCodes.commitCurrent, traceFields),
  };
}

function planNavigation(input: NavigationPlannerInput): NavigationDecisionV0 {
  switch (input.event.kind) {
    case "navigate":
      return createRequestWorkDecision({
        eventKind: input.event.kind,
        state: input.state,
        work: {
          href: input.event.href,
          kind: "flight",
          mode: input.event.mode,
        },
      });
    case "refresh":
      return createRequestWorkDecision({
        eventKind: input.event.kind,
        state: input.state,
        work: {
          href: input.state.visibleSnapshot.displayUrl,
          kind: "flight",
          mode: "refresh",
        },
      });
    case "traverse":
      return createRequestWorkDecision({
        eventKind: input.event.kind,
        state: input.state,
        work: {
          direction: input.event.direction,
          historyState: input.event.historyState,
          kind: "traverseFlight",
        },
      });
    case "prefetch":
      return createRequestWorkDecision({
        eventKind: input.event.kind,
        state: input.state,
        work: {
          href: input.event.href,
          kind: "prefetch",
        },
      });
    case "flightResponseArrived":
      return planFlightResponseArrived({
        event: input.event,
        state: input.state,
      });
    default: {
      const _exhaustive: never = input.event;
      throw new Error("[vinext] Unknown navigation event: " + String(_exhaustive));
    }
  }
}

export const navigationPlanner = {
  classifyRootBoundaryTransition,
  plan: planNavigation,
};
