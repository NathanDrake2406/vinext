/**
 * Reads the narrow projection of wrangler.jsonc/.json/.toml that vinext's
 * deploy-time features consume: account and KV fields for TPR, cache/route/
 * environment/Worker-name/version-metadata fields for CDN warmup target
 * resolution. Deliberately partial parsing — `utils/toml.ts` holds the
 * format-level TOML helpers, and unknown fields are ignored rather than
 * validated. Owned here so deploy features depend on a config module instead
 * of reaching into feature modules like tpr.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { isUnknownRecord } from "./utils/cache-control-metadata.js";
import {
  extractTomlRouteEntries,
  extractTomlRoutePatterns,
  getTomlRootBody,
  getTomlSections,
  stripTomlLineComments,
} from "./utils/toml.js";

export type WranglerConfig = {
  accountId?: string;
  cache?: WranglerCacheConfig;
  kvNamespaceId?: string;
  customDomain?: string;
  warmupHosts?: readonly string[];
  name?: string;
  legacyEnv?: boolean;
  targetEnvironment?: string;
  versionMetadataBinding?: string;
  env?: Record<string, WranglerEnvironmentConfig>;
};

type WranglerEnvironmentConfig = {
  cache?: WranglerCacheConfig;
  customDomain?: string;
  warmupHosts?: readonly string[];
  name?: string;
  versionMetadataBinding?: string;
};

export type WranglerCacheConfig = {
  enabled?: boolean;
  crossVersionCache?: boolean;
};

// ─── Wrangler Config Parsing ─────────────────────────────────────────────────

/**
 * Parse wrangler config (JSONC or TOML) to extract the fields used by TPR and
 * CDN warmup target resolution.
 */
export function parseWranglerConfig(root: string, configPath?: string): WranglerConfig | null {
  if (configPath) {
    const filepath = path.resolve(root, configPath);
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, "utf-8");
    if (filepath.endsWith(".toml")) {
      return extractFromTOML(content);
    }
    try {
      const json = JSON.parse(stripJsonCommentsAndTrailingCommas(content));
      return extractFromJSON(json);
    } catch {
      return null;
    }
  }

  // Try JSONC / JSON first
  for (const filename of ["wrangler.jsonc", "wrangler.json"]) {
    const filepath = path.join(root, filename);
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, "utf-8");
      try {
        const json = JSON.parse(stripJsonCommentsAndTrailingCommas(content));
        return extractFromJSON(json);
      } catch {
        continue;
      }
    }
  }

  // Try TOML
  const tomlPath = path.join(root, "wrangler.toml");
  if (fs.existsSync(tomlPath)) {
    const content = fs.readFileSync(tomlPath, "utf-8");
    return extractFromTOML(content);
  }

  return null;
}

/**
 * Strip single-line (//), multi-line comments, and trailing commas from JSONC
 * while preserving strings that contain comment-like text or commas.
 */
function stripJsonCommentsAndTrailingCommas(str: string): string {
  let result = "";
  let inString = false;
  let inSingleLine = false;
  let inMultiLine = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (escapeNext) {
      if (!inSingleLine && !inMultiLine) result += ch;
      escapeNext = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escapeNext = true;
      continue;
    }

    if (inSingleLine) {
      if (ch === "\n") {
        inSingleLine = false;
        result += ch;
      }
      continue;
    }

    if (inMultiLine) {
      if (ch === "*" && next === "/") {
        inMultiLine = false;
        i++;
      }
      continue;
    }

    if (ch === '"' && !inString) {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === '"' && inString) {
      inString = false;
      result += ch;
      continue;
    }

    if (!inString && ch === "/" && next === "/") {
      inSingleLine = true;
      i++;
      continue;
    }

    if (!inString && ch === "/" && next === "*") {
      inMultiLine = true;
      i++;
      continue;
    }

    if (!inString && ch === "," && isJsonTrailingComma(str, i + 1)) {
      continue;
    }

    result += ch;
  }

  return result;
}

function isJsonTrailingComma(str: string, start: number): boolean {
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];
    if (ch === undefined) return false;
    if (/\s/.test(ch)) {
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < str.length && str[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < str.length) {
        if (str[i] === "*" && str[i + 1] === "/") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    return ch === "}" || ch === "]";
  }

  return false;
}

function extractFromJSON(config: Record<string, unknown>): WranglerConfig {
  const result: WranglerConfig = {};

  const cache = extractCacheConfig(config.cache);
  if (cache) result.cache = cache;

  if (typeof config.name === "string" && config.name.length > 0) {
    result.name = config.name;
  }

  if (typeof config.legacy_env === "boolean") {
    result.legacyEnv = config.legacy_env;
  }

  // Cloudflare's generated dist/server/wrangler.json is already flattened to
  // the environment selected at build time. Wrangler tags that redirected
  // config so deploy-time readers can distinguish it from a source config
  // that simply omitted the requested env block.
  if (typeof config.targetEnvironment === "string" && config.targetEnvironment.length > 0) {
    result.targetEnvironment = config.targetEnvironment;
  }

  // account_id
  if (typeof config.account_id === "string") {
    result.accountId = config.account_id;
  }

  // KV namespace ID for VINEXT_KV_CACHE
  if (Array.isArray(config.kv_namespaces)) {
    const vinextKV = config.kv_namespaces.find(
      (ns: Record<string, unknown>) =>
        ns &&
        typeof ns === "object" &&
        (ns.binding === "VINEXT_KV_CACHE" || ns.binding === "VINEXT_CACHE"),
    );
    if (vinextKV && typeof vinextKV.id === "string" && vinextKV.id !== "<your-kv-namespace-id>") {
      result.kvNamespaceId = vinextKV.id;
    }
  }

  // TPR needs a zone-resolvable domain, while CDN warmup needs the exact route
  // host. Keep both because zone_name is not the hostname a request should use.
  const domain =
    extractDomainFromRoute(config.route) ??
    extractDomainFromRoutes(config.routes) ??
    extractDomainFromCustomDomains(config);
  if (domain) result.customDomain = domain;
  const warmupHosts = extractWarmupHosts(config);
  if (warmupHosts.length > 0) result.warmupHosts = warmupHosts;
  const versionMetadataBinding = extractVersionMetadataBinding(config);
  if (versionMetadataBinding) result.versionMetadataBinding = versionMetadataBinding;

  const env = extractEnvConfigs(config.env);
  if (env) result.env = env;

  return result;
}

function extractEnvConfigs(envs: unknown): Record<string, WranglerEnvironmentConfig> | undefined {
  if (!envs || typeof envs !== "object" || Array.isArray(envs)) return undefined;

  const result: Record<string, WranglerEnvironmentConfig> = {};
  for (const [envName, rawConfig] of Object.entries(envs)) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) continue;
    const envConfig = extractEnvironmentConfig(rawConfig as Record<string, unknown>);
    if (
      envConfig.name ||
      envConfig.cache ||
      envConfig.customDomain ||
      envConfig.warmupHosts ||
      envConfig.versionMetadataBinding
    ) {
      result[envName] = envConfig;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractEnvironmentConfig(config: Record<string, unknown>): WranglerEnvironmentConfig {
  const result: WranglerEnvironmentConfig = {};
  const cache = extractCacheConfig(config.cache);
  if (cache) result.cache = cache;
  if (typeof config.name === "string" && config.name.length > 0) {
    result.name = config.name;
  }
  const domain =
    extractDomainFromRoute(config.route) ??
    extractDomainFromRoutes(config.routes) ??
    extractDomainFromCustomDomains(config);
  if (domain) result.customDomain = domain;
  const warmupHosts = extractWarmupHosts(config);
  if (warmupHosts.length > 0) result.warmupHosts = warmupHosts;
  const versionMetadataBinding = extractVersionMetadataBinding(config);
  if (versionMetadataBinding) result.versionMetadataBinding = versionMetadataBinding;
  return result;
}

function extractCacheConfig(value: unknown): WranglerCacheConfig | null {
  if (!isUnknownRecord(value)) return null;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
  const crossVersionCache =
    typeof value.cross_version_cache === "boolean" ? value.cross_version_cache : undefined;
  return enabled === undefined && crossVersionCache === undefined
    ? null
    : { enabled, crossVersionCache };
}

function extractVersionMetadataBinding(config: Record<string, unknown>): string | null {
  const metadata = config.version_metadata;
  return isUnknownRecord(metadata) &&
    typeof metadata.binding === "string" &&
    metadata.binding.length > 0
    ? metadata.binding
    : null;
}

function extractDomainFromRoute(route: unknown): string | null {
  if (typeof route === "string") {
    const domain = cleanDomain(route);
    return domain && !domain.includes("workers.dev") ? domain : null;
  }
  if (!isUnknownRecord(route)) return null;
  const domainSource =
    typeof route.zone_name === "string"
      ? route.zone_name
      : typeof route.pattern === "string"
        ? route.pattern
        : null;
  if (!domainSource) return null;
  const domain = cleanDomain(domainSource);
  return domain && !domain.includes("workers.dev") ? domain : null;
}

function extractDomainFromRoutes(routes: unknown): string | null {
  if (!Array.isArray(routes)) return null;
  return firstMatch(routes, extractDomainFromRoute);
}

/**
 * Every eligible host-wide origin, not only the first. The hostname is part of
 * Cloudflare's cache key, so each attached host owns its own cache partition:
 * a deployment with several routes or Custom Domains is only warm once every
 * one of those origins has been warmed.
 */
function extractWarmupHosts(config: Record<string, unknown>): string[] {
  const hosts: string[] = [];
  const singular = extractWarmupHostFromRoute(config.route);
  if (singular) hosts.push(singular);
  if (Array.isArray(config.routes)) {
    hosts.push(...collectMatches(config.routes, extractWarmupHostFromRoute));
  }
  if (Array.isArray(config.custom_domains)) {
    hosts.push(
      ...collectMatches(config.custom_domains, (domain) =>
        typeof domain === "string" ? routePatternToWarmupHost(domain) : null,
      ),
    );
  }
  return dedupeHosts(hosts);
}

/** A host attached both as a route and a Custom Domain is still one cache-key origin. */
function dedupeHosts(hosts: readonly string[]): string[] {
  return [...new Set(hosts)];
}

/**
 * A route array can mix host-wide and path-scoped (or workers.dev) entries;
 * a disqualified earlier entry must not hide a valid later one. Returns the
 * first non-null result of `fn`, or null if none qualify.
 */
function firstMatch<T, R>(items: Iterable<T>, fn: (item: T) => R | null): R | null {
  for (const item of items) {
    const result = fn(item);
    if (result !== null) return result;
  }
  return null;
}

/** Every non-null result of `fn`, preserving input order. */
function collectMatches<T, R>(items: Iterable<T>, fn: (item: T) => R | null): R[] {
  const results: R[] = [];
  for (const item of items) {
    const result = fn(item);
    if (result !== null) results.push(result);
  }
  return results;
}

function extractWarmupHostFromRoute(route: unknown): string | null {
  if (isUnknownRecord(route) && route.enabled === false) return null;
  const pattern = typeof route === "string" ? route : isUnknownRecord(route) ? route.pattern : null;
  return typeof pattern === "string" ? routePatternToWarmupHost(pattern) : null;
}

function extractDomainFromCustomDomains(config: Record<string, unknown>): string | null {
  // Workers Custom Domains: "custom_domains": ["example.com"]
  if (Array.isArray(config.custom_domains)) {
    for (const d of config.custom_domains) {
      if (typeof d === "string" && !d.includes("workers.dev")) {
        return cleanDomain(d);
      }
    }
  }
  return null;
}

/** Strip protocol and trailing wildcards from a route pattern to get a bare domain. */
function cleanDomain(raw: string): string | null {
  const cleaned = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/\*$/, "")
    .replace(/\/+$/, "")
    .split("/")[0]; // Take only the host part
  return cleaned || null;
}

/**
 * Simple extraction of specific fields from wrangler.toml content.
 * Not a full TOML parser — just enough for the fields we need.
 */
function extractFromTOML(content: string): WranglerConfig {
  const result: WranglerConfig = {};
  const sections = getTomlSections(content);

  const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
  if (nameMatch) result.name = nameMatch[1];

  const legacyEnvMatch = content.match(/^legacy_env\s*=\s*(true|false)\s*$/m);
  if (legacyEnvMatch) result.legacyEnv = legacyEnvMatch[1] === "true";

  // account_id = "..."
  const accountMatch = content.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (accountMatch) result.accountId = accountMatch[1];

  // KV namespace with binding = "VINEXT_KV_CACHE"
  // Look for [[kv_namespaces]] blocks
  const kvBlocks = content.split(/\[\[kv_namespaces\]\]/);
  for (let i = 1; i < kvBlocks.length; i++) {
    const block = kvBlocks[i].split(/\[\[/)[0]; // Take until next section
    const bindingMatch = block.match(/binding\s*=\s*"([^"]+)"/);
    const idMatch = block.match(/\bid\s*=\s*"([^"]+)"/);
    if (
      (bindingMatch?.[1] === "VINEXT_KV_CACHE" || bindingMatch?.[1] === "VINEXT_CACHE") &&
      idMatch?.[1] &&
      idMatch[1] !== "<your-kv-namespace-id>"
    ) {
      result.kvNamespaceId = idMatch[1];
    }
  }

  // routes — both string and table forms
  // route = "example.com/*"
  const routeMatch = content.match(/^route\s*=\s*"([^"]+)"/m);
  if (routeMatch) {
    const domain = cleanDomain(routeMatch[1]);
    if (domain && !domain.includes("workers.dev")) {
      result.customDomain = domain;
    }
  }

  // [[routes]] is a TOML array-of-tables: each entry produces its own section
  // with the same header, so an earlier disqualified route must not shadow a
  // later valid one.
  const rootRouteSections = sections.filter(
    (section) => section.header === "route" || section.header === "routes",
  );

  // Preserves prior behavior: root-level [[routes]] blocks match `pattern`
  // only (unlike the env-scoped path below, which also accepts `zone_name`).
  if (!result.customDomain) {
    result.customDomain =
      firstMatch(rootRouteSections, (section) => extractTomlRoutePatternDomain(section.body)) ??
      undefined;
  }

  const warmupHosts = dedupeHosts([
    ...extractTomlWarmupHosts(getTomlRootBody(content)),
    ...collectMatches(rootRouteSections, (section) =>
      extractTomlWarmupRouteBlockHost(section.body),
    ),
  ]);
  if (warmupHosts.length > 0) result.warmupHosts = warmupHosts;

  const rootBody = getTomlRootBody(content);
  const rootCache = sections.find((section) => section.header === "cache");
  const cache =
    extractTomlCacheConfig(rootBody) ??
    (rootCache ? extractTomlCacheTableConfig(rootCache.body) : null);
  if (cache) result.cache = cache;
  const rootVersionMetadata = sections.find((section) => section.header === "version_metadata");
  const versionMetadataBinding =
    extractTomlVersionMetadataBinding(rootBody) ??
    (rootVersionMetadata ? extractTomlVersionMetadataTableBinding(rootVersionMetadata.body) : null);
  if (versionMetadataBinding) result.versionMetadataBinding = versionMetadataBinding;

  const env = extractEnvConfigsFromTOML(content);
  if (env) result.env = env;

  return result;
}

function extractEnvConfigsFromTOML(
  content: string,
): Record<string, WranglerEnvironmentConfig> | undefined {
  const result: Record<string, WranglerEnvironmentConfig> = {};

  for (const section of getTomlSections(content)) {
    const envName = section.header.match(/^env\.([^.]+)$/)?.[1];
    if (envName) {
      const envConfig = result[envName] ?? {};
      const cache = extractTomlCacheConfig(section.body);
      if (cache) envConfig.cache = cache;
      const nameMatch = section.body.match(/^name\s*=\s*"([^"]+)"/m);
      if (nameMatch) envConfig.name = nameMatch[1];
      const domain =
        extractTomlScalarRouteDomain(section.body) ?? extractTomlRoutesArrayDomain(section.body);
      if (domain) envConfig.customDomain = domain;
      const warmupHosts = extractTomlWarmupHosts(section.body);
      if (warmupHosts.length > 0) {
        envConfig.warmupHosts = dedupeHosts([...(envConfig.warmupHosts ?? []), ...warmupHosts]);
      }
      const versionMetadataBinding = extractTomlVersionMetadataBinding(section.body);
      if (versionMetadataBinding) envConfig.versionMetadataBinding = versionMetadataBinding;
      if (
        envConfig.name ||
        envConfig.cache ||
        envConfig.customDomain ||
        envConfig.warmupHosts ||
        envConfig.versionMetadataBinding
      ) {
        result[envName] = envConfig;
      }
      continue;
    }

    const cacheEnvName = section.header.match(/^env\.([^.]+)\.cache$/)?.[1];
    if (cacheEnvName) {
      const envConfig = result[cacheEnvName] ?? {};
      const cache = extractTomlCacheTableConfig(section.body);
      if (cache) envConfig.cache = cache;
      if (
        envConfig.name ||
        envConfig.cache ||
        envConfig.customDomain ||
        envConfig.warmupHosts ||
        envConfig.versionMetadataBinding
      ) {
        result[cacheEnvName] = envConfig;
      }
      continue;
    }

    const metadataEnvName = section.header.match(/^env\.([^.]+)\.version_metadata$/)?.[1];
    if (metadataEnvName) {
      const envConfig = result[metadataEnvName] ?? {};
      const binding = extractTomlVersionMetadataTableBinding(section.body);
      if (binding) envConfig.versionMetadataBinding = binding;
      if (
        envConfig.name ||
        envConfig.cache ||
        envConfig.customDomain ||
        envConfig.warmupHosts ||
        envConfig.versionMetadataBinding
      ) {
        result[metadataEnvName] = envConfig;
      }
      continue;
    }

    const routesEnvName = section.header.match(/^env\.([^.]+)\.(?:route|routes)$/)?.[1];
    if (routesEnvName) {
      const envConfig = result[routesEnvName] ?? {};
      const domain = extractTomlRouteBlockDomain(section.body);
      if (domain) envConfig.customDomain = domain;
      const warmupHost = extractTomlWarmupRouteBlockHost(section.body);
      if (warmupHost) {
        envConfig.warmupHosts = dedupeHosts([...(envConfig.warmupHosts ?? []), warmupHost]);
      }
      if (
        envConfig.name ||
        envConfig.cache ||
        envConfig.customDomain ||
        envConfig.warmupHosts ||
        envConfig.versionMetadataBinding
      ) {
        result[routesEnvName] = envConfig;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function extractTomlCacheConfig(section: string): WranglerCacheConfig | null {
  const match = stripTomlLineComments(section).match(/^cache\s*=\s*\{([\s\S]*?)\}/m);
  return match ? extractTomlCacheTableConfig(match[1] ?? "") : null;
}

function extractTomlCacheTableConfig(section: string): WranglerCacheConfig | null {
  const enabledMatch = section.match(/(?:^|[,\n])\s*enabled\s*=\s*(true|false)\b/);
  const crossVersionMatch = section.match(/(?:^|[,\n])\s*cross_version_cache\s*=\s*(true|false)\b/);
  if (!enabledMatch && !crossVersionMatch) return null;
  return {
    enabled: enabledMatch ? enabledMatch[1] === "true" : undefined,
    crossVersionCache: crossVersionMatch ? crossVersionMatch[1] === "true" : undefined,
  };
}

function extractTomlVersionMetadataBinding(section: string): string | null {
  const match = stripTomlLineComments(section).match(
    /^version_metadata\s*=\s*\{[^}]*\bbinding\s*=\s*(?:"([^"]+)"|'([^']+)')[^}]*\}/m,
  );
  return match?.slice(1).find((value): value is string => Boolean(value)) ?? null;
}

function extractTomlVersionMetadataTableBinding(section: string): string | null {
  const match = section.match(/^binding\s*=\s*(?:"([^"]+)"|'([^']+)')/m);
  return match?.slice(1).find((value): value is string => Boolean(value)) ?? null;
}

function extractTomlScalarRouteDomain(section: string): string | null {
  const routeMatch = section.match(/^route\s*=\s*"([^"]+)"/m);
  if (!routeMatch) return null;
  const domain = cleanDomain(routeMatch[1]);
  return domain && !domain.includes("workers.dev") ? domain : null;
}

function extractTomlRoutesArrayDomain(section: string): string | null {
  const routesMatch = section.match(/^routes\s*=\s*\[([\s\S]*?)\]/m);
  if (!routesMatch) return null;
  return firstMatch(extractTomlRoutePatterns(routesMatch[1] ?? ""), (pattern) => {
    const domain = cleanDomain(pattern);
    return domain && !domain.includes("workers.dev") ? domain : null;
  });
}

function extractTomlWarmupHosts(section: string): string[] {
  const uncommented = stripTomlLineComments(section);
  const scalarRoute = uncommented
    .match(/^route\s*=\s*(?:"([^"]+)"|'([^']+)')/m)
    ?.slice(1)
    .find((value): value is string => Boolean(value));
  if (scalarRoute) {
    const host = routePatternToWarmupHost(scalarRoute);
    return host ? [host] : [];
  }

  const inlineRoute = uncommented.match(/^route\s*=\s*\{([\s\S]*?)\}\s*$/m)?.[1];
  if (inlineRoute && /\benabled\s*=\s*false\b/.test(inlineRoute)) return [];
  const inlinePattern = inlineRoute
    ?.match(/\bpattern\s*=\s*(?:"([^"]+)"|'([^']+)')/)
    ?.slice(1)
    .find((value): value is string => Boolean(value));
  if (inlinePattern) {
    const host = routePatternToWarmupHost(inlinePattern);
    return host ? [host] : [];
  }

  const routesArray = uncommented.match(/^routes\s*=\s*\[([\s\S]*?)\]/m)?.[1];
  if (!routesArray) return [];
  return collectMatches(extractTomlRouteEntries(routesArray), (route) =>
    route.enabled === false ? null : routePatternToWarmupHost(route.pattern),
  );
}

function routePatternToWarmupHost(pattern: string): string | null {
  const withoutProtocol = pattern.replace(/^https?:\/\//, "");
  const pathStart = withoutProtocol.indexOf("/");
  const routePath = pathStart === -1 ? "" : withoutProtocol.slice(pathStart);
  if (routePath !== "" && routePath !== "/*") return null;
  const host = cleanDomain(pattern);
  return host && !host.includes("*") && !host.includes("workers.dev") ? host : null;
}

function extractTomlRouteBlockDomain(section: string): string | null {
  const patternMatch = section.match(/^(?:pattern|zone_name)\s*=\s*"([^"]+)"/m);
  if (!patternMatch) return null;
  const domain = cleanDomain(patternMatch[1]);
  return domain && !domain.includes("workers.dev") ? domain : null;
}

function extractTomlRoutePatternDomain(section: string): string | null {
  const patternMatch = section.match(/^pattern\s*=\s*"([^"]+)"/m);
  if (!patternMatch) return null;
  const domain = cleanDomain(patternMatch[1]);
  return domain && !domain.includes("workers.dev") ? domain : null;
}

function extractTomlWarmupRouteBlockHost(section: string): string | null {
  if (/^enabled\s*=\s*false\b/m.test(section)) return null;
  const patternMatch = section.match(/^pattern\s*=\s*"([^"]+)"/m);
  return patternMatch ? routePatternToWarmupHost(patternMatch[1]) : null;
}
