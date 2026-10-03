import { describe, expect, it } from "vite-plus/test";
import { collectRewriteSourcePathnames } from "../packages/vinext/src/build/prerender-rewrite-sources.js";
import {
  matchRewrite,
  rewriteSourceForDestination,
} from "../packages/vinext/src/config/config-matchers.js";
import type { NextRewrite } from "../packages/vinext/src/config/next-config.js";

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
  ])("returns null when %s", (_label, rewrite, destinationPathname) => {
    expect(rewriteSourceForDestination(rewrite, destinationPathname)).toBeNull();
  });

  it("does not run a constraint that can backtrack without bound", () => {
    // Against this pathname, `(a+)+` needs about 2^40 steps to fail.
    const destinationPathname = `/x/${"a".repeat(40)}!`;
    expect(
      rewriteSourceForDestination(
        { source: "/:p((a+)+)", destination: "/x/:p" },
        destinationPathname,
      ),
    ).toBeNull();
  });
});

describe("collectRewriteSourcePathnames", () => {
  it("collects each source pathname one time from all rewrite phases", () => {
    expect(
      collectRewriteSourcePathnames("/en/about", {
        beforeFiles: [{ source: "/a", destination: "/en/about" }],
        afterFiles: [
          { source: "/a", destination: "/en/about" },
          { source: "/b", destination: "/en/about" },
          { source: "/other", destination: "/en/contact" },
        ],
        fallback: [{ source: "/c", destination: "/en/about" }],
      }),
    ).toEqual(["/a", "/b", "/c"]);
  });

  it("leaves out a source pathname that an external rewrite can take", () => {
    expect(
      collectRewriteSourcePathnames("/en/about", {
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
      }),
    ).toEqual(["/info"]);
  });
});
