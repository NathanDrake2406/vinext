import React from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  APP_ROOT_LAYOUT_KEY,
  APP_ROUTE_KEY,
  normalizeAppElements,
  type AppElements,
} from "../packages/vinext/src/server/app-elements.js";
import { createClientNavigationRenderSnapshot } from "../packages/vinext/src/shims/navigation.js";
import {
  applyAppRouterStateUpdate,
  createPendingNavigationCommit,
  routerReducer,
  type AppRouterState,
} from "../packages/vinext/src/server/app-browser-state.js";

function createResolvedElements(
  routeId: string,
  rootLayoutTreePath: string | null,
  extraEntries: Record<string, unknown> = {},
) {
  return Promise.resolve(
    normalizeAppElements({
      [APP_ROUTE_KEY]: routeId,
      [APP_ROOT_LAYOUT_KEY]: rootLayoutTreePath,
      ...extraEntries,
    }),
  );
}

function createState(overrides: Partial<AppRouterState> = {}): AppRouterState {
  return {
    elements: createResolvedElements("route:/initial", "/"),
    navigationSnapshot: createClientNavigationRenderSnapshot("https://example.com/initial", {}),
    renderId: 0,
    rootLayoutTreePath: "/",
    routeId: "route:/initial",
    ...overrides,
  };
}

describe("app browser entry state helpers", () => {
  it("merges elements on navigate", async () => {
    const previousElements = createResolvedElements("route:/initial", "/", {
      "layout:/": React.createElement("div", null, "layout"),
    });
    const nextElements = createResolvedElements("route:/next", "/", {
      "page:/next": React.createElement("main", null, "next"),
    });

    const nextState = routerReducer(
      createState({
        elements: previousElements,
      }),
      {
        elements: nextElements,
        navigationSnapshot: createState().navigationSnapshot,
        renderId: 1,
        rootLayoutTreePath: "/",
        routeId: "route:/next",
        type: "navigate",
      },
    );

    expect(nextState.routeId).toBe("route:/next");
    expect(nextState.rootLayoutTreePath).toBe("/");
    await expect(nextState.elements).resolves.toMatchObject({
      "layout:/": expect.anything(),
      "page:/next": expect.anything(),
    });
  });

  it("replaces elements on replace", async () => {
    const nextElements = createResolvedElements("route:/next", "/", {
      "page:/next": React.createElement("main", null, "next"),
    });

    const nextState = routerReducer(createState(), {
      elements: nextElements,
      navigationSnapshot: createState().navigationSnapshot,
      renderId: 1,
      rootLayoutTreePath: "/",
      routeId: "route:/next",
      type: "replace",
    });

    expect(nextState.elements).toBe(nextElements);
    await expect(nextState.elements).resolves.toMatchObject({
      "page:/next": expect.anything(),
    });
  });

  it("hard navigates instead of merging when the root layout changes", async () => {
    const assign = vi.fn<(href: string) => void>();

    const result = await applyAppRouterStateUpdate({
      commit: vi.fn(),
      currentState: createState({
        rootLayoutTreePath: "/(marketing)",
      }),
      dispatch: vi.fn(),
      nextElements: createResolvedElements("route:/dashboard", "/(dashboard)"),
      onHardNavigate: assign,
      targetHref: "/dashboard",
      transition: (callback) => callback(),
    });

    expect(result).toEqual({ type: "hard-navigate" });
    expect(assign).toHaveBeenCalledWith("/dashboard");
  });

  it("defers commit side effects until the payload has resolved and dispatched", async () => {
    let resolveElements: ((value: AppElements) => void) | undefined;
    const nextElements = new Promise<AppElements>((resolve) => {
      resolveElements = resolve;
    });
    const dispatch = vi.fn();
    const commit = vi.fn();

    const pending = applyAppRouterStateUpdate({
      commit,
      currentState: createState(),
      dispatch,
      nextElements,
      onHardNavigate: vi.fn(),
      targetHref: "/dashboard",
      transition: (callback) => callback(),
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();

    if (!resolveElements) {
      throw new Error("Expected deferred elements resolver");
    }

    resolveElements(
      normalizeAppElements({
        [APP_ROUTE_KEY]: "route:/dashboard",
        [APP_ROOT_LAYOUT_KEY]: "/",
        "page:/dashboard": React.createElement("main", null, "dashboard"),
      }),
    );

    await pending;

    expect(dispatch).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
  });

  it("builds a merge commit for refresh and server-action payloads", async () => {
    const refreshCommit = await createPendingNavigationCommit({
      currentState: createState(),
      nextElements: createResolvedElements("route:/dashboard", "/"),
      navigationSnapshot: createState().navigationSnapshot,
      type: "navigate",
    });

    expect(refreshCommit.action.type).toBe("navigate");
    expect(refreshCommit.routeId).toBe("route:/dashboard");
    expect(refreshCommit.rootLayoutTreePath).toBe("/");
  });
});
