/**
 * Next.js Compatibility Tests: middleware runs for server action redirect targets.
 *
 * A server action that throws `redirect()` renders the target page inline and
 * returns its Flight payload with the action response, instead of making the
 * client re-request the target. Middleware only ran for the action's own path,
 * so the target's middleware — commonly the app's authorization boundary — has
 * to be run before that render.
 *
 * In Next.js the client re-requests the target through the full pipeline, so a
 * middleware-blocked target is never rendered from the action request. Here the
 * fixture's middleware blocks `/admin` with a 403; the action response must fall
 * back to a header-only redirect the client re-requests, carrying no payload.
 */

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { ViteDevServer } from "vite-plus";
import { APP_FIXTURE_DIR, startFixtureServer } from "../helpers.js";

const ACTION_PATH = "/nextjs-compat/action-redirect-middleware";
const ACTION_ID = "/app/nextjs-compat/action-redirect-middleware/actions.ts#redirectToBlockedPath";

describe("Next.js compat: server action redirect targets run middleware", () => {
  let server: ViteDevServer;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer(APP_FIXTURE_DIR, { appRouter: true }));
    await fetch(`${baseUrl}${ACTION_PATH}`).catch(() => {});
  }, 60_000);

  afterAll(async () => {
    await server?.close();
  });

  it("blocks a direct request to the redirect target", async () => {
    const res = await fetch(`${baseUrl}/admin`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Protected admin content");
  });

  it("does not return the blocked target's payload from the action response", async () => {
    const res = await fetch(`${baseUrl}${ACTION_PATH}.rsc`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-rsc-action": ACTION_ID,
      },
      body: JSON.stringify([]),
    });
    const text = await res.text();

    expect(res.headers.get("x-action-redirect")).toBe("/admin");
    expect(text).not.toContain("Protected admin content");
    // A header-only redirect the client re-requests through the full pipeline,
    // where middleware gets to block it.
    expect(res.headers.get("content-type")).toBeNull();
    expect(text).toBe("");
  });
});
