/**
 * Code generation for the `virtual:vinext-image-loader` module, resolved by the
 * vinext vite plugin from `images.loaderFile` in next.config.
 *
 * Next.js implements `loaderFile` as a bundler alias: the module that
 * `next/image` imports for its default loader
 * (`next/dist/shared/lib/image-loader`) is swapped for the user's file — see
 * `create-compiler-aliases.ts` upstream. vinext replaces `next/image` wholesale
 * with its own shim, so there is no upstream module left to alias. Instead the
 * shim imports this virtual module unconditionally and the plugin generates
 * either a re-export of the user's loader or an inert stub.
 *
 * The generated module always has a default export, so the shim's unconditional
 * import stays valid whether or not `loaderFile` is configured.
 *
 * This mirrors the adapter pattern in `image/image-adapters-virtual.ts`.
 */

/** Public virtual module id imported by the `next/image` shim. */
export const VIRTUAL_IMAGE_LOADER = "virtual:vinext-image-loader";

/**
 * Property stamped on the generated loader when `images.loader` is `"custom"`
 * with no `images.loaderFile`, so the shim can distinguish "the user configured
 * a loader" from "the user configured that every image must bring its own".
 *
 * Mirrors upstream's `__next_img_default` marker on its built-in loader. The
 * name is duplicated in `shims/image.tsx` and `virtual-vinext-image-loader.d.ts`
 * because the generated module is a string and cannot import this constant.
 */
export const MISSING_CUSTOM_LOADER_MARKER = "__vinext_img_missing_loader";

/**
 * Next.js's error for a `loaderFile` whose module has no default export.
 * Kept verbatim so existing troubleshooting docs and searches still apply.
 */
const MISSING_DEFAULT_EXPORT_ERROR =
  "images.loaderFile detected but the file is missing default export.\n" +
  "Read more: https://nextjs.org/docs/messages/invalid-images-config";

/**
 * Generate the source of the `virtual:vinext-image-loader` module.
 *
 * @param images The resolved `images` block from next.config. `loaderFile` is
 *   expected to already be an absolute path (see `resolveImageLoaderFile`).
 */
export function generateImageLoaderModule(images?: {
  loader?: "default" | "custom";
  loaderFile?: string;
}): string {
  const loaderFile = images?.loaderFile;

  // `loader: "custom"` with no `loaderFile` means every image must supply its
  // own `loader` prop. Export a loader that reports the omission instead of
  // silently falling back to `/_next/image`, matching upstream's `customLoader`.
  if (!loaderFile && images?.loader === "custom") {
    return [
      '// vinext: images.loader is "custom" with no images.loaderFile — each',
      "// <Image> must pass its own `loader` prop.",
      "export default function customImageLoader({ src }) {",
      "  throw new Error(",
      "    'Image with src \"' + src + '\" is missing \"loader\" prop.\\n' +",
      "      'Read more: https://nextjs.org/docs/messages/next-image-missing-loader',",
      "  );",
      "}",
      "",
      "// Marks this export as a misconfiguration report rather than a working",
      "// loader. Upstream raises the missing-prop error before it decides whether",
      "// an image is optimized, so the shim needs to tell the two apart: an",
      "// `unoptimized` image bypasses a real loader, but must not bypass this one.",
      `customImageLoader.${MISSING_CUSTOM_LOADER_MARKER} = true;`,
      "",
    ].join("\n");
  }

  // Nothing configured → the shim falls back to its built-in `/_next/image`
  // loader. `undefined` (not `null`) so the shim's `??` fallback reads naturally.
  if (!loaderFile) {
    return [
      "// vinext: no images.loaderFile configured — the built-in /_next/image loader is used.",
      "export default undefined;",
      "",
    ].join("\n");
  }

  return [
    "// vinext: generated from `images.loaderFile` in your next.config.",
    `import * as __vinextUserImageLoaderModule from ${JSON.stringify(loaderFile)};`,
    "",
    "const __vinextImageLoader = __vinextUserImageLoaderModule.default;",
    "",
    "// Configuring loaderFile is an explicit opt-in, so a module that cannot",
    "// supply a loader is a config error worth failing on immediately rather",
    "// than silently falling back to the built-in optimizer — which would be",
    "// indistinguishable from the loaderFile being ignored.",
    "if (typeof __vinextImageLoader !== 'function') {",
    `  throw new Error(${JSON.stringify(MISSING_DEFAULT_EXPORT_ERROR)});`,
    "}",
    "",
    "export default __vinextImageLoader;",
    "",
  ].join("\n");
}
