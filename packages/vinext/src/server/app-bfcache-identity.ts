import { AppElementsWire, type AppElements, type AppElementsSlotBinding } from "./app-elements.js";
import { INITIAL_BFCACHE_ID } from "./app-bfcache-id.js";
import { isBfcacheSegmentId, type BfcacheIdMap } from "./app-history-state.js";
import { deriveBfcacheSegmentIdentity } from "./bfcache-identity.js";

export type BfcacheStateKeyMap = Readonly<Record<string, string>>;

export type InitialBfcacheMaps = Readonly<{
  bfcacheIds: BfcacheIdMap;
  stateKeys: BfcacheStateKeyMap;
}>;

// Monotonic within a single browser document. Full reloads reset the counter,
// while the document-scoped version gate prevents old history ids from
// colliding with freshly minted ids.
let nextBfcacheId = 0;

function rememberBfcacheId(value: string): void {
  // The hydration sentinel is the raw "0" value and intentionally does not
  // advance the counter; fresh ids start at "_b_1_".
  const match = /^_b_(\d+)_$/.exec(value);
  if (!match) return;
  nextBfcacheId = Math.max(nextBfcacheId, Number(match[1]));
}

function mintBfcacheId(): string {
  nextBfcacheId += 1;
  return `_b_${nextBfcacheId}_`;
}

type AppElementsMetadata = ReturnType<typeof AppElementsWire.readMetadata>;

/**
 * Metadata parsed once per element map, with an index that keeps per-slot
 * identity lookup O(1) rather than scanning every binding for every slot.
 */
type ParsedAppElementsMetadata = {
  metadata: AppElementsMetadata;
  slotBindingsBySlotId: ReadonlyMap<string, AppElementsSlotBinding>;
};

function indexAppElementsMetadata(metadata: AppElementsMetadata): ParsedAppElementsMetadata {
  const slotBindingsBySlotId = new Map<string, AppElementsSlotBinding>();
  for (const binding of metadata.slotBindings) {
    slotBindingsBySlotId.set(binding.slotId, binding);
  }
  return { metadata, slotBindingsBySlotId };
}

function readAppElementsMetadata(elements: AppElements): ParsedAppElementsMetadata | null {
  let metadata: AppElementsMetadata;
  try {
    metadata = AppElementsWire.readMetadata(elements);
  } catch {
    // Some low-level tests pass partial element maps without metadata.
    return null;
  }
  return indexAppElementsMetadata(metadata);
}

/**
 * Derive a BFCache segment identity from route-graph facts: the segment's
 * semantic wire id, the carried canonical bound-segment key (__segmentStateKeys),
 * the route graph version, and per-kind facts such as slot state.
 */
function createBfcacheSegmentIdentity(
  id: string,
  options: { metadata: ParsedAppElementsMetadata | null },
): string | null {
  const parsed = AppElementsWire.parseElementKey(id);
  if (!parsed || parsed.kind === "route") return null;

  const metadata = options.metadata?.metadata;
  const graphVersion = metadata?.artifactCompatibility.graphVersion ?? null;
  const rootBoundaryId = metadata?.rootLayoutTreePath ?? null;
  const boundSegmentKey = metadata?.segmentStateKeys[id] ?? "";

  if (parsed.kind === "page") {
    return deriveBfcacheSegmentIdentity({
      kind: "page",
      graphVersion,
      graphId: id,
      rootBoundaryId,
      boundSegmentKey,
    });
  }

  if (parsed.kind === "slot") {
    const binding = options.metadata?.slotBindingsBySlotId.get(id) ?? null;
    const interception = metadata?.interception ?? null;
    return deriveBfcacheSegmentIdentity({
      kind: "slot",
      graphVersion,
      graphId: id,
      slotId: id,
      ownerLayoutId: binding?.ownerLayoutId ?? null,
      state: binding?.state ?? "active",
      activeRouteId: binding?.activeRouteId ?? null,
      interceptionTargetRouteId: interception?.slotId === id ? interception.targetRouteId : null,
      boundSegmentKey,
    });
  }

  if (parsed.kind === "layout") {
    return deriveBfcacheSegmentIdentity({
      kind: "layout",
      graphVersion,
      graphId: id,
      rootBoundaryId,
      boundSegmentKey,
    });
  }

  if (parsed.kind === "template") {
    return deriveBfcacheSegmentIdentity({
      kind: "template",
      graphVersion,
      graphId: id,
      rootBoundaryId,
      ownerLayoutId: null,
      boundSegmentKey,
    });
  }

  return null;
}

function collectBfcacheSegmentIds(
  elements: AppElements,
  metadata?: ParsedAppElementsMetadata | null,
): string[] {
  const ids = new Set(Object.keys(elements));
  const parsedMetadata = metadata === undefined ? readAppElementsMetadata(elements) : metadata;
  for (const layoutId of parsedMetadata?.metadata.layoutIds ?? []) {
    ids.add(layoutId);
  }
  return Array.from(ids).filter(isBfcacheSegmentId);
}

export function createInitialBfcacheIdMap(elements: AppElements): BfcacheIdMap {
  const bfcacheIds: Record<string, string> = {};
  for (const id of collectBfcacheSegmentIds(elements)) {
    bfcacheIds[id] = INITIAL_BFCACHE_ID;
  }
  return bfcacheIds;
}

export function createBfcacheSegmentStateKeyMap(options: {
  elements: AppElements;
}): BfcacheStateKeyMap {
  const metadata = readAppElementsMetadata(options.elements);
  const stateKeys: Record<string, string> = {};
  for (const id of collectBfcacheSegmentIds(options.elements, metadata)) {
    const stateKey = createBfcacheSegmentIdentity(id, { metadata });
    if (stateKey !== null) stateKeys[id] = stateKey;
  }
  return stateKeys;
}

export function createInitialBfcacheMaps(options: {
  elements: AppElements;
  metadata: AppElementsMetadata;
}): InitialBfcacheMaps {
  const metadata = indexAppElementsMetadata(options.metadata);
  const bfcacheIds: Record<string, string> = {};
  const stateKeys: Record<string, string> = {};

  for (const id of collectBfcacheSegmentIds(options.elements, metadata)) {
    bfcacheIds[id] = INITIAL_BFCACHE_ID;
    const stateKey = createBfcacheSegmentIdentity(id, { metadata });
    if (stateKey !== null) stateKeys[id] = stateKey;
  }

  return { bfcacheIds, stateKeys };
}

export function createNextBfcacheIdMap(options: {
  current: BfcacheIdMap;
  currentElements: AppElements;
  elements: AppElements;
  restored?: BfcacheIdMap | null;
  reuseCurrent?: boolean;
}): BfcacheIdMap {
  const current = options.reuseCurrent === false ? {} : options.current;
  for (const value of Object.values(current)) rememberBfcacheId(value);
  for (const value of Object.values(options.restored ?? {})) rememberBfcacheId(value);

  const currentMetadata = readAppElementsMetadata(options.currentElements);
  const nextMetadata = readAppElementsMetadata(options.elements);
  const ids: Record<string, string> = {};
  for (const id of collectBfcacheSegmentIds(options.elements, nextMetadata)) {
    const currentIdentity = createBfcacheSegmentIdentity(id, { metadata: currentMetadata });
    const nextIdentity = createBfcacheSegmentIdentity(id, { metadata: nextMetadata });
    const currentValue = currentIdentity === nextIdentity ? current[id] : undefined;
    // History restoration wins, then identity-compatible reuse, then a fresh
    // id. Redirected traversals must clear stale restored ids before this call.
    const value = options.restored?.[id] ?? currentValue ?? mintBfcacheId();
    ids[id] = value;
    rememberBfcacheId(value);
  }

  return ids;
}

export function preserveBfcacheIdsForMergedElements(options: {
  elements: AppElements;
  next: BfcacheIdMap;
  previous: BfcacheIdMap;
}): BfcacheIdMap {
  const ids: Record<string, string> = {};
  for (const id of collectBfcacheSegmentIds(options.elements)) {
    const value = options.next[id] ?? options.previous[id];
    if (value === undefined) continue;
    ids[id] = value;
    // Keep future mints ahead of ids restored by reducer-level preservation.
    rememberBfcacheId(value);
  }

  return ids;
}
