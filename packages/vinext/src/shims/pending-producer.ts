import { isProducerStaleSince } from "./cache-handler.js";

/** The shared state needed to decide whether an in-flight producer is joinable. */
export type PendingProducer<T> = {
  startTime: number;
  tags: readonly string[];
  promise: Promise<T>;
};

const PRODUCER_RESERVATION = Symbol("vinext.pendingProducer.reservation");

type ProducerReservation<T> = PendingProducer<T> & {
  [PRODUCER_RESERVATION]: true;
  adopt(promise: Promise<T>): void;
  reject(error: unknown): void;
};

export type PendingProducerSelection<T> = {
  producer: PendingProducer<T>;
  created: boolean;
};

function createProducerReservation<T>(): ProducerReservation<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // A synchronous factory failure can leave no joiner to observe the
  // reservation. Keep its rejection handled while still forwarding it to any
  // caller that did join during a re-entrant producer factory.
  void promise.catch(() => {});
  return {
    [PRODUCER_RESERVATION]: true,
    startTime: Number.POSITIVE_INFINITY,
    tags: [],
    promise,
    adopt(producerPromise) {
      producerPromise.then(resolve, reject);
    },
    reject,
  };
}

function isProducerReservation<T>(
  producer: PendingProducer<T>,
): producer is ProducerReservation<T> {
  return PRODUCER_RESERVATION in producer;
}

/**
 * Join a current producer when it is still valid, or atomically reserve and
 * create the replacement for an empty or stale slot.
 *
 * The identity check is part of the helper's contract: an invalidation check
 * yields, so another caller may replace the entry while it is in flight. A
 * stale caller must never delete that newer producer.
 */
export async function getOrCreateJoinableProducer<T>(
  pending: Map<string, PendingProducer<T>>,
  key: string,
  createProducer: () => PendingProducer<T>,
): Promise<PendingProducerSelection<T>> {
  while (true) {
    const producer = pending.get(key);
    if (producer !== undefined) {
      if (isProducerReservation(producer)) return { producer, created: false };
      try {
        if (!(await isProducerStaleSince(producer.startTime, producer.tags))) {
          return { producer, created: false };
        }
      } catch (error) {
        // A failed version lookup cannot prove that the existing producer is
        // safe to join. Reserve its replacement just as a stale lookup does.
        console.error(
          `[vinext] cache invalidation version lookup failed for ${key}; replacing the in-flight producer:`,
          error,
        );
      }
      if (pending.get(key) !== producer) continue;
    }

    // Claim the empty/stale slot before invoking caller code. Concurrent
    // lookups join this reservation, so only its owner can install replacement
    // work after the asynchronous invalidation check.
    const reservation = createProducerReservation<T>();
    pending.set(key, reservation);
    try {
      const replacement = createProducer();
      if (pending.get(key) === reservation) pending.set(key, replacement);
      reservation.adopt(replacement.promise);
      return { producer: replacement, created: true };
    } catch (error) {
      if (pending.get(key) === reservation) pending.delete(key);
      reservation.reject(error);
      throw error;
    }
  }
}

/** Remove a producer only when the caller still owns the registry slot. */
export function deletePendingProducerIfOwned<T>(
  pending: Map<string, PendingProducer<T>>,
  key: string,
  producer: PendingProducer<T>,
): void {
  if (pending.get(key) === producer) pending.delete(key);
}
