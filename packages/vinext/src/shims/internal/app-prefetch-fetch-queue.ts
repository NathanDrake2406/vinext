"use client";

const APP_PREFETCH_FETCH_SLOT_RELEASE_KEY = Symbol.for("vinext.appPrefetchFetchSlotRelease");

const MAX_DEFAULT_APP_PREFETCH_REQUESTS = 4;
const defaultAppPrefetchQueue: Array<() => void> = [];
/** Lets a consumer find the queued runner behind a promise it already holds. */
const queuedAppPrefetchRunners = new WeakMap<Promise<Response>, () => void>();
let activeDefaultAppPrefetchRequests = 0;
let defaultAppPrefetchDrainScheduled = false;

function drainDefaultAppPrefetchQueue(): void {
  defaultAppPrefetchDrainScheduled = false;
  while (activeDefaultAppPrefetchRequests < MAX_DEFAULT_APP_PREFETCH_REQUESTS) {
    const run = defaultAppPrefetchQueue.shift();
    if (!run) return;
    activeDefaultAppPrefetchRequests += 1;
    run();
  }
}

function scheduleDefaultAppPrefetchDrain(): void {
  if (defaultAppPrefetchDrainScheduled) return;
  defaultAppPrefetchDrainScheduled = true;
  queueMicrotask(drainDefaultAppPrefetchQueue);
}

export function releaseAppPrefetchFetchSlot(response: Response): void {
  const release = (response as Response & Record<symbol, (() => void) | undefined>)[
    APP_PREFETCH_FETCH_SLOT_RELEASE_KEY
  ];
  if (release === undefined) return;

  (response as Response & Record<symbol, (() => void) | undefined>)[
    APP_PREFETCH_FETCH_SLOT_RELEASE_KEY
  ] = undefined;
  release();
}

/**
 * Low-priority App Router prefetches share a small request queue. The consumer
 * must either snapshot the returned Response with snapshotRscResponse() or call
 * releaseAppPrefetchFetchSlot() when it drops the response without consuming it.
 */
export function scheduleAppPrefetchFetch(
  fetcher: () => Promise<Response>,
  priority: "low" | "high",
): Promise<Response> {
  if (priority === "high") {
    return fetcher();
  }

  let runner!: () => void;
  const promise = new Promise<Response>((resolve, reject) => {
    runner = () => {
      let didRelease = false;
      const release = () => {
        if (didRelease) return;
        didRelease = true;
        activeDefaultAppPrefetchRequests -= 1;
        drainDefaultAppPrefetchQueue();
      };

      try {
        fetcher().then(
          (response) => {
            (response as Response & Record<symbol, (() => void) | undefined>)[
              APP_PREFETCH_FETCH_SLOT_RELEASE_KEY
            ] = release;
            resolve(response);
          },
          (error: unknown) => {
            release();
            reject(error);
          },
        );
      } catch (error) {
        release();
        reject(error);
      }
    };
  });

  defaultAppPrefetchQueue.push(runner);
  queuedAppPrefetchRunners.set(promise, runner);
  scheduleDefaultAppPrefetchDrain();
  return promise;
}

/**
 * Start a still-queued prefetch request immediately.
 *
 * A navigation that reuses an in-flight prefetch awaits that prefetch's
 * promise. When the request is only queued, the navigation would otherwise wait
 * for unrelated prefetch response bodies to finish before its own request even
 * starts — indefinitely if one of those streams stalls. A promoted request is
 * no longer a prefetch, it is the navigation, so it bypasses the concurrency
 * cap instead of waiting for a slot.
 *
 * No-op when the request has already started or was never queued.
 */
export function promoteAppPrefetchFetch(promise: Promise<Response> | undefined): void {
  if (promise === undefined) return;
  const runner = queuedAppPrefetchRunners.get(promise);
  if (runner === undefined) return;

  const index = defaultAppPrefetchQueue.indexOf(runner);
  if (index === -1) return;
  defaultAppPrefetchQueue.splice(index, 1);
  queuedAppPrefetchRunners.delete(promise);

  activeDefaultAppPrefetchRequests += 1;
  runner();
}
