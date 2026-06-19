import { normalizePathSeparators, stripViteModuleQuery } from "../utils/path.js";

export type ClientReferenceImportMap = Readonly<Record<string, string>>;
export type ClientReferenceImportIndex = ReadonlyMap<string, readonly string[]>;

export function normalizeClientReferenceImportId(value: string): string {
  const withoutVirtualPrefix = value.startsWith("\0") ? value.slice(1) : value;
  return normalizePathSeparators(stripViteModuleQuery(withoutVirtualPrefix));
}

export function createClientReferenceImportIndex(
  clientReferenceImportIds: ClientReferenceImportMap,
): ClientReferenceImportIndex {
  const index = new Map<string, string[]>();
  for (const [referenceId, importId] of Object.entries(clientReferenceImportIds)) {
    const normalizedImportId = normalizeClientReferenceImportId(importId);
    const existing = index.get(normalizedImportId);
    if (existing) {
      existing.push(referenceId);
    } else {
      index.set(normalizedImportId, [referenceId]);
    }
  }

  for (const referenceIds of index.values()) {
    referenceIds.sort();
  }

  return index;
}

export function resolveClientReferenceIdsForImportCandidates(
  importCandidates: readonly string[] | null | undefined,
  clientReferenceImportIndex: ClientReferenceImportIndex,
): readonly string[] | null {
  if (!importCandidates) return null;

  const referenceIds = new Set<string>();
  for (const importCandidate of importCandidates) {
    const candidateReferenceIds = clientReferenceImportIndex.get(
      normalizeClientReferenceImportId(importCandidate),
    );
    if (candidateReferenceIds) {
      for (const referenceId of candidateReferenceIds) {
        referenceIds.add(referenceId);
      }
    }
  }

  return [...referenceIds].sort();
}
