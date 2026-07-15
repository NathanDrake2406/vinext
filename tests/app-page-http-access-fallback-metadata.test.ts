import { describe, expect, it, vi } from "vite-plus/test";
import {
  createHttpAccessFallbackMetadataPlan,
  isPageOwnedNotFoundBoundary,
  resolveHttpAccessFallbackMetadata,
} from "../packages/vinext/src/server/app-page-http-access-fallback-metadata.js";

describe("HTTP-access fallback metadata planning", () => {
  it("recognizes only a not-found convention colocated with the page", () => {
    const boundary = {};

    expect(
      isPageOwnedNotFoundBoundary(
        { notFound: boundary, notFoundTreePosition: 2, routeSegments: ["items", "[id]"] },
        boundary,
      ),
    ).toBe(true);
    expect(
      isPageOwnedNotFoundBoundary(
        { notFound: boundary, notFoundTreePosition: 1, routeSegments: ["items", "[id]"] },
        boundary,
      ),
    ).toBe(false);
    expect(
      isPageOwnedNotFoundBoundary(
        { notFound: boundary, notFoundTreePosition: 2, routeSegments: ["items", "[id]"] },
        {},
      ),
    ).toBe(false);
  });

  it("places the fallback convention at every active leaf in owner order", () => {
    const rootLayout = {};
    const nestedLayout = {};
    const boundary = {};
    const rootSlotLayout = {};
    const nestedSlotLayout = {};

    const plan = createHttpAccessFallbackMetadataPlan({
      boundaryModule: boundary,
      boundaryOwner: { kind: "layout" },
      boundaryParams: { locale: "en" },
      layoutModules: [rootLayout, nestedLayout],
      layoutTreePositions: [0, 1],
      parallelBranches: [
        {
          head: {
            layoutModules: [rootSlotLayout],
            layoutParams: [{}],
            routeSegments: ["[locale]", "posts", "[slug]"],
          },
          ownerTreePosition: 0,
        },
        {
          head: {
            layoutModules: [nestedSlotLayout],
            layoutParams: [{ locale: "en" }],
            routeSegments: ["[locale]", "posts", "[slug]"],
          },
          ownerTreePosition: 1,
        },
      ],
      params: { locale: "en", slug: "hello" },
      routeSegments: ["[locale]", "posts", "[slug]"],
    });

    expect(plan.map((source) => source.module)).toEqual([
      rootLayout,
      nestedLayout,
      boundary,
      nestedSlotLayout,
      boundary,
      rootSlotLayout,
      boundary,
    ]);
    expect(
      plan.filter((source) => source.module === boundary).map((source) => source.params),
    ).toEqual([{ locale: "en" }, { locale: "en" }, { locale: "en" }]);
  });

  it("uses a sibling intercept as the primary leaf without inventing another leaf", () => {
    const rootLayout = {};
    const boundary = {};
    const interceptLayout = {};
    const slotLayout = {};

    const plan = createHttpAccessFallbackMetadataPlan({
      boundaryModule: boundary,
      boundaryOwner: { kind: "layout" },
      boundaryParams: {},
      layoutModules: [rootLayout],
      layoutTreePositions: [0],
      parallelBranches: [
        {
          head: {
            layoutModules: [slotLayout],
            routeSegments: ["feed"],
          },
          ownerTreePosition: 0,
        },
      ],
      params: {},
      primaryParallelBranch: {
        head: {
          layoutModules: [interceptLayout],
          routeSegments: ["feed", "(..)photo", "[id]"],
        },
        ownerTreePosition: 1,
      },
      routeSegments: ["feed"],
    });

    expect(plan.map((source) => source.module)).toEqual([
      rootLayout,
      interceptLayout,
      boundary,
      slotLayout,
      boundary,
    ]);
  });

  it("attaches page-owned searchParams and its observer to every fallback leaf", () => {
    const boundary = {};
    const searchParams = { source: "search" };
    const searchParamsObserver = { observeParamAccess: vi.fn() };

    const plan = createHttpAccessFallbackMetadataPlan({
      boundaryModule: boundary,
      boundaryOwner: { kind: "page", searchParams, searchParamsObserver },
      boundaryParams: { id: "missing" },
      layoutModules: [],
      parallelBranches: [
        {
          head: { layoutModules: [{}], routeSegments: ["items", "[id]"] },
          ownerTreePosition: 0,
        },
      ],
      params: { id: "missing" },
      routeSegments: ["items", "[id]"],
    });

    const boundarySources = plan.filter((source) => source.module === boundary);
    expect(boundarySources).toHaveLength(2);
    for (const source of boundarySources) {
      expect(source.searchParams).toBe(searchParams);
      expect(source.searchParamsObserver).toBe(searchParamsObserver);
    }
  });

  it("starts generators eagerly while exposing accumulated metadata as parent", async () => {
    const started: string[] = [];
    const boundaryParents: unknown[] = [];
    let releaseRoot!: () => void;
    const rootGate = new Promise<void>((resolve) => {
      releaseRoot = resolve;
    });
    const rootLayout = {
      async generateMetadata() {
        started.push("root");
        await rootGate;
        return { description: "Root description" };
      },
    };
    const boundary = {
      async generateMetadata(_props: unknown, parent: Promise<{ description?: unknown }>) {
        started.push("boundary");
        boundaryParents.push((await parent).description);
        return { title: "Not found" };
      },
    };

    const metadataPromise = resolveHttpAccessFallbackMetadata<Record<string, unknown>>({
      boundaryModule: boundary,
      boundaryOwner: { kind: "layout" },
      boundaryParams: {},
      layoutModules: [rootLayout],
      metadataRoutes: [],
      params: {},
      routePath: "/missing",
      routeSegments: ["missing"],
    });

    await vi.waitFor(() => expect(started).toEqual(["root", "boundary"]));
    releaseRoot();

    await expect(metadataPromise).resolves.toMatchObject({
      description: "Root description",
      title: "Not found",
    });
    expect(boundaryParents).toEqual(["Root description"]);
  });
});
