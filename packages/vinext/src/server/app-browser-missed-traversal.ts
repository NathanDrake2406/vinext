import { readHistoryStateTraversalIndex } from "./app-history-state.js";

/** The only Navigation API surface this check reads: activation/current entry keys. */
export type NavigationEntryKeySource = {
  activation?: { entry?: { key?: string } | null } | null;
  currentEntry?: { key?: string } | null;
};

/**
 * Reads `window.navigation`. Undefined outside Chromium, where the check no-ops
 * and a traversal missed before hydration stays unhandled.
 */
export function readBrowserNavigationEntryKeySource(): NavigationEntryKeySource | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { navigation?: NavigationEntryKeySource }).navigation;
}

/**
 * True when Back/Forward landed before the App Router's popstate listener
 * existed. The activation entry is fixed for the document's lifetime and entry
 * keys survive `replaceState`, so a key mismatch means a traversal fired with
 * nobody listening. Only vinext-written entries (they carry a traversal index)
 * can be replayed; on any other entry the traversal is left unhandled.
 */
export function hasMissedInitialTraversal(options: {
  historyState: unknown;
  navigation: NavigationEntryKeySource | undefined;
}): boolean {
  const activationKey = options.navigation?.activation?.entry?.key;
  const currentKey = options.navigation?.currentEntry?.key;
  if (typeof activationKey !== "string" || typeof currentKey !== "string") return false;
  if (activationKey === currentKey) return false;
  return readHistoryStateTraversalIndex(options.historyState) !== null;
}
