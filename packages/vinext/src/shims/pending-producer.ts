import { isProducerStaleSince } from "./cache-handler.js";

/** The shared state needed to decide whether an in-flight producer is joinable. */
export type PendingProducer<T> = {
  startTime: number;
  tags: readonly string[];
  promise: Promise<T>;
};

/**
 * Return the current producer when it is still safe to join, or remove stale
 * producers until the key is empty or a fresh producer is observed.
 *
 * The identity check is part of the helper's contract: an invalidation check
 * yields, so another caller may replace the entry while it is in flight. A
 * stale caller must never delete that newer producer.
 */
export async function getJoinableProducer<T>(
  pending: Map<string, PendingProducer<T>>,
  key: string,
): Promise<PendingProducer<T> | undefined> {
  while (true) {
    const producer = pending.get(key);
    if (producer === undefined) return undefined;
    if (!(await isProducerStaleSince(producer.startTime, producer.tags))) return producer;
    if (pending.get(key) !== producer) continue;
    pending.delete(key);
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
