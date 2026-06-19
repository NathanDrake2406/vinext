import { describe, expect, it } from "vitest";
import {
  createClientReferencePreloader,
  preloadClientReferencesForImportCandidates,
} from "../packages/vinext/src/server/app-client-reference-preloader.js";
import type { ClientReferenceImportMap } from "../packages/vinext/src/server/client-reference-imports.js";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolveDeferred: () => void = () => {
    throw new Error("deferred promise was not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    resolveDeferred = () => resolve();
  });
  return { promise, resolve: resolveDeferred };
}

describe("app client reference preloader", () => {
  async function preloadImportCandidates(options: {
    importCandidates?: readonly string[] | null;
    importMap?: ClientReferenceImportMap;
  }): Promise<string[]> {
    const calls: string[] = [];
    const preloader = createClientReferencePreloader({
      getReferences: () => ({ "comp-a": true, "comp-b": true, "comp-c": true }),
      getClientRequire: () => async (id) => {
        calls.push(id);
      },
    });

    await preloadClientReferencesForImportCandidates(preloader, options.importCandidates, {
      getImportMap: () => options.importMap ?? {},
      isAvailable: () => options.importMap !== undefined,
    });

    return calls;
  }

  it("maps route import candidates to client reference ids before preloading", async () => {
    const importMap = {
      "comp-a": "/app/alpha.tsx",
      "comp-b": "/app/beta.tsx",
      "comp-c": "package-client",
    };

    await expect(
      preloadImportCandidates({ importCandidates: ["/app/alpha.tsx"] }),
    ).resolves.toEqual(["comp-a", "comp-b", "comp-c"]);
    await expect(preloadImportCandidates({ importCandidates: null, importMap })).resolves.toEqual([
      "comp-a",
      "comp-b",
      "comp-c",
    ]);
    await expect(preloadImportCandidates({ importCandidates: [], importMap })).resolves.toEqual([]);
    await expect(
      preloadImportCandidates({ importCandidates: ["/app/beta.tsx"], importMap }),
    ).resolves.toEqual(["comp-b"]);
  });

  it("shares one in-flight preload across concurrent cold SSR calls", async () => {
    const refs = { "comp-a": true, "comp-b": true, "comp-c": true };
    const calls: string[] = [];
    const preloadGate = createDeferred();

    const preloader = createClientReferencePreloader({
      getReferences: () => refs,
      getClientRequire: () => async (id) => {
        calls.push(id);
        await preloadGate.promise;
      },
    });

    const first = preloader.preload();
    const second = preloader.preload();
    const third = preloader.preload();

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(calls).toEqual(["comp-a", "comp-b", "comp-c"]);

    preloadGate.resolve();
    await Promise.all([first, second, third]);

    await preloader.preload();
    expect(calls).toEqual(["comp-a", "comp-b", "comp-c"]);
  });

  it("does not mark preload complete when references or client require are unavailable", async () => {
    const refs = { "comp-a": true };
    let currentRefs: Record<string, unknown> | undefined;
    let currentRequire: ((id: string) => Promise<unknown>) | undefined;
    const calls: string[] = [];

    const preloader = createClientReferencePreloader({
      getReferences: () => currentRefs,
      getClientRequire: () => currentRequire,
    });

    await preloader.preload();

    currentRefs = refs;
    await preloader.preload();

    currentRequire = async (id) => {
      calls.push(id);
    };
    await preloader.preload();

    expect(calls).toEqual(["comp-a"]);
  });

  it("dedupes overlapping scoped preload requests per reference id", async () => {
    const calls: string[] = [];
    const preloadGate = createDeferred();
    const preloader = createClientReferencePreloader({
      getReferences: () => ({ "comp-a": true, "comp-b": true, "comp-c": true }),
      getClientRequire: () => async (id) => {
        calls.push(id);
        await preloadGate.promise;
      },
    });

    const firstRoute = preloader.preload(["comp-a", "comp-b"]);
    const secondRoute = preloader.preload(["comp-b", "comp-c"]);

    expect(calls).toEqual(["comp-a", "comp-b", "comp-c"]);

    preloadGate.resolve();
    await Promise.all([firstRoute, secondRoute]);

    await preloader.preload(["comp-b"]);
    expect(calls).toEqual(["comp-a", "comp-b", "comp-c"]);
  });

  it("reports individual preload failures and completes the manifest pass", async () => {
    const reported: Array<{ id: string; error: unknown }> = [];
    const calls: string[] = [];
    const preloader = createClientReferencePreloader({
      getReferences: () => ({ "comp-a": true, "comp-b": true }),
      getClientRequire: () => async (id) => {
        calls.push(id);
        if (id === "comp-a") {
          throw new Error("load failed");
        }
      },
      onPreloadError: (id, error) => reported.push({ id, error }),
    });

    await preloader.preload();
    await preloader.preload();

    expect(calls).toEqual(["comp-a", "comp-b"]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.id).toBe("comp-a");
    expect(reported[0]?.error).toBeInstanceOf(Error);
  });
});
