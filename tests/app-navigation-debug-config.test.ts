import { afterEach, describe, expect, it } from "vite-plus/test";
import { createServer, type ViteDevServer } from "vite-plus";
import vinext from "../packages/vinext/src/index.js";
import { PAGES_FIXTURE_DIR } from "./helpers.js";
import { withEnvVar } from "./env-test-helpers.js";

const NAVIGATION_DEBUG_DEFINE = "process.env.__VINEXT_DEBUG_NAVIGATION";

async function createConfigServer(): Promise<ViteDevServer> {
  return createServer({
    root: PAGES_FIXTURE_DIR,
    configFile: false,
    plugins: [vinext()],
    server: { port: 0 },
    logLevel: "silent",
  });
}

describe("App Router navigation debug configuration", () => {
  let server: ViteDevServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("defaults the client diagnostic define to disabled", async () => {
    server = await withEnvVar("VINEXT_DEBUG_NAVIGATION", undefined, createConfigServer);
    expect(server.config.define?.[NAVIGATION_DEBUG_DEFINE]).toBe(JSON.stringify("false"));
  });

  it("enables the client diagnostic define from VINEXT_DEBUG_NAVIGATION=1", async () => {
    server = await withEnvVar("VINEXT_DEBUG_NAVIGATION", "1", createConfigServer);
    expect(server.config.define?.[NAVIGATION_DEBUG_DEFINE]).toBe(JSON.stringify("true"));
  });
});
