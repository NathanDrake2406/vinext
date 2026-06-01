import { describe, it, expect, afterEach } from "vite-plus/test";
import {
  clearPregeneratedConcretePaths,
  addPregeneratedConcretePath,
  getRenderedConcreteUrlPathsForRoute,
  initPregeneratedPathsFromGlobals,
} from "../packages/vinext/src/server/pregenerated-concrete-paths.js";

describe("pregenerated concrete paths", () => {
  afterEach(() => {
    clearPregeneratedConcretePaths();
  });

  it("returns undefined for an unknown route pattern", () => {
    expect(getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")).toBeUndefined();
  });

  it("stores and retrieves pathnames for a route pattern", () => {
    addPregeneratedConcretePath("/:locale/blog/:slug", "/en/blog/hello");
    addPregeneratedConcretePath("/:locale/blog/:slug", "/fr/blog/bonjour");

    const paths = getRenderedConcreteUrlPathsForRoute("/:locale/blog/:slug");
    expect(paths).toBeDefined();
    expect([...paths!]).toEqual(["/en/blog/hello", "/fr/blog/bonjour"]);
  });

  it("supports independent route patterns", () => {
    addPregeneratedConcretePath("/:locale/blog/:slug", "/en/blog/hello");
    addPregeneratedConcretePath("/products/:id", "/products/42");

    expect([...getRenderedConcreteUrlPathsForRoute("/:locale/blog/:slug")!]).toEqual([
      "/en/blog/hello",
    ]);
    expect([...getRenderedConcreteUrlPathsForRoute("/products/:id")!]).toEqual(["/products/42"]);
  });

  it("returns an empty state after clear", () => {
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/persistent");
    expect(getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")).toBeDefined();

    clearPregeneratedConcretePaths();

    expect(getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")).toBeUndefined();
  });

  it("clears stale paths from a previous build on re-population (issue 3)", () => {
    // Build A
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/old");
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/also-old");
    expect(getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")!.size).toBe(2);

    // Build B — clear and re-seed without the old paths
    clearPregeneratedConcretePaths();
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/new");

    const paths = getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")!;
    expect(paths.has("/en/blog/old")).toBe(false);
    expect(paths.has("/en/blog/also-old")).toBe(false);
    expect(paths.has("/en/blog/new")).toBe(true);
    expect(paths.size).toBe(1);
  });

  it("populates paths from globalThis via initPregeneratedPathsFromGlobals (Worker path)", () => {
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [
      ["/:locale/blog/:slug", ["/en/blog/hello", "/fr/blog/bonjour"]],
      ["/products/:id", ["/products/42"]],
    ];
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;

    const blogPaths = getRenderedConcreteUrlPathsForRoute("/:locale/blog/:slug");
    expect(blogPaths).toBeDefined();
    expect([...blogPaths!]).toEqual(["/en/blog/hello", "/fr/blog/bonjour"]);

    const productPaths = getRenderedConcreteUrlPathsForRoute("/products/:id");
    expect(productPaths).toBeDefined();
    expect([...productPaths!]).toEqual(["/products/42"]);
  });

  it("is a no-op when globalThis key is not set", () => {
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/known");
    // No global is set — call init and verify existing paths survive
    initPregeneratedPathsFromGlobals();
    const paths = getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]");
    expect(paths).toBeDefined();
    expect(paths!.has("/en/blog/known")).toBe(true);
  });

  it("is a no-op when globalThis value is not an array", () => {
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/known");
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = "not-an-array";
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;
    const paths = getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]");
    expect(paths).toBeDefined();
    expect(paths!.has("/en/blog/known")).toBe(true);
  });

  it("is a no-op when globalThis entries have wrong structure", () => {
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/known");
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [
      ["/:locale/blog/:slug", ["/en/blog/hello"]],
      ["/broken"],
      "not-an-entry",
      null,
    ];
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;
    const paths = getRenderedConcreteUrlPathsForRoute("/:locale/blog/:slug");
    // First valid entry populated, then second invalid entry caused reject
    expect(paths).toBeUndefined();
    // Original state should survive the reject
    const origPaths = getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]");
    expect(origPaths).toBeDefined();
    expect(origPaths!.has("/en/blog/known")).toBe(true);
  });

  it("clears previous state and repopulates when globalThis has empty array", () => {
    addPregeneratedConcretePath("/en/blog/[slug]", "/en/blog/old");
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [];
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;
    // Previous state was cleared (empty table)
    expect(getRenderedConcreteUrlPathsForRoute("/en/blog/[slug]")).toBeUndefined();
  });

  it("normalizes percent-encoded paths from globalThis", () => {
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [
      ["/:locale/blog/:slug", ["/en/blog/hello%20world"]],
    ];
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;
    const paths = [...getRenderedConcreteUrlPathsForRoute("/:locale/blog/:slug")!];
    expect(paths).toEqual(["/en/blog/hello world"]);
  });

  it("second initPregeneratedPathsFromGlobals call overrides the first", () => {
    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [["/route/a", ["/a/one"]]];
    initPregeneratedPathsFromGlobals();
    expect(getRenderedConcreteUrlPathsForRoute("/route/a")).toBeDefined();

    globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = [["/route/b", ["/b/one"]]];
    initPregeneratedPathsFromGlobals();
    delete globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS;
    // First route's paths are gone
    expect(getRenderedConcreteUrlPathsForRoute("/route/a")).toBeUndefined();
    // Second route's paths are present
    expect([...getRenderedConcreteUrlPathsForRoute("/route/b")!]).toEqual(["/b/one"]);
  });
});
