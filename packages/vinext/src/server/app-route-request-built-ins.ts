const BUILT_IN_REQUEST_PROPERTY_NAMES_KEY = Symbol.for(
  "vinext.appRouteHandlerRuntime.builtInRequestPropertyNames",
);
const globalState = globalThis as unknown as Record<PropertyKey, unknown>;

export function captureBuiltInRequestPropertyNames(
  requestInstance: Request = new Request("http://vinext.invalid/"),
): readonly PropertyKey[] {
  const properties = new Set<PropertyKey>();
  const prototypeChain: object[] = [];
  let prototype: object | null = Reflect.getPrototypeOf(requestInstance);
  while (prototype !== null && prototype !== Object.prototype) {
    prototypeChain.push(prototype);
    prototype = Reflect.getPrototypeOf(prototype);
  }

  // Object.prototype stays excluded because its reflection helpers must keep
  // the tracked proxy as their receiver.
  for (const source of [...prototypeChain, requestInstance]) {
    for (const prop of Reflect.ownKeys(source)) {
      // Node stores internal Request state in own symbol keys. Worker Web IDL
      // members that are absent from the prototype surface are string-named.
      if (source === requestInstance && typeof prop !== "string") continue;
      properties.add(prop);
    }
  }

  return Object.freeze([...properties]);
}

/**
 * Capture the standard Request surface before route modules can extend or
 * shadow it. Workerd can place Web IDL members on intermediate prototypes or
 * directly on Request instances, so both runtime-specific layouts are included.
 * The production RSC entry imports this module ahead of userland;
 * the global symbol also preserves that first snapshot if a bundler duplicates
 * this module across the eager entry and lazy dispatch chunks.
 *
 * Callers resolve each implementation from the concrete request rather than
 * retaining or invoking anything from the pristine instance.
 */
export const BUILT_IN_REQUEST_PROPERTY_NAMES = (globalState[BUILT_IN_REQUEST_PROPERTY_NAMES_KEY] ??=
  captureBuiltInRequestPropertyNames()) as readonly PropertyKey[];
