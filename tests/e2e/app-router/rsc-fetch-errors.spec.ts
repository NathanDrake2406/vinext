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

// Stream-parse errors thrown by createFromFetch / createFromReadableStream
// when handed a non-RSC payload (HTML error body, wrong content-type, empty
// stream). The pre-fix failure path produces one of these diagnostics; the
// filter here stays narrow on purpose so unrelated console errors (hydration
// timing, third-party scripts, JSON.parse in fixture code) never
// false-positive. Generic strings ("Connection closed", "Unexpected token")
// are gated on an RSC-context co-marker so a benign third-party JSON.parse
// diagnostic cannot satisfy them.
function isRscStreamParseError(msg: string): boolean {
  const hasRscContext = msg.includes("RSC") || msg.includes("vinext");
  return (
    msg.includes("createFromFetch") ||
    msg.includes("createFromReadableStream") ||
    msg.includes("Failed to parse RSC") ||
    (hasRscContext && msg.includes("Connection closed")) ||
    (hasRscContext && msg.includes("Unexpected token"))
  );
}

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

    // The bug this PR fixes surfaces as one of a small set of RSC-stream
    // parse errors when createFromFetch is handed an HTML body. Match only
    // those diagnostics so an unrelated console error (e.g. a hydration-
    // timing race that pre-existed this PR) does not false-positive here.
    const rscParseError = consoleErrors.find((msg) => isRscStreamParseError(msg));
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
    // indefinitely — networkidle would never fire and the default timeout
    // catches that. Tracking actual request activity avoids flaky wall-clock
    // waits in CI.
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBe(`${BASE}/about`);

    // Expected trajectory: up to two hits — one from the home-page Link
    // prefetch of /about.rsc (which the prefetch-cache discards because the
    // response is !ok), and one from the client RSC nav fetch that triggers
    // the hard-nav. Hydration timing can race the prefetch, in which case
    // the count is 1. After the hard navigation to /about, the embedded-RSC
    // branch in readInitialRscStream handles hydration without a fallback
    // .rsc fetch, so no post-reload hits occur. A runaway reload loop would
    // produce many more.
    // Lower bound: at minimum, the client nav fetch that triggers the
    // hard-nav must have fired. A value of 0 would mean the navigation
    // skipped the RSC fetch entirely and the test is no longer exercising
    // the !ok-guard path.
    expect(aboutRscHits).toBeGreaterThanOrEqual(1);
    expect(aboutRscHits).toBeLessThanOrEqual(2);

    const rscParseError = consoleErrors.find((msg) => isRscStreamParseError(msg));
    expect(rscParseError).toBeUndefined();
  });
});
