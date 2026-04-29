import { describe, expect, it } from "vite-plus/test";
import { resolveAppPageHead } from "../packages/vinext/src/server/app-page-head.js";

describe("app page head resolution", () => {
  it("preserves query keys that collide with Object prototype names", async () => {
    let generatedSearchParams: Record<string, unknown> | undefined;

    const page = {
      async generateMetadata(props: { searchParams?: Promise<Record<string, unknown>> }) {
        generatedSearchParams = await props.searchParams;
        return null;
      },
    };

    const result = await resolveAppPageHead<Record<string, unknown>>({
      layoutModules: [],
      metadataRoutes: [],
      pageModule: page,
      params: {},
      routePath: "/",
      routeSegments: [],
      searchParams: new URLSearchParams(
        "constructor=ctor&toString=stringifier&__proto__=prototype",
      ),
    });

    expect(Reflect.get(result.pageSearchParams, "constructor")).toBe("ctor");
    expect(Reflect.get(result.pageSearchParams, "toString")).toBe("stringifier");
    expect(Reflect.get(result.pageSearchParams, "__proto__")).toBe("prototype");
    expect(Reflect.get(generatedSearchParams ?? {}, "constructor")).toBe("ctor");
    expect(Reflect.get(generatedSearchParams ?? {}, "toString")).toBe("stringifier");
    expect(Reflect.get(generatedSearchParams ?? {}, "__proto__")).toBe("prototype");
  });

  it("resolves layout and page metadata with parent chaining and page-only search params", async () => {
    const layoutSearchParamsSeen: unknown[] = [];
    const layoutParamsSeen: unknown[] = [];
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
      async generateMetadata(
        props: { params?: Promise<Record<string, string | string[]>>; searchParams?: unknown },
        parent: Promise<unknown>,
      ) {
        layoutSearchParamsSeen.push(props.searchParams);
        layoutParamsSeen.push(await props.params);
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
    expect(layoutSearchParamsSeen).toEqual([undefined]);
    expect(layoutParamsSeen).toEqual([{}]);
    expect(pageParentImages).toEqual(["/root-og.png", "/nested-og.png"]);
  });

  it("includes active parallel route metadata in resolved head", async () => {
    const slotParentDescriptions: unknown[] = [];
    const rootLayout = {
      metadata: {
        description: "Root description",
        title: "Root title",
      },
    };
    const page = {
      metadata: {
        title: "Page title",
      },
    };
    const slotPage = {
      async generateMetadata(_props: unknown, parent: Promise<Record<string, unknown>>) {
        const parentMetadata = await parent;
        slotParentDescriptions.push(parentMetadata.description);
        return {
          openGraph: {
            title: "Slot OG title",
          },
        };
      },
    };

    const result = await resolveAppPageHead<Record<string, unknown>>({
      layoutModules: [rootLayout],
      layoutTreePositions: [0],
      metadataRoutes: [],
      pageModule: page,
      parallelRoutes: [
        {
          pageModule: slotPage,
          routeSegments: ["dashboard"],
        },
      ],
      params: {},
      routePath: "/dashboard",
      routeSegments: ["dashboard"],
    });

    expect(slotParentDescriptions).toEqual(["Root description"]);
    expect(result.metadata).toEqual({
      description: "Root description",
      openGraph: {
        title: "Slot OG title",
      },
      title: "Page title",
    });
  });
});
