import { describe, expect, it } from "vitest";
import {
  pagesRouteHasPriorityOverAppRoute,
  resolveHybridRouteOwner,
} from "../packages/vinext/src/server/hybrid-route-priority.js";

describe("hybrid App Router + Pages Router route priority", () => {
  it("lets a more specific Pages dynamic route beat an App root catch-all", () => {
    // Ported from Next.js: test/e2e/app-dir/use-params/use-params.test.ts
    // https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/use-params/use-params.test.ts
    //
    // Next.js's DefaultRouteMatcherManager merges Pages and App matchers before
    // sorting dynamic routes, so /pages-dir/[dynamic] owns /pages-dir/foobar
    // ahead of app/[...path].
    expect(
      pagesRouteHasPriorityOverAppRoute(
        { isDynamic: true, pattern: "/pages-dir/:dynamic" },
        { isDynamic: true, pattern: "/:path+" },
      ),
    ).toBe(true);
  });

  it("keeps a more specific App static route ahead of a Pages catch-all", () => {
    expect(
      pagesRouteHasPriorityOverAppRoute(
        { isDynamic: true, pattern: "/:path+" },
        { isDynamic: false, pattern: "/dashboard" },
      ),
    ).toBe(false);
  });

  it("keeps the App route ahead of an identical static Pages route", () => {
    expect(
      pagesRouteHasPriorityOverAppRoute(
        { isDynamic: false, pattern: "/" },
        { isDynamic: false, pattern: "/" },
      ),
    ).toBe(false);
  });

  it("uses Pages provider order as the tie-breaker for identical dynamic patterns", () => {
    // Next.js pushes Pages providers before App providers, then preserves
    // provider order when merging dynamic matchers with the same pathname.
    expect(
      pagesRouteHasPriorityOverAppRoute(
        { isDynamic: true, pattern: "/:slug" },
        { isDynamic: true, pattern: "/:slug" },
      ),
    ).toBe(true);
  });
});

describe("resolveHybridRouteOwner", () => {
  it("returns null when neither router matched", () => {
    expect(resolveHybridRouteOwner(null, null)).toBeNull();
  });

  it("returns the matched router when only one router matched", () => {
    const matched = {
      route: { isDynamic: true, pattern: "/a" },
      params: { id: "1" },
    };
    expect(resolveHybridRouteOwner(matched, null)).toBe("app");
    expect(resolveHybridRouteOwner(null, matched)).toBe("pages");
  });

  it("lets a more specific Pages dynamic route beat an App root catch-all", () => {
    // /pages-dir/[dynamic] owns /pages-dir/foobar ahead of app/[...path].
    expect(
      resolveHybridRouteOwner(
        {
          route: { isDynamic: true, pattern: "/:path+" },
          params: { path: ["pages-dir", "foobar"] },
        },
        {
          route: { isDynamic: true, pattern: "/pages-dir/:dynamic" },
          params: { dynamic: "foobar" },
        },
      ),
    ).toBe("pages");
  });

  it("lets an App static route own the request when Pages only has a catch-all", () => {
    expect(
      resolveHybridRouteOwner(
        { route: { isDynamic: false, pattern: "/dashboard" }, params: {} },
        { route: { isDynamic: true, pattern: "/:path+" }, params: { path: "dashboard" } },
      ),
    ).toBe("app");
  });

  it("lets an App static route win over an identical static Pages route", () => {
    expect(
      resolveHybridRouteOwner(
        { route: { isDynamic: false, pattern: "/" }, params: {} },
        { route: { isDynamic: false, pattern: "/" }, params: {} },
      ),
    ).toBe("app");
  });

  it("uses Pages provider order as the tie-breaker for identical dynamic patterns", () => {
    // Next.js pushes Pages providers before App providers, so identical
    // dynamic patterns go to Pages.
    expect(
      resolveHybridRouteOwner(
        { route: { isDynamic: true, pattern: "/:slug" }, params: { slug: "x" } },
        { route: { isDynamic: true, pattern: "/:slug" }, params: { slug: "x" } },
      ),
    ).toBe("pages");
  });
});
