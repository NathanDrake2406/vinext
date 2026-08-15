import { expect, test } from "@playwright/test";
import { waitForAppRouterHydration } from "../../helpers";

const BASE = "http://localhost:4174";
const START = "/nextjs-compat/hash-cross-path-push";
const DESTINATION = "/nextjs-compat/hash-cross-path-push/destination";

// Ported from Next.js: test/e2e/app-dir/navigation/navigation.test.ts
// ("cross-pathname Link then same-pathname hash change")
// https://github.com/vercel/next.js/pull/93132
//
// Next.js regressed here because its segment cache stored one canonical URL per
// route entry, shared across every hash target, and a later same-route hash
// navigation appended `url.hash` to it — producing `/destination#foo#bar`.
// vinext resolves each navigation target against the live location instead
// (`toBrowserNavigationHref`) and writes that resolved href to history
// (`commitNavigationHistory`), so the hash is replaced rather than concatenated.
// These tests lock that in for both navigation entry points.
test.describe("Next.js compat: cross-path push with hash then same-path hash change", () => {
  test("<Link> replaces the hash instead of concatenating it", async ({ page }) => {
    await page.goto(`${BASE}${START}`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("h1")).toHaveText("Hash Cross Path Push Start");

    await page.click("#link-to-target-foo");
    await expect(page).toHaveURL(`${BASE}${DESTINATION}#foo`);

    await page.click("#link-to-target-baz");
    await expect(page).toHaveURL(`${BASE}${DESTINATION}#baz`);
  });

  test("router.push replaces the hash instead of concatenating it", async ({ page }) => {
    await page.goto(`${BASE}${START}`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("h1")).toHaveText("Hash Cross Path Push Start");

    await page.click("#push-to-target-foo");
    await expect(page).toHaveURL(`${BASE}${DESTINATION}#foo`);

    await page.click("#push-to-target-baz");
    await expect(page).toHaveURL(`${BASE}${DESTINATION}#baz`);
  });
});
