import { getRequestExecutionContext } from "../request-context.js";

const PENDING_CACHE_REVALIDATIONS = Symbol.for("vinext.cache.pendingRevalidations");
const globalState = globalThis as unknown as Record<PropertyKey, unknown>;

export type CacheRevalidationLease = {
  write: (write: () => Promise<void>) => Promise<void>;
};

type CacheRevalidation = {
  active: boolean;
  background: boolean;
  promise: Promise<unknown>;
  writes: Array<() => Promise<void>>;
};

type CacheRevalidationCoordinator = {
  active: number;
  current: CacheRevalidation;
};

function getPendingCacheRevalidations(): Map<string, CacheRevalidationCoordinator> {
  const existing = globalState[PENDING_CACHE_REVALIDATIONS];
  if (existing instanceof Map) return existing;

  const pending = new Map<string, CacheRevalidationCoordinator>();
  globalState[PENDING_CACHE_REVALIDATIONS] = pending;
  return pending;
}

export function hasPendingCacheRevalidation(cacheKey: string): boolean {
  return getPendingCacheRevalidations().has(cacheKey);
}

/** Run one foreground fill and supersede any older background refresh. */
export function runForegroundCacheRevalidation<T>(
  cacheKey: string,
  refresh: (lease: CacheRevalidationLease) => Promise<T>,
): Promise<T> {
  const pending = getPendingCacheRevalidations();
  const existing = pending.get(cacheKey);
  if (existing?.current.active && !existing.current.background) {
    return existing.current.promise as Promise<T>;
  }

  const revalidation: CacheRevalidation = {
    active: true,
    background: false,
    promise: Promise.resolve(),
    writes: [],
  };
  const coordinator = existing ?? { active: 0, current: revalidation };
  coordinator.current = revalidation;
  coordinator.active += 1;
  pending.set(cacheKey, coordinator);

  let trackedRevalidation!: Promise<T>;
  trackedRevalidation = Promise.resolve()
    .then(() => refresh(createLease(coordinator, revalidation)))
    .finally(() => {
      revalidation.active = false;
      coordinator.active -= 1;
      if (coordinator.active === 0 && pending.get(cacheKey) === coordinator) {
        pending.delete(cacheKey);
      }
    });
  revalidation.promise = trackedRevalidation;
  return trackedRevalidation;
}

async function repairCurrentWrites(coordinator: CacheRevalidationCoordinator): Promise<void> {
  while (true) {
    const current = coordinator.current;
    for (const write of current.writes) {
      await write();
    }
    if (coordinator.current === current) return;
  }
}

function createLease(
  coordinator: CacheRevalidationCoordinator,
  revalidation: CacheRevalidation,
): CacheRevalidationLease {
  const isCurrent = () => coordinator.current === revalidation;
  return {
    async write(write) {
      if (!revalidation.background) {
        revalidation.writes.push(write);
      } else if (!isCurrent()) {
        return;
      }

      await write();
      if (!isCurrent()) {
        await repairCurrentWrites(coordinator);
      }
    },
  };
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
  refresh: (lease: CacheRevalidationLease) => Promise<unknown>,
  reportError: (error: unknown) => void,
): void {
  const pending = getPendingCacheRevalidations();
  if (pending.has(cacheKey)) return;

  const revalidation: CacheRevalidation = {
    active: true,
    background: true,
    promise: Promise.resolve(),
    writes: [],
  };
  const coordinator = { active: 1, current: revalidation };
  pending.set(cacheKey, coordinator);
  const trackedRevalidation = Promise.resolve()
    .then(() => refresh(createLease(coordinator, revalidation)))
    .then(() => undefined)
    .catch((error) => {
      reportError(error);
    })
    .finally(() => {
      revalidation.active = false;
      coordinator.active -= 1;
      if (coordinator.active === 0 && pending.get(cacheKey) === coordinator) {
        pending.delete(cacheKey);
      }
    });
  revalidation.promise = trackedRevalidation;
  const executionContext = getRequestExecutionContext();
  if (executionContext) {
    executionContext.waitUntil(trackedRevalidation);
  } else {
    void trackedRevalidation;
  }
}
