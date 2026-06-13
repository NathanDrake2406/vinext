import { describe, expect, it } from "vitest";
import { compareHybridRoutePatterns } from "../packages/vinext/src/routing/utils.js";
import {
  pagesRouteHasPriorityOverAppRoute,
  resolveHybridRouteOwner,
} from "../packages/vinext/src/server/hybrid-route-priority.js";

describe("compareHybridRoutePatterns", () => {
  it("lets a more specific Pages dynamic route beat an App root catch-all", () => {
    // Ported from Next.js: test/e2e/app-dir/use-params/use-params.test.ts
    // https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/use-params/use-params.test.ts
    //
    // Next.js's DefaultRouteMatcherManager merges Pages and App matchers before
    // sorting dynamic routes, so /pages-dir/[dynamic] owns /pages-dir/foobar
    // ahead of app/[...path].
    expect(compareHybridRoutePatterns("/pages-dir/:dynamic", true, "/:path+", true)).toBe("pages");
  });

  it("keeps a more specific App static route ahead of a Pages catch-all", () => {
    expect(compareHybridRoutePatterns("/:path+", true, "/dashboard", false)).toBe("app");
  });

  it("lets a static Pages route win over a dynamic App catch-all", () => {
    // E.g. Pages has a literal `/about` page, App only has a catch-all.
    // The literal Pages hit must own the request even though the App
    // catch-all matches the same URL.
    expect(compareHybridRoutePatterns("/about", false, "/:path+", true)).toBe("pages");
  });

  it("keeps the App route ahead of an identical static Pages route", () => {
    // App providers are registered after Pages providers, but identical
    // static routes have identical specificity, and App's static literal
    // wins by direct hit.
    expect(compareHybridRoutePatterns("/", false, "/", false)).toBe("app");
  });

  it("uses Pages provider order as the tie-breaker for identical dynamic patterns", () => {
    // Next.js pushes Pages providers before App providers, then preserves
    // provider order when merging dynamic matchers with the same pathname.
    // `sortRoutes` returns 0 for equal patterns; Array.prototype.sort keeps
    // the front element, and the front element is Pages.
    expect(compareHybridRoutePatterns("/:slug", true, "/:slug", true)).toBe("pages");
  });

  it("lets a static-prefix Pages catch-all beat a bare App catch-all", () => {
    // /_sites/:slug* must beat /:slug*. `routePrecedence` reduces the
    // static-prefix score by 50 per segment, so the Pages route scores
    // 51 and the App route scores 100. The hand-copied client comparator
    // missed this reduction and reversed the answer; the shared
    // comparator (which delegates to `sortRoutes`) gets it right.
    expect(compareHybridRoutePatterns("/_sites/:slug*", true, "/:slug*", true)).toBe("pages");
  });

  it("lets a static-prefix Pages dynamic beat a bare App dynamic", () => {
    // Same shape as the catch-all case but for a plain dynamic segment.
    expect(compareHybridRoutePatterns("/_sites/:subdomain", true, "/:subdomain", true)).toBe(
      "pages",
    );
  });

  it("lets a Pages dynamic with a static prefix beat an App dynamic with a static prefix", () => {
    // Both have a static prefix of length 1. The Pages route has a more
    // specific infix (`/_sites/blog/:slug`) versus a bare infix dynamic
    // (`/_sites/:slug`); the static-prefix reduction cancels but the
    // infix-static bonus inside `routePrecedence` puts the more specific
    // Pages route ahead.
    expect(compareHybridRoutePatterns("/_sites/blog/:slug", true, "/_sites/:slug", true)).toBe(
      "pages",
    );
  });
});

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
