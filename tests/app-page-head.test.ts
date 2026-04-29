import { describe, expect, it } from "vite-plus/test";
import { resolveAppPageHead } from "../packages/vinext/src/server/app-page-head.js";

describe("app page head resolution", () => {
  it("resolves layout and page metadata with parent chaining and page-only search params", async () => {
    const layoutSearchParamsSeen: unknown[] = [];
    const pageParentImages: unknown[] = [];

    const rootLayout = {
      metadata: {
        openGraph: {
          images: ["/root-og.png"],
        },
        title: { default: "Root", template: "%s | Root" },
      },
      viewport: {
        width: "device-width",
      },
    };
    const nestedLayout = {
      async generateMetadata(props: { searchParams?: unknown }, parent: Promise<unknown>) {
        layoutSearchParamsSeen.push(props.searchParams);
        const parentMetadata = await parent;
        const parentOpenGraph =
          typeof parentMetadata === "object" && parentMetadata
            ? Reflect.get(parentMetadata, "openGraph")
            : null;
        const parentImages =
          typeof parentOpenGraph === "object" && parentOpenGraph
            ? Reflect.get(parentOpenGraph, "images")
            : [];
        return {
          openGraph: {
            images: [...(Array.isArray(parentImages) ? parentImages : []), "/nested-og.png"],
          },
        };
      },
    };
    const page = {
      async generateMetadata(
        props: { searchParams?: Promise<Record<string, string | string[]>> },
        parent: Promise<unknown>,
      ) {
        const searchParams = await props.searchParams;
        const parentMetadata = await parent;
        const parentOpenGraph =
          typeof parentMetadata === "object" && parentMetadata
            ? Reflect.get(parentMetadata, "openGraph")
            : null;
        const parentImages =
          typeof parentOpenGraph === "object" && parentOpenGraph
            ? Reflect.get(parentOpenGraph, "images")
            : [];
        pageParentImages.push(...(Array.isArray(parentImages) ? parentImages : []));

        const tagValue = searchParams?.tag;
        return {
          description: `tag ${Array.isArray(tagValue) ? tagValue.join(",") : tagValue}`,
          title: "Post",
        };
      },
      viewport: {
        initialScale: 1,
      },
    };

    const result = await resolveAppPageHead<Record<string, unknown>>({
      layoutModules: [rootLayout, nestedLayout],
      layoutTreePositions: [0, 1],
      metadataRoutes: [],
      pageModule: page,
      params: { slug: "post" },
      routePath: "/blog/[slug]",
      routeSegments: ["blog", "[slug]"],
      searchParams: new URLSearchParams("tag=next&tag=vinext"),
    });

    expect(result.metadata).toEqual({
      description: "tag next,vinext",
      openGraph: {
        images: ["/root-og.png", "/nested-og.png"],
      },
      title: "Post | Root",
    });
    expect(result.viewport).toEqual({
      initialScale: 1,
      width: "device-width",
    });
    expect(result.pageSearchParams).toEqual({ tag: ["next", "vinext"] });
    expect(result.hasSearchParams).toBe(true);
    await expect(layoutSearchParamsSeen[0]).resolves.toEqual({});
    expect(pageParentImages).toEqual(["/root-og.png", "/nested-og.png"]);
  });
});
