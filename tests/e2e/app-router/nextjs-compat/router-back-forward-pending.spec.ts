/**
 * Next.js Compat E2E: router.back() / router.forward() pending state
 *
 * Next.js references:
 * - https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/navigation/navigation.test.ts
 *
 * Contract: when router.back() or router.forward() is invoked inside a
 * React.startTransition callback, useTransition().isPending must stay true
 * from the synchronous call site until the traversal commits. Without the
 * deferred pending promise, the transition callback exits before popstate
 * fires (popstate is a new browser task), so no React state update is tied
 * to the transition and isPending flashes false mid-traversal.
 */

import { expect, test, type Page } from "@playwright/test";
import { waitForAppRouterHydration } from "../../helpers";

const BASE = "http://localhost:4174";

async function installPendingObserver(page: Page, selector: string, logKey: string): Promise<void> {
  await page.evaluate(
    ({ selector, logKey }: { selector: string; logKey: string }) => {
      const log: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      w[logKey] = log;

      const el = document.querySelector(selector);
      if (el) {
        log.push(el.textContent ?? "");
      }

      const obs = new MutationObserver(() => {
        const current = document.querySelector(selector);
        if (current) {
          log.push(current.textContent ?? "");
        } else {
          log.push("__removed__");
          obs.disconnect();
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      w[`${logKey}__obs`] = obs;
    },
    { selector, logKey },
  );
}

async function readObserverLog(page: Page, logKey: string): Promise<string[]> {
  return await page.evaluate((key: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    (w[`${key}__obs`] as MutationObserver | undefined)?.disconnect();
    return (w[key] as string[] | undefined) ?? [];
  }, logKey);
}

/**
 * Assert that the log contains no "idle" entries between the first "pending"
 * and either the final "__removed__" or the end of the log. Matches the
 * strategy used in router-push-pending.spec.ts.
 */
function assertNoIdleFlash(log: string[], pendingValue = "pending"): void {
  const firstPendingIdx = log.indexOf(pendingValue);
  expect(
    firstPendingIdx,
    `isPending never became "${pendingValue}". Log: ${JSON.stringify(log)}`,
  ).toBeGreaterThan(-1);

  const afterFirstPending = log.slice(firstPendingIdx);
  const removedIdx = afterFirstPending.indexOf("__removed__");
  const beforeRemoval =
    removedIdx >= 0 ? afterFirstPending.slice(0, removedIdx) : afterFirstPending;

  const idleFlashIdx = beforeRemoval.findIndex((v) => v.endsWith(":idle") || v === "idle");
  expect(
    idleFlashIdx,
    `isPending flashed idle mid-traversal at index ${idleFlashIdx}. Full log: ${JSON.stringify(log)}`,
  ).toBe(-1);
}

test.describe("Next.js compat: router.back / router.forward pending state", () => {
  test("router.back() keeps isPending true until page A commits", async ({ page }) => {
    await page.goto(`${BASE}/nextjs-compat/router-back-forward-pending`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-destination");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#back-pending-state")).toHaveText("b:idle");

    await installPendingObserver(page, "#back-pending-state", "__backLog");

    await page.click("#router-back-btn", { noWaitAfter: true });

    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    const log = await readObserverLog(page, "__backLog");
    assertNoIdleFlash(log, "b:pending");
    expect(page.url()).toBe(`${BASE}/nextjs-compat/router-back-forward-pending`);
  });

  test("router.forward() keeps isPending true until page B commits", async ({ page }) => {
    await page.goto(`${BASE}/nextjs-compat/router-back-forward-pending`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-destination");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });

    // Bare history.back() (not router.back()) on purpose: router.back() would
    // arm a pending, and the forward observer's log would then capture the
    // back traversal's "pending"/"idle" entries instead of isolating the
    // forward traversal under test.
    await page.evaluate(() => window.history.back());
    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#forward-pending-state")).toHaveText("idle");

    await installPendingObserver(page, "#forward-pending-state", "__forwardLog");

    await page.click("#router-forward-btn", { noWaitAfter: true });

    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });

    const log = await readObserverLog(page, "__forwardLog");
    assertNoIdleFlash(log, "pending");
    expect(page.url()).toBe(`${BASE}/nextjs-compat/router-back-forward-pending/destination`);
  });

  test("rapid router.back(); router.back(); keeps isPending true through second traversal", async ({
    page,
  }) => {
    await page.goto(`${BASE}/nextjs-compat/router-back-forward-pending`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-destination");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-step2");
    await expect(page.locator("#page-b2-marker")).toBeVisible({ timeout: 10_000 });

    await installPendingObserver(page, "#back-pending-state", "__doubleBackLog");

    await page.click("#router-double-back-btn", { noWaitAfter: true });

    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    const log = await readObserverLog(page, "__doubleBackLog");
    // While page B2 is still mounted, isPending must not flash back to idle.
    // We only inspect the prefix of the log prior to a "b:" entry (which
    // signals the intermediate page B committed) or "__removed__".
    const firstPendingIdx = log.indexOf("b2:pending");
    expect(
      firstPendingIdx,
      `isPending never became "b2:pending". Log: ${JSON.stringify(log)}`,
    ).toBeGreaterThan(-1);

    const afterFirst = log.slice(firstPendingIdx);
    const endIdx = afterFirst.findIndex(
      (v) => v === "__removed__" || v.startsWith("b:") || v === "idle",
    );
    const duringB2 = endIdx >= 0 ? afterFirst.slice(0, endIdx) : afterFirst;

    expect(
      duringB2.indexOf("b2:idle"),
      `isPending flashed "b2:idle" while B2 was mounted. Log: ${JSON.stringify(log)}`,
    ).toBe(-1);
  });

  test("one-entry-deep router.back(); router.back(); only arms the real traversal", async ({
    page,
  }) => {
    await page.goto(`${BASE}/nextjs-compat/router-back-forward-pending`);
    await waitForAppRouterHydration(page);
    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-destination");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const originalArm = window.__VINEXT_ARM_TRAVERSAL_PENDING__;
      const originalBack = window.history.back.bind(window.history);
      w.__vinextTraversalArmCount = 0;
      w.__vinextHistoryBackCount = 0;
      window.__VINEXT_ARM_TRAVERSAL_PENDING__ = () => {
        w.__vinextTraversalArmCount += 1;
        originalArm?.();
      };
      window.history.back = () => {
        w.__vinextHistoryBackCount += 1;
        if (w.__vinextHistoryBackCount === 1) {
          originalBack();
        }
      };
    });

    await page.click("#router-double-back-btn", { noWaitAfter: true });

    await expect(page.locator("#page-a-marker")).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => page.evaluate(() => window.location.pathname))
      .toBe("/nextjs-compat/router-back-forward-pending");
    await expect
      .poll(() =>
        page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          return w.__vinextTraversalArmCount;
        }),
      )
      .toBe(1);
  });

  test("router.back() then router.forward() round-trips cleanly across separate clicks", async ({
    page,
  }) => {
    await page.goto(`${BASE}/nextjs-compat/router-back-forward-pending`);
    await waitForAppRouterHydration(page);

    await page.click("#push-to-destination");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#push-to-step2");
    await expect(page.locator("#page-b2-marker")).toBeVisible({ timeout: 10_000 });

    await page.click("#router-back-btn");
    await expect(page.locator("#page-b-marker")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(`${BASE}/nextjs-compat/router-back-forward-pending/destination`);

    await page.click("#router-forward-from-b-btn");
    await expect(page.locator("#page-b2-marker")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(`${BASE}/nextjs-compat/router-back-forward-pending/destination/step2`);
  });
});
