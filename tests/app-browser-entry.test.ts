import React from "react";
import { describe, expect, it } from "vite-plus/test";
import {
  APP_ROOT_LAYOUT_KEY,
  APP_ROUTE_KEY,
  normalizeAppElements,
} from "../packages/vinext/src/server/app-elements.js";
import { createClientNavigationRenderSnapshot } from "../packages/vinext/src/shims/navigation.js";
import {
  createPendingNavigationCommit,
  routerReducer,
  shouldHardNavigate,
  type AppRouterState,
} from "../packages/vinext/src/server/app-browser-state.js";

function createResolvedElements(
  routeId: string,
  rootLayoutTreePath: string | null,
  extraEntries: Record<string, unknown> = {},
) {
  return normalizeAppElements({
    [APP_ROUTE_KEY]: routeId,
    [APP_ROOT_LAYOUT_KEY]: rootLayoutTreePath,
    ...extraEntries,
  });
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
    expect(nextState.elements).toMatchObject({
      "layout:/": expect.anything(),
      "page:/next": expect.anything(),
    });
  });

  it("replaces elements on replace", () => {
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
    expect(nextState.elements).toMatchObject({
      "page:/next": expect.anything(),
    });
  });

  it("hard navigates when the root layout changes between two non-null paths", () => {
    expect(shouldHardNavigate("/(marketing)", "/(dashboard)")).toBe(true);
  });

  it("hard navigates when current route has no root layout but next does", () => {
    // Navigating from a page with no layouts to one with a root layout fundamentally
    // changes the component tree structure, so a hard navigate is required.
    expect(shouldHardNavigate(null, "/")).toBe(true);
  });

  it("hard navigates when current route has a root layout but next does not", () => {
    expect(shouldHardNavigate("/", null)).toBe(true);
  });

  it("soft navigates when both routes have the same root layout", () => {
    expect(shouldHardNavigate("/", "/")).toBe(false);
  });

  it("soft navigates when both routes have no root layout", () => {
    expect(shouldHardNavigate(null, null)).toBe(false);
  });

  it("creates a pending navigation commit with the resolved elements metadata", async () => {
    const commit = await createPendingNavigationCommit({
      currentState: createState({ rootLayoutTreePath: "/(marketing)" }),
      nextElements: Promise.resolve(createResolvedElements("route:/dashboard", "/(dashboard)")),
      navigationSnapshot: createState().navigationSnapshot,
      type: "navigate",
    });

    expect(commit.routeId).toBe("route:/dashboard");
    expect(commit.rootLayoutTreePath).toBe("/(dashboard)");
    // Caller checks shouldHardNavigate(currentState.rootLayoutTreePath, commit.rootLayoutTreePath)
    expect(shouldHardNavigate("/(marketing)", commit.rootLayoutTreePath)).toBe(true);
  });

  it("builds a merge commit for refresh and server-action payloads", async () => {
    const refreshCommit = await createPendingNavigationCommit({
      currentState: createState(),
      nextElements: Promise.resolve(createResolvedElements("route:/dashboard", "/")),
      navigationSnapshot: createState().navigationSnapshot,
      type: "navigate",
    });

    expect(refreshCommit.action.type).toBe("navigate");
    expect(refreshCommit.routeId).toBe("route:/dashboard");
    expect(refreshCommit.rootLayoutTreePath).toBe("/");
  });
});
