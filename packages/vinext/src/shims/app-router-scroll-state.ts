export type AppRouterScrollIntent = Readonly<{
  commitId: number | null;
  hash: string | null;
  id: number;
}>;

const hoistedHeadElementSelector =
  "style[href][precedence],style[href][data-precedence],style[data-href][precedence],style[data-href][data-precedence],link[href][precedence],link[href][data-precedence]";

// A scroll intent is staged by `navigateClientSide` (next/navigation) before an
// RSC navigation and consumed by the committed `AppRouterScrollTarget`. Both run
// in the browser, but next/navigation and this module can be loaded through
// separate Vite module instances (see the Symbol.for navigation state in
// navigation.ts and AGENTS.md "RSC and SSR Are Separate Vite Environments"). If
// the writer and consumer held different module-level copies, the staged intent
// would be invisible to the consumer and scroll/focus would silently no-op.
// Store the single pending intent and the id counter on a Symbol.for global so
// every instance shares one slot, matching the rest of the navigation state.
const _SCROLL_INTENT_KEY = Symbol.for("vinext.appRouterScrollIntent");

type ScrollIntentStore = {
  nextId: number;
  pending: AppRouterScrollIntent | null;
};

type ScrollIntentGlobal = typeof globalThis & {
  [_SCROLL_INTENT_KEY]?: ScrollIntentStore;
};

function getScrollIntentStore(): ScrollIntentStore {
  const globalState = globalThis as ScrollIntentGlobal;
  globalState[_SCROLL_INTENT_KEY] ??= { nextId: 0, pending: null };
  return globalState[_SCROLL_INTENT_KEY]!;
}

function createHoistedHeadSignature(element: Element): string {
  const href = element.getAttribute("href") ?? "";
  const dataHref = element.getAttribute("data-href") ?? "";
  const precedence = element.getAttribute("precedence") ?? "";
  const dataPrecedence = element.getAttribute("data-precedence") ?? "";
  return `${element.localName}\0${href}\0${dataHref}\0${precedence}\0${dataPrecedence}`;
}

export function readAppRouterHoistedHeadSignatures(
  doc: Pick<Document, "head"> | undefined = typeof document === "undefined" ? undefined : document,
): readonly string[] {
  const head = doc?.head;
  if (head == null) return [];

  return Array.from(head.querySelectorAll(hoistedHeadElementSelector))
    .map(createHoistedHeadSignature)
    .sort();
}

export function hasAppRouterHoistedHeadNode(): boolean {
  return readAppRouterHoistedHeadSignatures().length > 0;
}

export function beginAppRouterScrollIntent(hash: string | null): AppRouterScrollIntent {
  const store = getScrollIntentStore();
  store.nextId += 1;
  const intent = {
    commitId: null,
    hash,
    id: store.nextId,
  };
  store.pending = intent;
  return intent;
}

export function clearAppRouterScrollIntent(): void {
  getScrollIntentStore().pending = null;
}

export function getPendingAppRouterScrollIntent(): AppRouterScrollIntent | null {
  return getScrollIntentStore().pending;
}

export function claimAppRouterScrollIntentForCommit(
  expected: AppRouterScrollIntent | null | undefined,
  commitId: number,
): void {
  const store = getScrollIntentStore();
  const intent = store.pending;
  if (expected === null || expected === undefined || intent === null) return;
  if (intent.id !== expected.id) return;

  store.pending = {
    ...intent,
    commitId,
  };
}

export function consumeAppRouterScrollIntent(
  expected: AppRouterScrollIntent | null | undefined,
  commitId?: number,
): AppRouterScrollIntent | null {
  if (expected === null || expected === undefined) return null;
  const store = getScrollIntentStore();
  const intent = store.pending;
  if (intent === null) return null;
  if (intent.id !== expected.id) return null;
  if (commitId !== undefined && intent.commitId !== commitId) return null;

  store.pending = null;
  return intent;
}
