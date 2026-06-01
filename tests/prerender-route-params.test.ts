import { describe, expect, it } from "vite-plus/test";
import {
  encodePrerenderRouteParams,
  matchPrerenderRouteParamsPayload,
  prerenderRouteParamsPayloadMatchesRoute,
  type PrerenderRouteParamsPayload,
} from "../packages/vinext/src/server/prerender-route-params.js";

describe("prerenderRouteParamsPayloadMatchesRoute", () => {
  it("requires the decoded prerender params to match the final route params", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/product/:id",
      params: { id: "sticks%20%26%20stones" },
    };

    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/product/:id", {
        id: "sticks & stones",
      }),
    ).toBe(true);
    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/product/:id", {
        id: "sticks-and-stones",
      }),
    ).toBe(false);
    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/source/:slug", {
        id: "sticks & stones",
      }),
    ).toBe(false);
  });

  it("compares catch-all params element-by-element after decoding", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/docs/:slug+",
      params: { slug: ["sticks%20%26%20stones", "more%20words"] },
    };

    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/docs/:slug+", {
        slug: ["sticks & stones", "more words"],
      }),
    ).toBe(true);
    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/docs/:slug+", {
        slug: ["more words", "sticks & stones"],
      }),
    ).toBe(false);
    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/docs/:slug+", {
        slug: "sticks & stones",
      }),
    ).toBe(false);
  });
});

describe("matchPrerenderRouteParamsPayload", () => {
  it("distinguishes fallback-shell prerender payloads from exact route params", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "%5Bslug%5D" },
      fallbackParamNames: ["slug"],
    };

    expect(
      matchPrerenderRouteParamsPayload(payload, "/:locale/blog/:slug", {
        locale: "en",
        slug: "[slug]",
      }),
    ).toEqual({
      fallbackParamNames: ["slug"],
      kind: "fallback-shell",
      params: { locale: "en", slug: "%5Bslug%5D" },
    });
    expect(
      prerenderRouteParamsPayloadMatchesRoute(payload, "/:locale/blog/:slug", {
        locale: "en",
        slug: "[slug]",
      }),
    ).toBe(false);
  });

  it("rejects fallback-shell payloads that name params outside the route pattern", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "%5Bslug%5D" },
      fallbackParamNames: ["missing"],
    };

    expect(
      matchPrerenderRouteParamsPayload(payload, "/:locale/blog/:slug", {
        locale: "en",
        slug: "[slug]",
      }),
    ).toBeNull();
  });

  it("matches fallback-shell catch-all placeholders as route param arrays", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/:locale/docs/:slug+",
      params: { locale: "fr", slug: ["%5B...slug%5D"] },
      fallbackParamNames: ["slug"],
    };

    expect(
      matchPrerenderRouteParamsPayload(payload, "/:locale/docs/:slug+", {
        locale: "fr",
        slug: ["[...slug]"],
      }),
    ).toEqual({
      fallbackParamNames: ["slug"],
      kind: "fallback-shell",
      params: { locale: "fr", slug: ["%5B...slug%5D"] },
    });
  });

  it("returns kind exact when payload has no fallbackParamNames", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "hello%20world" },
    };

    expect(
      matchPrerenderRouteParamsPayload(payload, "/:locale/blog/:slug", {
        locale: "en",
        slug: "hello world",
      }),
    ).toEqual({ kind: "exact", params: { locale: "en", slug: "hello%20world" } });
  });

  it("returns null when payload kind is exact but params differ", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/product/:id",
      params: { id: "abc" },
    };

    expect(matchPrerenderRouteParamsPayload(payload, "/product/:id", { id: "xyz" })).toBeNull();
  });

  it("returns null when payload routePattern does not match", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/blog/:slug",
      params: { slug: "post" },
    };

    expect(matchPrerenderRouteParamsPayload(payload, "/news/:slug", { slug: "post" })).toBeNull();
  });

  it("returns null when payload param count differs from route params", () => {
    const payload: PrerenderRouteParamsPayload = {
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "post" },
    };

    expect(
      matchPrerenderRouteParamsPayload(payload, "/:locale/blog/:slug", {
        locale: "en",
        slug: "post",
        extra: "x",
      }),
    ).toBeNull();
  });
});

describe("encodePrerenderRouteParams", () => {
  it("encodes exact params without fallbackParamNames", () => {
    const result = encodePrerenderRouteParams("/product/:id", { id: "abc" });

    expect(result).toEqual({
      routePattern: "/product/:id",
      params: { id: "abc" },
    });
  });

  it("encodes fallback-shell params with fallbackParamNames", () => {
    const result = encodePrerenderRouteParams(
      "/:locale/blog/:slug",
      { locale: "en", slug: "[slug]" },
      ["slug"],
    );

    expect(result).toEqual({
      fallbackParamNames: ["slug"],
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "%5Bslug%5D" },
    });
  });

  it("returns null for static patterns with no dynamic params", () => {
    expect(encodePrerenderRouteParams("/about", {})).toBeNull();
  });

  it("encodes catch-all params with array values", () => {
    const result = encodePrerenderRouteParams("/docs/:slug+", {
      slug: ["getting-started", "intro"],
    });

    expect(result).toEqual({
      routePattern: "/docs/:slug+",
      params: { slug: ["getting-started", "intro"] },
    });
  });

  it("encodes optional catch-all params with array values", () => {
    const result = encodePrerenderRouteParams("/docs/:slug*", {
      slug: ["guides", "advanced"],
    });

    expect(result).toEqual({
      routePattern: "/docs/:slug*",
      params: { slug: ["guides", "advanced"] },
    });
  });

  it("percent-encodes param values", () => {
    const result = encodePrerenderRouteParams("/:locale/blog/:slug", {
      locale: "en",
      slug: "hello world & more",
    });

    expect(result).toEqual({
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "hello%20world%20%26%20more" },
    });
  });

  it("omits fallbackParamNames when empty array is passed", () => {
    const result = encodePrerenderRouteParams(
      "/:locale/blog/:slug",
      { locale: "en", slug: "post" },
      [],
    );

    expect(result).toEqual({
      routePattern: "/:locale/blog/:slug",
      params: { locale: "en", slug: "post" },
    });
  });
});
