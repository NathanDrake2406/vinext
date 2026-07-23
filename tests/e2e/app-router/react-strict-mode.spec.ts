import { expect, test } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

test("enables Strict Mode by default for the App Router", async ({ page }) => {
  await page.goto("/react-strict-mode");
  await waitForAppRouterHydration(page);

  await expect(page.getByTestId("strict-mode-render-count")).toHaveText("2");
});
