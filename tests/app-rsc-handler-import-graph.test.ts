import { readFileSync } from "node:fs";
import { escapeRegExp } from "../packages/vinext/src/utils/regex.js";
import { describe, expect, it } from "vite-plus/test";

const OPTIONAL_BRANCH_MODULES = [
  "./app-prerender-endpoints.js",
  "./image-optimization.js",
  "./implicit-tags.js",
  "./metadata-route-response.js",
  "./pages-data-route.js",
] as const;

function hasStaticValueImport(source: string, specifier: string): boolean {
  const quotedSpecifier = `["']${escapeRegExp(specifier)}["']`;
  const pattern = new RegExp(`^import\\s+(?!type\\b)[^;]+\\sfrom\\s+${quotedSpecifier};`, "m");
  return pattern.test(source);
}

describe("App RSC handler import graph", () => {
  it("keeps optional App Router branches out of the cold-start import graph", () => {
    const source = readFileSync(
      new URL("../packages/vinext/src/server/app-rsc-handler.ts", import.meta.url),
      "utf8",
    );

    for (const specifier of OPTIONAL_BRANCH_MODULES) {
      expect(hasStaticValueImport(source, specifier), specifier).toBe(false);
      expect(source).toContain(`import("${specifier}")`);
    }
  });
});
