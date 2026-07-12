import { expect, test } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

type NavigationDebugEvent = {
  decision?: { kind?: string };
  navigationId: number;
  phase: string;
  stage?: string;
};

function isNavigationDebugEvent(value: unknown): value is NavigationDebugEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "navigationId" in value &&
    typeof value.navigationId === "number" &&
    "phase" in value &&
    typeof value.phase === "string"
  );
}

test("emits a correlated refresh lifecycle through the real navigation runtime", async ({
  page,
}) => {
  const events: NavigationDebugEvent[] = [];
  let captureEvents = Promise.resolve();
  page.on("console", (message) => {
    captureEvents = captureEvents.then(async () => {
      if (!message.text().startsWith("[vinext:navigation]")) return;
      const event = await message.args()[1]?.jsonValue();
      if (isNavigationDebugEvent(event)) events.push(event);
    });
  });

  await page.goto("/about");
  await waitForAppRouterHydration(page);
  await page.evaluate(() => {
    const router = window.next?.router;
    if (router === undefined) throw new Error("window.next.router is not installed");
    if (!("refresh" in router)) throw new Error("App Router refresh is not installed");
    router.refresh();
  });

  await expect
    .poll(async () => {
      await captureEvents;
      return events.some((event) => event.phase === "commit");
    })
    .toBe(true);

  const navigationId = events.find((event) => event.phase === "start")?.navigationId;
  expect(navigationId).toBeDefined();
  const correlated = events.filter((event) => event.navigationId === navigationId);
  const sequence = correlated.map((event) =>
    event.phase === "reuse"
      ? `${event.phase}:${event.decision?.kind}`
      : event.phase === "fetch"
        ? `${event.phase}:${event.stage}`
        : event.phase,
  );

  expect(sequence).toEqual([
    "start",
    "reuse:fetchFresh",
    "fetch:start",
    "fetch:response",
    "commit",
  ]);
});
