import { describe, expect, it, vi } from "vite-plus/test";
import {
  collectRewriteSourcePathnames,
  collectRewriteSources,
} from "../packages/vinext/src/build/prerender-rewrite-sources.js";
import {
  matchRewrite,
  rewriteSourceForDestination,
} from "../packages/vinext/src/config/config-matchers.js";
import type { NextRewrite } from "../packages/vinext/src/config/next-config.js";
import {
  applyPrerenderCacheIdentityHeader,
  isRewriteCachePathnameOf,
  readPrerenderCacheIdentityHeader,
} from "../packages/vinext/src/server/app-rewrite-cache-identity.js";
import {
  getOutputPath,
  getRewriteSourceArtifactPathname,
  getRscOutputPath,
} from "../packages/vinext/src/utils/prerender-output-paths.js";

// The "default locale without a prefix" rule from
// https://github.com/cloudflare/vinext/issues/3672.
const UNPREFIXED_DEFAULT_LOCALE: NextRewrite = {
  source: "/:path((?!en$|en/|es$|es/|api$|api/|_next/).*)",
  destination: "/en/:path",
};

const requestContext = {
  headers: new Headers(),
  cookies: {},
  query: new URLSearchParams(),
  host: "example.test",
};

/** A trailing slash does not change which page a rewritten pathname names. */
const withoutTrailingSlash = (pathname: string | null) =>
  pathname !== null && pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

describe("rewriteSourceForDestination", () => {
  it.each<[string, NextRewrite, string, string]>([
    ["a literal rule", { source: "/", destination: "/en" }, "/en", "/"],
    ["a constrained param", UNPREFIXED_DEFAULT_LOCALE, "/en/about", "/about"],
    // The destination slot `:path` must accept what the source `(.*)` accepts.
    [
      "a constrained param that spans segments",
      UNPREFIXED_DEFAULT_LOCALE,
      "/en/docs/intro",
      "/docs/intro",
    ],
    [
      "a catch-all param",
      { source: "/docs/:path*", destination: "/en/docs/:path*" },
      "/en/docs/a/b",
      "/docs/a/b",
    ],
    // The rule rewrites `/` to `/en/`, which names the page at `/en`.
    ["an empty catch-all param", { source: "/:path*", destination: "/en/:path*" }, "/en", "/"],
    [
      "a destination that ends with a slash",
      { source: "/about", destination: "/en/about/" },
      "/en/about",
      "/about",
    ],
    [
      "params in a different order",
      { source: "/:a/:b", destination: "/x/:b/:a" },
      "/x/1/2",
      "/2/1",
    ],
    // The runtime matches a source without regard to letter case.
    [
      "a constraint that the value matches only without regard to letter case",
      { source: "/docs/:slug([a-z0-9-]+)", destination: "/en/guide/:slug" },
      "/en/guide/Getting-Started",
      "/docs/Getting-Started",
    ],
  ])("inverts %s", (_label, rewrite, destinationPathname, sourcePathname) => {
    expect(rewriteSourceForDestination(rewrite, destinationPathname)).toBe(sourcePathname);
    // The contract: the returned source rewrites to the destination through the rule.
    expect(withoutTrailingSlash(matchRewrite(sourcePathname, [rewrite], requestContext))).toBe(
      destinationPathname,
    );
  });

  it.each<[string, NextRewrite, string]>([
    ["the destination does not match the rule", UNPREFIXED_DEFAULT_LOCALE, "/es/about"],
    // The candidate source `/en/x` fails the source constraint.
    ["the source constraint rejects the candidate", UNPREFIXED_DEFAULT_LOCALE, "/en/en/x"],
    // The destination gives the candidate `/es`, but the source needs `/es/`.
    [
      "the rule does not match the candidate source",
      { source: "/:locale(en|es)/", destination: "/:locale" },
      "/es",
    ],
    [
      "a single-segment param would have to span segments",
      { source: "/p/:id", destination: "/post/:id" },
      "/post/a/b",
    ],
    ["the destination drops a source param", { source: "/p/:id", destination: "/post" }, "/post"],
    [
      "the rule has a `has` condition",
      { source: "/a", destination: "/b", has: [{ type: "cookie", key: "plan" }] },
      "/b",
    ],
    [
      "the rule has a `missing` condition",
      { source: "/a", destination: "/b", missing: [{ type: "cookie", key: "plan" }] },
      "/b",
    ],
    ["the destination is external", { source: "/a", destination: "https://example.dev/b" }, "/b"],
    ["the destination has a query", { source: "/a", destination: "/b?view=1" }, "/b"],
    ["the source has an unnamed group", { source: "/(en|es)/a", destination: "/b" }, "/b"],
    // Config validation accepts this source, but it gives no request pathname.
    [
      "the source has no leading slash",
      { source: ":slug", destination: "/en/blog/:slug" },
      "/en/blog/intro",
    ],
  ])("returns null when %s", (_label, rewrite, destinationPathname) => {
    expect(rewriteSourceForDestination(rewrite, destinationPathname)).toBeNull();
  });

  it("does not run a constraint that can backtrack without bound", () => {
    // Against this pathname, `(a+)+` needs about 2^40 steps to fail. The spy
    // records such a run and stops it, so a missing guard fails the test fast.
    const unsafeRuns: string[] = [];
    const exec: RegExp["exec"] = Reflect.get(RegExp.prototype, "exec");
    const spy = vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (
      this: RegExp,
      input: string,
    ) {
      if (!this.source.includes("(a+)+")) return exec.call(this, input);
      unsafeRuns.push(this.source);
      return null;
    });
    try {
      expect(
        rewriteSourceForDestination(
          { source: "/:p((a+)+)", destination: "/x/:p" },
          `/x/${"a".repeat(40)}!`,
        ),
      ).toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(unsafeRuns).toEqual([]);
  });
});

describe("collectRewriteSourcePathnames", () => {
  it("collects each source pathname one time from all rewrite phases", () => {
    expect(
      collectRewriteSourcePathnames(
        "/en/about",
        {
          basePath: "",
          rewrites: {
            beforeFiles: [{ source: "/a", destination: "/en/about" }],
            afterFiles: [
              { source: "/a", destination: "/en/about" },
              { source: "/b", destination: "/en/about" },
              { source: "/other", destination: "/en/contact" },
            ],
            fallback: [{ source: "/c", destination: "/en/about" }],
          },
        },
        [],
      ),
    ).toEqual(["/a", "/b", "/c"]);
  });

  it("leaves out a source pathname when an external rewrite takes the build request first", () => {
    expect(
      collectRewriteSourcePathnames(
        "/en/about",
        {
          basePath: "",
          rewrites: {
            beforeFiles: [
              {
                source: "/about",
                missing: [{ type: "cookie", key: "session" }],
                destination: "https://upstream.example/landing",
              },
            ],
            afterFiles: [
              { source: "/about", destination: "/en/about" },
              { source: "/info", destination: "/en/about" },
            ],
            fallback: [],
          },
        },
        [],
      ),
    ).toEqual(["/info"]);
  });

  // A request for a pathname runs what owns it. A route handler at `/feed`
  // must not run during the build because a page exists at `/en/feed`.
  describe("a pathname that a route owns", () => {
    const rule = { source: "/:name", destination: "/en/:name" };
    const routes = [
      { pattern: "/feed", isDynamic: false },
      { pattern: "/:locale/feed", isDynamic: true },
    ];
    const sources = (
      rewrites: Partial<Record<"beforeFiles" | "afterFiles" | "fallback", [typeof rule]>>,
    ) =>
      collectRewriteSourcePathnames(
        "/en/feed",
        { basePath: "", rewrites: { beforeFiles: [], afterFiles: [], fallback: [], ...rewrites } },
        routes,
      );

    it("is a source of a beforeFiles rule, which runs before the route", () => {
      expect(sources({ beforeFiles: [rule] })).toEqual(["/feed"]);
    });

    it("is not a source of an afterFiles rule when a route without params owns it", () => {
      expect(sources({ afterFiles: [rule] })).toEqual([]);
    });

    it("is a source of an afterFiles rule when only a dynamic route matches it", () => {
      expect(
        collectRewriteSourcePathnames(
          "/en/about",
          { basePath: "", rewrites: { beforeFiles: [], afterFiles: [rule], fallback: [] } },
          [{ pattern: "/:locale", isDynamic: true }],
        ),
      ).toEqual(["/about"]);
    });

    it("is not a source of a fallback rule when a dynamic route matches it", () => {
      expect(
        collectRewriteSourcePathnames(
          "/en/about",
          { basePath: "", rewrites: { beforeFiles: [], afterFiles: [], fallback: [rule] } },
          [{ pattern: "/:locale", isDynamic: true }],
        ),
      ).toEqual([]);
    });
  });

  it.each<[string, Parameters<typeof collectRewriteSourcePathnames>[1]]>([
    [
      "comes after the rule that takes the pathname",
      {
        basePath: "",
        rewrites: {
          beforeFiles: [],
          afterFiles: [{ source: "/about", destination: "/en/about" }],
          fallback: [{ source: "/:path*", destination: "https://legacy.example/:path*" }],
        },
      },
    ],
    [
      "needs a cookie that the build request does not have",
      {
        basePath: "",
        rewrites: {
          beforeFiles: [
            {
              source: "/about",
              has: [{ type: "cookie", key: "session" }],
              destination: "https://upstream.example/landing",
            },
          ],
          afterFiles: [{ source: "/about", destination: "/en/about" }],
          fallback: [],
        },
      },
    ],
    // The build requests URLs below basePath. The runtime does not evaluate a
    // `basePath: false` rule for such a request.
    [
      "opts out of the basePath that the build request has",
      {
        basePath: "/docs",
        rewrites: {
          beforeFiles: [],
          afterFiles: [
            { source: "/:path*", destination: "https://legacy.example/:path*", basePath: false },
            { source: "/about", destination: "/en/about" },
          ],
          fallback: [],
        },
      },
    ],
  ])("keeps a source pathname when an external rewrite %s", (_label, config) => {
    expect(collectRewriteSourcePathnames("/en/about", config, [])).toEqual(["/about"]);
  });
});

describe("collectRewriteSources", () => {
  it("keeps one source pathname as a candidate of each page that a rule maps it to", () => {
    // The first rule takes `/pricing` at runtime, so only the request handler
    // can tell that `/en/plans` is the page. Both candidates must be requested.
    const pages = [{ urlPath: "/en/pricing" }, { urlPath: "/en/plans" }];
    expect(
      collectRewriteSources(
        pages,
        {
          basePath: "",
          rewrites: {
            beforeFiles: [],
            afterFiles: [
              { source: "/pricing", destination: "/en/plans" },
              { source: "/:name", destination: "/en/:name" },
            ],
            fallback: [],
          },
        },
        [],
      ),
    ).toEqual([
      { page: pages[0], sourcePathname: "/pricing" },
      { page: pages[1], sourcePathname: "/pricing" },
      { page: pages[1], sourcePathname: "/plans" },
    ]);
  });

  it("keeps the first of the source pathnames that differ only by letter case", () => {
    const pages = [{ urlPath: "/en/about" }];
    expect(
      collectRewriteSources(
        pages,
        {
          basePath: "",
          rewrites: {
            beforeFiles: [],
            afterFiles: [
              { source: "/About", destination: "/en/about" },
              { source: "/about", destination: "/en/about" },
            ],
            fallback: [],
          },
        },
        [],
      ),
    ).toEqual([{ page: pages[0], sourcePathname: "/About" }]);
  });
});

describe("getRewriteSourceArtifactPathname", () => {
  it.each([false, true])(
    "names artifact files that no page artifact and no other source uses (trailingSlash: %s)",
    (trailingSlash) => {
      // `/`, `/index` and `/404` are the pathnames whose page artifacts have
      // file names that a source pathname could produce.
      const pathnames = ["/", "/index", "/404", "/about"];
      const sourceArtifacts = pathnames.flatMap((pathname) => {
        const artifactPathname = getRewriteSourceArtifactPathname(pathname);
        return [getOutputPath(artifactPathname, trailingSlash), getRscOutputPath(artifactPathname)];
      });
      const pageArtifacts = pathnames.flatMap((pathname) => [
        getOutputPath(pathname, trailingSlash),
        getRscOutputPath(pathname),
      ]);

      expect(new Set(sourceArtifacts).size).toBe(sourceArtifacts.length);
      expect(sourceArtifacts.filter((file) => pageArtifacts.includes(file))).toEqual([]);
    },
  );
});

describe("prerender cache identity header", () => {
  it("carries a cache pathname with characters that a header value cannot hold", () => {
    const headers = new Headers();
    const cachePathname = "/blog/café?__vinext_rewrite=%2Fen%2Fblog%2Fcaf%25C3%25A9";
    applyPrerenderCacheIdentityHeader(headers, cachePathname);
    expect(readPrerenderCacheIdentityHeader(headers)).toBe(cachePathname);
  });
});

describe("isRewriteCachePathnameOf", () => {
  it.each<[string, string, string, string]>([
    ["a plain rewrite", "/about?__vinext_rewrite=%2Fen%2Fabout", "/about", "/en/about"],
    [
      "a request with a trailing slash",
      "/about/?__vinext_rewrite=%2Fen%2Fabout",
      "/about/",
      "/en/about",
    ],
    // The handler decodes the source part and keeps the encoding of the capture.
    [
      "a percent-encoded capture",
      "/blog/caf\u00e9?__vinext_rewrite=%2Fen%2Fblog%2Fcaf%25C3%25A9",
      "/blog/caf%C3%A9",
      "/en/blog/caf%C3%A9",
    ],
    [
      "a resolved pathname with a trailing slash",
      "/shop?__vinext_rewrite=%2Fen%2Fshop%2F",
      "/shop",
      "/en/shop",
    ],
  ])("accepts the identity of %s", (_label, cachePathname, requestPathname, pagePathname) => {
    expect(isRewriteCachePathnameOf(cachePathname, requestPathname, pagePathname)).toBe(true);
  });

  it.each<[string, string, string, string]>([
    ["another page", "/promo?__vinext_rewrite=%2Fen%2Fabout", "/promo", "/en/contact"],
    ["another source", "/other?__vinext_rewrite=%2Fen%2Fabout", "/about", "/en/about"],
    ["an unrewritten request", "/en/about", "/en/about", "/en/about"],
    ["a malformed resolved pathname", "/about?__vinext_rewrite=%E0%A4%A", "/about", "/en/about"],
  ])("rejects the identity of %s", (_label, cachePathname, requestPathname, pagePathname) => {
    expect(isRewriteCachePathnameOf(cachePathname, requestPathname, pagePathname)).toBe(false);
  });
});
