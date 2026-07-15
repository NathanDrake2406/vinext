/**
 * Resolves the Worker name, production host, and version metadata binding
 * that CDN warmup needs to target a deploy, on top of the raw fields
 * `parseWranglerConfig` reads out of wrangler.jsonc/.toml.
 *
 * The env fallback and legacy_env Worker-name suffixing here are CDN-warmup
 * resolution rules, not generic Wrangler config fields — keeping them out of
 * tpr.ts keeps that module's `WranglerConfig` an honest TPR-input shape
 * instead of a shared deployment-semantics owner.
 */

import type { DeployOptions } from "./deploy.js";
import { parseWranglerConfig, type WranglerConfig } from "./tpr.js";

export type WranglerDeploymentTarget = {
  workerName?: string;
  productionHost?: string;
  versionMetadataBinding?: string;
};

export function getWranglerTargetEnv(
  options: Pick<DeployOptions, "preview" | "env">,
): string | undefined {
  return options.env || (options.preview ? "preview" : undefined);
}

export function resolveWranglerDeploymentTarget(
  root: string,
  options: Pick<DeployOptions, "preview" | "env" | "name" | "config">,
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
  return {
    workerName: resolveWorkerName(config, envName, flattenedEnvConfig, options.name),
    productionHost: selected?.warmupHost,
    versionMetadataBinding: selected?.versionMetadataBinding,
  };
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
