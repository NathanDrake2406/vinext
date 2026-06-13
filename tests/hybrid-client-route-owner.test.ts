/**
 * Direct unit tests for the client-side `resolveHybridClientRouteOwner`.
 *
 * Mirrors the server-side `pagesRouteHasPriorityOverAppRoute` tests and
 * adds the manifest-mocking plumbing needed to drive the client resolver
 * with synthetic `__VINEXT_LINK_PREFETCH_ROUTES__` and
 * `__VINEXT_PAGES_LINK_PREFETCH_ROUTES__` arrays.
 *
 * The hard guarantee these tests assert: the client and the server reach
 * the same owner for the same (pages pattern, app pattern) pair. If a
 * test here ever diverges from `tests/hybrid-route-priority.test.ts`,
 * the hybrid invariant is broken and the next browser hard-navigation
 * will go to the wrong router.
 *
 * The trie matcher expects Next.js-segment-encoded patternParts: static
 * segments are plain strings, dynamic segments start with `:`, catch-alls
 * end with `+`, and optional catch-alls end with `*`. See
 * `routing/route-trie.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  VinextLinkPrefetchRoute,
  VinextPagesLinkPrefetchRoute,
} from "../packages/vinext/src/client/vinext-next-data.js";
import { resolveHybridClientRouteOwner } from "../packages/vinext/src/shims/internal/hybrid-client-route-owner.js";

const APP_BASE = "http://localhost/";

type WindowState = {
  app: VinextLinkPrefetchRoute[];
  pages: VinextPagesLinkPrefetchRoute[];
};

function installWindow({ app, pages }: WindowState): void {
  (globalThis as any).window = {
    location: { href: APP_BASE, origin: "http://localhost" },
    __VINEXT_LINK_PREFETCH_ROUTES__: app,
    __VINEXT_PAGES_LINK_PREFETCH_ROUTES__: pages,
  };
}

function uninstallWindow(): void {
  delete (globalThis as any).window;
}

let savedWindow: unknown;
beforeEach(() => {
  savedWindow = (globalThis as any).window;
});
afterEach(() => {
  if (savedWindow === undefined) {
    uninstallWindow();
  } else {
    (globalThis as any).window = savedWindow;
  }
});

const appRoute = (patternParts: string[], isDynamic = true): VinextLinkPrefetchRoute => ({
  canPrefetchLoadingShell: !isDynamic,
  isDynamic,
  patternParts,
});

const pagesRoute = (patternParts: string[], isDynamic = true): VinextPagesLinkPrefetchRoute => ({
  canPrefetchLoadingShell: false,
  isDynamic,
  patternParts,
});

describe("resolveHybridClientRouteOwner", () => {
  it("returns null when neither router has a matching manifest", () => {
    installWindow({ app: [], pages: [] });
    expect(resolveHybridClientRouteOwner("/missing", "")).toBeNull();
  });

  it("returns null when neither router matched the URL", () => {
    installWindow({
      app: [appRoute(["a"])],
      pages: [pagesRoute(["b"])],
    });
    expect(resolveHybridClientRouteOwner("/c", "")).toBeNull();
  });

  it("returns 'app' when only the App manifest matched", () => {
    installWindow({
      app: [appRoute(["a", ":slug"])],
      pages: [pagesRoute(["b"])],
    });
    expect(resolveHybridClientRouteOwner("/a/foobar", "")).toBe("app");
  });

  it("returns 'pages' when only the Pages manifest matched", () => {
    installWindow({
      app: [appRoute(["a"])],
      pages: [pagesRoute(["b", ":slug"])],
    });
    expect(resolveHybridClientRouteOwner("/b/foobar", "")).toBe("pages");
  });

  it("lets a more specific Pages dynamic route beat an App root catch-all", () => {
    // Mirrors the server test of the same name. /pages-dir/:dynamic
    // (score 51) beats /:path+ (score 1000).
    installWindow({
      app: [appRoute([":path+"])],
      pages: [pagesRoute(["pages-dir", ":dynamic"])],
    });
    expect(resolveHybridClientRouteOwner("/pages-dir/foobar", "")).toBe("pages");
  });

  it("lets an App static route own the request when Pages only has a catch-all", () => {
    installWindow({
      app: [appRoute(["dashboard"], false)],
      pages: [pagesRoute([":path+"])],
    });
    expect(resolveHybridClientRouteOwner("/dashboard", "")).toBe("app");
  });

  it("lets a static Pages route win over a dynamic App catch-all", () => {
    // E.g. Pages has a literal `/about` page, App only has a catch-all.
    // The literal Pages hit must own the request even though the App
    // catch-all matches the same URL.
    installWindow({
      app: [appRoute([":path+"])],
      pages: [pagesRoute(["about"], false)],
    });
    expect(resolveHybridClientRouteOwner("/about", "")).toBe("pages");
  });

  it("lets an App static route win over an identical static Pages route", () => {
    // Mirrors the server's "keeps the App route ahead of an identical
    // static Pages route" assertion: both have identical static
    // specificity, and the App literal wins by direct hit.
    installWindow({
      app: [appRoute([], false)],
      pages: [pagesRoute([], false)],
    });
    expect(resolveHybridClientRouteOwner("/", "")).toBe("app");
  });

  it("uses Pages provider order as the tie-breaker for identical dynamic patterns", () => {
    // The hand-copied client comparator that this resolver used to ship
    // with returned 'app' for this case (it compared
    // `routePrecedence(p) < routePrecedence(a)` and ties go to false).
    // Delegating to the shared `compareHybridRoutePatterns` (which puts
    // Pages first into `sortRoutes` and preserves order on ties) restores
    // parity with the server.
    installWindow({
      app: [appRoute([":slug"])],
      pages: [pagesRoute([":slug"])],
    });
    expect(resolveHybridClientRouteOwner("/anything", "")).toBe("pages");
  });

  it("lets a static-prefix Pages catch-all beat a bare App catch-all", () => {
    // `/_sites/:slug*` (score 1951 with the static-prefix reduction)
    // must beat `/:slug*` (score 2000). The previous hand-copied
    // comparator missed the static-prefix reduction and returned 'app'
    // for this case, splitting client / server ownership.
    installWindow({
      app: [appRoute([":slug*"])],
      pages: [pagesRoute(["_sites", ":slug*"])],
    });
    expect(resolveHybridClientRouteOwner("/_sites/anything/here", "")).toBe("pages");
  });

  it("lets a static-prefix Pages dynamic beat a bare App dynamic", () => {
    installWindow({
      app: [appRoute([":subdomain"])],
      pages: [pagesRoute(["_sites", ":subdomain"])],
    });
    expect(resolveHybridClientRouteOwner("/_sites/foo", "")).toBe("pages");
  });

  it("prioritizes an earlier static App segment over a later static Pages segment", () => {
    installWindow({
      app: [appRoute(["account", ":tab"])],
      pages: [pagesRoute([":section", "details"])],
    });
    expect(resolveHybridClientRouteOwner("/account/details", "")).toBe("app");
  });

  it("ignores the basePath prefix when matching", () => {
    installWindow({
      app: [appRoute(["a"])],
      pages: [pagesRoute(["pages-dir", ":dynamic"])],
    });
    // The client strips the basePath before consulting the manifest,
    // matching the server's normalisation.
    expect(resolveHybridClientRouteOwner("/base/pages-dir/foobar", "/base")).toBe("pages");
    expect(resolveHybridClientRouteOwner("/base/a", "/base")).toBe("app");
  });
});
