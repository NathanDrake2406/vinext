/**
 * RSC fetch error handling tests.
 *
 * Verifies that when an RSC navigation fetch returns a non-ok response (404,
 * 500), the client performs a clean hard navigation to the destination URL
 * rather than trying to parse the HTML error body as an RSC stream.
 *
 * Without the fix:
 *   - fetch(url.rsc) returns 404 HTML
 *   - createFromFetch throws a cryptic stream-parse error
 *   - The catch block logs "[vinext] RSC navigation error: ..." and hard-navs
 *     to the same URL again, which can loop
 *
 * With the fix:
 *   - !response.ok is detected immediately after fetch
 *   - Client hard-navigates directly to the destination URL (no .rsc suffix)
 *   - No stream-parse error is logged
 *
 * Ported behavior from Next.js fetch-server-response.ts:211:
 *   if (!isFlightResponse || !res.ok || !res.body) {
 *     return doMpaNavigation(responseUrl.toString())
 *   }
 */
import { test, expect } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = "http://localhost:4174";

test.describe("RSC fetch non-ok response handling", () => {
  test("client navigation to a non-existent route hard-navs to the non-.rsc URL", async ({
    page,
  }) => {
    await page.goto(`${BASE}/about`);
    await waitForAppRouterHydration(page);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Trigger RSC navigation to a route that does not exist (returns 404 HTML).
    // We need to wait for the hard navigation, so we listen for the URL to change.
    const navigationPromise = page.waitForURL(`${BASE}/this-route-does-not-exist`, {
      timeout: 10_000,
    });
    await page.evaluate(() => {
      void (window as any).__VINEXT_RSC_NAVIGATE__("/this-route-does-not-exist");
    });
    await navigationPromise;

    // The browser must land on the non-.rsc URL — never on the .rsc variant.
    expect(page.url()).toBe(`${BASE}/this-route-does-not-exist`);

    // No RSC stream-parse error should be the first-class error logged.
    // A navigation error caused by RSC stream parse failures contains "RSC navigation error"
    // or stack frames from createFromFetch. The pre-fix path would log exactly this.
    const rscParseError = consoleErrors.find(
      (msg) =>
        msg.includes("RSC navigation error") ||
        msg.includes("createFromFetch") ||
        msg.includes("Failed to parse RSC"),
    );
    expect(rscParseError).toBeUndefined();
  });

  test("client navigation to a 500-route hard-navs to the destination URL without looping", async ({
    page,
  }) => {
    // Intercept the .rsc request for /about and return a 500 error. This
    // intercept persists across navigations and reloads on this page, so if
    // the fix is incomplete and a reload loop develops, the intercept hit
    // count will grow without bound.
    let aboutRscHits = 0;
    await page.route("**/about.rsc**", (route) => {
      aboutRscHits += 1;
      return route.fulfill({
        status: 500,
        contentType: "text/html",
        body: "<html><body><h1>Internal Server Error</h1></body></html>",
      });
    });

    await page.goto(`${BASE}/`);
    await waitForAppRouterHydration(page);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const navigationPromise = page.waitForURL(`${BASE}/about`, { timeout: 10_000 });
    await page.evaluate(() => {
      void (window as any).__VINEXT_RSC_NAVIGATE__("/about");
    });
    await navigationPromise;

    expect(page.url()).toBe(`${BASE}/about`);

    // Stability check: the hard-nav must settle. Without the
    // readInitialRscStream reload-loop guard, the initial RSC fetch on the
    // freshly-loaded /about page hits the intercepted 500 and reloads
    // indefinitely. Wait long enough for a loop to manifest, then verify
    // the URL is stable and the intercept fired a bounded number of times.
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(`${BASE}/about`);

    // Expected sequence: one hit from the client RSC nav fetch that triggered
    // the hard-nav, plus at most one hit from the post-reload initial RSC
    // fetch before the sessionStorage guard aborts further reloads. A runaway
    // loop would produce many more.
    expect(aboutRscHits).toBeLessThanOrEqual(3);

    const rscParseError = consoleErrors.find(
      (msg) =>
        msg.includes("RSC navigation error") ||
        msg.includes("createFromFetch") ||
        msg.includes("Failed to parse RSC"),
    );
    expect(rscParseError).toBeUndefined();
  });

  test("navigation to non-existent route does not land on the .rsc URL", async ({ page }) => {
    await page.goto(`${BASE}/about`);
    await waitForAppRouterHydration(page);

    // After hard-nav, URL must not contain .rsc
    const navigationPromise = page.waitForURL(`${BASE}/this-route-does-not-exist`, {
      timeout: 10_000,
    });
    await page.evaluate(() => {
      void (window as any).__VINEXT_RSC_NAVIGATE__("/this-route-does-not-exist");
    });
    await navigationPromise;

    expect(page.url()).not.toContain(".rsc");
  });
});
