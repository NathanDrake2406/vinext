import type { RenderObservation } from "../server/cache-proof.js";
import {
  readCacheControlNumberField,
  readCacheControlRevalidateField,
} from "../utils/cache-control-metadata.js";

export type CacheHandlerValue = {
  lastModified: number;
  age?: number;
  cacheState?: string;
  cacheControl?: CacheControlMetadata;
  value: IncrementalCacheValue | null;
};

export type CacheControlMetadata = {
  revalidate: number | false;
  expire?: number;
  /**
   * Client-router reuse bound from the render's resolved `cacheLife`,
   * persisted so warm hits replay the producing render's claim. Independent
   * of `revalidate`/`expire`; absent means no claim was made.
   */
  stale?: number;
};

export type IncrementalCacheValue =
  | CachedFetchValue
  | CachedAppPageValue
  | CachedPagesValue
  | CachedRouteValue
  | CachedRedirectValue
  | CachedImageValue;

export type CachedFetchValue = {
  kind: "FETCH";
  data: {
    headers: Record<string, string>;
    body: string;
    url: string;
    status?: number;
  };
  tags?: string[];
  revalidate: number | false;
};

export type CachedAppPageValue = {
  kind: "APP_PAGE";
  html: string;
  rscData: ArrayBuffer | undefined;
  headers: Record<string, string | string[]> | undefined;
  postponed: string | undefined;
  renderObservation?: RenderObservation;
  status: number | undefined;
};

export type CachedPagesValue = {
  kind: "PAGES";
  html: string;
  pageData: object;
  generatedFromDataRequest?: boolean;
  headers: Record<string, string | string[]> | undefined;
  status: number | undefined;
};

export type CachedRouteValue = {
  kind: "APP_ROUTE";
  body: ArrayBuffer;
  status: number;
  headers: Record<string, string | string[]>;
};

export type CachedRedirectValue = {
  kind: "REDIRECT";
  props: object;
};

export type CachedImageValue = {
  kind: "IMAGE";
  etag: string;
  buffer: ArrayBuffer;
  extension: string;
  revalidate?: number;
};

export type CacheHandlerContext = {
  dev?: boolean;
  maxMemoryCacheSize?: number;
  revalidatedTags?: string[];
  kind?: string;
  /** Tags stored on the entry and used by invalidation checks. */
  tags?: string[];
  /** Tags used for guarding the write but not persisted on the entry. */
  softTags?: string[];
  [key: string]: unknown;
};

/**
 * Metadata supplied when a producer stores an entry.
 *
 * The tag and guard fields are part of the CacheHandler contract rather than
 * opaque implementation metadata: handlers must use them to reject writes
 * whose producer began before a matching invalidation. `softTags` participate
 * in that guard but are not persisted as entry tags.
 */
export type CacheWriteContext = CacheHandlerContext & {
  fetchCache?: boolean;
  /** Producer start timestamp used to fence writes against later invalidations. */
  guardSince?: number;
  revalidate?: number | false;
  expire?: number;
  cacheControl?: CacheControlMetadata;
  [key: string]: unknown;
};

export type CacheHandler = {
  get(key: string, ctx?: Record<string, unknown>): Promise<CacheHandlerValue | null>;
  set(key: string, data: IncrementalCacheValue | null, ctx?: CacheWriteContext): Promise<void>;
  revalidateTag(tags: string | string[], durations?: { expire?: number }): Promise<void>;
  resetRequestCache?(): void;
  /**
   * Max invalidation marker timestamp across the given (encoded) tags, or 0
   * when none. Shared backends should read a shared marker here because this
   * method decides whether post-invalidation callers may join older work.
   */
  getInvalidationVersion?(tags: readonly string[]): Promise<number>;
};

type VersionedCacheHandler = CacheHandler & {
  getInvalidationVersion(tags: readonly string[]): Promise<number>;
};

export class NoOpCacheHandler implements VersionedCacheHandler {
  async get(_key: string, _ctx?: Record<string, unknown>): Promise<CacheHandlerValue | null> {
    return null;
  }

  async set(
    _key: string,
    _data: IncrementalCacheValue | null,
    _ctx?: CacheWriteContext,
  ): Promise<void> {}

  async revalidateTag(_tags: string | string[], _durations?: { expire?: number }): Promise<void> {}

  async getInvalidationVersion(_tags: readonly string[]): Promise<number> {
    return 0;
  }
}

type MemoryEntry = {
  value: IncrementalCacheValue | null;
  tags: string[];
  lastModified: number;
  invalidationGuardSince?: number;
  revalidateAt: number | null;
  expireAt: number | null;
  cacheControl?: CacheControlMetadata;
};

const DEFAULT_MEMORY_CACHE_MAX_SIZE = 50 * 1024 * 1024;
const MAX_REVALIDATED_TAG_ENTRIES = 10_000;

type MemoryCacheHandlerOptions = Pick<CacheHandlerContext, "maxMemoryCacheSize"> & {
  cacheMaxMemorySize?: number;
};

function estimateStringMapSize(map: Record<string, string | string[]> | undefined): number {
  if (!map) return 0;
  let size = 0;
  for (const [key, value] of Object.entries(map)) {
    size += key.length;
    if (Array.isArray(value)) {
      for (const item of value) size += item.length;
    } else {
      size += value.length;
    }
  }
  return size;
}

function estimateIncrementalCacheValueSize(value: IncrementalCacheValue | null): number {
  if (value === null) return 25;

  switch (value.kind) {
    case "FETCH":
      return JSON.stringify(value.data ?? "").length;
    case "PAGES":
      return (
        value.html.length +
        JSON.stringify(value.pageData ?? {}).length +
        estimateStringMapSize(value.headers)
      );
    case "APP_PAGE":
      return (
        value.html.length +
        (value.rscData?.byteLength ?? 0) +
        (value.postponed?.length ?? 0) +
        estimateStringMapSize(value.headers)
      );
    case "APP_ROUTE":
      return value.body.byteLength + estimateStringMapSize(value.headers);
    case "REDIRECT":
      return JSON.stringify(value.props ?? {}).length;
    case "IMAGE":
      return value.buffer.byteLength + value.extension.length + value.etag.length;
    default:
      return JSON.stringify(value).length;
  }
}

function resolveMemoryCacheMaxSize(options?: number | MemoryCacheHandlerOptions): number {
  if (typeof options === "number") return options;
  if (typeof options?.cacheMaxMemorySize === "number") return options.cacheMaxMemorySize;
  if (typeof options?.maxMemoryCacheSize === "number") return options.maxMemoryCacheSize;
  return DEFAULT_MEMORY_CACHE_MAX_SIZE;
}

function readStringArrayField(ctx: Record<string, unknown> | undefined, field: string): string[] {
  const value = ctx?.[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readPositiveNumberField(
  ctx: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  const value = ctx?.[field];
  return typeof value === "number" && value > 0 ? value : undefined;
}

export class MemoryCacheHandler implements VersionedCacheHandler {
  private store = new Map<string, MemoryEntry>();
  private tagRevalidatedAt = new Map<string, number>();
  /** Highest marker evicted from the bounded tag map. */
  private evictedInvalidationFloor = 0;
  private readonly maxMemoryCacheSize: number;
  private currentMemoryCacheSize = 0;

  constructor(options?: number | MemoryCacheHandlerOptions) {
    this.maxMemoryCacheSize = resolveMemoryCacheMaxSize(options);
  }

  private estimateEntrySize(entry: MemoryEntry): number {
    return (
      estimateIncrementalCacheValueSize(entry.value) +
      entry.tags.reduce((sum, tag) => sum + tag.length, 0) +
      64
    );
  }

  private deleteEntry(key: string): void {
    const existing = this.store.get(key);
    if (!existing) return;
    this.currentMemoryCacheSize -= this.estimateEntrySize(existing);
    this.store.delete(key);
  }

  private touchEntry(key: string, entry: MemoryEntry): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictLeastRecentlyUsed(): void {
    while (this.maxMemoryCacheSize > 0 && this.currentMemoryCacheSize > this.maxMemoryCacheSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) return;
      this.deleteEntry(oldestKey);
    }
  }

  async get(key: string, ctx?: Record<string, unknown>): Promise<CacheHandlerValue | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    const invalidationBaseline = entry.invalidationGuardSince ?? entry.lastModified;
    if (this.evictedInvalidationFloor >= invalidationBaseline) {
      this.deleteEntry(key);
      return null;
    }

    for (const tag of entry.tags) {
      const revalidatedAt = this.tagRevalidatedAt.get(tag);
      if (revalidatedAt && revalidatedAt >= invalidationBaseline) {
        this.deleteEntry(key);
        return null;
      }
    }

    for (const tag of readStringArrayField(ctx, "softTags")) {
      const revalidatedAt = this.tagRevalidatedAt.get(tag);
      if (revalidatedAt && revalidatedAt >= invalidationBaseline) {
        return null;
      }
    }

    this.touchEntry(key, entry);

    const now = Date.now();
    if (entry.expireAt !== null && now > entry.expireAt) {
      return {
        lastModified: entry.lastModified,
        value: entry.value,
        cacheState: "expired",
        cacheControl: entry.cacheControl,
      };
    }

    const requestedRevalidate = readPositiveNumberField(ctx, "revalidate");
    const requestedRevalidateAt =
      requestedRevalidate === undefined ? null : entry.lastModified + requestedRevalidate * 1000;
    const isStale =
      (entry.revalidateAt !== null && now > entry.revalidateAt) ||
      (requestedRevalidateAt !== null && now > requestedRevalidateAt);

    if (isStale) {
      return {
        lastModified: entry.lastModified,
        value: entry.value,
        cacheState: "stale",
        cacheControl: entry.cacheControl,
      };
    }

    return {
      lastModified: entry.lastModified,
      value: entry.value,
      cacheControl: entry.cacheControl,
    };
  }

  async set(
    key: string,
    data: IncrementalCacheValue | null,
    ctx?: CacheWriteContext,
  ): Promise<void> {
    const tagSet = new Set<string>();
    if (data && "tags" in data && Array.isArray(data.tags)) {
      for (const tag of data.tags) tagSet.add(tag);
    }
    for (const tag of readStringArrayField(ctx, "tags")) {
      tagSet.add(tag);
    }
    const tags = [...tagSet];

    let effectiveRevalidate = readCacheControlRevalidateField(ctx);
    const effectiveExpire = readCacheControlNumberField(ctx, "expire");
    const effectiveStale = readCacheControlNumberField(ctx, "stale");
    if (data && "revalidate" in data && typeof data.revalidate === "number") {
      effectiveRevalidate = data.revalidate;
    } else if (data && "revalidate" in data && data.revalidate === false) {
      // Preserve a non-expiring value when no context policy was supplied,
      // but never let it override an explicit `ctx.revalidate: 0` no-store.
      effectiveRevalidate ??= false;
    }
    if (effectiveRevalidate === 0) return;

    const now = Date.now();
    const revalidateAt =
      typeof effectiveRevalidate === "number" && effectiveRevalidate > 0
        ? now + effectiveRevalidate * 1000
        : null;
    const expireAt =
      typeof effectiveExpire === "number" && effectiveExpire > 0
        ? now + effectiveExpire * 1000
        : null;
    // Absent fields stay absent rather than becoming explicit `undefined`, so a
    // round trip through a serializing cache adapter cannot turn "no claim"
    // into a key that later reads as present.
    const cacheControl: CacheControlMetadata | undefined =
      typeof effectiveRevalidate === "number" || effectiveRevalidate === false
        ? {
            revalidate: effectiveRevalidate,
            ...(effectiveExpire === undefined ? {} : { expire: effectiveExpire }),
            ...(effectiveStale === undefined ? {} : { stale: effectiveStale }),
          }
        : undefined;

    if (this.maxMemoryCacheSize === 0) return;

    // Stale-write guard: refuse the write when an invalidation marker for the
    // entry's tags (context tags plus guard-only soft tags) is newer than the
    // producer's start. The check and the store mutation run in the same
    // synchronous block, so the decision is atomic within this isolate.
    const guardSince = readPositiveNumberField(ctx, "guardSince");
    if (guardSince !== undefined) {
      if (this.evictedInvalidationFloor >= guardSince) return;
      for (const tag of [...tags, ...readStringArrayField(ctx, "softTags")]) {
        const revalidatedAt = this.tagRevalidatedAt.get(tag);
        if (revalidatedAt !== undefined && revalidatedAt >= guardSince) return;
      }
    }

    const entry = {
      value: data,
      tags,
      lastModified: now,
      invalidationGuardSince: guardSince,
      revalidateAt,
      expireAt,
      cacheControl,
    };
    const entrySize = this.estimateEntrySize(entry);
    if (entrySize > this.maxMemoryCacheSize) {
      this.deleteEntry(key);
      return;
    }

    this.deleteEntry(key);
    this.store.set(key, entry);
    this.currentMemoryCacheSize += entrySize;
    this.evictLeastRecentlyUsed();
  }

  async revalidateTag(tags: string | string[]): Promise<void> {
    const tagList = Array.isArray(tags) ? tags : [tags];
    const now = Date.now();
    for (const tag of tagList) {
      this.tagRevalidatedAt.set(tag, now);
      while (this.tagRevalidatedAt.size > MAX_REVALIDATED_TAG_ENTRIES) {
        const oldest = this.tagRevalidatedAt.keys().next().value;
        if (oldest === undefined) break;
        const evicted = this.tagRevalidatedAt.get(oldest);
        if (evicted !== undefined) {
          this.evictedInvalidationFloor = Math.max(this.evictedInvalidationFloor, evicted);
        }
        this.tagRevalidatedAt.delete(oldest);
      }
    }
  }

  async getInvalidationVersion(tags: readonly string[]): Promise<number> {
    let version = this.evictedInvalidationFloor;
    for (const tag of tags) {
      const revalidatedAt = this.tagRevalidatedAt.get(tag);
      if (revalidatedAt !== undefined && revalidatedAt > version) version = revalidatedAt;
    }
    return version;
  }

  resetRequestCache(): void {}
}

const HANDLER_KEY = Symbol.for("vinext.cacheHandler");
const globalHandlers = globalThis as unknown as Record<PropertyKey, VersionedCacheHandler>;

/**
 * Preserve the previously supported Next.js CacheHandler shape while adding
 * same-process invalidation fencing for adapters that predate
 * `getInvalidationVersion`. New handlers should implement the method so they
 * can source versions from shared storage when their backend supports it.
 */
class LegacyFencedCacheHandler implements VersionedCacheHandler {
  private readonly tagInvalidations = new Map<string, { version: number; pending: Set<symbol> }>();
  /**
   * Highest marker evicted from the bounded per-tag map. Treating this floor
   * as relevant to every tag can cause an extra regeneration, but never lets
   * an older producer through after its precise marker has been discarded.
   */
  private evictedInvalidationFloor = 0;

  constructor(private readonly delegate: CacheHandler) {}

  get(key: string, ctx?: Record<string, unknown>): Promise<CacheHandlerValue | null> {
    return this.delegate.get(key, ctx);
  }

  async set(
    key: string,
    data: IncrementalCacheValue | null,
    ctx?: CacheWriteContext,
  ): Promise<void> {
    const guardSince = readPositiveNumberField(ctx, "guardSince");
    const guardedTags = new Set<string>();
    if (guardSince !== undefined) {
      if (this.evictedInvalidationFloor >= guardSince) return;
      for (const tag of readStringArrayField(ctx, "tags")) guardedTags.add(tag);
      for (const tag of readStringArrayField(ctx, "softTags")) guardedTags.add(tag);
      if (data && "tags" in data && Array.isArray(data.tags)) {
        for (const tag of data.tags) guardedTags.add(tag);
      }
      for (const tag of guardedTags) {
        const invalidation = this.tagInvalidations.get(tag);
        if (
          invalidation !== undefined &&
          (invalidation.pending.size > 0 || invalidation.version >= guardSince)
        ) {
          return;
        }
      }
    }
    await this.delegate.set(key, data, ctx);

    // A legacy delegate may yield between accepting the write and committing
    // it. If an invalidation completed in that window, repeat it after the
    // write so the late entry cannot restore stale data.
    if (guardSince !== undefined) {
      const invalidatedDuringWrite =
        this.evictedInvalidationFloor >= guardSince
          ? [...guardedTags]
          : [...guardedTags].filter((tag) => {
              const invalidation = this.tagInvalidations.get(tag);
              return (
                invalidation !== undefined &&
                (invalidation.pending.size > 0 || invalidation.version >= guardSince)
              );
            });
      if (invalidatedDuringWrite.length > 0) {
        await this.delegate.revalidateTag(invalidatedDuringWrite);
      }
    }
  }

  async revalidateTag(tags: string | string[], durations?: { expire?: number }): Promise<void> {
    const tagList = [...new Set(Array.isArray(tags) ? tags : [tags])];
    const token = Symbol();
    for (const tag of tagList) {
      const invalidation = this.tagInvalidations.get(tag) ?? {
        version: 0,
        pending: new Set<symbol>(),
      };
      invalidation.pending.add(token);
      this.tagInvalidations.set(tag, invalidation);
    }

    try {
      await this.delegate.revalidateTag(tags, durations);
      const completedAt = Date.now();
      for (const tag of tagList) {
        const invalidation = this.tagInvalidations.get(tag);
        if (invalidation === undefined) continue;
        invalidation.pending.delete(token);
        invalidation.version = Math.max(invalidation.version, completedAt);
      }
      while (this.tagInvalidations.size > MAX_REVALIDATED_TAG_ENTRIES) {
        let oldestTag: string | undefined;
        for (const [tag, invalidation] of this.tagInvalidations) {
          if (invalidation.pending.size > 0) continue;
          oldestTag = tag;
          break;
        }
        if (oldestTag === undefined) break;
        const evicted = this.tagInvalidations.get(oldestTag);
        if (evicted !== undefined) {
          this.evictedInvalidationFloor = Math.max(this.evictedInvalidationFloor, evicted.version);
        }
        this.tagInvalidations.delete(oldestTag);
      }
    } catch (error) {
      for (const tag of tagList) {
        const invalidation = this.tagInvalidations.get(tag);
        if (invalidation === undefined) continue;
        invalidation.pending.delete(token);
        if (invalidation.pending.size === 0 && invalidation.version === 0) {
          this.tagInvalidations.delete(tag);
        }
      }
      throw error;
    }
  }

  resetRequestCache(): void {
    this.delegate.resetRequestCache?.();
  }

  async getInvalidationVersion(tags: readonly string[]): Promise<number> {
    let version = this.evictedInvalidationFloor;
    for (const tag of tags) {
      const invalidation = this.tagInvalidations.get(tag);
      if (invalidation?.pending.size) return Number.POSITIVE_INFINITY;
      if (invalidation !== undefined && invalidation.version > version) {
        version = invalidation.version;
      }
    }
    return version;
  }
}

function getActiveHandler(): VersionedCacheHandler {
  return globalHandlers[HANDLER_KEY] ?? (globalHandlers[HANDLER_KEY] = new MemoryCacheHandler());
}

export function configureMemoryCacheHandler(options?: MemoryCacheHandlerOptions): void {
  const current = globalHandlers[HANDLER_KEY];
  if (current && !(current instanceof MemoryCacheHandler)) return;
  globalHandlers[HANDLER_KEY] = new MemoryCacheHandler(options);
}

function hasInvalidationVersion(handler: CacheHandler): handler is VersionedCacheHandler {
  return typeof handler.getInvalidationVersion === "function";
}

export function setDataCacheHandler(handler: CacheHandler): void {
  globalHandlers[HANDLER_KEY] = hasInvalidationVersion(handler)
    ? handler
    : new LegacyFencedCacheHandler(handler);
}

export function getDataCacheHandler(): VersionedCacheHandler {
  return getActiveHandler();
}

export function setCacheHandler(handler: CacheHandler): void {
  setDataCacheHandler(handler);
}

export function getCacheHandler(): VersionedCacheHandler {
  return getDataCacheHandler();
}

/**
 * Whether an in-flight producer that began at `startTime` must not be joined
 * by a post-invalidation caller: true when any invalidation marker for its
 * tags landed since it started. Tag-aware, so an unrelated invalidation never
 * disqualifies a producer. Tagless producers are never stale (nothing can
 * invalidate them by tag) and untagged callers join unconditionally; the
 * write-side `set` guard remains the correctness gate either way.
 */
export async function isProducerStaleSince(
  startTime: number,
  tags: readonly string[],
): Promise<boolean> {
  if (tags.length === 0) return false;
  const handler = getDataCacheHandler();
  return (await handler.getInvalidationVersion([...tags])) >= startTime;
}
