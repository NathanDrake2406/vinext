// Route-graph-derived BFCache segment identity (cloudflare/vinext#1790).
//
// BFCache id mint/restore/preserve and the React Activity state-key map both
// turn on one question: are two renders of the same wire element the *same*
// logical segment instance, or a different one that must re-mint? That equality
// relation is the contract this module owns.
//
// Identity is composed from route-graph semantic facts rather than reverse-
// engineered from wire-key strings + pathname segment counting:
//
//   - graphVersion        — the route graph generation that produced the render;
//                           a deploy that changes it re-mints, matching the
//                           document-scoped BFCache invalidation on reload
//   - graphId             — the segment's stable semantic id (page/layout/...)
//   - boundSegmentKey     — canonical param binding (the resolveAppPageRouteStateKey
//                           family already used for React reset keys), so /p/1 and
//                           /p/2 differ and route groups / catch-all / optional
//                           catch-all are canonicalised one way across both systems
//   - per-kind facts      — slot state, owner layout, active/intercepted target
//
// The descriptor is a typed, inspectable contract: each variant names exactly
// which facts participate in identity, so a new participating fact is a type
// change, not a silent string-format tweak. deriveBfcacheSegmentIdentity is the
// single pure, deterministic producer of the equality relation; the wire-payload
// emit and the app-browser-state consumers assemble descriptors and compare its
// output, never re-deriving identity inline.

type ParallelSlotBindingState = "active" | "default" | "unmatched";

export type BfcacheSegmentDescriptor =
  | {
      kind: "page";
      graphVersion: string | null;
      graphId: string;
      rootBoundaryId: string | null;
      boundSegmentKey: string;
    }
  | {
      kind: "layout";
      graphVersion: string | null;
      graphId: string;
      rootBoundaryId: string | null;
      boundSegmentKey: string;
    }
  | {
      kind: "template";
      graphVersion: string | null;
      graphId: string;
      rootBoundaryId: string | null;
      ownerLayoutId: string | null;
      boundSegmentKey: string;
    }
  | {
      kind: "slot";
      graphVersion: string | null;
      graphId: string;
      slotId: string;
      ownerLayoutId: string | null;
      state: ParallelSlotBindingState;
      activeRouteId: string | null;
      interceptionTargetRouteId: string | null;
      boundSegmentKey: string;
    }
  | {
      kind: "default";
      graphVersion: string | null;
      graphId: string;
      slotId: string;
      ownerLayoutId: string | null;
    };

// Deterministic, collision-resistant encoding. The leading kind tag plus a
// fixed field order means the string is stable regardless of object key order,
// and JSON.stringify of the ordered tuple keeps embedded separators (`|`, `@`,
// `:`) inside their fields as data instead of structural delimiters.
export function deriveBfcacheSegmentIdentity(descriptor: BfcacheSegmentDescriptor): string {
  switch (descriptor.kind) {
    case "page":
      return JSON.stringify([
        "page",
        descriptor.graphVersion,
        descriptor.graphId,
        descriptor.rootBoundaryId,
        descriptor.boundSegmentKey,
      ]);
    case "layout":
      return JSON.stringify([
        "layout",
        descriptor.graphVersion,
        descriptor.graphId,
        descriptor.rootBoundaryId,
        descriptor.boundSegmentKey,
      ]);
    case "template":
      return JSON.stringify([
        "template",
        descriptor.graphVersion,
        descriptor.graphId,
        descriptor.rootBoundaryId,
        descriptor.ownerLayoutId,
        descriptor.boundSegmentKey,
      ]);
    case "slot":
      return JSON.stringify([
        "slot",
        descriptor.graphVersion,
        descriptor.graphId,
        descriptor.slotId,
        descriptor.ownerLayoutId,
        descriptor.state,
        descriptor.activeRouteId,
        descriptor.interceptionTargetRouteId,
        descriptor.boundSegmentKey,
      ]);
    case "default":
      return JSON.stringify([
        "default",
        descriptor.graphVersion,
        descriptor.graphId,
        descriptor.slotId,
        descriptor.ownerLayoutId,
      ]);
  }
}
