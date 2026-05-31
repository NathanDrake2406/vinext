import { describe, expect, it } from "vite-plus/test";
import {
  createPprFallbackShellState,
  createPprFallbackShellSuspensePromise,
  runWithPprFallbackShellState,
  trackPprFallbackShellCacheTask,
  waitForPprFallbackShellCacheReady,
} from "../packages/vinext/src/shims/ppr-fallback-shell.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ppr fallback shell cache task tracking", () => {
  it("waits for public cache work before marking warmup cache-ready", async () => {
    const state = createPprFallbackShellState({
      fallbackParamNames: ["slug"],
      routePattern: "/:locale/blog/:slug",
    });
    let finishTask!: () => void;
    let isReady = false;

    const tracked = runWithPprFallbackShellState(state, () =>
      trackPprFallbackShellCacheTask(
        () => new Promise<void>((resolve) => (finishTask = resolve)),
        "default",
      ),
    );
    const ready = waitForPprFallbackShellCacheReady(state).then(() => {
      isReady = true;
    });

    await delay(5);
    expect(isReady).toBe(false);
    finishTask();
    await tracked;
    await ready;
    expect(state.pendingCacheTasks).toBe(0);
  });

  it("stops waiting for cache tasks that suspend on fallback-shell dynamic work", async () => {
    const state = createPprFallbackShellState({
      fallbackParamNames: ["slug"],
      routePattern: "/:locale/blog/:slug",
    });
    let reachedAfterSuspend = false;

    const tracked = runWithPprFallbackShellState(state, () =>
      trackPprFallbackShellCacheTask(
        () =>
          trackPprFallbackShellCacheTask(async () => {
            const suspension = createPprFallbackShellSuspensePromise<void>("`params`");
            if (suspension) {
              await suspension;
            }
            reachedAfterSuspend = true;
          }, "default"),
        "default",
      ),
    );

    await waitForPprFallbackShellCacheReady(state);
    expect(state.pendingCacheTasks).toBe(0);
    expect(reachedAfterSuspend).toBe(false);

    state.abortController.abort();
    await tracked.catch(() => undefined);
  });
});
