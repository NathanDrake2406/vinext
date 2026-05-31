import { describe, expect, it } from "vite-plus/test";
import {
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
});
