import { hasBasePath, stripBasePath } from "./base-path.js";

export function normalizeAssetPrefix(assetPrefix: string | undefined): string {
  const raw = assetPrefix?.trim();
  if (!raw) return "";

  if (URL.canParse(raw)) {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  }

  const pathPrefix = raw.replace(/^\/+|\/+$/g, "");
  return pathPrefix ? `/${pathPrefix}` : "";
}

export function assetPrefixPathname(assetPrefix: string | undefined): string {
  const normalized = normalizeAssetPrefix(assetPrefix);
  if (!normalized) return "";

  if (URL.canParse(normalized)) {
    const pathname = new URL(normalized).pathname;
    return pathname === "/" ? "" : pathname.replace(/\/+$/, "");
  }

  return normalized;
}

export function stripAssetPrefixPathname(
  pathname: string,
  assetPrefix: string | undefined,
): string {
  const prefixPathname = assetPrefixPathname(assetPrefix);
  if (!prefixPathname || !hasBasePath(pathname, prefixPathname)) {
    return pathname;
  }

  return stripBasePath(pathname, prefixPathname);
}

export function applyAssetPrefix(pathname: string, assetPrefix: string | undefined): string {
  const normalized = normalizeAssetPrefix(assetPrefix);
  if (!normalized || !pathname.startsWith("/")) return pathname;
  return `${normalized}${pathname}`;
}
