import { describe, it, expect, afterEach } from "vite-plus/test";
import {
  clearPregeneratedConcretePaths,
  addPregeneratedConcretePath,
  getRenderedConcreteUrlPathsForRoute,
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


});
