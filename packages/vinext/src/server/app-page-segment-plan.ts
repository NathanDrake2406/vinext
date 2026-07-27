import {
  AppElementsWire,
  type AppElementsInterception,
  type AppElementsSlotBinding,
} from "./app-elements.js";
import type { AppPageParams } from "./app-page-boundary.js";
import type {
  AppPageErrorModule,
  AppPageLayoutEntry,
  AppPageModule,
  AppPageRouteWiringRoute,
  AppPageRouteWiringSlot,
  AppPageSlotOverride,
  AppPageTemplateEntry,
} from "./app-page-route-wiring.js";
import {
  resolveAppPageRouteStateKey,
  resolveAppPageSemanticSegmentStateKey,
  resolveAppPageTemplateStateKey,
  type AppPageSemanticSegment,
} from "./app-page-segment-state.js";
import {
  createNestedBfcacheSlotSegmentId,
  deriveBfcacheSegmentIdentity,
} from "./bfcache-identity.js";

type AppPageSlotSegmentPlan<TModule extends AppPageModule> = Readonly<{
  branchSegments: readonly string[];
  includedInPayload: boolean;
  key: string;
  nestedBfcacheSegments: readonly Readonly<{
    id: string;
    stateKey: string;
    treePosition: number | null;
  }>[];
  ownerTreePosition: number;
  params: AppPageParams;
  resetKey: string;
  routeSegments: readonly string[];
  slot: AppPageRouteWiringSlot<TModule>;
  slotId: string;
  slotOverride: AppPageSlotOverride<TModule> | undefined;
  targetIndex: number;
}>;

export type AppPageSegmentPlan<TModule extends AppPageModule> = Readonly<{
  bfcacheSegmentIdentities: Readonly<Record<string, string>>;
  routeResetKey: string;
  slots: readonly AppPageSlotSegmentPlan<TModule>[];
}>;

function requireGraphSequenceId(
  ids: readonly string[],
  index: number,
  kind: "layout" | "template",
): string {
  const id = ids[index];
  if (id === undefined) {
    throw new Error(`[vinext] Missing App Router graph ${kind} id at index ${index}`);
  }
  return id;
}

/**
 * Serialise the resolved route/render model into the BFCache identities and
 * per-slot reset keys the browser treats as opaque. Route matching owns the
 * semantics — which segment intercepts, which params bind it — so this layer
 * only binds keys and derives identities from graph ids.
 */
export function createAppPageSegmentPlan<
  TModule extends AppPageModule,
  TErrorModule extends AppPageErrorModule,
>(options: {
  includeSlot: (ownerTreePosition: number, targetTreePosition: number) => boolean;
  interception: AppElementsInterception | null;
  layoutEntries: readonly AppPageLayoutEntry<TModule, TErrorModule>[];
  matchedParams: AppPageParams;
  pageElementId: string;
  resolveSlotOverride: (
    slotKey: string,
    slotName: string,
  ) => AppPageSlotOverride<TModule> | undefined;
  rootLayoutTreePath: string | null;
  route: AppPageRouteWiringRoute<TModule, TErrorModule>;
  routeSegments: readonly string[];
  semanticPageIdentity:
    | Readonly<{
        boundSegmentKey: string;
        interceptionGraphId: string;
        sourceBoundSegmentKey: string;
        sourceRouteGraphId: string;
      }>
    | null
    | undefined;
  semanticInterceptionTargetRouteId: string | null;
  slotBindings: readonly AppElementsSlotBinding[];
  templateEntries: readonly AppPageTemplateEntry<TModule>[];
}): AppPageSegmentPlan<TModule> {
  const identities: Record<string, string> = {};
  const graphIds = options.route.ids;
  const rootBoundaryId = graphIds ? graphIds.rootBoundary : options.rootLayoutTreePath;
  const routeResetKey = resolveAppPageRouteStateKey(options.routeSegments, options.matchedParams);

  for (const [index, layoutEntry] of options.layoutEntries.entries()) {
    identities[layoutEntry.id] = deriveBfcacheSegmentIdentity({
      boundSegmentKey: resolveAppPageRouteStateKey(
        options.routeSegments.slice(0, layoutEntry.treePosition),
        options.matchedParams,
      ),
      graphId: graphIds
        ? requireGraphSequenceId(graphIds.layouts, index, "layout")
        : layoutEntry.id,
      kind: "layout",
      rootBoundaryId,
    });
  }
  for (const [index, templateEntry] of options.templateEntries.entries()) {
    identities[templateEntry.id] = deriveBfcacheSegmentIdentity({
      boundSegmentKey: resolveAppPageTemplateStateKey(
        options.routeSegments,
        templateEntry.treePosition,
        options.matchedParams,
      ),
      graphId: graphIds
        ? requireGraphSequenceId(graphIds.templates, index, "template")
        : templateEntry.id,
      kind: "template",
      rootBoundaryId,
    });
  }

  const slotBindingsById = new Map(
    options.slotBindings.map((binding) => [binding.slotId, binding]),
  );
  const resolveOwnerLayoutGraphId = (ownerLayoutId: string | null): string | null => {
    if (ownerLayoutId === null || !graphIds) return ownerLayoutId;
    const ownerLayoutIndex = options.layoutEntries.findIndex(
      (layoutEntry) => layoutEntry.id === ownerLayoutId,
    );
    if (ownerLayoutIndex < 0) {
      throw new Error(`[vinext] Missing App Router owner layout for ${ownerLayoutId}`);
    }
    return requireGraphSequenceId(graphIds.layouts, ownerLayoutIndex, "layout");
  };
  const deriveSlotIdentity = (
    slotGraphId: string,
    slotId: string,
    slotBinding: AppElementsSlotBinding,
    boundSegmentKey: string,
    includeInterceptionTarget = true,
  ): string | null => {
    const isIntercepted = includeInterceptionTarget && options.interception?.slotId === slotId;
    const interceptionTargetRouteGraphId = isIntercepted
      ? graphIds
        ? options.semanticInterceptionTargetRouteId
        : (slotBinding.activeRouteId ?? options.interception?.targetRouteId ?? null)
      : null;
    // A graph-owned intercepted identity without a semantic target is
    // incomplete. Omit its proof so the browser remints conservatively rather
    // than falling back to the transport route id.
    if (isIntercepted && graphIds && interceptionTargetRouteGraphId === null) {
      return null;
    }
    return deriveBfcacheSegmentIdentity({
      activeRouteGraphId:
        slotBinding.state !== "active"
          ? null
          : isIntercepted
            ? interceptionTargetRouteGraphId
            : null,
      boundSegmentKey,
      interceptionTargetRouteGraphId,
      kind: "slot",
      ownerLayoutGraphId: resolveOwnerLayoutGraphId(slotBinding.ownerLayoutId),
      slotGraphId,
      state: slotBinding.state,
    });
  };

  const pageBinding = options.route.childrenSlot
    ? slotBindingsById.get(options.pageElementId)
    : undefined;
  if (options.route.childrenSlot && !pageBinding) {
    throw new Error(`[vinext] Missing App Router slot binding for ${options.pageElementId}`);
  }
  if (options.semanticPageIdentity !== undefined) {
    if (options.semanticPageIdentity !== null) {
      identities[options.pageElementId] = deriveBfcacheSegmentIdentity({
        boundSegmentKey: options.semanticPageIdentity.boundSegmentKey,
        interceptionGraphId: options.semanticPageIdentity.interceptionGraphId,
        kind: "sibling-interception",
        rootBoundaryId,
        sourceBoundSegmentKey: options.semanticPageIdentity.sourceBoundSegmentKey,
        sourceRouteGraphId: options.semanticPageIdentity.sourceRouteGraphId,
      });
    }
  } else if (pageBinding) {
    const identity = deriveSlotIdentity(
      options.route.childrenSlot!.id,
      options.pageElementId,
      pageBinding,
      routeResetKey,
    );
    if (identity !== null) identities[options.pageElementId] = identity;
  } else {
    // Layout-only routes still emit a page carrier for their parallel-slot
    // content. The route is the graph-owned identity for that synthetic leaf.
    const pageGraphId = graphIds ? (graphIds.page ?? graphIds.route) : options.pageElementId;
    identities[options.pageElementId] = deriveBfcacheSegmentIdentity({
      boundSegmentKey: routeResetKey,
      graphId: pageGraphId,
      kind: "page",
      rootBoundaryId,
    });
  }

  const slots = Object.entries(options.route.slots ?? {}).map(([slotKey, slot]) => {
    const targetIndex = slot.layoutIndex >= 0 ? slot.layoutIndex : options.layoutEntries.length - 1;
    const targetTreePosition = options.layoutEntries[targetIndex]?.treePosition ?? 0;
    const ownerTreePosition = slot.ownerTreePosition ?? targetTreePosition;
    const treePath = options.layoutEntries[targetIndex]?.treePath ?? "/";
    const slotId = AppElementsWire.encodeSlotId(slot.name, treePath);
    const slotBinding = slotBindingsById.get(slotId);
    if (!slotBinding) {
      throw new Error(`[vinext] Missing App Router slot binding for ${slotId}`);
    }
    const slotOverride = options.resolveSlotOverride(slotKey, slot.name);
    const params = slotOverride?.params ?? options.matchedParams;
    const routeSegments = slotOverride?.routeSegments ?? slot.routeSegments ?? [];
    const branchSegments = slotOverride?.branchSegments ?? routeSegments;
    const resetKey = resolveAppPageRouteStateKey(routeSegments, params);
    const ownerStateKey = resolveAppPageRouteStateKey(
      options.routeSegments.slice(0, ownerTreePosition),
      options.matchedParams,
    );
    const bindOwnerState = (segmentKey: string) =>
      ownerStateKey ? JSON.stringify([ownerStateKey, segmentKey]) : segmentKey;
    const branchSegmentPositions = branchSegments.flatMap((segment, treePosition) =>
      segment.startsWith("@") ? [] : [treePosition],
    );
    const identitySegments: readonly AppPageSemanticSegment[] =
      slotOverride?.identitySegments ??
      branchSegmentPositions.map(
        (treePosition): AppPageSemanticSegment => ({
          marker: null,
          paramSource: "slot",
          segment: branchSegments[treePosition]!,
        }),
      );
    const semanticStateKeys = identitySegments.map((semanticSegment) =>
      resolveAppPageSemanticSegmentStateKey(
        semanticSegment,
        semanticSegment.paramSource === "route" ? options.matchedParams : params,
      ),
    );
    const identitySegmentsAlignWithBranch =
      identitySegments.length === branchSegmentPositions.length;
    const semanticSegments = identitySegmentsAlignWithBranch
      ? semanticStateKeys.map((stateKey, index) => ({
          identityKey: JSON.stringify(semanticStateKeys.slice(0, index + 1)),
          stateKey,
          treePosition: branchSegmentPositions[index]!,
        }))
      : [];
    const includedInPayload = options.includeSlot(ownerTreePosition, targetTreePosition);
    const graphId = graphIds ? graphIds.slots[slotKey] : (slot.id ?? slotId);
    if (graphId === undefined) {
      throw new Error(`[vinext] Missing App Router graph slot id for ${slotKey}`);
    }
    const nestedBfcacheSegmentCandidates = identitySegmentsAlignWithBranch
      ? (semanticSegments.length > 0
          ? semanticSegments
          : [
              {
                identityKey: "",
                stateKey: slotBinding.state,
                treePosition: 0,
              },
            ]
        ).map((segment) => ({
          ...segment,
          hasIdentityProof: true,
          // Next keys each Activity level from its physical segment path. A
          // leaf target graph id would over-key every shared interception
          // ancestor when the target grows a deeper child.
          includeInterceptionTarget: false,
        }))
      : [
          {
            hasIdentityProof: false,
            identityKey: resetKey,
            includeInterceptionTarget: false,
            stateKey: resetKey || slotBinding.state,
            treePosition: null,
          },
        ];
    const nestedBfcacheSegments: {
      id: string;
      stateKey: string;
      treePosition: number | null;
    }[] = [];
    if (includedInPayload) {
      if (identitySegmentsAlignWithBranch) {
        identities[slotId] = deriveBfcacheSegmentIdentity({
          boundOwnerSegmentKey: ownerStateKey,
          kind: "slot-shell",
          ownerLayoutGraphId: resolveOwnerLayoutGraphId(slotBinding.ownerLayoutId),
          slotGraphId: graphId,
        });
      }
      for (const [level, segment] of nestedBfcacheSegmentCandidates.entries()) {
        const id = createNestedBfcacheSlotSegmentId(slotId, level + 1);
        if (segment.hasIdentityProof) {
          const nestedIdentity = deriveSlotIdentity(
            graphId,
            slotId,
            slotBinding,
            bindOwnerState(segment.identityKey),
            segment.includeInterceptionTarget,
          );
          if (nestedIdentity !== null) identities[id] = nestedIdentity;
        }
        nestedBfcacheSegments.push({
          id,
          stateKey: segment.stateKey,
          treePosition: segment.treePosition,
        });
      }
    }
    return Object.freeze({
      branchSegments,
      includedInPayload,
      key: slotKey,
      nestedBfcacheSegments: Object.freeze(nestedBfcacheSegments),
      ownerTreePosition,
      params,
      resetKey,
      routeSegments,
      slot,
      slotId,
      slotOverride,
      targetIndex,
    });
  });

  return Object.freeze({
    bfcacheSegmentIdentities: Object.freeze(identities),
    routeResetKey,
    slots: Object.freeze(slots),
  });
}
