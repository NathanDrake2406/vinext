/**
 * next/server shim
 *
 * Provides NextRequest, NextResponse, and related types that work with
 * standard Web APIs (Request/Response). This means they work on Node,
 * Cloudflare Workers, Deno, and any WinterCG-compatible runtime.
 *
 * This is a pragmatic subset — we implement the most commonly used APIs
 * rather than bug-for-bug parity with Next.js internals.
 */

import {
  MIDDLEWARE_NEXT_HEADER,
  MIDDLEWARE_REWRITE_HEADER,
  MIDDLEWARE_SET_COOKIE_HEADER,
} from "../server/headers.js";
import { encodeMiddlewareRequestHeaders } from "../server/middleware-request-headers.js";
import { serializeSetCookie, validateCookieName } from "./internal/cookie-serialize.js";
import { getRequestExecutionContext } from "./request-context.js";
import {
  NextFetchEvent,
  NextURL,
  RequestCookies,
  validateURL,
  type CookieEntry,
  type NextURLConfig,
} from "./server-request-primitives.js";
export {
  NextFetchEvent,
  NextURL,
  RequestCookies,
  sealRequestCookies,
  sealRequestHeaders,
} from "./server-request-primitives.js";
export type { CookieEntry, NextURLConfig } from "./server-request-primitives.js";

// ---------------------------------------------------------------------------
// Inlined cache-scope guard for after()
//
// We cannot statically import throwIfInsideCacheScope from headers.ts here
// because headers.ts contains the "use cache" directive string in its error
// message, which causes Vite's use-cache transform to include it in the module
// graph. If headers.ts is pulled in via static import from server.ts, the
// transform fires on it in Pages Router fixtures that lack @vitejs/plugin-rsc.
//
// The connection() function in this file avoids the same problem by using
// `await import("./headers.js")` (dynamic import, async function). after()
// must remain synchronous, so we inline the check using the same Symbol.for
// keys that cache-runtime.ts and cache.ts register their ALS instances with.
// ---------------------------------------------------------------------------

const _USE_CACHE_ALS_KEY = Symbol.for("vinext.cacheRuntime.contextAls");
const _UNSTABLE_CACHE_ALS_KEY = Symbol.for("vinext.unstableCache.als");
const _g = globalThis as unknown as Record<PropertyKey, unknown>;

/**
 * Record an invalid dynamic usage error on the request context so it survives
 * user try/catch and can be forwarded to the dev overlay on client-side navigations.
 */
function _recordInvalidDynamicUsageError(error: Error): void {
  try {
    const _unifiedAls = _g[Symbol.for("vinext.unifiedRequestContext.als")] as
      | { getStore(): unknown }
      | undefined;
    const ctx = _unifiedAls?.getStore() as Record<string, unknown> | undefined;
    if (ctx) ctx.invalidDynamicUsageError = error;
  } catch {
    // Ignore — best-effort recording for dev diagnostics
  }
}

function _throwIfInsideCacheScope(apiName: string): void {
  const cacheAls = _g[_USE_CACHE_ALS_KEY] as { getStore(): unknown } | undefined;
  if (cacheAls?.getStore() != null) {
    const error = new Error(
      `\`${apiName}\` cannot be called inside "use cache". ` +
        `If you need this data inside a cached function, call \`${apiName}\` ` +
        "outside and pass the required data as an argument.",
    );
    _recordInvalidDynamicUsageError(error);
    throw error;
  }
  const unstableAls = _g[_UNSTABLE_CACHE_ALS_KEY] as { getStore(): unknown } | undefined;
  if (unstableAls?.getStore() === true) {
    const error = new Error(
      `\`${apiName}\` cannot be called inside a function cached with \`unstable_cache()\`. ` +
        `If you need this data inside a cached function, call \`${apiName}\` ` +
        "outside and pass the required data as an argument.",
    );
    _recordInvalidDynamicUsageError(error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// NextRequest
// ---------------------------------------------------------------------------

export class NextRequest extends Request {
  private _nextUrl: NextURL;
  private _url: string;
  private _cookies: RequestCookies;

  constructor(
    input: URL | RequestInfo,
    init?: RequestInit & {
      nextConfig?: {
        basePath?: string;
        i18n?: {
          locales: string[];
          defaultLocale: string;
          domains?: Array<{
            domain: string;
            defaultLocale: string;
            locales?: string[];
          }>;
        };
        trailingSlash?: boolean;
      };
    },
  ) {
    // Match Next.js: reject relative URLs with the canonical error before any
    // fallback URL parsing kicks in. Next.js calls `validateURL(url)` at the
    // top of its NextRequest constructor; we mirror that here so middleware
    // tests asserting on the error message text get the documented string.
    // Reuse the local `validateURL` helper so the message format stays in lockstep
    // with NextResponse, and so `javascript:` / `data:` URIs are blocked too.
    const rawUrl = typeof input !== "string" && "url" in input ? input.url : String(input);
    validateURL(rawUrl);
    // Strip nextConfig before passing to super() — it's vinext-internal,
    // not a valid RequestInit property.
    const { nextConfig: _nextConfig, ...requestInit } = init ?? {};
    if (input instanceof Request) {
      // Keep caller-owned request bodies readable after wrapping. Middleware and
      // route-handler plumbing may need the source Request after this wrapper runs.
      const requestInput =
        requestInit.body === undefined && input.body && !input.bodyUsed ? input.clone() : input;
      super(requestInput, requestInit);
      const cf = Reflect.get(input, "cf");
      if (cf !== undefined) {
        Object.defineProperty(this, "cf", {
          value: cf,
          enumerable: true,
          configurable: true,
        });
      }
    } else {
      super(input, requestInit);
    }
    const url =
      typeof input === "string"
        ? new URL(input, "http://localhost")
        : input instanceof URL
          ? input
          : new URL(input.url, "http://localhost");
    const urlConfig: NextURLConfig | undefined = _nextConfig
      ? {
          basePath: _nextConfig.basePath,
          nextConfig: { i18n: _nextConfig.i18n, trailingSlash: _nextConfig.trailingSlash },
        }
      : undefined;
    this._nextUrl = new NextURL(url, undefined, urlConfig);
    this._url = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
      ? url.toString()
      : this._nextUrl.toString();
    this._cookies = new RequestCookies(this.headers);
  }

  get nextUrl(): NextURL {
    return this._nextUrl;
  }

  get url(): string {
    return this._url;
  }

  get cookies(): RequestCookies {
    return this._cookies;
  }

  /**
   * Client IP address. Prefers Cloudflare's trusted CF-Connecting-IP header
   * over the spoofable X-Forwarded-For. Returns undefined if unavailable.
   */
  get ip(): string | undefined {
    return (
      this.headers.get("cf-connecting-ip") ??
      this.headers.get("x-real-ip") ??
      this.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined
    );
  }

  /**
   * Geolocation data. Platform-dependent (e.g., Cloudflare, Vercel).
   * Returns undefined if not available.
   */
  get geo():
    | { city?: string; country?: string; region?: string; latitude?: string; longitude?: string }
    | undefined {
    // Check Cloudflare-style headers, Vercel-style headers
    const country =
      this.headers.get("cf-ipcountry") ?? this.headers.get("x-vercel-ip-country") ?? undefined;
    if (!country) return undefined;
    return {
      country,
      city: this.headers.get("cf-ipcity") ?? this.headers.get("x-vercel-ip-city") ?? undefined,
      region:
        this.headers.get("cf-region") ??
        this.headers.get("x-vercel-ip-country-region") ??
        undefined,
      latitude:
        this.headers.get("cf-iplatitude") ?? this.headers.get("x-vercel-ip-latitude") ?? undefined,
      longitude:
        this.headers.get("cf-iplongitude") ??
        this.headers.get("x-vercel-ip-longitude") ??
        undefined,
    };
  }

  /**
   * The build ID of the Next.js application.
   * Delegates to `nextUrl.buildId` to match Next.js API surface.
   * Can be used in middleware to detect deployment skew between client and server.
   */
  get buildId(): string | undefined {
    return this._nextUrl.buildId;
  }
}

// ---------------------------------------------------------------------------
// NextResponse
// ---------------------------------------------------------------------------

/** Valid HTTP redirect status codes, matching Next.js's REDIRECTS set. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class NextResponse<_Body = unknown> extends Response {
  private _cookies: ResponseCookies;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this._cookies = new MiddlewareResponseCookies(this.headers);
  }

  get cookies(): ResponseCookies {
    return this._cookies;
  }

  /**
   * Create a JSON response.
   */
  static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody> {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers,
    }) as NextResponse<JsonBody>;
  }

  /**
   * Create a redirect response.
   */
  static redirect(url: string | URL | NextURL, init?: number | ResponseInit): NextResponse {
    const status = typeof init === "number" ? init : (init?.status ?? 307);
    if (!REDIRECT_STATUSES.has(status)) {
      throw new RangeError(`Failed to execute "redirect" on "response": Invalid status code`);
    }
    const headers = new Headers(typeof init === "object" ? init?.headers : undefined);
    headers.set("Location", validateURL(url));
    return new NextResponse(null, { status, headers });
  }

  /**
   * Create a rewrite response (middleware pattern).
   * Sets the x-middleware-rewrite header.
   */
  static rewrite(destination: string | URL | NextURL, init?: MiddlewareResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    headers.set(MIDDLEWARE_REWRITE_HEADER, validateURL(destination));
    if (init?.request?.headers) {
      encodeMiddlewareRequestHeaders(headers, init.request.headers);
    }
    return new NextResponse(null, { ...init, headers });
  }

  /**
   * Continue to the next handler (middleware pattern).
   * Sets the x-middleware-next header.
   */
  static next(init?: MiddlewareResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    headers.set(MIDDLEWARE_NEXT_HEADER, "1");
    if (init?.request?.headers) {
      encodeMiddlewareRequestHeaders(headers, init.request.headers);
    }
    return new NextResponse(null, { ...init, headers });
  }
}

export class ResponseCookies {
  private _headers: Headers;
  /** Internal map keyed by cookie name — single source of truth. */
  private _parsed: Map<string, { serialized: string; entry: CookieEntry }> = new Map();

  constructor(headers: Headers) {
    this._headers = headers;

    // Hydrate internal map from any existing Set-Cookie headers
    for (const header of headers.getSetCookie()) {
      const eq = header.indexOf("=");
      if (eq === -1) continue;
      const cookieName = header.slice(0, eq);
      const semi = header.indexOf(";", eq);
      const raw = header.slice(eq + 1, semi === -1 ? undefined : semi);
      let value: string;
      try {
        value = decodeURIComponent(raw);
      } catch {
        value = raw;
      }
      this._parsed.set(cookieName, { serialized: header, entry: { name: cookieName, value } });
    }
  }

  set(
    ...args:
      | [name: string, value: string, options?: CookieOptions]
      | [options: CookieOptions & { name: string; value: string }]
  ): this {
    const [name, value, opts] = parseCookieSetArgs(args);
    validateCookieName(name);

    const serialized = serializeSetCookie(name, value, opts);
    this._parsed.set(name, { serialized, entry: { name, value } });
    this._syncHeaders();
    return this;
  }

  get(...args: [name: string] | [options: { name: string }]): CookieEntry | undefined {
    const key = typeof args[0] === "string" ? args[0] : args[0].name;
    return this._parsed.get(key)?.entry;
  }

  has(name: string): boolean {
    return this._parsed.has(name);
  }

  getAll(...args: [name: string] | [options: { name: string }] | []): CookieEntry[] {
    const all = [...this._parsed.values()].map((v) => v.entry);
    if (args.length === 0) return all;
    const key = typeof args[0] === "string" ? args[0] : args[0].name;
    return all.filter((c) => c.name === key);
  }

  delete(
    ...args:
      | [name: string]
      | [options: Omit<CookieOptions & { name: string }, "maxAge" | "expires">]
  ): this {
    const [name, opts] =
      typeof args[0] === "string" ? [args[0], undefined] : [args[0].name, args[0]];
    return this.set({
      name,
      value: "",
      expires: new Date(0),
      path: opts?.path,
      domain: opts?.domain,
      httpOnly: opts?.httpOnly,
      secure: opts?.secure,
      sameSite: opts?.sameSite,
    });
  }

  [Symbol.iterator](): IterableIterator<[string, CookieEntry]> {
    const entries: [string, CookieEntry][] = [...this._parsed.values()].map((v) => [
      v.entry.name,
      v.entry,
    ]);
    return entries[Symbol.iterator]();
  }

  /** Delete all Set-Cookie headers and re-append from the internal map. */
  private _syncHeaders(): void {
    this._headers.delete("Set-Cookie");
    for (const { serialized } of this._parsed.values()) {
      this._headers.append("Set-Cookie", serialized);
    }
  }
}

class MiddlewareResponseCookies extends ResponseCookies {
  private _responseHeaders: Headers;

  constructor(headers: Headers) {
    super(headers);
    this._responseHeaders = headers;
  }

  override set(
    ...args:
      | [name: string, value: string, options?: CookieOptions]
      | [options: CookieOptions & { name: string; value: string }]
  ): this {
    super.set(...args);
    this._syncMiddlewareCookieHeader();
    return this;
  }

  override delete(
    ...args:
      | [name: string]
      | [options: Omit<CookieOptions & { name: string }, "maxAge" | "expires">]
  ): this {
    super.delete(...args);
    this._syncMiddlewareCookieHeader();
    return this;
  }

  private _syncMiddlewareCookieHeader(): void {
    const cookies = this._responseHeaders.getSetCookie();
    if (cookies.length === 0) {
      this._responseHeaders.delete(MIDDLEWARE_SET_COOKIE_HEADER);
      return;
    }

    this._responseHeaders.set(MIDDLEWARE_SET_COOKIE_HEADER, cookies.join(","));
  }
}

type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

/**
 * Parse the overloaded arguments for ResponseCookies.set():
 *   - (name, value, options?) — positional form
 *   - ({ name, value, ...options }) — object form
 */
function parseCookieSetArgs(
  args:
    | [name: string, value: string, options?: CookieOptions]
    | [options: CookieOptions & { name: string; value: string }],
): [string, string, CookieOptions | undefined] {
  if (typeof args[0] === "string") {
    return [args[0], args[1] as string, args[2] as CookieOptions | undefined];
  }
  const { name, value, ...opts } = args[0];
  return [name, value, opts as CookieOptions];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MiddlewareResponseInit = {
  request?: {
    headers?: Headers;
  };
} & ResponseInit;

export type NextMiddlewareResult = NextResponse | Response | null | undefined | void;

export type NextMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => NextMiddlewareResult | Promise<NextMiddlewareResult>;

// ---------------------------------------------------------------------------
// Utility exports
// ---------------------------------------------------------------------------

/**
 * Parse user agent string. Minimal implementation — for full UA parsing,
 * apps should use a dedicated library like `ua-parser-js`.
 */
export function userAgentFromString(ua: string | undefined): UserAgent {
  const input = ua ?? "";
  return {
    isBot: /bot|crawler|spider|crawling/i.test(input),
    ua: input,
    browser: {},
    device: {},
    engine: {},
    os: {},
    cpu: {},
  };
}

export function userAgent({ headers }: { headers: Headers }): UserAgent {
  return userAgentFromString(headers.get("user-agent") ?? undefined);
}

export type UserAgent = {
  isBot: boolean;
  ua: string;
  browser: { name?: string; version?: string; major?: string };
  device: { model?: string; type?: string; vendor?: string };
  engine: { name?: string; version?: string };
  os: { name?: string; version?: string };
  cpu: { architecture?: string };
};

/**
 * after() — schedule work after the response is sent.
 *
 * Uses the platform's `waitUntil` (via the per-request ExecutionContext) when
 * available so the task survives past the response on Cloudflare Workers.
 * Falls back to a fire-and-forget microtask on runtimes without an execution
 * context (e.g. Node.js dev server).
 *
 * Throws when called inside a cached scope — request-specific
 * side-effects must not leak into cached results.
 */
export function after<T>(task: Promise<T> | (() => T | Promise<T>)): void {
  _throwIfInsideCacheScope("after()");

  const promise = typeof task === "function" ? Promise.resolve().then(task) : task;
  // NOTE: vinext runs function tasks concurrently with response streaming (next microtask),
  // whereas Next.js queues them to run strictly after the response is sent via onClose.
  // This is a known simplification — function tasks here are not guaranteed to run
  // after the response completes, only after the current synchronous execution.
  //
  // `.catch()` is attached synchronously in the same tick as `promise` is created, so
  // there is no window where a pre-rejected `task` promise could trigger an
  // `unhandledrejection` event before the handler is in place.
  const guarded = promise.catch((err) => {
    console.error("[vinext] after() task failed:", err);
  });

  // TODO: Next.js throws when after() is called outside a request context or when
  // waitUntil is unavailable, preventing silent task loss. vinext falls back to
  // fire-and-forget here, which is correct for the Node.js dev server (where
  // getRequestExecutionContext() always returns null). On Workers, a misconfigured
  // entry that omits runWithExecutionContext would silently drop tasks — consider
  // a one-time console.warn on the fallback path, gated to production only (e.g.
  // `process.env.NODE_ENV === 'production'` or `typeof caches !== 'undefined'` for
  // a Workers runtime check) with a module-level `let _warned = false` guard so it
  // fires at most once and doesn't spam the dev-server console.
  getRequestExecutionContext()?.waitUntil(guarded);
}

/**
 * connection() — signals that the response requires a live connection
 * (not a static/cached response). Opts the page out of ISR caching
 * and sets Cache-Control: no-store on the response.
 */
export async function connection(): Promise<void> {
  const {
    getHeadersContext,
    markDynamicUsage,
    markRenderRequestApiUsage,
    suspendConnectionProbe,
    throwIfInsideCacheScope,
  } = await import("./headers.js");
  if (getHeadersContext()?.forceStatic) {
    return;
  }
  markRenderRequestApiUsage("connection");
  throwIfInsideCacheScope("connection()");
  markDynamicUsage();
  const pendingProbe = suspendConnectionProbe();
  if (pendingProbe) {
    await pendingProbe;
  }
}

/**
 * URLPattern re-export — used in middleware for route matching.
 * Available natively in Node 20+, Cloudflare Workers, Deno.
 * Falls back to urlpattern-polyfill if the global is not available.
 */
export const URLPattern: typeof globalThis.URLPattern =
  globalThis.URLPattern ??
  (() => {
    throw new Error(
      "URLPattern is not available in this runtime. " +
        "Install the `urlpattern-polyfill` package or upgrade to Node 20+.",
    );
  });
