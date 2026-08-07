import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = "http://localhost:4174";

// Back/Forward pressed after a reload commits but before the App Router's
// popstate listener exists is an instant same-document traversal: the URL bar
// moves, popstate fires, and nobody is listening. Chrome keeps the
// same-document association across the reload, so the entries created by the
// earlier client-side navigation are still same-document siblings.
//
// Scripts are stalled to make that window deterministic; releasing them lets
// hydration run and the router must reconcile the URL with what it renders.
async function stallScripts(page: Page): Promise<() => void> {
  let stalling = true;
  const stalled: Array<() => void> = [];
  await page.route("**/*", async (route) => {
    if (stalling && route.request().resourceType() === "script") {
      await new Promise<void>((resolve) => {
        stalled.push(resolve);
      });
    }
    await route.continue();
  });
  return () => {
    stalling = false;
    for (const release of stalled) release();
  };
}

test.describe("App Router Back before hydration", () => {
  test("replays a traversal that landed before the popstate listener existed", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await waitForAppRouterHydration(page);

    await page.click('a[href="/about"]');
    await expect(page.locator("h1")).toHaveText("About");

    const releaseScripts = await stallScripts(page);
    await page.reload({ waitUntil: "commit" });
    await page.evaluate("window.__stayed = true");

    await page.goBack({ waitUntil: "commit" });
    expect(new URL(page.url()).pathname).toBe("/");

    releaseScripts();

    // The traversal must be replayed once the router is up: URL and content
    // agree on "/", and hydration must not have reloaded the document.
    await expect(page.locator("h1")).toHaveText("Welcome to App Router");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(await page.evaluate("window.__stayed")).toBe(true);

    // Traversal keeps working afterwards.
    await page.goForward();
    await expect(page.locator("h1")).toHaveText("About");
    await page.goBack();
    await expect(page.locator("h1")).toHaveText("Welcome to App Router");
  });

  test("adopts a third-party pushState that lands before hydration", async ({ page }) => {
    const releaseScripts = await stallScripts(page);
    await page.goto(`${BASE}/about`, { waitUntil: "commit" });
    await page.waitForSelector("h1");
    await page.evaluate("window.__stayed = true");

    // e.g. analytics/consent tooling running before the framework. The entry is
    // not vinext-written, so there is no traversal to replay and no recovery.
    await page.evaluate("window.history.pushState({ thirdParty: true }, '', '/about?tp=1')");
    releaseScripts();

    await waitForAppRouterHydration(page);
    await expect(page.locator("h1")).toHaveText("About");
    expect(new URL(page.url()).search).toBe("?tp=1");
    expect(await page.evaluate("window.__stayed")).toBe(true);

    // The router still navigates from the adopted entry.
    await page.click('a[href="/"]');
    await expect(page.locator("h1")).toHaveText("Welcome to App Router");
  });
});
