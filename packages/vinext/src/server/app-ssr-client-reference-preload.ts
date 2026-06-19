/// <reference types="@vitejs/plugin-rsc/types" />

import {
  createClientReferencePreloader,
  preloadClientReferencesForImportCandidates,
} from "./app-client-reference-preloader.js";
import type { ClientReferenceImportIndex } from "./client-reference-imports.js";
import {
  getClientReferenceImportIndex,
  isClientReferenceImportMapAvailable,
} from "./client-reference-import-map-state.js";

type ClientReferenceRequire = (id: string) => Promise<unknown>;
type ClientReferenceMap = Readonly<Record<string, unknown>>;

type AppSsrClientReferencePreloadRuntime = {
  getReferences: () => ClientReferenceMap | undefined;
  getClientRequire: () => ClientReferenceRequire | undefined;
  getImportIndex: () => ClientReferenceImportIndex;
  isImportMapAvailable: () => boolean;
  onPreloadError?: (id: string, error: unknown) => void;
};

export type AppSsrClientReferencePreload = (
  importCandidates: readonly string[] | null | undefined,
) => Promise<void>;

function createAppSsrClientReferencePreload(
  runtime: AppSsrClientReferencePreloadRuntime,
): AppSsrClientReferencePreload {
  const preloader = createClientReferencePreloader({
    getReferences: runtime.getReferences,
    getClientRequire: runtime.getClientRequire,
    onPreloadError: runtime.onPreloadError,
  });

  return async (importCandidates) => {
    await preloadClientReferencesForImportCandidates(preloader, importCandidates, {
      getImportIndex: runtime.getImportIndex,
      isAvailable: runtime.isImportMapAvailable,
    });
  };
}

export function createAppSsrClientReferencePreloadForRuntime(
  clientReferences: ClientReferenceMap,
): AppSsrClientReferencePreload {
  return createAppSsrClientReferencePreload({
    getReferences() {
      return clientReferences;
    },
    getClientRequire() {
      return globalThis.__vite_rsc_client_require__;
    },
    getImportIndex: getClientReferenceImportIndex,
    isImportMapAvailable: isClientReferenceImportMapAvailable,
    onPreloadError(id, error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[vinext] failed to preload client ref:", id, error);
      }
    },
  });
}
