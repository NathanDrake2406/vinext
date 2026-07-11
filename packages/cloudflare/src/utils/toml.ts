/**
 * Format-generic TOML lexing helpers used by the Wrangler config reader.
 *
 * This is deliberately not a full TOML parser — it is the small set of
 * source-scanning primitives the deploy path needs (comment stripping, section
 * splitting, inline route-array reading). The wrangler-specific semantics
 * (which fields mean a custom domain, a warmup host, a KV namespace, etc.) live
 * in `tpr.ts`; this module only knows TOML text shape, mirroring how the init
 * path keeps generic JSONC parsing in `utils/jsonc`.
 */

export type TomlSection = {
  header: string;
  body: string;
};

export type TomlRouteEntry = {
  pattern: string;
  enabled?: boolean;
};

/**
 * Remove TOML line comments (`#` to end of line) while leaving `#` that appears
 * inside quoted strings intact. Basic strings use `"` with `\` escapes; literal
 * strings use `'` with no escapes. Callers only pass single-line string values
 * (route patterns), so `"""`/`'''` multiline forms are not handled.
 */
function stripTomlLineComments(body: string): string {
  let result = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote === '"') {
      result += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      result += ch;
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      result += ch;
      continue;
    }
    if (ch === "#") {
      while (i < body.length && body[i] !== "\n") i++;
      if (i < body.length) result += "\n";
      continue;
    }
    result += ch;
  }
  return result;
}

/** Return the section name from a TOML header line (`[name]` or `[[name]]`), else null. */
function parseTomlSectionHeader(line: string): string | null {
  // TOML allows a trailing comment after a table header (`[env.foo] # note`).
  // Strip it first (quote-aware) so the header is still recognized; otherwise
  // the section is misread as body and its keys leak into the previous section.
  const trimmed = stripTomlLineComments(line).trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const isArrayHeader = trimmed.startsWith("[[") && trimmed.endsWith("]]");
  const start = isArrayHeader ? 2 : 1;
  const end = isArrayHeader ? trimmed.length - 2 : trimmed.length - 1;
  const header = trimmed.slice(start, end).trim();
  return header.length > 0 ? header : null;
}

/**
 * Split TOML into its sections. A repeated `[[header]]` array-of-tables yields
 * one entry per occurrence, so callers can walk every block under a header
 * instead of only the first.
 */
export function getTomlSections(content: string): TomlSection[] {
  const sections: TomlSection[] = [];
  let currentHeader: string | null = null;
  let currentBody: string[] = [];

  for (const line of content.split("\n")) {
    const header = parseTomlSectionHeader(line);
    if (header) {
      if (currentHeader) {
        sections.push({ header: currentHeader, body: currentBody.join("\n") });
      }
      currentHeader = header;
      currentBody = [];
    } else if (currentHeader) {
      currentBody.push(line);
    }
  }

  if (currentHeader) {
    sections.push({ header: currentHeader, body: currentBody.join("\n") });
  }

  return sections;
}

/** Return the top-of-file body before the first TOML section header. */
export function getTomlRootBody(content: string): string {
  const lines: string[] = [];
  for (const line of content.split("\n")) {
    if (parseTomlSectionHeader(line)) break;
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Extract each route pattern from a TOML inline `routes = [...]` array body.
 * Every entry is either a bare string (basic `"..."` or literal `'...'`) or an
 * inline table with a `pattern` field; entries without a resolvable pattern
 * (e.g. only `zone_name`) are skipped rather than aborting the whole array.
 *
 * TOML permits `#` comments between array values, so a commented-out route must
 * not be read as a live entry. Comments are stripped first, honoring `#` inside
 * quoted strings.
 */
export function extractTomlRouteEntries(routesArrayBody: string): TomlRouteEntry[] {
  const routes: TomlRouteEntry[] = [];
  for (const entry of stripTomlLineComments(routesArrayBody).matchAll(
    /\{[^}]*\}|"[^"]*"|'[^']*'/g,
  )) {
    const raw = entry[0];
    const pattern = raw.startsWith("{")
      ? raw
          .match(/\bpattern\s*=\s*(?:"([^"]+)"|'([^']+)')/)
          ?.slice(1)
          .find(Boolean)
      : raw.slice(1, -1);
    if (!pattern) continue;
    const enabledMatch = raw.startsWith("{") ? raw.match(/\benabled\s*=\s*(true|false)\b/) : null;
    routes.push({
      pattern,
      ...(enabledMatch ? { enabled: enabledMatch[1] === "true" } : {}),
    });
  }
  return routes;
}

export function extractTomlRoutePatterns(routesArrayBody: string): string[] {
  return extractTomlRouteEntries(routesArrayBody).map((route) => route.pattern);
}
