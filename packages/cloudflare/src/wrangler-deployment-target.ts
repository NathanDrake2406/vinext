/**
 * Resolves the Worker name, production hosts, and version metadata binding
 * that CDN warmup needs to target a deploy, on top of the raw fields
 * `parseWranglerConfig` reads out of wrangler.jsonc/.toml.
 *
 * The env fallback and legacy_env Worker-name suffixing here are CDN-warmup
 * resolution rules, not generic Wrangler config fields — they layer on the
 * raw projection `wrangler-config.ts` owns.
 */

import type { WranglerTargetOptions } from "./wrangler-cli.js";
import {
  parseWranglerConfig,
  type WranglerCacheConfig,
  type WranglerConfig,
} from "./wrangler-config.js";

export type WranglerDeploymentTarget = {
  cacheEnabled?: boolean;
  crossVersionCache?: boolean;
  hasProductionRoute: boolean;
  workerName?: string;
  /**
   * Every host-wide origin (route or Custom Domain) attached to the Worker.
   * The hostname is part of Cloudflare's cache key, so each entry is its own
   * cache partition and warmup must cover all of them.
   */
  productionHosts: readonly string[];
  /**
   * True when some enabled route could not be reduced to a concrete host-wide
   * origin (path-scoped or wildcard-host patterns). Its cache partition is
   * unreachable to warmup, so `productionHosts` is an incomplete picture of
   * the production cache surface and no "confirmed warm" claim may be made.
   */
  hasUnwarmableProductionRoute: boolean;
  versionMetadataBinding?: string;
};

export function getWranglerTargetEnv(
  options: Pick<WranglerTargetOptions, "preview" | "env">,
): string | undefined {
  return options.env || (options.preview ? "preview" : undefined);
}

export function resolveWranglerDeploymentTarget(
  root: string,
  options: WranglerTargetOptions,
): WranglerDeploymentTarget | null {
  const config = parseWranglerConfig(root, options.config);
  if (!config) return null;
  const envName = getWranglerTargetEnv(options);
  const flattenedEnvConfig = Boolean(
    envName && !config.env?.[envName] && config.targetEnvironment === envName,
  );
  const selected = envName
    ? (config.env?.[envName] ?? (flattenedEnvConfig ? config : undefined))
    : config;
  const cache = resolveCacheConfig(config, envName, flattenedEnvConfig);
  return {
    cacheEnabled: cache?.enabled,
    crossVersionCache: cache?.crossVersionCache,
    hasProductionRoute: Boolean(selected?.customDomain),
    workerName: resolveWorkerName(config, envName, flattenedEnvConfig, options.name),
    productionHosts: selected?.warmupHosts ?? [],
    hasUnwarmableProductionRoute: Boolean(selected?.hasUnwarmableRoute),
    versionMetadataBinding: selected?.versionMetadataBinding,
  };
}

/** Wrangler inherits the whole cache object only when an env omits it. */
function resolveCacheConfig(
  config: WranglerConfig,
  envName: string | undefined,
  flattenedEnvConfig: boolean,
): WranglerCacheConfig | undefined {
  if (!envName || flattenedEnvConfig) return config.cache;
  return config.env?.[envName]?.cache ?? config.cache;
}

function resolveWorkerName(
  config: WranglerConfig,
  envName: string | undefined,
  flattenedEnvConfig: boolean,
  explicitName: string | undefined,
): string | undefined {
  if (explicitName) return explicitName;
  if (!envName) return config.name;
  const explicitEnvName = config.env?.[envName]?.name;
  if (explicitEnvName) return explicitEnvName;
  if (flattenedEnvConfig) return config.name;
  if (!config.name) return undefined;
  return config.legacyEnv === false ? config.name : `${config.name}-${envName}`;
}
