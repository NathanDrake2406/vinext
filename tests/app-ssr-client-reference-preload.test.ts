import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppSsrClientReferencePreloadForRuntime } from "../packages/vinext/src/server/app-ssr-client-reference-preload.js";
import {
  resetClientReferenceImportMapForTesting,
  setClientReferenceImportMap,
} from "../packages/vinext/src/server/client-reference-import-map-state.js";

const clientReferences = {
  "ref-a": true,
  "ref-b": true,
  "ref-c": true,
};

describe("app SSR client reference preload wiring", () => {
  let previousClientRequire: typeof globalThis.__vite_rsc_client_require__;

  beforeEach(() => {
    previousClientRequire = globalThis.__vite_rsc_client_require__;
    resetClientReferenceImportMapForTesting();
  });

  afterEach(() => {
    globalThis.__vite_rsc_client_require__ = previousClientRequire;
    resetClientReferenceImportMapForTesting();
  });

  async function preloadWithCalls(importCandidates: readonly string[] | null): Promise<string[]> {
    const calls: string[] = [];
    globalThis.__vite_rsc_client_require__ = async (id) => {
      calls.push(id);
      return {};
    };

    const preload = createAppSsrClientReferencePreloadForRuntime(clientReferences);
    await preload(importCandidates);
    return calls;
  }

  it("maps registered import candidates to actual Vite RSC client require calls", async () => {
    await expect(preloadWithCalls(["/app/a.tsx"])).resolves.toEqual(["ref-a", "ref-b", "ref-c"]);

    setClientReferenceImportMap({
      "ref-a": "/app/a.tsx",
      "ref-b": "/app/b.tsx?used",
      "ref-c": "package-client",
    });

    await expect(preloadWithCalls(null)).resolves.toEqual(["ref-a", "ref-b", "ref-c"]);
    await expect(preloadWithCalls([])).resolves.toEqual([]);
    await expect(preloadWithCalls(["/app/b.tsx"])).resolves.toEqual(["ref-b"]);
    await expect(preloadWithCalls(["package-client"])).resolves.toEqual(["ref-c"]);
  });
});
