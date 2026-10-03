import { removeTrailingSlash } from "../utils/base-path.js";

// Characters that start a param, group, modifier, or escape in a source.
const CLIENT_CONFIG_SOURCE_SYNTAX = /[:(){}\\*+?]/;

/**
 * Match a redirect or rewrite source without the real matcher
 * (`matchConfigPattern`), which is loaded on demand to keep it out of the
 * router chunk.
 *
 * A definite answer (params or `null`) must equal the answer of the real
 * matcher. This function therefore answers only for the source shapes whose
 * meaning it implements in full: literal segments, whole-segment `:name`
 * params, and one trailing `:name*` or `:name+`. It returns `undefined` for
 * every other source and for a pathname it does not normalize, and the caller
 * then asks the real matcher.
 */
export function matchSimpleClientConfigPattern(
  pathname: string,
  source: string,
): Record<string, string> | null | undefined {
  // The real matcher compares with the regex `i` flag. For non-ASCII text
  // that flag and toLowerCase() do not agree on every character.
  if (!source.startsWith("/") || /[^\x20-\x7e]/.test(source + pathname)) return undefined;

  // The real matcher removes one trailing slash from the pathname. A source
  // that ends in a slash, and a pathname that ends in two, are left to it.
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (!path.startsWith("/") || (path.length > 1 && path.endsWith("/"))) return undefined;

  const sourceParts = source === "/" ? [] : source.slice(1).split("/");
  const pathParts = path === "/" ? [] : path.slice(1).split("/");
  const params: Record<string, string> = {};

  for (let index = 0; index < sourceParts.length; index++) {
    const sourcePart = sourceParts[index]!;
    const pathPart = pathParts[index];

    if (sourcePart !== "" && !CLIENT_CONFIG_SOURCE_SYNTAX.test(sourcePart)) {
      if (pathPart?.toLowerCase() !== sourcePart.toLowerCase()) return null;
      continue;
    }

    const param = /^:(\w+)$/.exec(sourcePart);
    if (param) {
      // A param needs a non-empty segment, so `/:section` does not match `/`.
      if (!pathPart) return null;
      params[param[1]!] = pathPart;
      continue;
    }

    const catchAll = index === sourceParts.length - 1 ? /^:(\w+)([*+])$/.exec(sourcePart) : null;
    if (!catchAll) return undefined;
    const rest = pathParts.slice(index);
    if (rest.includes("") || (catchAll[2] === "+" && rest.length === 0)) return null;
    params[catchAll[1]!] = rest.join("/");
    return params;
  }

  return pathParts.length === sourceParts.length ? params : null;
}

/**
 * Cheap pre-check before a source is matched. It must never return false for
 * a pathname that the real matcher accepts.
 *
 * Only the whole literal segments at the start of the source are compared.
 * The segment that holds the first param or group is not: `/legacy-(.*)`
 * matches `/legacy-x`, and in `/shop/:id?` the `/` before the param is
 * optional with it.
 */
export function simpleClientConfigSourceCouldMatch(pathname: string, source: string): boolean {
  const syntaxIndex = source.search(CLIENT_CONFIG_SOURCE_SYNTAX);
  const literalPrefix =
    syntaxIndex === -1
      ? removeTrailingSlash(source)
      : source.slice(0, Math.max(0, source.lastIndexOf("/", syntaxIndex)));
  if (!literalPrefix || literalPrefix === "/") return true;
  const normalizedPrefix = literalPrefix.toLowerCase();
  const normalizedPathname = removeTrailingSlash(pathname).toLowerCase();
  return (
    normalizedPathname === normalizedPrefix || normalizedPathname.startsWith(`${normalizedPrefix}/`)
  );
}
