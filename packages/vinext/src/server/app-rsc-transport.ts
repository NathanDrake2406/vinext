import { decodeBase64Url, encodeBase64Url } from "../utils/base64url.js";
import { APP_RSC_RENDER_MODE_NAVIGATION } from "./app-rsc-render-mode.js";
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL_HEADER,
  VINEXT_CLIENT_REUSE_MANIFEST_HEADER,
  VINEXT_INTERCEPTION_CONTEXT_HEADER,
  VINEXT_MOUNTED_SLOTS_HEADER,
  VINEXT_RSC_RENDER_MODE_HEADER,
} from "./headers.js";

export const VINEXT_STATIC_RSC_TRANSPORT_PREFIX = "/_next/static/__vinext/prerendered-rsc";
export const VINEXT_WORKER_RSC_TRANSPORT_PREFIX = "/__vinext/rsc";

export function isCloudflareRscTransportEnabled(): boolean {
  return process.env.__VINEXT_CLOUDFLARE_RSC_TRANSPORT === "true";
}

/**
 * Transport asset names encode the full visible pathname as one opaque
 * base64url token. Structured filenames (`/about.rsc` plus `__root.rsc` /
 * `__index.rsc` sentinels) are not injective: legal routes like `/__root` or
 * `/docs/__index` alias the sentinels for `/` and `/docs/`. The token keeps
 * the route-to-asset mapping bijective for every legal pathname.
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
// Reject non-canonical tokens (`+`, `/`, `=`) so each route has exactly one
// accepted transport asset path, not every base64 spelling atob tolerates.
const BASE64URL_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function encodeRouteToken(routePathname: string): string {
  return encodeBase64Url(textEncoder.encode(routePathname));
}

function decodeRouteToken(token: string): string | null {
  if (!BASE64URL_TOKEN_PATTERN.test(token)) return null;
  const bytes = decodeBase64Url(token);
  return bytes === null ? null : textDecoder.decode(bytes);
}

function isStaticRscTransportEligible(headers: Headers): boolean {
  const renderMode = headers.get(VINEXT_RSC_RENDER_MODE_HEADER);
  return (
    !headers.has(NEXT_ROUTER_PREFETCH_HEADER) &&
    !headers.has(NEXT_ROUTER_SEGMENT_PREFETCH_HEADER) &&
    !headers.has(NEXT_ROUTER_STATE_TREE_HEADER) &&
    !headers.has(NEXT_URL_HEADER) &&
    !headers.has(VINEXT_CLIENT_REUSE_MANIFEST_HEADER) &&
    !headers.has(VINEXT_INTERCEPTION_CONTEXT_HEADER) &&
    !headers.has(VINEXT_MOUNTED_SLOTS_HEADER) &&
    (renderMode === null || renderMode === APP_RSC_RENDER_MODE_NAVIGATION)
  );
}

export function createRscTransportAssetPathname(routePathname: string): string {
  if (!routePathname.startsWith("/")) {
    throw new Error(`Invalid RSC transport route pathname: ${routePathname}`);
  }
  return `/${encodeRouteToken(routePathname)}.rsc`;
}

export function createRscTransportRequestPathname(routePathname: string, headers: Headers): string {
  const prefix = isStaticRscTransportEligible(headers)
    ? VINEXT_STATIC_RSC_TRANSPORT_PREFIX
    : VINEXT_WORKER_RSC_TRANSPORT_PREFIX;
  return `${prefix}${createRscTransportAssetPathname(routePathname)}`;
}

function stripTransportPrefix(pathname: string, prefix: string): string | null {
  if (pathname === prefix) return "";
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : null;
}

export function resolveRscTransportRoutePathname(pathname: string): string | null {
  const assetPathname =
    stripTransportPrefix(pathname, VINEXT_STATIC_RSC_TRANSPORT_PREFIX) ??
    stripTransportPrefix(pathname, VINEXT_WORKER_RSC_TRANSPORT_PREFIX);
  if (assetPathname === null) return null;
  if (!assetPathname.startsWith("/") || !assetPathname.endsWith(".rsc")) return null;
  const token = assetPathname.slice(1, -4);
  if (token.length === 0 || token.includes("/")) return null;
  const routePathname = decodeRouteToken(token);
  return routePathname !== null && routePathname.startsWith("/") ? routePathname : null;
}

export function resolveRscTransportRequest(request: Request, url = new URL(request.url)): Request {
  const routePathname = resolveRscTransportRoutePathname(url.pathname);
  if (routePathname === null) return request;

  const mappedUrl = `${url.protocol}//${url.host}${routePathname}${url.search}`;
  return new Request(mappedUrl, request);
}
