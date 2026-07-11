/**
 * Staged CDN-warmup deployment transaction.
 *
 * Warms Cloudflare's version-isolated CDN cache before a new Worker version
 * takes production traffic:
 *
 *   validate → upload → inspect deployment → stage new version at 0% →
 *   warm through a version override → verify the producing version →
 *   promote → apply triggers
 *
 * If warming fails, the new version stays staged at 0% and the previous
 * version stays at 100% — that split is already the safe state, so failure
 * just reports it rather than issuing another remote mutation to undo it. A
 * promotion whose CLI process fails ambiguously is reported the same way:
 * the operator is told to check `wrangler deployments status`, not silently
 * reconciled. It lives apart from `deploy.ts` so the CLI module stays a thin
 * caller and the sequencing can be tested directly.
 */

import { VINEXT_VERSION_METADATA_BINDING } from "vinext/internal/server/worker-version";
import { warmCdnCache } from "./cdn-warm.js";
import { formatUnknownError, type DeployOptions } from "./deploy.js";
import { parseWranglerConfig } from "./tpr.js";
import {
  runWranglerDeploymentStatus,
  runWranglerTriggersDeploy,
  runWranglerVersionDeploy,
  runWranglerVersionUpload,
  type WranglerDeploymentStatus,
  type WranglerVersionDeployResult,
  type WranglerVersionTraffic,
} from "./version-deploy.js";

export async function deployWithCdnWarmup(
  root: string,
  paths: readonly string[],
  options: Pick<
    DeployOptions,
    | "preview"
    | "env"
    | "name"
    | "config"
    | "warmCdnConcurrency"
    | "warmCdnTimeout"
    | "warmCdnRetries"
    | "warmCdnStrict"
  >,
): Promise<string> {
  const wranglerConfig = validateCdnWarmupConfiguration(root, options);
  const upload = runWranglerVersionUpload(root, options);
  const deployment = readWranglerDeploymentStatus(root, options);
  const currentVersions = deployment?.versions ?? [];
  const stagingTraffic = getZeroPercentStagingTraffic(currentVersions, upload.versionId);

  if (!stagingTraffic) {
    const message =
      "CDN pre-warm requires the current deployment to contain exactly one version at 100%.";
    if (options.warmCdnStrict) throw new Error(message);
    console.warn(`  ${message} Promoting without pre-warming.`);
    const deployed = runWranglerVersionDeploy(
      root,
      [{ versionId: upload.versionId, percentage: 100 }],
      options,
      "promote-uploaded",
    );
    const triggers = runWranglerTriggersDeploy(root, options);
    return (
      deployed.deployedUrl ??
      triggers.deployedUrl ??
      upload.previewUrl ??
      "(URL not detected in wrangler output)"
    );
  }

  // Workers Cache includes the invoked Worker version in its key unless
  // cross_version_cache is enabled. Staging lets overrides warm the uploaded
  // version's partition while a failed override can only touch the old one.
  const staged = runWranglerVersionDeploy(root, stagingTraffic, options, "stage");
  const previousVersionId = currentVersions[0].versionId;

  // Triggers (routes/schedules/custom domains) are applied AFTER promotion, not
  // before warming. `wrangler triggers deploy` PUTs the script's routes and can
  // detach the current production hostname; running it inside the warm window
  // means a warm/promote failure leaves production routing pointed at a version
  // that never got promoted. Warming instead targets the already-attached
  // production host via the version-override header, so the risky window only
  // ever leaves the new version staged at 0% — already the safe state.
  let warmed = false;
  try {
    const targetUrl = resolveCdnWarmupTargetUrl(root, staged.deployedUrl, options);
    const workerName = resolveCdnWarmupWorkerName(wranglerConfig, options);
    const headers = buildVersionOverrideHeaders(workerName, upload.versionId);
    if (!targetUrl || !headers) {
      const message =
        "CDN pre-warm requires a production URL and Worker name for version overrides.";
      if (options.warmCdnStrict) throw new Error(message);
      console.warn(`  ${message} Promoting without pre-warming.`);
    } else {
      const result = await warmCdnCache({
        targetUrl,
        paths,
        headers,
        expectedVersionId: upload.versionId,
        concurrency: options.warmCdnConcurrency,
        timeoutMs: options.warmCdnTimeout,
        retries: options.warmCdnRetries,
        strict: options.warmCdnStrict,
      });
      warmed = result.failed === 0;
    }
  } catch (error) {
    throw new Error(
      `${formatUnknownError(error)}\n\n` +
        `CDN warmup failed. The previous Worker version (${previousVersionId}) remains at 100% ` +
        `traffic; the uploaded version (${upload.versionId}) is staged at 0% and was not promoted.`,
    );
  }

  let deployed: WranglerVersionDeployResult;
  try {
    deployed = runWranglerVersionDeploy(
      root,
      [{ versionId: upload.versionId, percentage: 100 }],
      options,
      warmed ? "promote-warmed" : "promote-uploaded",
    );
  } catch (error) {
    throw new Error(
      `${formatUnknownError(error)}\n\n` +
        `Could not confirm the promotion of Worker version ${upload.versionId} succeeded. ` +
        "Run `wrangler deployments status` to check the current traffic split, then " +
        "re-promote or retry as needed.",
    );
  }
  const triggers = applyTriggersAfterPromotion(root, options);
  return (
    deployed.deployedUrl ??
    staged.deployedUrl ??
    triggers.deployedUrl ??
    upload.previewUrl ??
    "(URL not detected in wrangler output)"
  );
}

/**
 * Apply triggers after a successful promotion. A failure here is far less severe
 * than the pre-promotion case: the new version is already live on the previously
 * deployed routes, only the route/schedule changes did not apply. Surface that
 * plainly so the operator re-runs triggers instead of assuming the whole deploy
 * failed and re-uploading.
 */
function applyTriggersAfterPromotion(
  root: string,
  options: Pick<DeployOptions, "preview" | "env" | "name" | "config">,
): WranglerVersionDeployResult {
  try {
    return runWranglerTriggersDeploy(root, options);
  } catch (error) {
    throw new Error(
      `${formatUnknownError(error)}\n\n` +
        "The uploaded Worker version was promoted to 100%, but applying triggers " +
        "(routes/schedules) failed. Production serves the new version on the previously " +
        "deployed routes. Re-run `wrangler triggers deploy` to apply the route changes.",
    );
  }
}

function validateCdnWarmupConfiguration(
  root: string,
  options: Pick<DeployOptions, "preview" | "env" | "config">,
): NonNullable<ReturnType<typeof parseWranglerConfig>> {
  const config = parseWranglerConfig(root, options.config);
  const envName = getWranglerTargetEnv(options);
  const selected = envName ? config?.env?.[envName] : config;
  const targetLabel = envName
    ? `Wrangler environment "${envName}"`
    : "the top-level Wrangler config";
  if (!config || selected?.versionMetadataBinding !== VINEXT_VERSION_METADATA_BINDING) {
    throw new Error(
      `CDN warmup requires a version_metadata binding named "${VINEXT_VERSION_METADATA_BINDING}" in ${targetLabel}. ` +
        "Re-run vinext init with CDN warmup enabled or configure the binding before deploying.",
    );
  }
  return config;
}

function readWranglerDeploymentStatus(
  root: string,
  options: Pick<DeployOptions, "preview" | "env" | "name" | "config">,
): WranglerDeploymentStatus | null {
  try {
    return runWranglerDeploymentStatus(root, options);
  } catch (error) {
    console.warn(
      `  CDN pre-warm could not read the current deployment: ${formatUnknownError(error)}`,
    );
    return null;
  }
}

function getZeroPercentStagingTraffic(
  current: readonly WranglerVersionTraffic[],
  versionId: string,
): WranglerVersionTraffic[] | null {
  if (current.length !== 1 || current[0].percentage !== 100) return null;
  return [current[0], { versionId, percentage: 0 }];
}

function quoteStructuredHeaderString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildVersionOverrideHeaders(
  workerName: string | undefined,
  versionId: string,
): HeadersInit | undefined {
  if (!workerName) return undefined;
  return {
    "Cloudflare-Workers-Version-Overrides": `${workerName}=${quoteStructuredHeaderString(versionId)}`,
  };
}

function resolveCdnWarmupWorkerName(
  config: NonNullable<ReturnType<typeof parseWranglerConfig>>,
  options: Pick<DeployOptions, "preview" | "env" | "name">,
): string | undefined {
  if (options.name) return options.name;
  const envName = getWranglerTargetEnv(options);
  if (!envName) return config.name;
  const explicitEnvName = config.env?.[envName]?.name;
  if (explicitEnvName) return explicitEnvName;
  if (!config.name) return undefined;
  return config.legacyEnv === false ? config.name : `${config.name}-${envName}`;
}

export function resolveCdnWarmupTargetUrl(root: string, deployedUrl: string | null): string | null;
export function resolveCdnWarmupTargetUrl(
  root: string,
  deployedUrl: string | null,
  options: Pick<DeployOptions, "preview" | "env" | "config">,
): string | null;
export function resolveCdnWarmupTargetUrl(
  root: string,
  deployedUrl: string | null,
  options?: Pick<DeployOptions, "preview" | "env" | "config">,
): string | null {
  const config = parseWranglerConfig(root, options?.config);
  const env = getWranglerTargetEnv(options ?? {});
  const warmupHost = env ? config?.env?.[env]?.warmupHost : config?.warmupHost;
  return warmupHost ? `https://${warmupHost}` : deployedUrl;
}

function getWranglerTargetEnv(options: Pick<DeployOptions, "preview" | "env">): string | undefined {
  return options.env || (options.preview ? "preview" : undefined);
}
