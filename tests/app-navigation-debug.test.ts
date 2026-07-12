import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createAppNavigationDebugReporter } from "../packages/vinext/src/client/app-navigation-debug.js";
import {
  navigationPlanner,
  type NavigationReuseFacts,
} from "../packages/vinext/src/server/navigation-planner.js";
import {
  NavigationTraceReasonCodes,
  createNavigationTrace,
} from "../packages/vinext/src/server/navigation-trace.js";

describe("App Router navigation diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not create a reporter when navigation debugging is disabled", () => {
    expect(createAppNavigationDebugReporter({ enabled: false })).toBeNull();
  });

  it("emits deterministic start, retarget, and abort events", () => {
    const sink = vi.fn();
    const reporter = createAppNavigationDebugReporter({ enabled: true, sink });
    if (reporter === null) throw new Error("Expected navigation debug reporter");

    reporter.start({
      navigationId: 3,
      navigationKind: "navigate",
      targetHref: "/projects/A",
    });
    reporter.retarget(3, "/projects/B");
    reporter.abort("superseded");

    expect(sink.mock.calls).toEqual([
      [
        {
          navigationId: 3,
          navigationKind: "navigate",
          phase: "start",
          targetHref: "/projects/A",
        },
      ],
      [
        {
          navigationId: 3,
          phase: "abort",
          reason: "superseded",
          targetHref: "/projects/B",
        },
      ],
    ]);
  });

  it("emits reuse, fetch, and commit facts without transport payload data", () => {
    const sink = vi.fn();
    const reporter = createAppNavigationDebugReporter({ enabled: true, sink });
    if (reporter === null) throw new Error("Expected navigation debug reporter");
    const trace = createNavigationTrace(NavigationTraceReasonCodes.fetchFresh, {
      eventKind: "navigate",
      freshFetchReason: "cacheMiss",
      targetHref: "/projects/B",
    });
    const facts: NavigationReuseFacts = {
      bypassNavigationCache: false,
      navigationKind: "navigate",
      optimisticRouteShell: { reason: "routeManifestMissing", status: "unavailable" },
      prefetch: { status: "unavailable" },
      targetHref: "/projects/B",
      visitedResponse: { status: "unavailable" },
    };
    const decision = navigationPlanner.classifyNavigationReuse(facts);

    reporter.reuse({
      additionalPrefetchRscUrls: [],
      decision,
      facts,
      navigationId: 4,
      rscUrl: "/projects/B?_rsc=key",
      visitedResponseCacheKey: "/projects/B?_rsc=key",
    });
    reporter.fetchStart({
      navigationId: 4,
      rscUrl: "/projects/B?_rsc=key",
      targetHref: "/projects/B",
    });
    reporter.fetchResponse({
      navigationId: 4,
      responseUrl: "https://example.com/projects/B?_rsc=key",
      rscUrl: "/projects/B?_rsc=key",
      status: 200,
      targetHref: "/projects/B",
    });
    reporter.commit({
      approval: {
        disposition: "commit",
        preserveAbsentSlots: true,
        preserveElementIds: [],
        preservePreviousSlotIds: [],
        trace,
      },
      navigationCommitKind: "authoritative",
      navigationId: 4,
      payloadOrigin: "fresh",
      targetHref: "/projects/B",
      visibleOutcome: "committed",
    });

    expect(sink.mock.calls.map(([event]) => event.phase)).toEqual([
      "reuse",
      "fetch",
      "fetch",
      "commit",
    ]);
    for (const [event] of sink.mock.calls) {
      expect(event).not.toHaveProperty("body");
      expect(event).not.toHaveProperty("headers");
      expect(event).not.toHaveProperty("params");
    }
  });

  it("writes enabled events to the browser console by default", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const reporter = createAppNavigationDebugReporter({ enabled: true });
    if (reporter === null) throw new Error("Expected navigation debug reporter");

    reporter.start({
      navigationId: 5,
      navigationKind: "navigate",
      targetHref: "/dashboard",
    });

    expect(info).toHaveBeenCalledWith(
      "[vinext:navigation]",
      expect.objectContaining({ navigationId: 5, phase: "start" }),
    );
  });
});
