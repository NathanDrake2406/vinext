import fs from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { startProdServer } from "../packages/vinext/src/server/prod-server.js";
import { APP_FIXTURE_DIR, buildAppFixture } from "./helpers.js";

function unwrapStartedProdServer(result: Server | { server: Server }): Server {
  return "server" in result ? result.server : result;
}

describe("App Node render runtime", () => {
  it("renders a generated production App route through the Node runtime", async () => {
    const rscEntryPath = await buildAppFixture(APP_FIXTURE_DIR);
    const outDir = path.dirname(path.dirname(rscEntryPath));

    try {
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
        expect(html).toContain("Welcome to App Router");
      } finally {
        await new Promise<void>((resolve) => prodServer.close(() => resolve()));
      }
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
