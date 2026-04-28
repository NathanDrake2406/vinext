import { test, expect } from "@playwright/test";
import { waitForAppRouterHydration } from "../../helpers";

const BASE = "http://localhost:4174";

test.describe("Next.js compat: hash popstate scroll", () => {
  // Ported from the App Router hash-scroll behavior covered by:
  // https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/navigation/navigation.test.ts
  // Next.js stores hash scroll intent in focusAndScrollRef and layout-router
  // consumes it after navigation commits.
  test("forward traversal to a hash-only Link entry scrolls the anchor into view", async ({
    page,
  }) => {
    await page.goto(`${BASE}/nextjs-compat/hash-popstate-scroll`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("h1")).toHaveText("Hash Popstate Scroll");

    await page.click("#hash-link");
    await expect(page).toHaveURL(`${BASE}/nextjs-compat/hash-popstate-scroll#content`);
    await expect(page.locator("#content")).toBeInViewport();

    await page.goBack();
    await expect(page).toHaveURL(`${BASE}/nextjs-compat/hash-popstate-scroll`);
    await expect(async () => {
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);
    }).toPass();

    await page.goForward();
    await expect(page).toHaveURL(`${BASE}/nextjs-compat/hash-popstate-scroll#content`);
    await expect(page.locator("#content")).toBeInViewport();
  });
});
