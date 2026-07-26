/**
 * router.prefetch() navigation reuse (issue #2707).
 *
 * A programmatic router.prefetch(x) followed by a navigation to x must reuse
 * the prefetched RSC payload instead of issuing a second RSC request, matching
 * Next.js's PrefetchKind.AUTO semantics. The /film/[imdbId] fixture has no
 * loading.tsx, so the auto prefetch policy marks it reusable, and /top
 * intercepts it via @modal/(..)film so the test also proves the interception
 * context survives prefetch reuse.
 */
import { test, expect, type Request } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

const BASE = process.env.VINEXT_E2E_BASE_URL ?? "http://localhost:4174";
const FILM_HREF = "/film/tt0068646-the-godfather-1972";

type RouterWindow = Window & {
  next?: { router?: { prefetch(href: string): void } };
};

function isFilmRscRequest(request: Request): boolean {
  const url = new URL(request.url());
  return (
    url.pathname.startsWith("/film/") &&
    url.searchParams.has("_rsc") &&
    request.headers()["rsc"] === "1"
  );
}

test.describe("router.prefetch navigation reuse", () => {
  test("click after router.prefetch reuses the prefetched payload", async ({ page }) => {
    const filmRscRequests: string[] = [];
    page.on("request", (request) => {
      if (isFilmRscRequest(request)) filmRscRequests.push(request.url());
    });

    await page.goto(`${BASE}/top`);
    await waitForAppRouterHydration(page);

    await page.evaluate((href) => {
      const router = (window as RouterWindow).next?.router;
      if (router === undefined) throw new Error("Missing app router instance");
      router.prefetch(href);
    }, FILM_HREF);
    await expect.poll(() => filmRscRequests.length).toBe(1);

    await page.click("#godfather-film-link");

    // Interception must stay intact: the modal slot renders the film panel.
    await expect(page.locator('[data-testid="film-panel"]')).toBeVisible();
    await expect(page).toHaveURL(`${BASE}${FILM_HREF}`);

    // The navigation consumed the prefetched payload; no second RSC request.
    expect(filmRscRequests.length).toBe(1);
  });

  test("click without prefetch issues exactly one navigation request", async ({ page }) => {
    // Guards the request counter above: proves a plain click is observed as a
    // /film/* RSC request, so the reuse test's "still 1" assertion is meaningful.
    const filmRscRequests: string[] = [];
    page.on("request", (request) => {
      if (isFilmRscRequest(request)) filmRscRequests.push(request.url());
    });

    await page.goto(`${BASE}/top`);
    await waitForAppRouterHydration(page);

    await page.click("#godfather-film-link");

    await expect(page.locator('[data-testid="film-panel"]')).toBeVisible();
    await expect.poll(() => filmRscRequests.length).toBe(1);
  });
});
