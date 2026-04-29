import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  createMetadataRouteEntryData,
  createMetadataRouteEntrySource,
} from "../packages/vinext/src/server/metadata-route-build-data.js";
import type { MetadataFileRoute } from "../packages/vinext/src/server/metadata-routes.js";

const imagePath = path.resolve("tests/fixtures/images/test-4x3.png");

describe("metadata route build data", () => {
  it("embeds static image route data with content hash, dimensions, alt text, and base64", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-metadata-route-"));
    const altFilePath = path.join(tempDir, "opengraph-image.alt.txt");
    fs.writeFileSync(altFilePath, "Static OG alt");

    const route: MetadataFileRoute = {
      type: "opengraph-image",
      isDynamic: false,
      filePath: imagePath,
      altFilePath,
      routePrefix: "/blog",
      routeSegments: ["blog"],
      servedUrl: "/blog/opengraph-image.png",
      contentType: "image/png",
    };

    const entryData = createMetadataRouteEntryData(route);

    expect(entryData.contentHash).toMatch(/^[a-f0-9]{16}$/);
    expect(entryData.fileDataBase64).toBe(fs.readFileSync(imagePath).toString("base64"));
    expect(entryData.headData).toEqual({
      kind: "openGraph",
      href: `/blog/opengraph-image.png?${entryData.contentHash}`,
      type: "image/png",
      width: 4,
      height: 3,
      alt: "Static OG alt",
    });
  });

  it("serializes dynamic metadata route entries with module and pattern wiring", () => {
    const route: MetadataFileRoute = {
      type: "sitemap",
      isDynamic: true,
      filePath: imagePath,
      routePrefix: "/docs/[section]",
      routeSegments: ["docs", "[section]"],
      servedUrl: "/docs/[section]/sitemap.xml",
      contentType: "application/xml",
    };

    const entryData = createMetadataRouteEntryData(route);
    const source = createMetadataRouteEntrySource({
      entryData,
      moduleName: "__metadataRouteModule",
      patternParts: "__metadataRoutePatternParts",
    });

    expect(entryData.headData).toBeUndefined();
    expect(entryData.fileDataBase64).toBeUndefined();
    expect(source).toContain('type: "sitemap"');
    expect(source).toContain('routePrefix: "/docs/[section]"');
    expect(source).toContain('servedUrl: "/docs/[section]/sitemap.xml"');
    expect(source).toContain("module: __metadataRouteModule");
    expect(source).toContain("patternParts: __metadataRoutePatternParts");
  });
});
