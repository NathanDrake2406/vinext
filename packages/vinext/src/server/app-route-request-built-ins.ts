import { NextRequest } from "vinext/shims/server";

const BUILT_IN_REQUEST_PROPERTIES_KEY = Symbol.for(
  "vinext.appRouteHandlerRuntime.builtInRequestProperties",
);
const globalState = globalThis as unknown as Record<PropertyKey, unknown>;

type BuiltInRequestProperty = readonly [PropertyKey, Readonly<PropertyDescriptor>];

function captureBuiltInRequestProperties(): readonly BuiltInRequestProperty[] {
  const properties = new Map<PropertyKey, PropertyDescriptor>();
  for (const prototype of [Request.prototype, NextRequest.prototype]) {
    for (const prop of Reflect.ownKeys(prototype)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(prototype, prop);
      if (descriptor !== undefined) properties.set(prop, descriptor);
    }
  }

  return Object.freeze(
    Array.from(properties, ([prop, descriptor]) =>
      Object.freeze([prop, Object.freeze({ ...descriptor })] as const),
    ),
  );
}

/**
 * Capture the standard Request prototype implementations before route modules
 * can extend or shadow them. The production RSC entry imports this module ahead of userland;
 * the global symbol also preserves that first snapshot if a bundler duplicates
 * this module across the eager entry and lazy dispatch chunks.
 *
 * Workerd may implement these names as branded own properties. Callers should
 * still resolve each descriptor from the concrete request instance rather than
 * retaining these prototype descriptors.
 */
export const BUILT_IN_REQUEST_PROPERTIES = (globalState[BUILT_IN_REQUEST_PROPERTIES_KEY] ??=
  captureBuiltInRequestProperties()) as readonly BuiltInRequestProperty[];
