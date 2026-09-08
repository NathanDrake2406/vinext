import { getRequestExecutionContext } from "../request-context.js";

const PENDING_BACKGROUND_CACHE_REVALIDATIONS = Symbol.for(
  "vinext.cache.pendingBackgroundRevalidations",
);
const globalState = globalThis as unknown as Record<PropertyKey, unknown>;

function getPendingCacheRevalidations(): Map<string, Promise<unknown>> {
  const existing = globalState[PENDING_BACKGROUND_CACHE_REVALIDATIONS];
  if (existing instanceof Map) return existing;

  const pending = new Map<string, Promise<unknown>>();
  globalState[PENDING_BACKGROUND_CACHE_REVALIDATIONS] = pending;
  return pending;
}

export function hasPendingCacheRevalidation(cacheKey: string): boolean {
  return getPendingCacheRevalidations().has(cacheKey);
}

/** Run a foreground fill after any older refresh for the same key settles. */
export function runForegroundCacheRevalidation<T>(
  cacheKey: string,
  refresh: () => Promise<T>,
): Promise<T> {
  const pending = getPendingCacheRevalidations();
  const previous = pending.get(cacheKey);
  const revalidation = Promise.resolve().then(async () => {
    if (previous) {
      try {
        await previous;
      } catch {
        // A foreground fill still gets its own attempt after an older failure.
      }
    }
    return refresh();
  });
  const trackedRevalidation = revalidation.finally(() => {
    if (pending.get(cacheKey) === trackedRevalidation) {
      pending.delete(cacheKey);
    }
  });

  pending.set(cacheKey, trackedRevalidation);
  return trackedRevalidation;
}

/**
 * Start at most one background refresh for a logical data-cache key.
 *
 * The caller owns the refresh's execution context and error message. This
 * helper owns only isolate-wide deduplication, cleanup, rejection guarding,
 * and attachment to the triggering request's runtime lifetime.
 */
export function scheduleBackgroundCacheRevalidation(
  cacheKey: string,
  refresh: () => Promise<unknown>,
  reportError: (error: unknown) => void,
): void {
  const pending = getPendingCacheRevalidations();
  if (pending.has(cacheKey)) return;

  const revalidation = Promise.resolve()
    .then(refresh)
    .then(() => undefined)
    .catch((error) => {
      reportError(error);
    });
  const trackedRevalidation = revalidation.finally(() => {
    if (pending.get(cacheKey) === trackedRevalidation) {
      pending.delete(cacheKey);
    }
  });

  pending.set(cacheKey, trackedRevalidation);
  const executionContext = getRequestExecutionContext();
  if (executionContext) {
    executionContext.waitUntil(trackedRevalidation);
  } else {
    void trackedRevalidation;
  }
}
