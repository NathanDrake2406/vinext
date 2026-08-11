import type { NextI18nConfig } from "../config/next-config.js";
import {
  NextRequest,
  RequestCookies,
  sealRequestCookies,
  sealRequestHeaders,
  type NextURL,
} from "vinext/shims/server";
import { attachRequestCfMetadata, cloneRequestWithUrl } from "./request-pipeline.js";
import { buildRequestHeadersFromMiddlewareResponse } from "../utils/middleware-request-headers.js";
import { addBasePathToPathname } from "../utils/base-path.js";
import { BUILT_IN_REQUEST_PROPERTY_NAMES } from "./app-route-request-built-ins.js";

const ROUTE_HANDLER_HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
] as const;

export type RouteHandlerHttpMethod = (typeof ROUTE_HANDLER_HTTP_METHODS)[number];

export type RouteHandlerModule = Partial<Record<RouteHandlerHttpMethod | "default", unknown>>;

/**
 * Checks whether a string is a recognized HTTP method for App Router route
 * handlers. Invalid methods must be rejected with 400 before any auto-OPTIONS
 * or 405 logic runs.
 *
 * @see https://github.com/vercel/next.js/blob/canary/packages/next/src/server/web/http.ts
 */
export function isValidHTTPMethod(maybeMethod: string): maybeMethod is RouteHandlerHttpMethod {
  return (ROUTE_HANDLER_HTTP_METHODS as readonly string[]).includes(maybeMethod);
}

export function collectRouteHandlerMethods(handler: RouteHandlerModule): RouteHandlerHttpMethod[] {
  const methods = ROUTE_HANDLER_HTTP_METHODS.filter(
    (method) => typeof handler[method] === "function",
  );

  if (methods.includes("GET") && !methods.includes("HEAD")) {
    methods.push("HEAD");
  }

  return methods;
}

export function buildRouteHandlerAllowHeader(exportedMethods: readonly string[]): string {
  const allow = new Set(exportedMethods);
  allow.add("OPTIONS");
  return Array.from(allow).sort().join(", ");
}

const _KNOWN_DYNAMIC_APP_ROUTE_HANDLERS_KEY = Symbol.for(
  "vinext.appRouteHandlerRuntime.knownDynamicHandlers",
);
const _g = globalThis as unknown as Record<PropertyKey, unknown>;

// NOTE: This set starts empty on cold start. The first request may serve a
// stale ISR cache entry before the handler runs and signals dynamic usage.
// Next.js avoids this by determining dynamism statically at build time; vinext
// learns it at runtime and remembers the result for the process lifetime.
const knownDynamicAppRouteHandlers = (_g[_KNOWN_DYNAMIC_APP_ROUTE_HANDLERS_KEY] ??=
  new Set<string>()) as Set<string>;

export function isKnownDynamicAppRoute(pattern: string): boolean {
  return knownDynamicAppRouteHandlers.has(pattern);
}

export function markKnownDynamicAppRoute(pattern: string): void {
  knownDynamicAppRouteHandlers.add(pattern);
}

type RequestDynamicAccess =
  | "request.headers"
  | "request.cookies"
  | "request.cf"
  | "request.ip"
  | "request.geo"
  | "request.url"
  | "request.body"
  | "request.blob"
  | "request.json"
  | "request.text"
  | "request.arrayBuffer"
  | "request.formData";

type NextUrlDynamicAccess =
  | "nextUrl.search"
  | "nextUrl.searchParams"
  | "nextUrl.url"
  | "nextUrl.href"
  | "nextUrl.toJSON"
  | "nextUrl.toString"
  | "nextUrl.origin";

type AppRouteDynamicRequestAccess = RequestDynamicAccess | NextUrlDynamicAccess;
type AppRouteRequestMode = "auto" | "force-static" | "error";

type TrackedAppRouteRequestOptions = {
  basePath?: string;
  i18n?: NextI18nConfig | null;
  trailingSlash?: boolean;
  middlewareHeaders?: Headers | null;
  onDynamicAccess?: (access: AppRouteDynamicRequestAccess) => void;
  requestMode?: AppRouteRequestMode;
  staticGenerationErrorMessage?: (expression?: string) => string;
};

type TrackedAppRouteRequest = {
  request: NextRequest;
  didAccessDynamicRequest(): boolean;
};

function bindMethodIfNeeded<T>(value: T, target: object): T {
  return typeof value === "function" ? (value.bind(target) as T) : value;
}

function hasSamePropertyImplementation(
  current: PropertyDescriptor,
  original: PropertyDescriptor,
): boolean {
  return (
    Object.is(current.value, original.value) &&
    current.get === original.get &&
    current.set === original.set
  );
}

function getResolvedPropertyDescriptor(
  target: object,
  prop: PropertyKey,
): PropertyDescriptor | undefined {
  let current: object | null = target;
  while (current !== null) {
    const descriptor = Reflect.getOwnPropertyDescriptor(current, prop);
    if (descriptor !== undefined) return descriptor;
    current = Reflect.getPrototypeOf(current);
  }
  return undefined;
}

function getRequestProperty(
  target: NextRequest,
  prop: PropertyKey,
  receiver: object,
  builtInProperties: ReadonlyMap<PropertyKey, PropertyDescriptor>,
): unknown {
  const originalProperty = builtInProperties.get(prop);
  const currentProperty =
    originalProperty === undefined ? undefined : getResolvedPropertyDescriptor(target, prop);
  const isBuiltIn =
    currentProperty !== undefined &&
    originalProperty !== undefined &&
    hasSamePropertyImplementation(currentProperty, originalProperty);
  const bindingTarget = isBuiltIn ? target : receiver;
  return bindMethodIfNeeded(Reflect.get(target, prop, bindingTarget), bindingTarget);
}

function buildNextConfig(options: TrackedAppRouteRequestOptions): {
  basePath?: string;
  i18n?: NextI18nConfig;
  trailingSlash?: boolean;
} | null {
  if (!options.basePath && !options.i18n && !options.trailingSlash) {
    return null;
  }

  return {
    basePath: options.basePath,
    i18n: options.i18n ?? undefined,
    trailingSlash: options.trailingSlash,
  };
}

function rebuildRequestWithHeaders(input: Request, headers: Headers): Request {
  const method = input.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    cache: input.cache,
    credentials: input.credentials,
    integrity: input.integrity,
    keepalive: input.keepalive,
    mode: input.mode,
    redirect: input.redirect,
    referrer: input.referrer,
    referrerPolicy: input.referrerPolicy,
    signal: input.signal,
  };

  if (hasBody && input.body) {
    init.body = input.body;
    init.duplex = "half";
  }

  return attachRequestCfMetadata(new Request(input.url, init), input);
}

function cleanStaticUrl(url: string): string {
  const cleanUrl = new URL(url);
  cleanUrl.protocol = "http:";
  cleanUrl.host = "localhost:3000";
  cleanUrl.username = "";
  cleanUrl.password = "";
  cleanUrl.search = "";
  cleanUrl.hash = "";
  return cleanUrl.href;
}

function readEmptyBodyAsArrayBuffer(): Promise<ArrayBuffer> {
  return new Response(null).arrayBuffer();
}

function readEmptyBodyAsBlob(): Promise<Blob> {
  return new Response(null).blob();
}

// Empty JSON/form-data parses reject naturally; that keeps force-static body
// stubs aligned with a bodyless request instead of inventing synthetic data.
function readEmptyBodyAsFormData(): Promise<FormData> {
  return new Response(null).formData();
}

function readEmptyBodyAsJson(): Promise<unknown> {
  return new Response(null).json();
}

function readEmptyBodyAsText(): Promise<string> {
  return new Response(null).text();
}

export function createTrackedAppRouteRequest(
  request: Request,
  options: TrackedAppRouteRequestOptions = {},
): TrackedAppRouteRequest {
  let didAccessDynamicRequest = false;
  const requestMode = options.requestMode ?? "auto";
  const nextConfig = buildNextConfig(options);

  const markDynamicAccess = (access: AppRouteDynamicRequestAccess): void => {
    didAccessDynamicRequest = true;
    options.onDynamicAccess?.(access);
  };

  // Mirror the dynamic request reads that Next.js tracks inside
  // packages/next/src/server/route-modules/app-route/module.ts
  // via proxyNextRequest(), but keep the logic in a normal typed module.
  const wrapNextUrl = (nextUrl: NextURL): NextURL => {
    const nextUrlHandler: ProxyHandler<NextURL> = {
      get(target, prop): unknown {
        switch (prop) {
          case "search":
          case "searchParams":
          case "url":
          case "href":
          case "toJSON":
          case "toString":
          case "origin":
            markDynamicAccess(`nextUrl.${String(prop)}` as NextUrlDynamicAccess);
            return bindMethodIfNeeded(Reflect.get(target, prop, target), target);
          case "clone":
            return () => wrapNextUrl(target.clone());
          default:
            return bindMethodIfNeeded(Reflect.get(target, prop, target), target);
        }
      },
    };

    return new Proxy(nextUrl, nextUrlHandler);
  };

  const wrapForceStaticNextUrl = (nextUrl: NextURL): NextURL => {
    const emptySearchParams = new URLSearchParams();
    const staticHref = cleanStaticUrl(nextUrl.href);
    const nextUrlHandler: ProxyHandler<NextURL> = {
      get(target, prop): unknown {
        switch (prop) {
          case "search":
            return "";
          case "searchParams":
            return emptySearchParams;
          case "href":
            return staticHref;
          case "url":
            return undefined;
          case "toJSON":
          case "toString":
            return () => staticHref;
          case "clone":
            return () => wrapForceStaticNextUrl(target.clone());
          default:
            return bindMethodIfNeeded(Reflect.get(target, prop, target), target);
        }
      },
    };

    return new Proxy(nextUrl, nextUrlHandler);
  };

  const throwStaticGenerationError = (expression: string): never => {
    throw new Error(
      options.staticGenerationErrorMessage?.(expression) ??
        `Route handler with \`dynamic = "error"\` used ${expression}.`,
    );
  };

  const wrapRequireStaticNextUrl = (nextUrl: NextURL): NextURL => {
    const nextUrlHandler: ProxyHandler<NextURL> = {
      get(target, prop): unknown {
        switch (prop) {
          case "search":
          case "searchParams":
          case "url":
          case "href":
          case "toJSON":
          case "toString":
          case "origin":
            return throwStaticGenerationError(`nextUrl.${String(prop)}`);
          case "clone":
            return () => wrapRequireStaticNextUrl(target.clone());
          default:
            return bindMethodIfNeeded(Reflect.get(target, prop, target), target);
        }
      },
    };

    return new Proxy(nextUrl, nextUrlHandler);
  };

  const wrapRequest = (rawInput: Request): NextRequest => {
    // App Router route handlers only run for in-basePath requests — the
    // routing layer strips the basePath prefix before invoking them. Re-add
    // the configured prefix so the NextRequest mirrors the original URL
    // Next.js hands to route handlers: request.url keeps the prefix while
    // NextURL strips it back during construction, so nextUrl.pathname stays
    // basePath-free and nextUrl.basePath reports the configured value.
    let input = rawInput;
    if (options.basePath) {
      const inputUrl = new URL(rawInput.url);
      const prefixedPathname = addBasePathToPathname(inputUrl.pathname, options.basePath);
      if (prefixedPathname !== inputUrl.pathname) {
        inputUrl.pathname = prefixedPathname;
        // Transfer the body instead of cloning: `rawInput` is replaced here and
        // its body is never read again, so a tee would just leave an unread
        // branch buffering the whole request in memory.
        input = cloneRequestWithUrl(rawInput, inputUrl.toString());
      }
    }
    const requestHeaders = options.middlewareHeaders
      ? buildRequestHeadersFromMiddlewareResponse(input.headers, options.middlewareHeaders)
      : null;
    const requestWithOverrides = requestHeaders
      ? rebuildRequestWithHeaders(input, requestHeaders)
      : input;
    const nextRequest =
      requestWithOverrides instanceof NextRequest
        ? requestWithOverrides
        : new NextRequest(requestWithOverrides, { nextConfig: nextConfig ?? undefined });
    const rawCfMetadata = Reflect.get(nextRequest, "cf", nextRequest);
    const hasCfMetadata = rawCfMetadata !== undefined;
    const originalCfDescriptor = Reflect.getOwnPropertyDescriptor(nextRequest, "cf");
    const accessCf = <T>(read: () => T, forceStaticValue: T): T => {
      if (requestMode === "force-static") return forceStaticValue;
      if (requestMode === "error") return throwStaticGenerationError("request.cf");
      markDynamicAccess("request.cf");
      return read();
    };
    // Pre-wrap instrumentation can replace a standard Request method with a
    // wrapper that delegates through `original.call(this)`. Those wrappers need
    // the branded target, while their own `this.cf` reads must still follow the
    // route's dynamic policy. The copied Workers property is configurable, so
    // route the raw target read through the same policy before exposing it.
    const targetTracksCf = originalCfDescriptor?.configurable === true;
    if (targetTracksCf) {
      Object.defineProperty(nextRequest, "cf", {
        configurable: true,
        enumerable: originalCfDescriptor.enumerable,
        get() {
          return accessCf(() => rawCfMetadata, undefined);
        },
      });
    }
    // Workerd can place branded Web IDL members directly on the instance. Keep
    // each resolved implementation distinguishable from own or prototype
    // shadows added after the tracked request is exposed to route code.
    const builtInProperties = new Map<PropertyKey, PropertyDescriptor>();
    for (const prop of BUILT_IN_REQUEST_PROPERTY_NAMES) {
      const descriptor = getResolvedPropertyDescriptor(nextRequest, prop);
      if (descriptor !== undefined) builtInProperties.set(prop, descriptor);
    }
    const cloneTrackedRequest = (): NextRequest => {
      const cloned = nextRequest.clone();
      if (hasCfMetadata) {
        Object.defineProperty(cloned, "cf", {
          value: rawCfMetadata,
          enumerable: originalCfDescriptor?.enumerable ?? true,
          configurable: true,
        });
      }
      return wrapRequest(cloned);
    };
    let proxiedNextUrl: NextURL | null = null;
    let forceStaticNextUrl: NextURL | null = null;
    let requireStaticNextUrl: NextURL | null = null;
    let forceStaticHeaders: Headers | null = null;
    let forceStaticCookies: RequestCookies | null = null;

    const requestHandler: ProxyHandler<NextRequest> = {
      get(target, prop, receiver): unknown {
        if (prop === "cf") {
          return targetTracksCf
            ? Reflect.get(target, prop, target)
            : accessCf(
                () => getRequestProperty(target, prop, receiver, builtInProperties),
                undefined,
              );
        }
        if (requestMode === "force-static") {
          switch (prop) {
            case "nextUrl":
              forceStaticNextUrl ??= wrapForceStaticNextUrl(target.nextUrl);
              return forceStaticNextUrl;
            case "headers":
              forceStaticHeaders ??= sealRequestHeaders(new Headers());
              return forceStaticHeaders;
            case "cookies":
              forceStaticCookies ??= sealRequestCookies(new RequestCookies(new Headers()));
              return forceStaticCookies;
            case "url":
              return cleanStaticUrl(target.nextUrl.href);
            case "ip":
            case "geo":
              return undefined;
            case "body":
              return null;
            case "arrayBuffer":
              return readEmptyBodyAsArrayBuffer;
            case "blob":
              return readEmptyBodyAsBlob;
            case "formData":
              return readEmptyBodyAsFormData;
            case "json":
              return readEmptyBodyAsJson;
            case "text":
              return readEmptyBodyAsText;
            case "clone":
              return cloneTrackedRequest;
            default:
              return getRequestProperty(target, prop, receiver, builtInProperties);
          }
        }

        if (requestMode === "error") {
          switch (prop) {
            case "nextUrl":
              requireStaticNextUrl ??= wrapRequireStaticNextUrl(target.nextUrl);
              return requireStaticNextUrl;
            case "headers":
            case "cookies":
            case "url":
            // Deliberate vinext divergence from Next.js: ip/geo/cf are exposed
            // on NextRequest for Cloudflare compatibility, so require-static
            // treats them as dynamic request APIs instead of falling through.
            case "ip":
            case "geo":
            case "body":
            case "blob":
            case "json":
            case "text":
            case "arrayBuffer":
            case "formData":
              return throwStaticGenerationError(`request.${String(prop)}`);
            case "clone":
              return cloneTrackedRequest;
            default:
              return getRequestProperty(target, prop, receiver, builtInProperties);
          }
        }

        switch (prop) {
          case "nextUrl":
            proxiedNextUrl ??= wrapNextUrl(target.nextUrl);
            return proxiedNextUrl;
          case "headers":
          case "cookies":
          case "url":
          case "body":
          case "blob":
          case "json":
          case "text":
          case "arrayBuffer":
          case "formData":
            markDynamicAccess(`request.${String(prop)}` as RequestDynamicAccess);
            return getRequestProperty(target, prop, receiver, builtInProperties);
          case "ip":
          case "geo":
            markDynamicAccess(`request.${prop}`);
            return Reflect.get(target, prop, target);
          case "clone":
            return cloneTrackedRequest;
          default:
            return getRequestProperty(target, prop, receiver, builtInProperties);
        }
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop !== "cf") return Reflect.getOwnPropertyDescriptor(target, prop);
        if (!targetTracksCf) {
          return accessCf(() => Reflect.getOwnPropertyDescriptor(target, prop), undefined);
        }
        const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
        return accessCf(
          () =>
            targetDescriptor?.configurable === false || !Reflect.isExtensible(target)
              ? targetDescriptor
              : {
                  configurable: true,
                  enumerable: originalCfDescriptor?.enumerable ?? true,
                  value: rawCfMetadata,
                  writable: false,
                },
          undefined,
        );
      },
      has(target, prop) {
        return prop === "cf"
          ? accessCf(() => Reflect.has(target, prop), false)
          : Reflect.has(target, prop);
      },
      preventExtensions(target) {
        // Once the target is non-extensible, Proxy invariants forbid hiding any
        // own key. Remove configurable Workers metadata before locking it down.
        if (requestMode === "force-static" && !Reflect.deleteProperty(target, "cf")) {
          return false;
        }
        return Reflect.preventExtensions(target);
      },
      ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        return keys.includes("cf")
          ? accessCf(
              () => keys,
              keys.filter((key) => key !== "cf"),
            )
          : keys;
      },
    };

    return new Proxy(nextRequest, requestHandler);
  };

  return {
    request: wrapRequest(request),
    didAccessDynamicRequest() {
      return didAccessDynamicRequest;
    },
  };
}
