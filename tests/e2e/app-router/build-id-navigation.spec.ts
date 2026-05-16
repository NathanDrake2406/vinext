import { test, expect, type Page } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = "http://localhost:4174";
const VISITED_CACHE_MARKER = "__VINEXT_VISITED_CACHE_MARKER__";
const RSC_NAVIGATION_PROMISE_MARKER = "__VINEXT_TEST_RSC_NAVIGATION_PROMISE__";

async function pushAppRoute(page: Page, pathname: string): Promise<void> {
  await page.evaluate((target) => {
    const router = window.next?.router;
    if (!router) {
      throw new Error("window.next.router is not installed");
    }
    router.push(target);
  }, pathname);
}

async function captureRscNavigationPromises(page: Page): Promise<void> {
  await page.evaluate((marker) => {
    const navigate = window.__VINEXT_RSC_NAVIGATE__;
    if (typeof navigate !== "function") {
      throw new Error("window.__VINEXT_RSC_NAVIGATE__ is not installed");
    }

    const wrappedNavigate: typeof navigate = (
      href,
      redirectDepth,
      navigationKind,
      historyUpdateMode,
      previousNextUrlOverride,
      programmaticTransition,
    ) => {
      const pendingNavigation = navigate(
        href,
        redirectDepth,
        navigationKind,
        historyUpdateMode,
        previousNextUrlOverride,
        programmaticTransition,
      );
      Reflect.set(window, marker, pendingNavigation);
      return pendingNavigation;
    };

    window.__VINEXT_RSC_NAVIGATE__ = wrappedNavigate;
  }, RSC_NAVIGATION_PROMISE_MARKER);
}

async function waitForLastRscNavigation(page: Page): Promise<void> {
  await page.waitForFunction(
    (marker) => Reflect.get(window, marker),
    RSC_NAVIGATION_PROMISE_MARKER,
  );
  await page.evaluate(async (marker) => {
    await Reflect.get(window, marker);
  }, RSC_NAVIGATION_PROMISE_MARKER);
}

test.describe("App Router RSC compatibility navigation", () => {
  test("replays same-build visited RSC payloads instead of refetching or reloading", async ({
    page,
  }) => {
    const aboutRscRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/about.rsc" && url.searchParams.has("_rsc")) {
        aboutRscRequests.push(request.url());
      }
    });

    await page.goto(`${BASE}/`);
    await waitForAppRouterHydration(page);
    await captureRscNavigationPromises(page);

    await pushAppRoute(page, "/about");
    await expect(page.locator("h1")).toHaveText("About");
    // router.push commits visible UI before the RSC navigation promise has
    // finished seeding the visited-response cache this test asserts on.
    await waitForLastRscNavigation(page);
    expect(aboutRscRequests).toHaveLength(1);

    await page.evaluate((marker) => {
      Reflect.set(window, marker, true);
      const router = window.next?.router;
      if (!router) {
        throw new Error("window.next.router is not installed");
      }
      router.push("/");
    }, VISITED_CACHE_MARKER);
    await expect(page.locator("h1")).toHaveText("Welcome to App Router");
    await waitForLastRscNavigation(page);

    await pushAppRoute(page, "/about");
    await expect(page.locator("h1")).toHaveText("About");

    await expect(
      page.evaluate((marker) => Reflect.get(window, marker), VISITED_CACHE_MARKER),
    ).resolves.toBe(true);
    expect(aboutRscRequests).toHaveLength(1);
  });
});
