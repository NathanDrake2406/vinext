import type { Plugin } from "vite";
import type { PluginApi } from "@vitejs/plugin-rsc";
import { describe, expect, it } from "vitest";
import { createRscClientReferenceLoadersPlugin } from "../packages/vinext/src/plugins/rsc-client-reference-loaders.js";

const CLIENT_REFERENCES_ID = "\0virtual:vite-rsc/client-references";

type ConfigResolvedHook = (this: unknown, config: unknown) => void | Promise<void>;
type TransformResult = string | { code: string; map: unknown } | null | undefined;
type TransformHook = (
  this: unknown,
  code: string,
  id: string,
) => TransformResult | Promise<TransformResult>;

async function runConfigResolved(plugin: Plugin, config: unknown): Promise<void> {
  const hook = plugin.configResolved;
  if (typeof hook !== "function") {
    throw new Error("expected function configResolved hook");
  }
  await (hook as ConfigResolvedHook).call(undefined, config);
}

async function runTransform(plugin: Plugin, code: string, id: string): Promise<TransformResult> {
  const hook = plugin.transform;
  if (typeof hook !== "function") {
    throw new Error("expected function transform hook");
  }
  return await (hook as TransformHook).call({}, code, id);
}

function requireTransformCode(result: TransformResult): { code: string; map: unknown } {
  if (typeof result !== "object" || result === null || !("code" in result)) {
    throw new Error("expected transform result with code");
  }
  return result;
}

describe("RSC client reference loaders plugin", () => {
  it("registers client-reference import ids from the transformed client-reference module", async () => {
    const meta = {
      importId: "/tmp/app/client.tsx",
      referenceKey: "/tmp/app/client.tsx#default",
      renderedExports: ["default"],
      serverChunk: { fileName: "server/client.js" },
    } as unknown as PluginApi["manager"]["clientReferenceMetaMap"][string];
    const plugin = createRscClientReferenceLoadersPlugin();

    await runConfigResolved(plugin, {
      plugins: [
        {
          name: "rsc:minimal",
          api: {
            manager: {
              isScanBuild: false,
              clientReferenceMetaMap: {
                "/tmp/app/client.tsx": meta,
              },
            },
          },
        },
      ],
    });

    const result = requireTransformCode(await runTransform(plugin, "", CLIENT_REFERENCES_ID));

    expect(result).toEqual(
      expect.objectContaining({
        code: expect.stringContaining("setClientReferenceImportMap"),
        map: null,
      }),
    );
    expect(result.code).toContain('"/tmp/app/client.tsx#default": "/tmp/app/client.tsx"');
    expect(result.code).toContain('"/tmp/app/client.tsx#default": async () => {');
    expect(meta.groupChunkId).toBe("/tmp/app/client.tsx");
  });
});
