import fs from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { createBuilder } from "vite";
import { describe, expect, it } from "vite-plus/test";
import vinext from "../packages/vinext/src/index.js";
import { startProdServer } from "../packages/vinext/src/server/prod-server.js";

const ROOT_NODE_MODULES = path.resolve(import.meta.dirname, "../node_modules");

async function writeAppNodeRuntimeFixture(root: string): Promise<void> {
  await fs.symlink(ROOT_NODE_MODULES, path.join(root, "node_modules"), "junction");
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
        },
        include: ["app"],
      },
      null,
      2,
    ),
  );
  await fs.mkdir(path.join(root, "app"), { recursive: true });
  await fs.writeFile(
    path.join(root, "app", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
  );
  await fs.writeFile(
    path.join(root, "app", "page.tsx"),
    `export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <h1>App Node Runtime Smoke</h1>
      <p id="message">{params.message ?? "default-message"}</p>
    </main>
  );
}
`,
  );
}

async function buildAppFixture(root: string, outDir: string): Promise<void> {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [
      vinext({
        appDir: root,
        rscOutDir: path.join(outDir, "server"),
        ssrOutDir: path.join(outDir, "server", "ssr"),
        clientOutDir: path.join(outDir, "client"),
      }),
    ],
  });

  await builder.buildApp();
  await fs.symlink(ROOT_NODE_MODULES, path.join(outDir, "node_modules"), "junction");
}

function unwrapStartedProdServer(result: Server | { server: Server }): Server {
  return "server" in result ? result.server : result;
}

describe("App Node render runtime", () => {
  it("renders a generated production App route through the Node runtime", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-app-node-runtime-"));
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-app-node-runtime-dist-"));

    try {
      await writeAppNodeRuntimeFixture(root);
      await buildAppFixture(root, outDir);
      await expect(fs.access(path.join(outDir, "server", "index.js"))).resolves.toBeUndefined();

      const prodServer = unwrapStartedProdServer(
        await startProdServer({
          port: 0,
          host: "127.0.0.1",
          outDir,
          noCompression: true,
        }),
      );

      try {
        const addr = prodServer.address();
        if (!addr || typeof addr === "string") throw new Error("Production server did not bind");

        const res = await fetch(`http://127.0.0.1:${addr.port}/?message=node-fizz`);
        const html = await res.text();
        expect(res.status, html).toBe(200);
        expect(html).toContain("App Node Runtime Smoke");
        expect(html).toContain("node-fizz");
      } finally {
        await new Promise<void>((resolve) => prodServer.close(() => resolve()));
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });
});
