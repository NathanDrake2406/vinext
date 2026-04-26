import { describe, expect, it } from "vite-plus/test";
import { applyFileBasedMetadata } from "../packages/vinext/src/server/file-based-metadata.js";
import type { Metadata } from "../packages/vinext/src/shims/metadata.js";
import type { MetadataFileRoute } from "../packages/vinext/src/server/metadata-routes.js";

const ogHeadData = {
  kind: "openGraph",
  href: "/blog/opengraph-image.png?hash",
  type: "image/png",
  width: 1200,
  height: 630,
} as const;

describe("applyFileBasedMetadata", () => {
  it("preserves URL metadata values while injecting file metadata", async () => {
    const metadata: Metadata = {
      metadataBase: new URL("https://example.com"),
    };
    const routes: MetadataFileRoute[] = [
      {
        type: "icon",
        isDynamic: false,
        filePath: "/tmp/app/icon.png",
        routePrefix: "",
        routeSegments: [],
        servedUrl: "/icon.png",
        contentType: "image/png",
        headData: {
          kind: "icon",
          href: "/icon.png?hash",
          type: "image/png",
          sizes: "32x32",
        },
      },
    ];

    const result = await applyFileBasedMetadata(metadata, "/", {}, routes, {
      routeSegments: [],
      metadataSources: [{ routeSegments: [], metadata }],
    });

    expect(result?.metadataBase).toBe(metadata.metadataBase);
    expect(result?.icons?.icon).toEqual([
      { url: "/icon.png?hash", sizes: "32x32", type: "image/png" },
    ]);
  });

  it("lets a leaf file image replace inherited parent Open Graph images", async () => {
    const parentMetadata: Metadata = {
      openGraph: {
        description: "Parent description",
        images: ["/parent-og.png"],
        siteName: "Parent site",
        title: "Parent title",
        type: "article",
      },
    };
    const leafMetadata: Metadata = { title: "Blog" };
    const mergedMetadata: Metadata = {
      title: "Blog",
      openGraph: {
        description: "Parent description",
        images: ["/parent-og.png"],
        siteName: "Parent site",
        title: "Parent title",
        type: "article",
      },
    };
    const routes: MetadataFileRoute[] = [
      {
        type: "opengraph-image",
        isDynamic: false,
        filePath: "/tmp/app/blog/opengraph-image.png",
        routePrefix: "/blog",
        routeSegments: ["blog"],
        servedUrl: "/blog/opengraph-image.png",
        contentType: "image/png",
        headData: ogHeadData,
      },
    ];

    const result = await applyFileBasedMetadata(mergedMetadata, "/blog", {}, routes, {
      routeSegments: ["blog"],
      metadataSources: [
        { routeSegments: [], metadata: parentMetadata },
        { routeSegments: ["blog"], metadata: leafMetadata },
      ],
    });

    expect(result?.openGraph?.images).toEqual([
      { url: "/blog/opengraph-image.png?hash", type: "image/png", width: 1200, height: 630 },
    ]);
    expect(result?.openGraph?.description).toBe("Parent description");
    expect(result?.openGraph?.siteName).toBe("Parent site");
    expect(result?.openGraph?.title).toBe("Parent title");
    expect(result?.openGraph?.type).toBe("article");
  });

  it("keeps same-segment explicit Open Graph images ahead of file images", async () => {
    const leafMetadata: Metadata = { openGraph: { images: ["/manual-og.png"] } };
    const routes: MetadataFileRoute[] = [
      {
        type: "opengraph-image",
        isDynamic: false,
        filePath: "/tmp/app/blog/opengraph-image.png",
        routePrefix: "/blog",
        routeSegments: ["blog"],
        servedUrl: "/blog/opengraph-image.png",
        contentType: "image/png",
        headData: ogHeadData,
      },
    ];

    const result = await applyFileBasedMetadata(leafMetadata, "/blog", {}, routes, {
      routeSegments: ["blog"],
      metadataSources: [
        { routeSegments: ["blog"], metadata: { title: "Blog layout" } },
        { routeSegments: ["blog"], metadata: leafMetadata },
      ],
    });

    expect(result?.openGraph?.images).toEqual(["/manual-og.png"]);
  });

  it("applies file manifest metadata over config manifest metadata", async () => {
    const metadata: Metadata = { manifest: "/manual.webmanifest" };
    const routes: MetadataFileRoute[] = [
      {
        type: "manifest",
        isDynamic: false,
        filePath: "/tmp/app/manifest.webmanifest",
        routePrefix: "",
        routeSegments: [],
        servedUrl: "/manifest.webmanifest",
        contentType: "application/manifest+json",
        headData: { kind: "manifest", href: "/manifest.webmanifest" },
      },
    ];

    const result = await applyFileBasedMetadata(metadata, "/", {}, routes, {
      routeSegments: [],
      metadataSources: [{ routeSegments: [], metadata }],
    });

    expect(result?.manifest).toBe("/manifest.webmanifest");
  });

  it("uses raw route segments so same-prefix route groups select their own file metadata", async () => {
    const routes: MetadataFileRoute[] = [
      {
        type: "opengraph-image",
        isDynamic: false,
        filePath: "/tmp/app/(marketing)/opengraph-image.png",
        routePrefix: "",
        routeSegments: ["(marketing)"],
        servedUrl: "/opengraph-image-marketing.png",
        contentType: "image/png",
        headData: { ...ogHeadData, href: "/opengraph-image-marketing.png?hash" },
      },
      {
        type: "opengraph-image",
        isDynamic: false,
        filePath: "/tmp/app/(shop)/opengraph-image.png",
        routePrefix: "",
        routeSegments: ["(shop)"],
        servedUrl: "/opengraph-image-shop.png",
        contentType: "image/png",
        headData: { ...ogHeadData, href: "/opengraph-image-shop.png?hash" },
      },
    ];

    const result = await applyFileBasedMetadata(null, "/", {}, routes, {
      routeSegments: ["(marketing)"],
      metadataSources: [{ routeSegments: ["(marketing)"], metadata: null }],
    });

    expect(result?.openGraph?.images).toEqual([
      { url: "/opengraph-image-marketing.png?hash", type: "image/png", width: 1200, height: 630 },
    ]);
  });
});
