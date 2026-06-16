import { describe, expect, it } from "vite-plus/test";
import {
  deriveBfcacheSegmentIdentity,
  type BfcacheSegmentDescriptor,
} from "../packages/vinext/src/server/bfcache-identity.js";

const pageDescriptor: Extract<BfcacheSegmentDescriptor, { kind: "page" }> = {
  kind: "page",
  graphVersion: "g1",
  graphId: "page:/p/[n]",
  rootBoundaryId: "rb1",
  boundSegmentKey: "n|1|d",
};

const layoutDescriptor: Extract<BfcacheSegmentDescriptor, { kind: "layout" }> = {
  kind: "layout",
  graphVersion: "g1",
  graphId: "layout:/p/[n]",
  rootBoundaryId: "rb1",
  boundSegmentKey: "n|1|d",
};

const templateDescriptor: Extract<BfcacheSegmentDescriptor, { kind: "template" }> = {
  kind: "template",
  graphVersion: "g1",
  graphId: "template:/p/[n]",
  rootBoundaryId: "rb1",
  ownerLayoutId: "layout:/p/[n]",
  boundSegmentKey: "n|1|d",
};

const slotDescriptor: Extract<BfcacheSegmentDescriptor, { kind: "slot" }> = {
  kind: "slot",
  graphVersion: "g1",
  graphId: "slot:modal:/dashboard",
  slotId: "slot:modal:/dashboard",
  ownerLayoutId: "layout:/dashboard",
  state: "active",
  activeRouteId: "route:/dashboard/@modal/photo/[id]",
  interceptionTargetRouteId: null,
  boundSegmentKey: "id|7|d",
};

const defaultDescriptor: Extract<BfcacheSegmentDescriptor, { kind: "default" }> = {
  kind: "default",
  graphVersion: "g1",
  graphId: "default:slot:modal:/dashboard",
  slotId: "slot:modal:/dashboard",
  ownerLayoutId: "layout:/dashboard",
};

describe("deriveBfcacheSegmentIdentity", () => {
  it("is stable for identical page facts and distinguishes bound segment keys", () => {
    expect(deriveBfcacheSegmentIdentity(pageDescriptor)).toBe(
      deriveBfcacheSegmentIdentity({ ...pageDescriptor }),
    );
    expect(deriveBfcacheSegmentIdentity(pageDescriptor)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...pageDescriptor, boundSegmentKey: "n|2|d" }),
    );
  });

  it("folds artifact-compatibility graphVersion into segment equality", () => {
    expect(deriveBfcacheSegmentIdentity(pageDescriptor)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...pageDescriptor, graphVersion: "g2" }),
    );
  });

  it("separates identities across segment kinds that share a graph id and binding", () => {
    const identities = [
      deriveBfcacheSegmentIdentity({ ...pageDescriptor, graphId: "x" }),
      deriveBfcacheSegmentIdentity({ ...layoutDescriptor, graphId: "x" }),
      deriveBfcacheSegmentIdentity({ ...templateDescriptor, graphId: "x", ownerLayoutId: null }),
    ];
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("derives layout identity from graph id and bound segment key", () => {
    expect(deriveBfcacheSegmentIdentity(layoutDescriptor)).toBe(
      deriveBfcacheSegmentIdentity({ ...layoutDescriptor }),
    );
    expect(deriveBfcacheSegmentIdentity(layoutDescriptor)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...layoutDescriptor, graphId: "layout:/p/[other]" }),
    );
  });

  it("includes owner layout in template identity so a remounted owner re-keys the template", () => {
    expect(deriveBfcacheSegmentIdentity(templateDescriptor)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...templateDescriptor, ownerLayoutId: "layout:/other" }),
    );
  });

  it("keys slot identity on state, active route, and interception target", () => {
    const base = deriveBfcacheSegmentIdentity(slotDescriptor);
    expect(base).not.toBe(deriveBfcacheSegmentIdentity({ ...slotDescriptor, state: "default" }));
    expect(base).not.toBe(
      deriveBfcacheSegmentIdentity({ ...slotDescriptor, activeRouteId: "route:/other" }),
    );
    // An intercepted modal and the hard-navigation full page render the same slot
    // graph id at the same URL; only the interception target distinguishes them.
    expect(base).not.toBe(
      deriveBfcacheSegmentIdentity({
        ...slotDescriptor,
        interceptionTargetRouteId: "route:/dashboard/photo/[id]",
      }),
    );
  });

  it("derives default-slot identity without a bound segment key", () => {
    expect(deriveBfcacheSegmentIdentity(defaultDescriptor)).toBe(
      deriveBfcacheSegmentIdentity({ ...defaultDescriptor }),
    );
    expect(deriveBfcacheSegmentIdentity(defaultDescriptor)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...defaultDescriptor, slotId: "slot:other:/dashboard" }),
    );
  });

  it("carries canonical catch-all and optional-catch-all bound keys as opaque data", () => {
    // boundSegmentKey is produced by app-page-segment-state (resolveAppPage*),
    // already canonical for catch-all (`|c`) and optional catch-all (`|oc`). The
    // engine must distinguish different bindings and never re-split the embedded
    // `/` as structure — that segment-counting is the bug class PR 6 removes.
    const catchAll = { ...pageDescriptor, boundSegmentKey: "parts|guides/routing|c" };
    expect(deriveBfcacheSegmentIdentity(catchAll)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...catchAll, boundSegmentKey: "parts|guides|c" }),
    );
    const optionalEmpty = { ...pageDescriptor, boundSegmentKey: "parts||oc" };
    expect(deriveBfcacheSegmentIdentity(optionalEmpty)).not.toBe(
      deriveBfcacheSegmentIdentity({ ...optionalEmpty, boundSegmentKey: "parts|docs|oc" }),
    );
  });

  it("treats null and absent graphVersion as the same low-context identity", () => {
    const a = deriveBfcacheSegmentIdentity({ ...pageDescriptor, graphVersion: null });
    const b = deriveBfcacheSegmentIdentity({ ...pageDescriptor, graphVersion: null });
    expect(a).toBe(b);
    expect(a).not.toBe(deriveBfcacheSegmentIdentity(pageDescriptor));
  });
});
