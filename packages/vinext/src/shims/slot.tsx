"use client";

import * as React from "react";
import { UNMATCHED_SLOT, type AppElements } from "../server/app-elements.js";
import { notFound } from "./navigation.js";

const EMPTY_ELEMENTS: AppElements = {};

export { UNMATCHED_SLOT };

/**
 * Holds resolved AppElements (not a Promise). React 19's use(Promise) during
 * hydration triggers "async Client Component" for native Promises that lack
 * React's internal .status property. Storing resolved values sidesteps this.
 */
export const ElementsContext = React.createContext<AppElements>(EMPTY_ELEMENTS);

export const ChildrenContext = React.createContext<React.ReactNode>(null);

export const ParallelSlotsContext = React.createContext<Readonly<
  Record<string, React.ReactNode>
> | null>(null);

export function mergeElements(prev: AppElements, next: AppElements): AppElements {
  return { ...prev, ...next };
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
  const elements = React.useContext(ElementsContext);

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
