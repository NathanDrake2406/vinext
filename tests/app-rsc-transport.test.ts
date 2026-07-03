import { describe, expect, it } from "vite-plus/test";
import {
  createRscTransportAssetPathname,
  resolveRscTransportRoutePathname,
  VINEXT_STATIC_RSC_TRANSPORT_PREFIX,
  VINEXT_WORKER_RSC_TRANSPORT_PREFIX,
} from "../packages/vinext/src/server/app-rsc-transport.js";

describe("App Router RSC transport encoding", () => {
  // Routes chosen to collide under structured transport filenames: `/__root`
  // aliased the `/` sentinel, `/docs/__index` aliased the `/docs/` sentinel,
  // and `/foo.rsc` / `/a%2Fb` stress suffix stripping and percent-encoding.
  const routes = ["/", "/__root", "/docs/", "/docs/__index", "/foo.rsc", "/a%2Fb"];

  it("round-trips visible routes through both transport prefixes", () => {
    for (const route of routes) {
      const assetPathname = createRscTransportAssetPathname(route);
      expect(
        resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}${assetPathname}`),
      ).toBe(route);
      expect(
        resolveRscTransportRoutePathname(`${VINEXT_WORKER_RSC_TRANSPORT_PREFIX}${assetPathname}`),
      ).toBe(route);
    }
  });

  it("maps distinct routes to distinct transport assets", () => {
    const assetPathnames = routes.map(createRscTransportAssetPathname);
    expect(new Set(assetPathnames).size).toBe(routes.length);
  });

  it("encodes the visible pathname as a stable opaque token", () => {
    // Hand-derived: base64url of the raw pathname bytes.
    expect(createRscTransportAssetPathname("/")).toBe("/Lw.rsc");
    expect(createRscTransportAssetPathname("/about")).toBe("/L2Fib3V0.rsc");
    expect(createRscTransportAssetPathname("/docs/")).toBe("/L2RvY3Mv.rsc");
  });

  it("rejects transport paths that do not decode to a rooted pathname", () => {
    // "YWJvdXQ" decodes to "about" — valid base64url, not a rooted pathname.
    expect(
      resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}/YWJvdXQ.rsc`),
    ).toBe(null);
    expect(
      resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}/not+base64!.rsc`),
    ).toBe(null);
    expect(resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}/a/b.rsc`)).toBe(
      null,
    );
    expect(resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}/.rsc`)).toBe(
      null,
    );
    expect(resolveRscTransportRoutePathname(`${VINEXT_STATIC_RSC_TRANSPORT_PREFIX}/Lw`)).toBe(null);
    expect(resolveRscTransportRoutePathname("/other/Lw.rsc")).toBe(null);
  });
});
