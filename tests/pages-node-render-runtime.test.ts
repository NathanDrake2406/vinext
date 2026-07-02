import fs from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import vinext from "../packages/vinext/src/index.js";
import { startProdServer } from "../packages/vinext/src/server/prod-server.js";

const ROOT_NODE_MODULES = path.resolve(import.meta.dirname, "../node_modules");

async function writePagesNodeRuntimeFixture(root: string): Promise<void> {
  await fs.symlink(ROOT_NODE_MODULES, path.join(root, "node_modules"), "junction");
  await fs.mkdir(path.join(root, "pages"), { recursive: true });
  await fs.writeFile(
    path.join(root, "pages", "_app.jsx"),
    `export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
`,
  );
  await fs.writeFile(
    path.join(root, "pages", "index.jsx"),
    `export async function getServerSideProps({ query }) {
  return { props: { message: query.message ?? "default-message" } };
}

export default function Page({ message }) {
  return (
    <main>
      <h1>Pages Node Runtime Smoke</h1>
      <p id="message">{message}</p>
    </main>
  );
}
`,
  );
}

async function buildPagesFixture(root: string, outDir: string): Promise<void> {
  await build({
    root,
    configFile: false,
    plugins: [vinext({ disableAppRouter: true })],
    logLevel: "silent",
    build: {
      outDir: path.join(outDir, "server"),
      ssr: "virtual:vinext-server-entry",
      rollupOptions: { output: { entryFileNames: "entry.js" } },
    },
  });

  await build({
    root,
    configFile: false,
    plugins: [vinext({ disableAppRouter: true })],
    logLevel: "silent",
    build: {
      outDir: path.join(outDir, "client"),
      manifest: true,
      ssrManifest: true,
      rollupOptions: { input: "virtual:vinext-client-entry" },
    },
  });
}

function unwrapStartedProdServer(result: Server | { server: Server }): Server {
  return "server" in result ? result.server : result;
}

describe("Pages Node render runtime", () => {
  it("renders a generated production Pages route through the Node runtime", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-pages-node-runtime-"));
    const outDir = path.join(root, "dist");

    try {
      await writePagesNodeRuntimeFixture(root);
      await buildPagesFixture(root, outDir);

      const serverEntry = await fs.readFile(path.join(outDir, "server", "entry.js"), "utf-8");
      expect(serverEntry).toContain("react-dom/server.node");
      expect(serverEntry).not.toContain("pages-render-runtime.web");

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
        expect(html).toContain("Pages Node Runtime Smoke");
        expect(html).toContain("node-fizz");
      } finally {
        await new Promise<void>((resolve) => prodServer.close(() => resolve()));
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
