import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, type InlineConfig, type Plugin, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  collectServerActionWarmupEntries,
  hasModuleUseServerDirective,
  mergeServerActionWarmupEntries,
} from "../packages/vinext/src/config/server-action-warmup.js";
import vinext from "../packages/vinext/src/index.js";

let server: ViteDevServer | null = null;

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

type ConfigHookPlugin = Plugin & {
  config: (
    config: InlineConfig,
    env: { command: "build" | "serve"; mode: string },
  ) => InlineConfig | null | void | Promise<InlineConfig | null | void>;
};

function findNamedConfigPlugin(plugins: ReturnType<typeof vinext>, name: string): ConfigHookPlugin {
  const flatPlugins = plugins.flat().filter((plugin): plugin is Plugin => Boolean(plugin));
  const plugin = flatPlugins.find((candidate) => candidate.name === name);
  if (!plugin || typeof plugin.config !== "function") {
    throw new Error(`${name} plugin not found`);
  }
  return plugin as ConfigHookPlugin;
}

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("server action dev warmup", () => {
  it("detects only module-level use server directives", () => {
    expect(hasModuleUseServerDirective('"use server";\nexport async function save() {}')).toBe(
      true,
    );
    expect(
      hasModuleUseServerDirective(
        '/* header */\n"use strict";\n"use server";\nexport async function save() {}',
      ),
    ).toBe(true);
    expect(hasModuleUseServerDirective(';\n"use server";\nexport async function save() {}')).toBe(
      false,
    );
    expect(
      hasModuleUseServerDirective(
        'export async function save() {\n  "use server";\n  return "inline";\n}',
      ),
    ).toBe(false);
    expect(hasModuleUseServerDirective('import "server-only";\n"use server";')).toBe(false);
  });

  it("collects warmup entries for server action files under app", async () => {
    const root = await makeTempDir("vinext-server-action-warmup-");
    try {
      await writeFile(
        root,
        "app/page.tsx",
        "export default function Page() { return <button>Run</button>; }",
      );
      await writeFile(
        root,
        "app/actions.ts",
        '"use server";\nexport async function save() { return "saved"; }\n',
      );
      await writeFile(
        root,
        "app/_actions/more.ts",
        "'use server';\nexport async function more() { return \"more\"; }\n",
      );
      await writeFile(
        root,
        "app/_actions/module.mts",
        "'use server';\nexport async function moduleAction() { return \"module\"; }\n",
      );
      await writeFile(
        root,
        "src/lib/actions.ts",
        '"use server";\nexport async function fromLib() { return "lib"; }\n',
      );
      await writeFile(
        root,
        "app/inline.tsx",
        'export async function inline() {\n  "use server";\n  return "inline";\n}\n',
      );
      await writeFile(root, "app/other.mdx", '"use server";\n\n# MDX action module\n');
      await writeFile(
        root,
        "node_modules/pkg/actions.ts",
        '"use server";\nexport async function dependencyAction() { return "dependency"; }\n',
      );
      await writeFile(
        root,
        "dist/actions.ts",
        '"use server";\nexport async function builtAction() { return "built"; }\n',
      );

      await expect(
        collectServerActionWarmupEntries({
          root,
          pageExtensions: ["tsx", "jsx"],
        }),
      ).resolves.toEqual([
        "app/_actions/module.mts",
        "app/_actions/more.ts",
        "app/actions.ts",
        "src/lib/actions.ts",
      ]);

      await expect(
        collectServerActionWarmupEntries({
          root,
          pageExtensions: ["tsx", "jsx", "mdx"],
        }),
      ).resolves.toEqual([
        "app/_actions/module.mts",
        "app/_actions/more.ts",
        "app/actions.ts",
        "app/other.mdx",
        "src/lib/actions.ts",
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("merges action warmup entries after valid user warmup entries", () => {
    expect(mergeServerActionWarmupEntries(["./manual-action.ts"], ["app/actions.ts"])).toEqual([
      "./manual-action.ts",
      "app/actions.ts",
    ]);
    expect(mergeServerActionWarmupEntries(["app/actions.ts"], ["app/actions.ts"])).toEqual([
      "app/actions.ts",
    ]);
  });

  it("wires discovered action files into the RSC dev warmup config", async () => {
    const root = await makeTempDir("vinext-server-action-warmup-config-");
    try {
      await writeFile(
        root,
        "app/page.tsx",
        "export default function Page() { return <button>Run</button>; }",
      );
      await writeFile(
        root,
        "app/actions.ts",
        '"use server";\nexport async function save() { return "saved"; }\n',
      );

      server = await createServer({
        root,
        configFile: false,
        environments: {
          rsc: {
            dev: {
              warmup: ["./manual-action.ts"],
            },
          },
        },
        plugins: [vinext()],
        server: { port: 0, cors: false },
        logLevel: "silent",
      });

      const warmup = server.config.environments.rsc?.dev?.warmup;
      expect(warmup).toContain("./manual-action.ts");
      expect(warmup).toContain("app/actions.ts");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("skips discovered action warmup entries during production builds", async () => {
    const root = await makeTempDir("vinext-server-action-warmup-build-");
    try {
      await writeFile(
        root,
        "app/page.tsx",
        "export default function Page() { return <button>Run</button>; }",
      );
      await writeFile(
        root,
        "app/actions.ts",
        '"use server";\nexport async function save() { return "saved"; }\n',
      );

      const configPlugin = findNamedConfigPlugin(vinext(), "vinext:config");
      const result = await configPlugin.config(
        { root, configFile: false, plugins: [] },
        { command: "build", mode: "production" },
      );

      expect(result?.environments?.rsc?.dev?.warmup).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
