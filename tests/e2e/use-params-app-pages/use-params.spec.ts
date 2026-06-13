// Ported from Next.js: test/e2e/app-dir/use-params/use-params.test.ts
// https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/use-params/use-params.test.ts
import { expect, test } from "@playwright/test";

test.describe("use-params", () => {
  test("should work for single dynamic param", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/a/b`);
    await expect(page.locator("#param-id")).toHaveText("a");
  });

  test("should work for nested dynamic params", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/a/b`);
    await expect(page.locator("#param-id")).toHaveText("a");
    await expect(page.locator("#param-id2")).toHaveText("b");
  });

  test("should work for catch all params", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/a/b/c/d/e/f/g`);
    await expect(page.locator("#params")).toHaveText('["a","b","c","d","e","f","g"]');
  });

  test("should work for single dynamic param client navigating", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);
    await page.locator("#to-a").click();
    await expect(page.locator("#param-id")).toHaveText("a");
  });

  test("should work for nested dynamic params client navigating", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`);
    await page.locator("#to-a-b").click();
    await expect(page.locator("#param-id")).toHaveText("a");
    await expect(page.locator("#param-id2")).toHaveText("b");
  });

  test("should work on pages router", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/pages-dir/foobar`);
    await expect(page.locator("#params")).toBeVisible();
    await expect(page.locator("#params")).toHaveText('"foobar"');
  });

  test("shouldn't rerender host component when prefetching", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/rerenders/foobar`);
    const initialRandom = await page.locator("#random").textContent();
    await page.locator("a").hover();
    await expect(page.locator("#random")).toHaveText(initialRandom ?? "");
  });
});
