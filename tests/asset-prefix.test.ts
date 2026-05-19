import { describe, expect, it } from "vitest";
import {
  applyAssetPrefix,
  assetPrefixPathname,
  normalizeAssetPrefix,
  stripAssetPrefixPathname,
} from "../packages/vinext/src/utils/asset-prefix.js";

describe("assetPrefix helpers", () => {
  it("normalizes path and absolute URL prefixes for emitted asset URLs", () => {
    expect(normalizeAssetPrefix(undefined)).toBe("");
    expect(normalizeAssetPrefix("/")).toBe("");
    expect(normalizeAssetPrefix("/custom-asset-prefix/")).toBe("/custom-asset-prefix");
    expect(normalizeAssetPrefix("custom-asset-prefix")).toBe("/custom-asset-prefix");
    expect(normalizeAssetPrefix("https://example.vercel.sh/")).toBe("https://example.vercel.sh");
    expect(normalizeAssetPrefix("https://example.vercel.sh/custom-asset-prefix/")).toBe(
      "https://example.vercel.sh/custom-asset-prefix",
    );
    expect(normalizeAssetPrefix("https://example.vercel.sh/custom?debug#hash")).toBe(
      "https://example.vercel.sh/custom",
    );
  });

  it("uses only the pathname from absolute URL prefixes for local serving aliases", () => {
    expect(assetPrefixPathname("https://example.vercel.sh/")).toBe("");
    expect(assetPrefixPathname("https://example.vercel.sh/custom-asset-prefix")).toBe(
      "/custom-asset-prefix",
    );
    expect(assetPrefixPathname("/custom-asset-prefix")).toBe("/custom-asset-prefix");
  });

  it("strips assetPrefix pathnames on segment boundaries only", () => {
    expect(
      stripAssetPrefixPathname("/custom-asset-prefix/assets/app.js", "/custom-asset-prefix"),
    ).toBe("/assets/app.js");
    expect(
      stripAssetPrefixPathname("/custom-asset-prefixes/assets/app.js", "/custom-asset-prefix"),
    ).toBe("/custom-asset-prefixes/assets/app.js");
    expect(
      stripAssetPrefixPathname(
        "/custom-asset-prefix/assets/app.js",
        "https://example.vercel.sh/custom-asset-prefix",
      ),
    ).toBe("/assets/app.js");
  });

  it("applies assetPrefix only to root-relative asset paths", () => {
    expect(applyAssetPrefix("/assets/app.js", "https://example.vercel.sh/custom")).toBe(
      "https://example.vercel.sh/custom/assets/app.js",
    );
    expect(applyAssetPrefix("assets/app.js", "https://example.vercel.sh/custom")).toBe(
      "assets/app.js",
    );
    expect(applyAssetPrefix("/assets/app.js", undefined)).toBe("/assets/app.js");
  });
});
