import { describe, expect, it } from "vite-plus/test";
import { handleMetadataRouteRequest } from "../packages/vinext/src/server/metadata-route-response.js";
import type { MetadataFileRoute } from "../packages/vinext/src/server/metadata-routes.js";

type MetadataRuntimeRoute = MetadataFileRoute & {
  fileDataBase64?: string;
};

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

  it("passes generated sitemap id as a promise of the URL string id", async () => {
    let receivedPromise = false;
    const route = {
      type: "sitemap",
      isDynamic: true,
      filePath: "/tmp/app/products/sitemap.ts",
      routePrefix: "/products",
      routeSegments: ["products"],
      servedUrl: "/products/sitemap.xml",
      contentType: "application/xml",
      module: {
        generateSitemaps: () => [{ id: 0 }],
        default: async ({ id }: { id: Promise<string | undefined> }) => {
          receivedPromise = id instanceof Promise;
          return [{ url: `https://example.com/products/${await id}` }];
        },
      },
    } satisfies MetadataFileRoute;

    const response = await handleMetadataRouteRequest({
      metadataRoutes: [route],
      cleanPathname: "/products/sitemap/0.xml",
      makeThenableParams,
    });

    expect(response?.status).toBe(200);
    expect(receivedPromise).toBe(true);
    expect(response?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await response?.text()).toContain("https://example.com/products/0");
  });

  it("throws when matched static metadata route data is missing", async () => {
    const route = {
      type: "icon",
      isDynamic: false,
      filePath: "/tmp/app/icon.png",
      routePrefix: "",
      routeSegments: [],
      servedUrl: "/icon.png",
      contentType: "image/png",
    } satisfies MetadataFileRoute;

    await expect(
      handleMetadataRouteRequest({
        metadataRoutes: [route],
        cleanPathname: "/icon.png",
        makeThenableParams,
      }),
    ).rejects.toThrow("Static metadata route /icon.png is missing embedded file data");
  });

  it("throws when matched static metadata route data is corrupt", async () => {
    const route = {
      type: "icon",
      isDynamic: false,
      filePath: "/tmp/app/icon.png",
      routePrefix: "",
      routeSegments: [],
      servedUrl: "/icon.png",
      contentType: "image/png",
      fileDataBase64: "%%%",
    } satisfies MetadataRuntimeRoute;

    await expect(
      handleMetadataRouteRequest({
        metadataRoutes: [route],
        cleanPathname: "/icon.png",
        makeThenableParams,
      }),
    ).rejects.toThrow("Failed to decode embedded metadata route file data for /icon.png");
  });

  it("sets explicit cache control on generated metadata route responses", async () => {
    const route = {
      type: "robots",
      isDynamic: true,
      filePath: "/tmp/app/robots.ts",
      routePrefix: "",
      routeSegments: [],
      servedUrl: "/robots.txt",
      contentType: "text/plain",
      module: {
        default: () => ({ rules: { userAgent: "*" } }),
      },
    } satisfies MetadataFileRoute;

    const response = await handleMetadataRouteRequest({
      metadataRoutes: [route],
      cleanPathname: "/robots.txt",
      makeThenableParams,
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });

  it("throws when generateSitemaps returns an entry without id", async () => {
    const route = {
      type: "sitemap",
      isDynamic: true,
      filePath: "/tmp/app/products/sitemap.ts",
      routePrefix: "/products",
      routeSegments: ["products"],
      servedUrl: "/products/sitemap.xml",
      contentType: "application/xml",
      module: {
        generateSitemaps: () => [{}],
        default: () => [{ url: "https://example.com/products/0" }],
      },
    } satisfies MetadataFileRoute;

    await expect(
      handleMetadataRouteRequest({
        metadataRoutes: [route],
        cleanPathname: "/products/sitemap/0.xml",
        makeThenableParams,
      }),
    ).rejects.toThrow("id property is required for every item returned from generateSitemaps");
  });
});
