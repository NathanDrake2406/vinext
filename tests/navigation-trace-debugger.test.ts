import { describe, expect, it } from "vite-plus/test";
import {
  NavigationTraceReasonCodes,
  NavigationTraceTransactionCodes,
  createNavigationTrace,
} from "../packages/vinext/src/server/navigation-trace.js";
import {
  navigationPlanner,
  type NavigationDecisionV0,
  type OperationToken,
  type RouteSnapshotV0,
} from "../packages/vinext/src/server/navigation-planner.js";
import {
  assertValidNavigationCommitApprovalTrace,
  assertValidNavigationDecisionTrace,
  inspectNavigationCommitApprovalTrace,
  inspectNavigationDecisionTrace,
  type NavigationTraceCommitApprovalDebugInput,
} from "../packages/vinext/src/server/navigation-trace-debugger.js";

function createOperationToken(overrides: Partial<OperationToken> = {}): OperationToken {
  return {
    baseVisibleCommitVersion: 0,
    deploymentVersion: null,
    graphVersion: null,
    lane: "navigation",
    operationId: 11,
    targetSnapshotFingerprint: "route:/dashboard|root:/",
    ...overrides,
  };
}

function createRouteSnapshot(rootBoundaryId: string | null): RouteSnapshotV0 {
  return {
    displayUrl: "https://example.com/dashboard",
    matchedUrl: "/dashboard",
    rootBoundaryId,
    routeId: "route:/dashboard",
  };
}

function planSameRootNavigation(): NavigationDecisionV0 {
  const token = createOperationToken();

  return navigationPlanner.plan({
    event: {
      kind: "flightResponseArrived",
      result: {
        href: "https://example.com/dashboard",
        targetSnapshot: createRouteSnapshot("/"),
      },
      token,
    },
    routeManifest: null,
    state: {
      nextOperationToken: token,
      traceFields: {
        activeNavigationId: 4,
        currentRootLayoutTreePath: "/",
        currentVisibleCommitVersion: 0,
        nextRootLayoutTreePath: "/",
        startedNavigationId: 4,
        startedVisibleCommitVersion: 0,
        targetHref: "https://example.com/dashboard",
      },
      visibleCommitVersion: 0,
      visibleSnapshot: createRouteSnapshot("/"),
    },
  });
}

function createCommitApprovalDebugInput(
  trace: NavigationTraceCommitApprovalDebugInput["decision"]["trace"],
): NavigationTraceCommitApprovalDebugInput {
  return {
    approvedCommit: {},
    decision: {
      disposition: "commit",
      trace,
    },
  };
}

describe("NavigationTrace invariant debugger", () => {
  it("explains valid planner visible-commit proposals without approving state", () => {
    const report = inspectNavigationDecisionTrace(planSameRootNavigation(), { runtime: "test" });

    expect(report).toMatchObject({
      ok: true,
      outcome: "visibleCommit",
      source: "planner",
      subject: "plannerDecision",
    });
    expect(report.explanation).toEqual({
      reasonCode: NavigationTraceReasonCodes.commitCurrent,
      transactionCode: null,
      traceCodes: [NavigationTraceReasonCodes.commitCurrent],
    });
  });

  it("points malformed planner decision traces at the planner owner", () => {
    const token = createOperationToken();
    const decision: NavigationDecisionV0 = {
      kind: "requestWork",
      token,
      trace: createNavigationTrace(NavigationTraceReasonCodes.requestWork, {
        eventKind: "navigate",
      }),
      work: {
        href: "https://example.com/dashboard",
        kind: "flight",
        mode: "push",
      },
    };

    const report = inspectNavigationDecisionTrace(decision, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      {
        code: "missing-field",
        entryIndex: 0,
        field: "targetHref",
        message: "NC_REQUEST is missing required field targetHref",
        source: "planner",
      },
    ]);
    expect(() => assertValidNavigationDecisionTrace(decision, { runtime: "test" })).toThrow(
      "NavigationTrace invariant failed [subject=plannerDecision outcome=requestWork source=planner]",
    );
  });

  it("validates commit approval transaction traces and visible outcome explanations", () => {
    const approval = {
      approvedCommit: {},
      decision: {
        disposition: "commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.visibleCommit,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 11,
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.commitCurrent,
              fields: {
                activeNavigationId: 4,
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: "/",
                startedNavigationId: 4,
                startedVisibleCommitVersion: 0,
                targetHref: "https://example.com/dashboard",
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report).toMatchObject({
      ok: true,
      outcome: "visibleCommit",
      source: "commitTransaction",
      subject: "commitApproval",
    });
    expect(report.explanation).toEqual({
      reasonCode: NavigationTraceReasonCodes.commitCurrent,
      transactionCode: NavigationTraceTransactionCodes.visibleCommit,
      traceCodes: [
        NavigationTraceTransactionCodes.visibleCommit,
        NavigationTraceReasonCodes.commitCurrent,
      ],
    });
    expect(() =>
      assertValidNavigationCommitApprovalTrace(approval, { runtime: "test" }),
    ).not.toThrow();
  });

  it("explains valid planner no-commit prefetch outcomes", () => {
    const token = createOperationToken({ lane: "prefetch" });
    const decision = navigationPlanner.plan({
      event: {
        kind: "flightResponseArrived",
        result: {
          href: "https://example.com/dashboard",
          targetSnapshot: createRouteSnapshot("/"),
        },
        token,
      },
      routeManifest: null,
      state: {
        nextOperationToken: token,
        traceFields: {
          currentRootLayoutTreePath: "/",
          currentVisibleCommitVersion: 0,
          nextRootLayoutTreePath: "/",
          startedVisibleCommitVersion: 0,
        },
        visibleCommitVersion: 0,
        visibleSnapshot: createRouteSnapshot("/"),
      },
    });

    const report = inspectNavigationDecisionTrace(decision, { runtime: "test" });

    expect(report).toMatchObject({
      ok: true,
      outcome: "noCommit",
      source: "planner",
      subject: "plannerDecision",
    });
    expect(report.explanation).toEqual({
      reasonCode: NavigationTraceReasonCodes.prefetchOnly,
      transactionCode: null,
      traceCodes: [NavigationTraceReasonCodes.prefetchOnly],
    });
  });

  it("explains valid stale lifecycle no-commit approvals", () => {
    const approval = {
      approvedCommit: null,
      decision: {
        disposition: "no-commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.noCommit,
              fields: {
                operationLane: "refresh",
                pendingOperationId: 22,
                startedVisibleCommitVersion: 4,
              },
            },
            {
              code: NavigationTraceReasonCodes.staleOperation,
              fields: {
                activeNavigationId: 7,
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 5,
                nextRootLayoutTreePath: "/",
                startedNavigationId: 7,
                startedVisibleCommitVersion: 4,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report).toMatchObject({
      ok: true,
      outcome: "stale",
      source: "lifecycleGate",
      subject: "commitApproval",
    });
    expect(report.explanation).toEqual({
      reasonCode: NavigationTraceReasonCodes.staleOperation,
      transactionCode: NavigationTraceTransactionCodes.noCommit,
      traceCodes: [
        NavigationTraceTransactionCodes.noCommit,
        NavigationTraceReasonCodes.staleOperation,
      ],
    });
  });

  it("explains valid hard-navigation commit approvals", () => {
    const approval = {
      approvedCommit: null,
      decision: {
        disposition: "hard-navigate",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.hardNavigate,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 13,
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.rootBoundaryChanged,
              fields: {
                activeNavigationId: 4,
                currentRootLayoutTreePath: "/(marketing)",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: "/(dashboard)",
                startedNavigationId: 4,
                startedVisibleCommitVersion: 0,
                targetHref: "https://example.com/dashboard",
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report).toMatchObject({
      ok: true,
      outcome: "hardNavigate",
      source: "commitTransaction",
      subject: "commitApproval",
    });
    expect(report.explanation).toEqual({
      reasonCode: NavigationTraceReasonCodes.rootBoundaryChanged,
      transactionCode: NavigationTraceTransactionCodes.hardNavigate,
      traceCodes: [
        NavigationTraceTransactionCodes.hardNavigate,
        NavigationTraceReasonCodes.rootBoundaryChanged,
      ],
    });
  });

  it("points stale no-commit trace field failures at the lifecycle gate", () => {
    const approval = {
      approvedCommit: null,
      decision: {
        disposition: "no-commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.noCommit,
              fields: {
                operationLane: "refresh",
                pendingOperationId: 22,
                startedVisibleCommitVersion: 4,
              },
            },
            {
              code: NavigationTraceReasonCodes.staleOperation,
              fields: {
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 5,
                nextRootLayoutTreePath: "/",
                startedVisibleCommitVersion: 4,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      {
        code: "missing-field",
        entryIndex: 1,
        field: "activeNavigationId",
        message: "NC_STALE is missing required field activeNavigationId",
        source: "lifecycleGate",
      },
      {
        code: "missing-field",
        entryIndex: 1,
        field: "startedNavigationId",
        message: "NC_STALE is missing required field startedNavigationId",
        source: "lifecycleGate",
      },
    ]);
  });

  it("rejects stale traces without a stale lifecycle mismatch", () => {
    const approval = {
      approvedCommit: null,
      decision: {
        disposition: "no-commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.noCommit,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 17,
                startedVisibleCommitVersion: 3,
              },
            },
            {
              code: NavigationTraceReasonCodes.staleOperation,
              fields: {
                activeNavigationId: 4,
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 3,
                nextRootLayoutTreePath: "/",
                startedNavigationId: 4,
                startedVisibleCommitVersion: 3,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "invalid-field",
      entryIndex: 1,
      message:
        "NC_STALE requires activeNavigationId/startNavigationId or visibleCommitVersion mismatch",
      source: "lifecycleGate",
    });
  });

  it("rejects commit approvals without an approved visible commit", () => {
    const approval = {
      approvedCommit: null,
      decision: {
        disposition: "commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.visibleCommit,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 11,
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.commitCurrent,
              fields: {
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: "/",
                startedVisibleCommitVersion: 0,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "approval-mismatch",
      message: "commit approval has commit disposition but no approved visible commit",
      source: "commitTransaction",
    });
  });

  it("rejects non-visible approvals that carry an approved visible commit", () => {
    const approval = {
      approvedCommit: {},
      decision: {
        disposition: "hard-navigate",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.hardNavigate,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 13,
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.rootBoundaryChanged,
              fields: {
                currentRootLayoutTreePath: "/(marketing)",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: "/(dashboard)",
                startedVisibleCommitVersion: 0,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "approval-mismatch",
      message: "hard-navigate approval must not carry an approved visible commit",
      source: "commitTransaction",
    });
  });

  it("reports compact trace shape validation failures", () => {
    const validCommitTrace = {
      schemaVersion: 0,
      entries: [
        {
          code: NavigationTraceTransactionCodes.visibleCommit,
          fields: {
            operationLane: "navigation",
            pendingOperationId: 11,
            startedVisibleCommitVersion: 0,
          },
        },
        {
          code: NavigationTraceReasonCodes.commitCurrent,
          fields: {
            currentRootLayoutTreePath: "/",
            currentVisibleCommitVersion: 0,
            nextRootLayoutTreePath: "/",
            startedVisibleCommitVersion: 0,
          },
        },
      ],
    } satisfies NavigationTraceCommitApprovalDebugInput["decision"]["trace"];
    const invalidShapeCases = [
      {
        expectedCode: "invalid-schema",
        trace: {
          ...validCommitTrace,
          schemaVersion: 999,
        },
      },
      {
        expectedCode: "empty-trace",
        trace: {
          schemaVersion: 0,
          entries: [],
        },
      },
      {
        expectedCode: "unknown-code",
        trace: {
          ...validCommitTrace,
          entries: [
            ...validCommitTrace.entries,
            {
              code: "NC_UNKNOWN",
              fields: {},
            },
          ],
        },
      },
      {
        expectedCode: "unknown-field",
        trace: {
          ...validCommitTrace,
          entries: [
            validCommitTrace.entries[0],
            {
              ...validCommitTrace.entries[1],
              fields: {
                ...validCommitTrace.entries[1].fields,
                unexpectedField: true,
              },
            },
          ],
        },
      },
      {
        expectedCode: "invalid-field",
        trace: {
          ...validCommitTrace,
          entries: [
            {
              ...validCommitTrace.entries[0],
              fields: {
                ...validCommitTrace.entries[0].fields,
                pendingOperationId: "11",
              },
            },
            validCommitTrace.entries[1],
          ],
        },
      },
    ] satisfies readonly {
      expectedCode: string;
      trace: NavigationTraceCommitApprovalDebugInput["decision"]["trace"];
    }[];

    for (const testCase of invalidShapeCases) {
      const report = inspectNavigationCommitApprovalTrace(
        createCommitApprovalDebugInput(testCase.trace),
        { runtime: "test" },
      );

      expect(report.issues).toContainEqual(
        expect.objectContaining({
          code: testCase.expectedCode,
        }),
      );
    }
  });

  it("points missing transaction wrappers at the commit transaction owner", () => {
    const approval = {
      approvedCommit: {},
      decision: {
        disposition: "commit",
        trace: createNavigationTrace(NavigationTraceReasonCodes.commitCurrent, {
          activeNavigationId: 4,
          currentRootLayoutTreePath: "/",
          currentVisibleCommitVersion: 0,
          nextRootLayoutTreePath: "/",
          startedNavigationId: 4,
          startedVisibleCommitVersion: 0,
          targetHref: "https://example.com/dashboard",
        }),
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "missing-transaction",
      entryIndex: 0,
      message: "commit approval expected first trace code NT_VISIBLE_COMMIT",
      source: "commitTransaction",
    });
  });

  it("rejects extra transaction entries on planner decision traces", () => {
    const decision: NavigationDecisionV0 = {
      ...planSameRootNavigation(),
      trace: {
        schemaVersion: 0,
        entries: [
          {
            code: NavigationTraceReasonCodes.commitCurrent,
            fields: {
              currentRootLayoutTreePath: "/",
              currentVisibleCommitVersion: 0,
              nextRootLayoutTreePath: "/",
              startedVisibleCommitVersion: 0,
            },
          },
          {
            code: NavigationTraceTransactionCodes.visibleCommit,
            fields: {
              operationLane: "navigation",
              pendingOperationId: 11,
              startedVisibleCommitVersion: 0,
            },
          },
        ],
      },
    };

    const report = inspectNavigationDecisionTrace(decision, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "unexpected-code",
      entryIndex: 1,
      message: "planner decision trace must not include transaction code NT_VISIBLE_COMMIT",
      source: "planner",
    });
  });

  it("rejects multiple reason entries on commit approval traces", () => {
    const approval = {
      approvedCommit: {},
      decision: {
        disposition: "commit",
        trace: {
          schemaVersion: 0,
          entries: [
            {
              code: NavigationTraceTransactionCodes.visibleCommit,
              fields: {
                operationLane: "navigation",
                pendingOperationId: 11,
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.commitCurrent,
              fields: {
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: "/",
                startedVisibleCommitVersion: 0,
              },
            },
            {
              code: NavigationTraceReasonCodes.rootBoundaryUnknown,
              fields: {
                currentRootLayoutTreePath: "/",
                currentVisibleCommitVersion: 0,
                nextRootLayoutTreePath: null,
                startedVisibleCommitVersion: 0,
              },
            },
          ],
        },
      },
    } satisfies NavigationTraceCommitApprovalDebugInput;

    const report = inspectNavigationCommitApprovalTrace(approval, { runtime: "test" });

    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual({
      code: "unexpected-code",
      entryIndex: 2,
      message: "commit approval trace must include exactly one reason code",
      source: "planner",
    });
  });

  it("keeps the debugger off production runtime surfaces", () => {
    expect(() =>
      inspectNavigationDecisionTrace(planSameRootNavigation(), { runtime: "production" }),
    ).toThrow("[vinext] NavigationTrace invariant debugger is dev/test-only");
  });
});
