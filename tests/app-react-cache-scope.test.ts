import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vite-plus/test";

const execFileAsync = promisify(execFile);

describe("React cache scope runner", () => {
  // https://github.com/cloudflare/vinext/issues/3671
  it("gives probed server components one React cache per scope", async () => {
    // React's cache() only memoizes in the react-server build with a Flight
    // request current, so this runs the real probe walker against real Flight
    // in a react-server subprocess. Vitest's React build never caches.
    const script = String.raw`
      import { AsyncLocalStorage } from "node:async_hooks";
      import React from "react";
      import { createServer } from "vite";

      // @vitejs/plugin-rsc injects this global into the Flight bundle it builds;
      // Flight needs it to keep its request current across an await.
      globalThis.AsyncLocalStorage = AsyncLocalStorage;
      const { renderToReadableStream } = await import(
        "./node_modules/@vitejs/plugin-rsc/dist/vendor/react-server-dom/server.edge.js"
      );

      const vite = await createServer({
        appType: "custom",
        configFile: false,
        logLevel: "silent",
        mode: "production",
        server: { middlewareMode: true },
      });

      try {
        const { createReactCacheScopeRunner } = await vite.ssrLoadModule(
          "/packages/vinext/src/server/app-react-cache-scope.ts",
        );
        const { probeReactServerSubtree } = await vite.ssrLoadModule(
          "/packages/vinext/src/server/app-page-probe.ts",
        );
        const runWithReactCacheScope = createReactCacheScopeRunner((model, options) =>
          renderToReadableStream(model, null, options),
        );

        const getStore = React.cache(() => ({ locale: undefined }));
        const readLocale = () => getStore().locale ?? "unset";

        function Nav() {
          reads.push("nav:" + readLocale());
          return null;
        }
        async function Layout({ children }) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          getStore().locale = "es";
          return React.createElement("section", null, React.createElement(Nav), children);
        }
        const probeLayout = () => probeReactServerSubtree(React.createElement(Layout));

        let reads = [];
        await probeLayout();
        const unscoped = reads;

        reads = [];
        const result = await runWithReactCacheScope(async () => {
          await probeLayout();
          reads.push("page:" + readLocale());
          return "probed";
        });
        const scoped = reads;

        reads = [];
        await runWithReactCacheScope(async () => {
          reads.push("next-scope:" + readLocale());
        });
        const nextScope = reads;

        const rejection = await runWithReactCacheScope(async () => {
          throw new Error("probe failed");
        }).catch((error) => error.message);

        process.stdout.write(JSON.stringify({ unscoped, scoped, result, nextScope, rejection }));
      } finally {
        await vite.close();
      }
    `;

    const { stdout } = await execFileAsync(
      process.execPath,
      ["--conditions", "react-server", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production" },
        timeout: 10_000,
      },
    );

    expect(JSON.parse(stdout)).toEqual({
      // Control: without a scope the child cannot see what the layout stored.
      unscoped: ["nav:unset"],
      scoped: ["nav:es", "page:es"],
      result: "probed",
      nextScope: ["next-scope:unset"],
      rejection: "probe failed",
    });
  });
});
