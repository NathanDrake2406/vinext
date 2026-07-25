/**
 * `next/image` behaviour when `virtual:vinext-image-loader` resolves to a
 * *configured* loader.
 *
 * The shim imports that module statically, and the test alias points it at the
 * unconfigured stand-in (see `WORKSPACE_SRC_ALIAS` in vite.config.ts), so every
 * other image test exercises the built-in path. These tests swap the module per
 * case with `vi.doMock` + `vi.resetModules()`, which is the only way to reach
 * the `images.loaderFile` / `images.loader` branches from a unit test.
 *
 * `tests/image-loader-config.test.ts` covers what the plugin *generates*; this
 * file covers what the shim *does* with it.
 */
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MISSING_CUSTOM_LOADER_MARKER } from "../packages/vinext/src/image/image-loader-virtual.js";

type Shim = typeof import("../packages/vinext/src/shims/image.js");

/** Load a fresh copy of the shim bound to `configuredLoader`. */
async function loadShim(configuredLoader: unknown): Promise<Shim> {
  vi.resetModules();
  vi.doMock("virtual:vinext-image-loader", () => ({ default: configuredLoader }));
  return import("../packages/vinext/src/shims/image.js");
}

const MISSING_LOADER_MESSAGE =
  'Image with src "/photo.jpg" is missing "loader" prop.\n' +
  "Read more: https://nextjs.org/docs/messages/next-image-missing-loader";

/**
 * Stands in for the module the plugin generates for `images.loader: "custom"`
 * with no `images.loaderFile`. Shape is pinned by
 * `tests/image-loader-config.test.ts`, which asserts the generator emits both
 * the throw and the marker.
 */
function bareCustomLoader(): unknown {
  const report = ({ src }: { src: string }): string => {
    throw new Error(
      `Image with src "${src}" is missing "loader" prop.\n` +
        "Read more: https://nextjs.org/docs/messages/next-image-missing-loader",
    );
  };
  return Object.assign(report, { [MISSING_CUSTOM_LOADER_MARKER]: true });
}

afterEach(() => {
  vi.doUnmock("virtual:vinext-image-loader");
  vi.resetModules();
});

describe('images.loader: "custom" with no loaderFile', () => {
  it("reports the missing loader prop when rendering", async () => {
    const { default: Image } = await loadShim(bareCustomLoader());

    expect(() =>
      ReactDOMServer.renderToString(
        React.createElement(Image, {
          alt: "no loader",
          src: "/photo.jpg",
          width: 300,
          height: 200,
        }),
      ),
    ).toThrow(MISSING_LOADER_MESSAGE);
  });

  it("reports it for unoptimized images too", async () => {
    // Upstream raises this before it decides whether an image is optimized
    // (`getImgProps` throws above `generateImgAttrs`, which is what handles
    // `unoptimized`). Skipping it here would let `unoptimized` silently render
    // the original URL from a config that cannot produce URLs at all.
    const { default: Image, getImageProps } = await loadShim(bareCustomLoader());
    const props = {
      alt: "no loader",
      src: "/photo.jpg",
      width: 300,
      height: 200,
      unoptimized: true,
    };

    expect(() => ReactDOMServer.renderToString(React.createElement(Image, props))).toThrow(
      MISSING_LOADER_MESSAGE,
    );
    expect(() => getImageProps(props)).toThrow(MISSING_LOADER_MESSAGE);
  });

  it("is satisfied by a per-image loader prop, including when unoptimized", async () => {
    // The whole point of bare "custom": each <Image> brings its own loader.
    const { default: Image, getImageProps } = await loadShim(bareCustomLoader());
    const loader = ({ src, width }: { src: string; width: number }) =>
      `https://cdn.example.com${src}?w=${width}`;

    const html = ReactDOMServer.renderToString(
      React.createElement(Image, {
        alt: "own loader",
        src: "/photo.jpg",
        width: 300,
        height: 200,
        loader,
      }),
    );
    expect(html).toContain("https://cdn.example.com/photo.jpg?w=");

    // An unoptimized image bypasses even a valid loader, matching upstream.
    const { props } = getImageProps({
      alt: "own loader",
      src: "/photo.jpg",
      width: 300,
      height: 200,
      unoptimized: true,
      loader,
    });
    expect(props.src).toBe("/photo.jpg");
    expect(props.srcSet).toBeUndefined();
  });
});

describe("images.loaderFile", () => {
  it("replaces the built-in loader for local and remote sources alike", async () => {
    const { default: Image, getImageProps } = await loadShim(
      ({ src, width }: { src: string; width: number }) =>
        `https://cdn.example.com/i?u=${encodeURIComponent(src)}&w=${width}`,
    );

    for (const src of ["/photo.jpg", "https://origin.example.com/photo.jpg"]) {
      const { props } = getImageProps({ alt: "configured", src, width: 300, height: 200 });
      expect(props.src).toContain("https://cdn.example.com/i?u=");
      expect(props.srcSet).toContain("https://cdn.example.com/i?u=");
    }

    const html = ReactDOMServer.renderToString(
      React.createElement(Image, {
        alt: "configured",
        src: "/photo.jpg",
        width: 300,
        height: 200,
      }),
    );
    expect(html).not.toContain("/_next/image");
  });

  it("keeps the blur placeholder", async () => {
    // The loaderFile-specific half of the regression: an image that showed a
    // placeholder under the built-in loader lost it purely by being configured.
    const blurDataURL = "data:image/png;base64,abc123";
    const { default: Image } = await loadShim(
      ({ src, width }: { src: string; width: number }) =>
        `https://cdn.example.com${src}?w=${width}`,
    );

    const html = ReactDOMServer.renderToString(
      React.createElement(Image, {
        alt: "configured blur",
        src: "/photo.jpg",
        width: 300,
        height: 200,
        placeholder: "blur",
        blurDataURL,
      }),
    );

    expect(html).toContain(`url(${blurDataURL})`);
  });

  it("is overridden by a per-image loader prop", async () => {
    const { getImageProps } = await loadShim(() => "https://configured.example.com/x.jpg");

    const { props } = getImageProps({
      alt: "prop wins",
      src: "/photo.jpg",
      width: 300,
      height: 200,
      loader: ({ width }: { src: string; width: number }) =>
        `https://prop.example.com/x.jpg?w=${width}`,
    });

    expect(props.src).toContain("https://prop.example.com/x.jpg");
  });
});
