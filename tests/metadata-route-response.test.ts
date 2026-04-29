import { describe, expect, it } from "vite-plus/test";
import { handleMetadataRouteRequest } from "../packages/vinext/src/server/metadata-route-response.js";
import type { MetadataFileRoute } from "../packages/vinext/src/server/metadata-routes.js";

function makeThenableParams(params: Record<string, string | string[]>): unknown {
  return Object.assign(Promise.resolve(params), params);
}

describe("handleMetadataRouteRequest", () => {
  it("does not inspect generateSitemaps on non-sitemap metadata routes", async () => {
    let generateSitemapsReads = 0;
    const route = {
      type: "icon",
      isDynamic: true,
      filePath: "/tmp/app/icon.tsx",
      routePrefix: "",
      routeSegments: [],
      servedUrl: "/icon",
      contentType: "image/png",
      module: {
        get generateSitemaps() {
          generateSitemapsReads++;
          return () => [];
        },
        default: () => new Response("icon", { headers: { "Content-Type": "image/png" } }),
      },
    } satisfies MetadataFileRoute;

    const response = await handleMetadataRouteRequest({
      metadataRoutes: [route],
      cleanPathname: "/icon",
      makeThenableParams,
    });

    expect(response?.status).toBe(200);
    expect(generateSitemapsReads).toBe(0);
  });

  it("checks generateSitemaps once when skipping the generated sitemap base URL", async () => {
    let generateSitemapsReads = 0;
    const route = {
      type: "sitemap",
      isDynamic: true,
      filePath: "/tmp/app/products/sitemap.ts",
      routePrefix: "/products",
      routeSegments: ["products"],
      servedUrl: "/products/sitemap.xml",
      contentType: "application/xml",
      module: {
        get generateSitemaps() {
          generateSitemapsReads++;
          return () => [{ id: 0 }];
        },
        default: () => [{ url: "https://example.com/products/0" }],
      },
    } satisfies MetadataFileRoute;

    const response = await handleMetadataRouteRequest({
      metadataRoutes: [route],
      cleanPathname: "/products/sitemap.xml",
      makeThenableParams,
    });

    expect(response).toBeNull();
    expect(generateSitemapsReads).toBe(1);
  });
});
