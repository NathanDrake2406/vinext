import type { AppNavigationPayloadOrigin } from "../server/app-browser-state.js";
import type {
  NavigationReuseDecision,
  NavigationReuseFacts,
} from "../server/navigation-planner.js";
import type { NavigationTrace } from "../server/navigation-trace.js";

type AppNavigationDebugBase = Readonly<{
  navigationId: number;
  targetHref: string;
}>;

type AppNavigationStartDebugInput = AppNavigationDebugBase &
  Readonly<{
    navigationKind: NavigationReuseFacts["navigationKind"];
  }>;

type AppNavigationReuseDebugInput = AppNavigationDebugBase &
  Readonly<{
    additionalPrefetchRscUrls: readonly string[];
    decision: NavigationReuseDecision["kind"];
    rscUrl: string;
    trace: NavigationTrace;
    visitedResponseCacheKey: string;
  }>;

type AppNavigationPrefetchDebugInput = AppNavigationDebugBase &
  Readonly<{
    outcome: "hit" | "miss";
    responseUrl: string | null;
    rscUrl: string;
  }>;

type AppNavigationFetchDebugInput = AppNavigationDebugBase &
  Readonly<{
    rscUrl: string;
  }>;

type AppNavigationFetchResponseDebugInput = AppNavigationFetchDebugInput &
  Readonly<{
    responseUrl: string;
    status: number;
  }>;

export type AppNavigationCommitDebugInput = AppNavigationDebugBase &
  Readonly<{
    navigationCommitKind: "authoritative" | "detached" | null;
    outcome: "committed" | "hard-navigate" | "no-commit";
    payloadOrigin: AppNavigationPayloadOrigin["origin"];
    trace: NavigationTrace;
  }>;

type AppNavigationDebugEvent =
  | (AppNavigationStartDebugInput & Readonly<{ phase: "start" }>)
  | (AppNavigationDebugBase &
      Readonly<{
        phase: "abort";
        reason: "history-restore" | "superseded";
      }>)
  | (AppNavigationReuseDebugInput & Readonly<{ phase: "reuse" }>)
  | (AppNavigationPrefetchDebugInput & Readonly<{ phase: "prefetch" }>)
  | (AppNavigationDebugBase &
      Readonly<{
        phase: "optimistic-shell";
        routeId: string;
      }>)
  | (AppNavigationFetchDebugInput &
      Readonly<{
        phase: "fetch";
        stage: "start";
      }>)
  | (AppNavigationFetchResponseDebugInput &
      Readonly<{
        phase: "fetch";
        stage: "response";
      }>)
  | (AppNavigationCommitDebugInput & Readonly<{ phase: "commit" }>);

export type AppNavigationDebugSink = (event: AppNavigationDebugEvent) => void;

export type AppNavigationDebugReporter = Readonly<{
  abort(reason: "history-restore" | "superseded"): void;
  commit(input: AppNavigationCommitDebugInput): void;
  fetchResponse(input: AppNavigationFetchResponseDebugInput): void;
  fetchStart(input: AppNavigationFetchDebugInput): void;
  optimisticShell(input: AppNavigationDebugBase & Readonly<{ routeId: string }>): void;
  prefetch(input: AppNavigationPrefetchDebugInput): void;
  retarget(navigationId: number, targetHref: string): void;
  reuse(input: AppNavigationReuseDebugInput): void;
  settle(navigationId: number): void;
  start(input: AppNavigationStartDebugInput): void;
}>;

function writeAppNavigationDebugEvent(event: AppNavigationDebugEvent): void {
  console.info("[vinext:navigation]", event);
}

export function createAppNavigationDebugReporter(options: {
  enabled: boolean;
  sink?: AppNavigationDebugSink;
}): AppNavigationDebugReporter | null {
  if (!options.enabled) return null;

  const sink = options.sink ?? writeAppNavigationDebugEvent;
  let activeNavigation: AppNavigationDebugBase | null = null;

  return {
    abort(reason) {
      if (activeNavigation === null) return;
      sink({ ...activeNavigation, phase: "abort", reason });
      activeNavigation = null;
    },
    commit(input) {
      sink({ ...input, phase: "commit" });
    },
    fetchResponse(input) {
      sink({ ...input, phase: "fetch", stage: "response" });
    },
    fetchStart(input) {
      sink({ ...input, phase: "fetch", stage: "start" });
    },
    optimisticShell(input) {
      sink({ ...input, phase: "optimistic-shell" });
    },
    prefetch(input) {
      sink({ ...input, phase: "prefetch" });
    },
    retarget(navigationId, targetHref) {
      if (activeNavigation?.navigationId !== navigationId) return;
      activeNavigation = { navigationId, targetHref };
    },
    reuse(input) {
      sink({ ...input, phase: "reuse" });
    },
    settle(navigationId) {
      if (activeNavigation?.navigationId === navigationId) {
        activeNavigation = null;
      }
    },
    start(input) {
      activeNavigation = { navigationId: input.navigationId, targetHref: input.targetHref };
      sink({ ...input, phase: "start" });
    },
  };
}
