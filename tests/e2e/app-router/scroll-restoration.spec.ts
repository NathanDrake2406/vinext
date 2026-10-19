import { expect, test } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = "http://localhost:4174";

test.describe("App Router scroll restoration", () => {
  // Ported from Next.js:
  // test/e2e/app-dir/navigation/navigation.test.ts
  // https://github.com/vercel/next.js/blob/v16.2.6/test/e2e/app-dir/navigation/navigation.test.ts#L706-L735
  test("restores the original scroll position when navigating back", async ({ page }) => {
    await page.goto(`${BASE}/scroll-restoration`);
    await waitForAppRouterHydration(page);

    const body = page.locator("body");
    await expect(body).toContainText("Item 50");
    await page.locator("#load-more").click();
    await page.locator("#load-more").click();
    await page.locator("#load-more").click();
    await expect(body).toContainText("Item 200");

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    const scrollPosition = await page.evaluate(() => window.pageYOffset);
    expect(scrollPosition).toBeGreaterThan(0);

    await page.locator('a[href="/scroll-restoration/other"]').click();
    await expect(page).toHaveURL(`${BASE}/scroll-restoration/other`);
    await expect(page.locator("#back-button")).toBeVisible();
    await page.locator("#back-button").click();
    await expect(page).toHaveURL(`${BASE}/scroll-restoration`);
    await expect(body).toContainText("Item 200");

    await expect.poll(() => page.evaluate(() => window.pageYOffset)).toEqual(scrollPosition);
  });

  // Next.js writes the history entry in HistoryUpdater's insertion effect,
  // before React changes the route tree's DOM:
  // https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/client/components/app-router.tsx
  // The browser saves the scroll position at pushState as the native position
  // of the entry being left, and iOS Safari applies that position on Back
  // after the router restores its own. A push after the commit saves the
  // destination's position instead.
  for (const target of ["/scroll-restoration/other", "/scroll-restoration/slow"]) {
    test(`pushes ${target} while the page being left is still shown`, async ({ page }) => {
      await page.addInitScript(() => {
        const snapshots: { scrollY: number; sourceShown: boolean }[] = [];
        Object.assign(window, { __pushStateSnapshots: snapshots });
        const pushState = history.pushState.bind(history);
        history.pushState = (...args: Parameters<History["pushState"]>) => {
          snapshots.push({
            scrollY: window.scrollY,
            sourceShown: document.querySelector("#load-more") !== null,
          });
          pushState(...args);
        };
      });
      await page.goto(`${BASE}/scroll-restoration`);
      await waitForAppRouterHydration(page);

      await page.locator("#load-more").click();
      await expect(page.locator("body")).toContainText("Item 100");
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      const scrollPosition = await page.evaluate(() => window.scrollY);
      expect(scrollPosition).toBeGreaterThan(0);

      await page.locator(`a[href="${target}"]`).click();
      await expect(page).toHaveURL(`${BASE}${target}`);

      const snapshots = await page.evaluate(() => Reflect.get(window, "__pushStateSnapshots"));
      expect(snapshots).toEqual([{ scrollY: scrollPosition, sourceShown: true }]);
    });
  }
});
