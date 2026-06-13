import { expect, test } from "@playwright/test";

// Ported from Next.js: test/e2e/app-dir/front-redirect-issue/front-redirect-issue.test.ts
// https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/front-redirect-issue/front-redirect-issue.test.ts

const BASE = "http://localhost:4186";

test.describe("app dir - front redirect issue", () => {
  test("should redirect", async ({ page }) => {
    await page.goto(`${BASE}/vercel-user`);

    await expect(page.locator("#home-page h1")).toHaveText("Hello!", { timeout: 10_000 });
    expect(page.url()).toBe(`${BASE}/vercel-user`);
  });
});
