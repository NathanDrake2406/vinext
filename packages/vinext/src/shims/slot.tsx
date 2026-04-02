"use client";

import * as React from "react";
import { UNMATCHED_SLOT, type AppElements } from "../server/app-elements.js";
import { notFound } from "./navigation.js";

const EMPTY_ELEMENTS_PROMISE = Promise.resolve<AppElements>({});
const mergeCache = new WeakMap<
  Promise<AppElements>,
  WeakMap<Promise<AppElements>, Promise<AppElements>>
>();

export { UNMATCHED_SLOT };

export const ElementsContext = React.createContext<Promise<AppElements>>(EMPTY_ELEMENTS_PROMISE);

export const ChildrenContext = React.createContext<React.ReactNode>(null);

export const ParallelSlotsContext = React.createContext<Readonly<
  Record<string, React.ReactNode>
> | null>(null);

export function mergeElementsPromise(
  prev: Promise<AppElements>,
  next: Promise<AppElements>,
): Promise<AppElements> {
  let nextCache = mergeCache.get(prev);
  if (!nextCache) {
    nextCache = new WeakMap();
    mergeCache.set(prev, nextCache);
  }

  const cached = nextCache.get(next);
  if (cached) {
    return cached;
  }

  const merged = Promise.all([prev, next]).then(([prevElements, nextElements]) => ({
    ...prevElements,
    ...nextElements,
  }));
  nextCache.set(next, merged);
  return merged;
}

export function Slot({
  id,
  children,
  parallelSlots,
}: {
  id: string;
  children?: React.ReactNode;
  parallelSlots?: Readonly<Record<string, React.ReactNode>>;
}) {
  const elements = React.use(React.useContext(ElementsContext));

  if (!(id in elements)) {
    return null;
  }

  const element = elements[id];
  if (element === UNMATCHED_SLOT) {
    notFound();
  }

  return (
    <ParallelSlotsContext.Provider value={parallelSlots ?? null}>
      <ChildrenContext.Provider value={children ?? null}>{element}</ChildrenContext.Provider>
    </ParallelSlotsContext.Provider>
  );
}

export function Children() {
  return React.useContext(ChildrenContext);
}

export function ParallelSlot({ name }: { name: string }) {
  const slots = React.useContext(ParallelSlotsContext);
  return slots?.[name] ?? null;
}
