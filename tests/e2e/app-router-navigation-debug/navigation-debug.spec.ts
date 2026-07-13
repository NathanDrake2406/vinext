import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { waitForAppRouterHydration } from "../helpers";

type NavigationDebugEvent = {
  decision?: { kind?: string };
  navigationKind?: string;
  navigationId: number;
  payloadOrigin?: string;
  phase: string;
  rscUrl?: string;
  stage?: string;
  targetHref?: string;
  visibleOutcome?: string;
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

function captureNavigationDebugEvents(page: Page) {
  const events: NavigationDebugEvent[] = [];
  let captureEvents = Promise.resolve();
  page.on("console", (message) => {
    captureEvents = captureEvents.then(async () => {
      if (!message.text().startsWith("[vinext:navigation]")) return;
      const event = await message.args()[1]?.jsonValue();
      if (isNavigationDebugEvent(event)) events.push(event);
    });
  });

  return {
    events,
    flush: async () => captureEvents,
  };
}

test("emits a correlated refresh lifecycle through the real navigation runtime", async ({
  page,
}) => {
  const captured = captureNavigationDebugEvents(page);

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
      await captured.flush();
      return captured.events.some((event) => event.phase === "commit");
    })
    .toBe(true);

  const navigationId = captured.events.find((event) => event.phase === "start")?.navigationId;
  expect(navigationId).toBeDefined();
  const correlated = captured.events.filter((event) => event.navigationId === navigationId);
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

test("keeps a shared dynamic layout current after traversing back and entering another param", async ({
  page,
}) => {
  const captured = captureNavigationDebugEvents(page);
  const rscRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.searchParams.has("_rsc")) rscRequests.push(`${url.pathname}${url.search}`);
  });

  await page.goto("/navigation-debug");
  await waitForAppRouterHydration(page);

  await page.getByTestId("project-a-link").click();
  await expect(page.getByTestId("server-project")).toHaveText("server project: A");
  await expect(page.getByTestId("client-project")).toHaveText("client project: A");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Navigation debug dashboard" })).toBeVisible();

  rscRequests.length = 0;
  await page.getByTestId("project-b-link").click();
  await expect(page.getByTestId("server-project")).toHaveText("server project: B");
  await expect(page.getByTestId("client-project")).toHaveText("client project: B");
  await expect(page.getByTestId("client-pathname")).toHaveText(
    "client pathname: /navigation-debug/projects/B",
  );

  await captured.flush();
  expect(rscRequests.some((request) => request.startsWith("/navigation-debug/projects/B?"))).toBe(
    true,
  );
  const projectBNavigationId = captured.events.find(
    (event) =>
      event.phase === "start" && event.targetHref?.endsWith("/navigation-debug/projects/B"),
  )?.navigationId;
  expect(projectBNavigationId).toBeDefined();
  const projectBEvents = captured.events.filter(
    (event) => event.navigationId === projectBNavigationId,
  );
  expect(projectBEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ navigationKind: "navigate", phase: "start" }),
      expect.objectContaining({ phase: "fetch", stage: "start" }),
      expect.objectContaining({ phase: "fetch", stage: "response" }),
      expect.objectContaining({ phase: "commit", visibleOutcome: "committed" }),
    ]),
  );
});

test("restores matching server and client state when traversing from a sibling child route", async ({
  page,
}) => {
  const captured = captureNavigationDebugEvents(page);

  await page.goto("/navigation-debug/projects/A");
  await waitForAppRouterHydration(page);
  await expect(page.getByTestId("client-pathname")).toHaveText(
    "client pathname: /navigation-debug/projects/A",
  );

  await page.getByTestId("project-child-link").click();
  await expect(page.getByTestId("server-page")).toHaveText("server page: child");
  await expect(page.getByTestId("client-pathname")).toHaveText(
    "client pathname: /navigation-debug/projects/A/child",
  );

  await page.goBack();
  await expect(page.getByTestId("server-page")).toHaveText("server page: index");
  await expect(page.getByTestId("server-project")).toHaveText("server project: A");
  await expect(page.getByTestId("client-project")).toHaveText("client project: A");
  await expect(page.getByTestId("client-pathname")).toHaveText(
    "client pathname: /navigation-debug/projects/A",
  );

  await captured.flush();
  const traverseNavigationId = captured.events.find(
    (event) => event.phase === "start" && event.navigationKind === "traverse",
  )?.navigationId;
  expect(traverseNavigationId).toBeDefined();
  const traverseEvents = captured.events.filter(
    (event) => event.navigationId === traverseNavigationId,
  );
  expect(traverseEvents).toEqual([
    expect.objectContaining({ navigationKind: "traverse", phase: "start" }),
    expect.objectContaining({
      payloadOrigin: "committed-cache",
      phase: "commit",
      visibleOutcome: "committed",
    }),
  ]);
});
