import { normalizePathSeparators, stripViteModuleQuery } from "../utils/path.js";

export type ClientReferenceImportMap = Readonly<Record<string, string>>;

export function normalizeClientReferenceImportId(value: string): string {
  const withoutVirtualPrefix = value.startsWith("\0") ? value.slice(1) : value;
  return normalizePathSeparators(stripViteModuleQuery(withoutVirtualPrefix));
}

export function resolveClientReferenceIdsForImportCandidates(
  importCandidates: readonly string[] | null | undefined,
  clientReferenceImportIds: ClientReferenceImportMap,
): readonly string[] | null {
  if (!importCandidates) return null;

  const normalizedCandidates = new Set(importCandidates.map(normalizeClientReferenceImportId));
  const referenceIds: string[] = [];
  for (const [referenceId, importId] of Object.entries(clientReferenceImportIds)) {
    if (normalizedCandidates.has(normalizeClientReferenceImportId(importId))) {
      referenceIds.push(referenceId);
    }
  }

  return referenceIds.sort();
}
