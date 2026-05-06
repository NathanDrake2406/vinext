import React from "react";
import { describe, expect, it } from "vite-plus/test";
import { UNMATCHED_SLOT } from "../packages/vinext/src/shims/slot.js";
import {
  APP_ARTIFACT_COMPATIBILITY_KEY,
  AppElementsWire,
  APP_INTERCEPTION_CONTEXT_KEY,
  APP_LAYOUT_FLAGS_KEY,
  APP_ROOT_LAYOUT_KEY,
  APP_ROUTE_KEY,
  APP_UNMATCHED_SLOT_WIRE_VALUE,
  buildOutgoingAppPayload,
  createAppPayloadCacheKey,
  createAppPayloadRouteId,
  isAppElementsRecord,
  normalizeAppElements,
  readAppElementsMetadata,
  resolveVisitedResponseInterceptionContext,
  withLayoutFlags,
} from "../packages/vinext/src/server/app-elements.js";
import {
  APP_ELEMENTS_SCHEMA_VERSION,
  ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
  createArtifactCompatibilityEnvelope,
  evaluateArtifactCompatibility,
  RSC_PAYLOAD_SCHEMA_VERSION,
} from "../packages/vinext/src/server/artifact-compatibility.js";

describe("AppElementsWire", () => {
  it("encodes outgoing record payloads without mutating caller-owned records", () => {
    const element = {
      "layout:/": "root-layout",
      "page:/blog": "blog-page",
    };

    const encoded = AppElementsWire.encodeOutgoingPayload({
      element,
      layoutFlags: { "layout:/": "s" },
    });

    expect(encoded).not.toBe(element);
    expect(isAppElementsRecord(encoded)).toBe(true);
    if (isAppElementsRecord(encoded)) {
      expect(encoded).toEqual({
        "layout:/": "root-layout",
        "page:/blog": "blog-page",
        [APP_ARTIFACT_COMPATIBILITY_KEY]: createArtifactCompatibilityEnvelope(),
        [APP_LAYOUT_FLAGS_KEY]: { "layout:/": "s" },
      });
    }
    expect(element).toEqual({
      "layout:/": "root-layout",
      "page:/blog": "blog-page",
    });
  });

  it("decodes wire payloads and reads metadata through one codec boundary", () => {
    const decoded = AppElementsWire.decode({
      [APP_INTERCEPTION_CONTEXT_KEY]: "/feed",
      [APP_ROOT_LAYOUT_KEY]: "/",
      [APP_ROUTE_KEY]: AppElementsWire.encodeRouteId("/photos/42", "/feed"),
      "slot:modal:/": AppElementsWire.unmatchedSlotValue,
    });

    expect(decoded["slot:modal:/"]).toBe(UNMATCHED_SLOT);
    expect(AppElementsWire.readMetadata(decoded)).toEqual({
      artifactCompatibility: createArtifactCompatibilityEnvelope(),
      interceptionContext: "/feed",
      layoutFlags: {},
      rootLayoutTreePath: "/",
      routeId: "route:/photos/42\0/feed",
    });
  });

  it("creates the canonical metadata entries for outgoing AppElements records", () => {
    const metadata = AppElementsWire.createMetadataEntries({
      interceptionContext: null,
      rootLayoutTreePath: "/(dashboard)",
      routeId: AppElementsWire.encodeRouteId("/dashboard", null),
    });

    expect(metadata).toEqual({
      [APP_INTERCEPTION_CONTEXT_KEY]: null,
      [APP_ROOT_LAYOUT_KEY]: "/(dashboard)",
      [APP_ROUTE_KEY]: "route:/dashboard",
    });
  });
});

describe("app elements payload helpers", () => {
  it("normalizes the unmatched-slot wire marker to UNMATCHED_SLOT for slot entries", () => {
    const normalized = normalizeAppElements({
      [APP_ROOT_LAYOUT_KEY]: "/",
      [APP_ROUTE_KEY]: "route:/dashboard",
      "page:/dashboard": React.createElement("main", null, "dashboard"),
      "slot:modal:/": APP_UNMATCHED_SLOT_WIRE_VALUE,
    });

    expect(normalized["slot:modal:/"]).toBe(UNMATCHED_SLOT);
    expect(normalized["page:/dashboard"]).not.toBe(UNMATCHED_SLOT);
  });

  it("does not rewrite the unmatched-slot wire marker for non-slot entries", () => {
    const normalized = normalizeAppElements({
      [APP_ROOT_LAYOUT_KEY]: "/",
      [APP_ROUTE_KEY]: "route:/dashboard",
      "page:/dashboard": APP_UNMATCHED_SLOT_WIRE_VALUE,
    });

    expect(normalized["page:/dashboard"]).toBe(APP_UNMATCHED_SLOT_WIRE_VALUE);
  });

  it("reads route metadata from the normalized payload", () => {
    const metadata = readAppElementsMetadata(
      normalizeAppElements({
        [APP_INTERCEPTION_CONTEXT_KEY]: "/feed",
        [APP_ROOT_LAYOUT_KEY]: "/(dashboard)",
        [APP_ROUTE_KEY]: "route:/dashboard",
        "route:/dashboard": React.createElement("div", null, "route"),
      }),
    );

    expect(metadata.routeId).toBe("route:/dashboard");
    expect(metadata.interceptionContext).toBe("/feed");
    expect(metadata.rootLayoutTreePath).toBe("/(dashboard)");
  });

  it("defaults missing interception context metadata to null", () => {
    const metadata = readAppElementsMetadata(
      normalizeAppElements({
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_ROUTE_KEY]: "route:/dashboard",
        "route:/dashboard": React.createElement("div", null, "route"),
      }),
    );

    expect(metadata.interceptionContext).toBeNull();
  });

  it("encodes intercepted route ids and cache keys with a NUL separator", () => {
    expect(createAppPayloadRouteId("/photos/42", null)).toBe("route:/photos/42");
    expect(createAppPayloadRouteId("/photos/42", "/feed")).toBe("route:/photos/42\0/feed");
    expect(createAppPayloadCacheKey("/photos/42.rsc", null)).toBe("/photos/42.rsc");
    expect(createAppPayloadCacheKey("/photos/42.rsc", "/feed")).toBe("/photos/42.rsc\0/feed");
  });

  it("preserves the request cache context when a direct-route payload omits it", () => {
    expect(resolveVisitedResponseInterceptionContext("/feed", null)).toBe("/feed");
    expect(resolveVisitedResponseInterceptionContext("/feed", "/feed")).toBe("/feed");
    expect(resolveVisitedResponseInterceptionContext("/feed", "/gallery")).toBe("/gallery");
    expect(resolveVisitedResponseInterceptionContext(null, null)).toBeNull();
  });

  it("rejects payloads with a missing __route key", () => {
    expect(() =>
      readAppElementsMetadata(
        normalizeAppElements({
          [APP_ROOT_LAYOUT_KEY]: "/",
        }),
      ),
    ).toThrow("[vinext] Missing __route string in App Router payload");
  });

  it("rejects payloads with an invalid __rootLayout value", () => {
    expect(() =>
      readAppElementsMetadata(
        normalizeAppElements({
          [APP_ROOT_LAYOUT_KEY]: 123,
          [APP_ROUTE_KEY]: "route:/dashboard",
        }),
      ),
    ).toThrow("[vinext] Invalid __rootLayout in App Router payload: expected string or null");
  });

  it("rejects payloads with a missing __rootLayout key", () => {
    expect(() =>
      readAppElementsMetadata(
        normalizeAppElements({
          [APP_ROUTE_KEY]: "route:/dashboard",
        }),
      ),
    ).toThrow("[vinext] Missing __rootLayout key in App Router payload");
  });

  it("rejects payloads with an invalid __interceptionContext value", () => {
    expect(() =>
      readAppElementsMetadata(
        normalizeAppElements({
          [APP_INTERCEPTION_CONTEXT_KEY]: 123,
          [APP_ROOT_LAYOUT_KEY]: "/",
          [APP_ROUTE_KEY]: "route:/dashboard",
        }),
      ),
    ).toThrow("[vinext] Invalid __interceptionContext in App Router payload");
  });

  it("reads layoutFlags from payload metadata", () => {
    // Layout flags are set directly on the elements object (not via
    // normalizeAppElements which expects AppWireElementValue types).
    const elements = {
      ...normalizeAppElements({
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_ROUTE_KEY]: "route:/blog",
        "page:/blog": React.createElement("div", null, "blog"),
      }),
      [APP_LAYOUT_FLAGS_KEY]: { "layout:/": "s", "layout:/blog": "d" },
    };
    const metadata = readAppElementsMetadata(elements);

    expect(metadata.layoutFlags).toEqual({ "layout:/": "s", "layout:/blog": "d" });
  });

  it("defaults missing layoutFlags to empty object (backward compat)", () => {
    const metadata = readAppElementsMetadata(
      normalizeAppElements({
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_ROUTE_KEY]: "route:/dashboard",
        "route:/dashboard": React.createElement("div", null, "route"),
      }),
    );

    expect(metadata.layoutFlags).toEqual({});
  });

  it("reads artifact compatibility envelope metadata", () => {
    const envelope = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
    });
    const metadata = readAppElementsMetadata({
      ...normalizeAppElements({
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_ROUTE_KEY]: "route:/dashboard",
        "route:/dashboard": React.createElement("div", null, "route"),
      }),
      [APP_ARTIFACT_COMPATIBILITY_KEY]: envelope,
    });

    expect(metadata.artifactCompatibility).toEqual(envelope);
  });

  it("defaults missing artifact compatibility to unknown proof for legacy payloads", () => {
    const metadata = readAppElementsMetadata(
      normalizeAppElements({
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_ROUTE_KEY]: "route:/dashboard",
        "route:/dashboard": React.createElement("div", null, "route"),
      }),
    );

    expect(metadata.artifactCompatibility).toEqual({
      schemaVersion: ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
      graphVersion: null,
      deploymentVersion: null,
      appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
      rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
      rootBoundaryId: null,
      renderEpoch: null,
    });
  });

  it("rejects malformed artifact compatibility metadata", () => {
    expect(() =>
      readAppElementsMetadata({
        ...normalizeAppElements({
          [APP_ROOT_LAYOUT_KEY]: "/",
          [APP_ROUTE_KEY]: "route:/dashboard",
        }),
        [APP_ARTIFACT_COMPATIBILITY_KEY]: {
          schemaVersion: ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
          graphVersion: 123,
          deploymentVersion: null,
          appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
          rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
          rootBoundaryId: null,
          renderEpoch: null,
        },
      }),
    ).toThrow("[vinext] Invalid __artifactCompatibility in App Router payload");
  });

  it("rejects artifact compatibility with an unrecognized schema version", () => {
    expect(() =>
      readAppElementsMetadata({
        ...normalizeAppElements({
          [APP_ROOT_LAYOUT_KEY]: "/",
          [APP_ROUTE_KEY]: "route:/dashboard",
        }),
        [APP_ARTIFACT_COMPATIBILITY_KEY]: {
          schemaVersion: 99,
          graphVersion: null,
          deploymentVersion: null,
          appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
          rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
          rootBoundaryId: null,
          renderEpoch: null,
        },
      }),
    ).toThrow("[vinext] Invalid __artifactCompatibility in App Router payload");
  });
});

describe("isAppElementsRecord", () => {
  it("returns true for a plain record", () => {
    expect(isAppElementsRecord({ "page:/": "x" })).toBe(true);
  });

  it("returns false for a React element", () => {
    expect(isAppElementsRecord(React.createElement("div", null, "x"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAppElementsRecord(null)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isAppElementsRecord([])).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isAppElementsRecord("string")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAppElementsRecord(undefined)).toBe(false);
  });
});

describe("withLayoutFlags", () => {
  it("attaches the __layoutFlags key with the supplied value", () => {
    const input = { "page:/": "page" };
    const result = withLayoutFlags(input, { "layout:/": "s" });
    expect(result[APP_LAYOUT_FLAGS_KEY]).toEqual({ "layout:/": "s" });
  });

  it("does not mutate the input", () => {
    const input: Record<string, unknown> = { "page:/": "page", "layout:/": "layout" };
    const snapshot = structuredClone(input);
    const result = withLayoutFlags(input, { "layout:/": "d" });
    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(Object.keys(input)).toEqual(Object.keys(snapshot));
    expect(APP_LAYOUT_FLAGS_KEY in input).toBe(false);
  });

  it("preserves other keys on the returned object", () => {
    const input = { "page:/blog": "page", "layout:/": "layout" };
    const result = withLayoutFlags(input, { "layout:/": "s" });
    expect(result["page:/blog"]).toBe("page");
    expect(result["layout:/"]).toBe("layout");
  });

  it("returns a new object with a different identity", () => {
    const input = { "page:/": "page" };
    const result = withLayoutFlags(input, {});
    expect(result).not.toBe(input);
  });
});

describe("buildOutgoingAppPayload", () => {
  it("returns a non-record element unchanged (same identity)", () => {
    const element = React.createElement("div", null, "page");
    const result = buildOutgoingAppPayload({
      element,
      layoutFlags: { "layout:/": "s" },
    });
    expect(result).toBe(element);
  });

  it("returns a new object for a record element (different identity)", () => {
    const element = { "page:/": "page" };
    const result = buildOutgoingAppPayload({
      element,
      layoutFlags: {},
    });
    expect(result).not.toBe(element);
  });

  it("does not mutate the input record", () => {
    const element: Record<string, React.ReactNode> = {
      "layout:/": "root-layout",
      "layout:/blog": "blog-layout",
      "page:/blog": "blog-page",
    };
    const snapshot = structuredClone(element);
    const result = buildOutgoingAppPayload({
      element,
      layoutFlags: { "layout:/": "s", "layout:/blog": "d" },
    });
    expect(result).not.toBe(element);
    expect(element).toEqual(snapshot);
    expect(Object.keys(element)).toEqual(Object.keys(snapshot));
    expect(APP_LAYOUT_FLAGS_KEY in element).toBe(false);
    expect(APP_ARTIFACT_COMPATIBILITY_KEY in element).toBe(false);
  });

  it("attaches __layoutFlags on the returned record", () => {
    const result = buildOutgoingAppPayload({
      element: { "page:/": "page" },
      layoutFlags: { "layout:/": "s" },
    });
    expect(isAppElementsRecord(result)).toBe(true);
    if (isAppElementsRecord(result)) {
      expect(result[APP_LAYOUT_FLAGS_KEY]).toEqual({ "layout:/": "s" });
    }
  });

  it("attaches __artifactCompatibility on the returned record", () => {
    const result = buildOutgoingAppPayload({
      element: { "page:/": "page" },
      layoutFlags: { "layout:/": "s" },
      artifactCompatibility: createArtifactCompatibilityEnvelope({
        graphVersion: "graph-a",
        deploymentVersion: "deploy-a",
        rootBoundaryId: "root-a",
      }),
    });
    expect(isAppElementsRecord(result)).toBe(true);
    if (isAppElementsRecord(result)) {
      expect(result[APP_ARTIFACT_COMPATIBILITY_KEY]).toEqual({
        schemaVersion: ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
        graphVersion: "graph-a",
        deploymentVersion: "deploy-a",
        appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
        rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
        rootBoundaryId: "root-a",
        renderEpoch: null,
      });
    }
  });

  it("returns canonical record keys regardless of any upstream skip intent", () => {
    const result = buildOutgoingAppPayload({
      element: { "layout:/": "root-layout", "page:/": "page" },
      layoutFlags: { "layout:/": "s" },
    });
    expect(isAppElementsRecord(result)).toBe(true);
    if (isAppElementsRecord(result)) {
      expect(result["layout:/"]).toBe("root-layout");
      expect(result["page:/"]).toBe("page");
    }
  });

  it("preserves non-layout metadata keys", () => {
    const result = buildOutgoingAppPayload({
      element: {
        [APP_ROUTE_KEY]: "route:/blog",
        [APP_ROOT_LAYOUT_KEY]: "/",
        [APP_INTERCEPTION_CONTEXT_KEY]: null,
        "layout:/": "root-layout",
        "page:/blog": "blog-page",
      },
      layoutFlags: { "layout:/": "s" },
    });
    expect(isAppElementsRecord(result)).toBe(true);
    if (isAppElementsRecord(result)) {
      expect(result[APP_ROUTE_KEY]).toBe("route:/blog");
      expect(result[APP_ROOT_LAYOUT_KEY]).toBe("/");
      expect(result[APP_INTERCEPTION_CONTEXT_KEY]).toBeNull();
      expect(result["page:/blog"]).toBe("blog-page");
      expect(result["layout:/"]).toBe("root-layout");
    }
  });
});

describe("artifact compatibility proof evaluation", () => {
  it("returns compatible only when every current proof field is known and equal", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });

    expect(evaluateArtifactCompatibility(current, current)).toEqual({
      kind: "compatible",
    });
  });

  it("falls back to renderFresh when graph compatibility is unknown", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });
    const candidate = createArtifactCompatibilityEnvelope({
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });

    expect(evaluateArtifactCompatibility(current, candidate)).toEqual({
      kind: "unknown",
      fallback: "renderFresh",
      reason: "graphVersionUnknown",
    });
  });

  it("falls back to renderFresh when deployment compatibility is unknown", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });
    const candidate = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });

    expect(evaluateArtifactCompatibility(current, candidate)).toEqual({
      kind: "unknown",
      fallback: "renderFresh",
      reason: "deploymentVersionUnknown",
    });
  });

  it("falls back to renderFresh when root boundary compatibility is unknown", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });
    const candidate = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      renderEpoch: "epoch-a",
    });

    expect(evaluateArtifactCompatibility(current, candidate)).toEqual({
      kind: "unknown",
      fallback: "renderFresh",
      reason: "rootBoundaryIdUnknown",
    });
  });

  it("does not promote matching graph and deployment metadata to reuse proof when renderEpoch is unknown", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
    });
    const candidate = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
    });

    expect(evaluateArtifactCompatibility(current, candidate)).toEqual({
      kind: "unknown",
      fallback: "renderFresh",
      reason: "renderEpochUnknown",
    });
  });

  it("rejects a known deployment mismatch instead of using the unknown fallback", () => {
    const current = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-a",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });
    const candidate = createArtifactCompatibilityEnvelope({
      graphVersion: "graph-a",
      deploymentVersion: "deploy-b",
      rootBoundaryId: "root-a",
      renderEpoch: "epoch-a",
    });

    expect(evaluateArtifactCompatibility(current, candidate)).toEqual({
      kind: "incompatible",
      fallback: "renderFresh",
      reason: "deploymentVersionMismatch",
    });
  });
});
