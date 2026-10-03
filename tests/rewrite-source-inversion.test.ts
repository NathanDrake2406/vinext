import { describe, expect, it } from "vite-plus/test";
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
    [
      "params in a different order",
      { source: "/:a/:b", destination: "/x/:b/:a" },
      "/x/1/2",
      "/2/1",
    ],
  ])("inverts %s", (_label, rewrite, destinationPathname, sourcePathname) => {
    expect(rewriteSourceForDestination(rewrite, destinationPathname)).toBe(sourcePathname);
    // The contract: the returned source rewrites to the destination through the rule.
    expect(matchRewrite(sourcePathname, [rewrite], requestContext)).toBe(destinationPathname);
  });

  it.each<[string, NextRewrite, string]>([
    ["the destination does not match the rule", UNPREFIXED_DEFAULT_LOCALE, "/es/about"],
    // The candidate source `/en/x` fails the source constraint.
    ["the source constraint rejects the candidate", UNPREFIXED_DEFAULT_LOCALE, "/en/en/x"],
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
});
