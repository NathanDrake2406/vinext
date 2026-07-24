/**
 * End-to-end plugin wiring for `images.loaderFile`.
 *
 * The codegen and config-resolution units are covered in
 * `image-loader-config.test.ts`. This file checks the part those cannot: that
 * the vinext plugin actually resolves and loads `virtual:vinext-image-loader`
 * from a real next.config, which is the step that was missing entirely and made
 * the option look unsupported.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vite-plus/test";
import { createServer } from "vite";
import vinext from "../packages/vinext/src/index.js";

/**
 * Build a throwaway project root with an app dir, a loader file, and the given
 * next.config body. `node_modules` is symlinked so plugin-internal resolution
 * behaves as it would in a real project.
 */
function createProject(nextConfigBody: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-loaderfile-plugin-"));
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "app", "page.tsx"),
    "export default function Page() { return null; }\n",
  );
  fs.writeFileSync(
    path.join(root, "my-loader.js"),
    "export default ({ src, width, quality }) =>\n" +
      "  `https://images.example.com${src}?width=${width}&quality=${quality ?? 75}`;\n",
  );
  fs.writeFileSync(path.join(root, "next.config.mjs"), nextConfigBody);
  fs.symlinkSync(
    path.resolve(import.meta.dirname, "..", "node_modules"),
    path.join(root, "node_modules"),
    "junction",
  );
  return root;
}

/** Resolve + load `virtual:vinext-image-loader` through the real plugin. */
async function loadVirtualLoaderModule(root: string): Promise<string> {
  const server = await createServer({
    root,
    configFile: false,
    plugins: [vinext({ appDir: root })],
    server: { port: 0 },
    logLevel: "silent",
  });
  try {
    const resolved = await server.pluginContainer.resolveId("virtual:vinext-image-loader");
    expect(resolved).toBeTruthy();
    const loaded = await server.pluginContainer.load(resolved!.id);
    return typeof loaded === "string" ? loaded : ((loaded as { code?: string } | null)?.code ?? "");
  } finally {
    await server.close();
  }
}

describe("virtual:vinext-image-loader plugin wiring", () => {
  it("loads the configured loaderFile from next.config", async () => {
    const root = createProject(
      "export default { images: { loader: 'custom', loaderFile: './my-loader.js' } };\n",
    );
    const code = await loadVirtualLoaderModule(root);

    // The generator receives an already-absolute path from resolveNextConfig.
    expect(code).toContain("my-loader.js");
    expect(code).toContain("export default __vinextImageLoader;");
    expect(code).not.toContain("export default undefined;");
  });

  it("falls back to the built-in loader when no loaderFile is set", async () => {
    const root = createProject("export default { images: { unoptimized: false } };\n");
    const code = await loadVirtualLoaderModule(root);

    expect(code).toContain("export default undefined;");
  });
});
