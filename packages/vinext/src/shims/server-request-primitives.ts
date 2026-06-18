import { parseEdgeRequestCookieHeader } from "../utils/parse-cookie.js";
import { assertSafeNavigationUrl } from "./url-safety.js";
import { hasBasePath, stripBasePath } from "../utils/base-path.js";
import { validateCookieName } from "./internal/cookie-serialize.js";

// ---------------------------------------------------------------------------
// NextURL — lightweight URL wrapper with pathname helpers
// ---------------------------------------------------------------------------

export type NextURLConfig = {
  basePath?: string;
  nextConfig?: {
    i18n?: {
      locales: string[];
      defaultLocale: string;
      domains?: Array<{
        domain: string;
        defaultLocale: string;
        locales?: string[];
      }>;
    };
    /**
     * When true, `href`/`toString()` formats non-root, non-file-like pathnames
     * with a trailing slash. Matches Next.js's `formatNextPathnameInfo` so that
     * `NextResponse.redirect(request.nextUrl)` and `NextResponse.rewrite(url)`
     * honour the user's `trailingSlash` config.
     */
    trailingSlash?: boolean;
  };
};

export class NextURL {
  /** Internal URL stores the pathname WITHOUT basePath or locale prefix. */
  private _url: URL;
  /**
   * The configured basePath (from nextConfig). May differ from the active
   * `_basePath`: parsing only activates basePath when the URL's pathname
   * actually carries the configured prefix.
   */
  private _configBasePath: string;
  private _basePath: string;
  private _trailingSlash: boolean;
  private _locale: string | undefined;
  private _configDefaultLocale: string | undefined;
  private _defaultLocale: string | undefined;
  private _locales: string[] | undefined;
  private _domains: NonNullable<NonNullable<NextURLConfig["nextConfig"]>["i18n"]>["domains"];
  private _domainLocale:
    | NonNullable<NonNullable<NonNullable<NextURLConfig["nextConfig"]>["i18n"]>["domains"]>[number]
    | undefined;

  constructor(input: string | URL, base?: string | URL, config?: NextURLConfig) {
    this._url = new URL(input.toString(), base);
    this._configBasePath = config?.basePath ?? "";
    this._basePath = this._configBasePath;
    this._trailingSlash = config?.nextConfig?.trailingSlash ?? false;
    this._stripBasePath();
    const i18n = config?.nextConfig?.i18n;
    if (i18n) {
      this._locales = [...i18n.locales];
      this._domains = i18n.domains?.map((domain) => ({
        ...domain,
        locales: domain.locales ? [...domain.locales] : undefined,
      }));
      this._configDefaultLocale = i18n.defaultLocale;
      this._analyzeI18n();
    }
  }

  /** Strip basePath prefix from the internal pathname.
   * Mirrors Next.js's getNextPathnameInfo (re-run by NextURL.analyze() on
   * every parse, including `href` reassignment): basePath is only considered
   * active when the URL's pathname actually starts with the configured
   * basePath prefix. If the pathname is outside the basePath, the active
   * basePath is cleared to "" so that request.nextUrl.basePath reflects the
   * actual URL rather than the config value; if a later `href` assignment
   * moves the URL back inside the basePath, it is re-activated from the
   * configured value. This matches the Next.js behavior tested by
   * middleware-base-path's "should execute from absolute paths" case.
   */
  private _stripBasePath(): void {
    if (!this._configBasePath) return;
    if (!hasBasePath(this._url.pathname, this._configBasePath)) {
      this._basePath = "";
      return;
    }
    this._basePath = this._configBasePath;
    this._url.pathname = stripBasePath(this._url.pathname, this._configBasePath);
  }

  /** Extract locale from pathname, stripping it from the internal URL. */
  private _detectPathnameLocale(locales: string[]): string | undefined {
    const segments = this._url.pathname.split("/");
    const candidate = segments[1]?.toLowerCase();
    const match = locales.find((l) => l.toLowerCase() === candidate);
    if (match) {
      this._url.pathname = "/" + segments.slice(2).join("/");
    }
    return match;
  }

  private _analyzeI18n(): void {
    if (!this._locales || !this._configDefaultLocale) return;
    const detectedLocale = this._detectPathnameLocale(this._locales);
    const detectedLocaleLower = detectedLocale?.toLowerCase();
    const hostname = this._url.hostname.toLowerCase();
    this._domainLocale = this._domains?.find(
      (domain) =>
        domain.domain.split(":", 1)[0].toLowerCase() === hostname ||
        detectedLocaleLower === domain.defaultLocale.toLowerCase() ||
        domain.locales?.some((locale) => locale.toLowerCase() === detectedLocaleLower),
    );
    this._defaultLocale = this._domainLocale?.defaultLocale ?? this._configDefaultLocale;
    this._locale = detectedLocale ?? this._defaultLocale;
  }

  /**
   * Reconstruct the full pathname with basePath + locale prefix and apply
   * the configured trailingSlash policy.
   * Mirrors Next.js's internal formatNextPathnameInfo().
   */
  private _formatPathname(): string {
    // Build prefix: basePath + locale (skip defaultLocale — Next.js omits it)
    let prefix = this._basePath;
    const inner = this._url.pathname;
    const innerLower = inner.toLowerCase();
    const isApiPath = innerLower === "/api" || innerLower.startsWith("/api/");
    if (!isApiPath && this._locale && this._locale !== this._defaultLocale) {
      prefix += "/" + this._locale;
    }
    const composed = !prefix ? inner : inner === "/" ? prefix : prefix + inner;
    return this._applyTrailingSlash(composed);
  }

  /**
   * Apply the configured trailingSlash policy to a composed pathname. Matches
   * Next.js's `formatNextPathnameInfo`: when `trailingSlash` is true, add a
   * trailing slash unless the path is empty/root; when false, strip a trailing
   * slash unless the path is empty/root.
   */
  private _applyTrailingSlash(pathname: string): string {
    // Never strip or add a slash to the root path.
    if (pathname === "" || pathname === "/") return pathname;
    if (this._trailingSlash) {
      return pathname.endsWith("/") ? pathname : pathname + "/";
    }
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  }

  get href(): string {
    const formatted = this._formatPathname();
    if (formatted === this._url.pathname) return this._url.href;
    // Replace pathname in href via string slicing — avoids URL allocation.
    // URL.href is always <origin+auth><pathname><search><hash>.
    const { href, pathname, search, hash } = this._url;
    const baseEnd = href.length - pathname.length - search.length - hash.length;
    return href.slice(0, baseEnd) + formatted + search + hash;
  }
  set href(value: string) {
    this._url.href = value;
    this._stripBasePath();
    this._analyzeI18n();
  }

  get origin(): string {
    return this._url.origin;
  }

  get protocol(): string {
    return this._url.protocol;
  }
  set protocol(value: string) {
    this._url.protocol = value;
  }

  get username(): string {
    return this._url.username;
  }
  set username(value: string) {
    this._url.username = value;
  }

  get password(): string {
    return this._url.password;
  }
  set password(value: string) {
    this._url.password = value;
  }

  get host(): string {
    return this._url.host;
  }
  set host(value: string) {
    this._url.host = value;
  }

  get hostname(): string {
    return this._url.hostname;
  }
  set hostname(value: string) {
    this._url.hostname = value;
  }

  get port(): string {
    return this._url.port;
  }
  set port(value: string) {
    this._url.port = value;
  }

  /** Returns the pathname WITHOUT basePath or locale prefix. */
  get pathname(): string {
    return this._url.pathname;
  }
  set pathname(value: string) {
    this._url.pathname = value;
  }

  get search(): string {
    return this._url.search;
  }
  set search(value: string) {
    this._url.search = value;
  }

  get searchParams(): URLSearchParams {
    return this._url.searchParams;
  }

  get hash(): string {
    return this._url.hash;
  }
  set hash(value: string) {
    this._url.hash = value;
  }

  get basePath(): string {
    return this._basePath;
  }
  set basePath(value: string) {
    this._basePath = value === "" ? "" : value.startsWith("/") ? value : "/" + value;
  }

  get locale(): string {
    return this._locale ?? "";
  }
  set locale(value: string | undefined) {
    if (this._locales) {
      if (!value) {
        this._locale = this._defaultLocale;
        return;
      }
      if (!this._locales.includes(value)) {
        throw new TypeError(
          `The locale "${value}" is not in the configured locales: ${this._locales.join(", ")}`,
        );
      }
    }
    this._locale = this._locales ? value : this._locale;
  }

  get defaultLocale(): string | undefined {
    return this._defaultLocale;
  }

  get domainLocale(): typeof this._domainLocale {
    if (!this._domainLocale) return undefined;
    return {
      ...this._domainLocale,
      locales: this._domainLocale.locales ? [...this._domainLocale.locales] : undefined,
    };
  }

  get locales(): string[] | undefined {
    return this._locales ? [...this._locales] : undefined;
  }

  clone(): NextURL {
    const nextConfig: NonNullable<NextURLConfig["nextConfig"]> = {};
    if (this._locales) {
      nextConfig.i18n = {
        locales: [...this._locales],
        defaultLocale: this._configDefaultLocale!,
        domains: this._domains?.map((domain) => ({
          ...domain,
          locales: domain.locales ? [...domain.locales] : undefined,
        })),
      };
    }
    if (this._trailingSlash) {
      nextConfig.trailingSlash = true;
    }
    const config: NextURLConfig = {
      basePath: this._basePath,
      nextConfig: Object.keys(nextConfig).length > 0 ? nextConfig : undefined,
    };
    // Pass the full href (with locale/basePath re-added) so the constructor
    // can re-analyze and extract locale correctly.
    return new NextURL(this.href, undefined, config);
  }

  toString(): string {
    return this.href;
  }

  /**
   * The build ID of the Next.js application.
   * Set from `generateBuildId` in next.config.js, or a random UUID if not configured.
   * Can be used in middleware to detect deployment skew between client and server.
   * Matches the Next.js API: `request.nextUrl.buildId`.
   */
  get buildId(): string | undefined {
    return process.env.__VINEXT_BUILD_ID ?? undefined;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers (minimal implementations)
// ---------------------------------------------------------------------------

export type CookieEntry = {
  name: string;
  value: string;
};

export class RequestCookies {
  private _headers: Headers;
  private _parsed: Map<string, string>;

  constructor(headers: Headers) {
    this._headers = headers;
    this._parsed = parseEdgeRequestCookieHeader(headers.get("cookie") ?? "");
  }

  get(name: string): CookieEntry | undefined {
    const value = this._parsed.get(name);
    return value !== undefined ? { name, value } : undefined;
  }

  getAll(nameOrOptions?: string | CookieEntry): CookieEntry[] {
    const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions?.name;
    return [...this._parsed.entries()]
      .filter(([cookieName]) => name === undefined || cookieName === name)
      .map(([cookieName, value]) => ({ name: cookieName, value }));
  }

  has(name: string): boolean {
    return this._parsed.has(name);
  }

  set(nameOrOptions: string | CookieEntry, value?: string): this {
    let cookieName: string;
    let cookieValue: string;
    if (typeof nameOrOptions === "string") {
      cookieName = nameOrOptions;
      cookieValue = value ?? "";
    } else {
      cookieName = nameOrOptions.name;
      cookieValue = nameOrOptions.value;
    }
    validateCookieName(cookieName);
    this._parsed.set(cookieName, cookieValue);
    this._syncHeader();
    return this;
  }

  delete(names: string | string[]): boolean | boolean[] {
    if (Array.isArray(names)) {
      const results = names.map((name) => {
        validateCookieName(name);
        return this._parsed.delete(name);
      });
      this._syncHeader();
      return results;
    }
    validateCookieName(names);
    const result = this._parsed.delete(names);
    this._syncHeader();
    return result;
  }

  clear(): this {
    this._parsed.clear();
    this._syncHeader();
    return this;
  }

  get size(): number {
    return this._parsed.size;
  }

  toString(): string {
    return this._serialize();
  }

  private _serialize(): string {
    return [...this._parsed.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  }

  private _syncHeader(): void {
    if (this._parsed.size === 0) {
      this._headers.delete("cookie");
    } else {
      this._headers.set("cookie", this._serialize());
    }
  }

  [Symbol.iterator](): IterableIterator<[string, CookieEntry]> {
    const entries = this.getAll().map((c) => [c.name, c] as [string, CookieEntry]);
    return entries[Symbol.iterator]();
  }
}

// Keep this error message in sync with headers.ts. This adapter backs
// NextRequest cookies, while headers.ts owns the next/headers cookies object.
class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super(
      "Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options",
    );
  }

  static callable(this: void): never {
    throw new ReadonlyRequestCookiesError();
  }
}

const REQUEST_HEADERS_MUTATING_METHODS = new Set(["set", "delete", "append"]);

// Keep this error message in sync with headers.ts. This adapter backs
// NextRequest headers in force-static route handlers, while headers.ts owns the
// next/headers object.
class ReadonlyRequestHeadersError extends Error {
  constructor() {
    super(
      "Headers cannot be modified. Read more: https://nextjs.org/docs/app/api-reference/functions/headers",
    );
  }

  static callable(this: void): never {
    throw new ReadonlyRequestHeadersError();
  }
}

export function sealRequestHeaders(headers: Headers): Headers {
  return new Proxy<Headers>(headers, {
    get(target, prop) {
      if (typeof prop === "string" && REQUEST_HEADERS_MUTATING_METHODS.has(prop)) {
        return ReadonlyRequestHeadersError.callable;
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function sealRequestCookies(cookies: RequestCookies): RequestCookies {
  return new Proxy<RequestCookies>(cookies, {
    get(target, prop) {
      if (prop === "set" || prop === "delete" || prop === "clear") {
        return ReadonlyRequestCookiesError.callable;
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function validateURL(url: string | URL | NextURL): string {
  assertSafeNavigationUrl(String(url));
  try {
    return String(new URL(String(url)));
  } catch (error) {
    throw new Error(
      `URL is malformed "${String(
        url,
      )}". Please use only absolute URLs - https://nextjs.org/docs/messages/middleware-relative-urls`,
      { cause: error },
    );
  }
}

/**
 * Minimal NextFetchEvent — extends FetchEvent where available,
 * otherwise provides the waitUntil pattern standalone.
 */
export class NextFetchEvent {
  sourcePage: string;
  private _waitUntilPromises: Promise<unknown>[] = [];

  constructor(params: { page: string }) {
    this.sourcePage = params.page;
  }

  waitUntil(promise: Promise<unknown>): void {
    this._waitUntilPromises.push(promise);
  }

  get waitUntilPromises(): Promise<unknown>[] {
    return this._waitUntilPromises;
  }

  /** Drain all waitUntil promises. Returns a single promise that settles when all are done. */
  drainWaitUntil(): Promise<PromiseSettledResult<unknown>[]> {
    return Promise.allSettled(this._waitUntilPromises);
  }
}
