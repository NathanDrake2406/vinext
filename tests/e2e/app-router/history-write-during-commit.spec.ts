import { expect, test } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = "http://localhost:4174";

// The navigation writes its URL before React changes the DOM, so cleanups of
// the page being left run after it. A raw history write from such a cleanup
// replaces the new entry, and the destination stays visible, as in Next.js,
// whose patched replaceState restores the tree of the entry it replaces.
test.describe("raw history write during a navigation commit", () => {
  test("from a layout effect cleanup of the page being left", async ({ page }) => {
    await page.goto(`${BASE}/history-write-during-commit`);
    await waitForAppRouterHydration(page);
    const lengthBefore = await page.evaluate(() => history.length);

    await page.locator("#to-dest").click();

    await expect(page.locator("#dest")).toHaveText("/history-write-during-commit/dest?left=1");
    await expect(page).toHaveURL(`${BASE}/history-write-during-commit/dest?left=1`);
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore + 1);
  });

  test("from a persistent layout's effect cleanup", async ({ page }) => {
    await page.goto(`${BASE}/history-write-during-commit/layout-cleanup/a`);
    await waitForAppRouterHydration(page);
    const lengthBefore = await page.evaluate(() => history.length);

    await page.locator("#to-b").click();

    await expect(page.locator("#layout-b")).toBeVisible();
    await expect(page).toHaveURL(`${BASE}/history-write-during-commit/layout-cleanup/b?x=1`);
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore + 1);
  });
});
