import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createRequireContextPlugin } from "../packages/vinext/src/plugins/require-context.js";

const importerId = path.resolve(
  import.meta.dirname,
  "./fixtures/app-basic/app/nextjs-compat/require-context/page.tsx",
);

function createTransform(): (code: string, id: string) => Promise<{ code: string } | null> {
  const plugin = createRequireContextPlugin();
  const hook = plugin.transform;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  // The handler keys per-environment state and registers directory watchers;
  // give it the minimal plugin context those two calls need.
  const context = { environment: {}, addWatchFile: () => {} };
  return handler!.bind(context as never) as never;
}

describe("vinext:require-context", () => {
  it("emits static imports only for modules accepted by the regexp", async () => {
    const transform = createTransform();
    const result = await transform(
      `const ctx = require.context("./filtered", false, /\\.safe\\.js$/);`,
      importerId,
    );

    expect(result?.code).toContain('from "./filtered/included.safe.js"');
    expect(result?.code).not.toContain("excluded.js");
    expect(result?.code).toContain('["./included.safe.js"]');
  });

  it("inserts generated imports after the directive prologue", async () => {
    const transform = createTransform();
    const source = `"use client";\nconst ctx = require.context("./filtered", false, /\\.safe\\.js$/);`;
    const result = await transform(source, importerId);

    const code = result!.code;
    expect(code.indexOf('"use client"')).toBeLessThan(code.indexOf("import * as "));
  });
});
