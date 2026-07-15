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
 * caller and the sequencing can be tested directly. Worker-name/host/binding
 * resolution lives in `wrangler-deployment-target.ts`, not here — this module
 * only sequences wrangler calls against an already-resolved target.
 */

import { VINEXT_VERSION_METADATA_BINDING } from "vinext/internal/server/worker-version";
import { warmCdnCache } from "./cdn-warm.js";
import { formatUnknownError, type DeployOptions } from "./deploy.js";
import {
  runWranglerDeploymentStatus,
  runWranglerTriggersDeploy,
  runWranglerVersionDeploy,
  runWranglerVersionUpload,
  type WranglerDeploymentStatus,
  type WranglerVersionDeployResult,
  type WranglerVersionTraffic,
  type WranglerVersionUploadResult,
} from "./version-deploy.js";
import {
  getWranglerTargetEnv,
  resolveWranglerDeploymentTarget,
  type WranglerDeploymentTarget,
} from "./wrangler-deployment-target.js";

export type CdnWarmupDeployResult = {
  url: string;
  /** False whenever the promoted version's cache was not confirmed pre-warmed. */
  warmed: boolean;
};

/** First present URL from a wrangler call chain, in order of specificity. */
function pickDeployedUrl(...candidates: Array<string | null | undefined>): string {
  return (
    candidates.find((url): url is string => Boolean(url)) ?? "(URL not detected in wrangler output)"
  );
}

function promotionPhaseFor(warmed: boolean): "promote-warmed" | "promote-uploaded" {
  return warmed ? "promote-warmed" : "promote-uploaded";
}

type CdnWarmupOptions = Pick<
  DeployOptions,
  | "preview"
  | "env"
  | "name"
  | "config"
  | "warmCdnConcurrency"
  | "warmCdnTimeout"
  | "warmCdnRetries"
  | "warmCdnStrict"
>;

export async function deployWithCdnWarmup(
  root: string,
  paths: readonly string[],
  options: CdnWarmupOptions,
): Promise<CdnWarmupDeployResult> {
  const target = validateCdnWarmupConfiguration(root, options);
  const upload = runWranglerVersionUpload(root, options);
  const deployment = readWranglerDeploymentStatus(root, options);
  const currentVersions = deployment?.versions ?? [];
  const stagingTraffic = getZeroPercentStagingTraffic(currentVersions, upload.versionId);

  if (!stagingTraffic) {
    return promoteWithoutWarmup(root, upload, options);
  }

  return warmAndPromote(
    root,
    paths,
    target,
    upload,
    stagingTraffic[0].versionId,
    stagingTraffic,
    options,
  );
}

/**
 * No safe staging split exists (the deployment isn't a single version at
 * 100%), so there is no version-isolated cache partition to warm into.
 * Staging is what makes warming safe to attempt at all — without it, this
 * mode only promotes directly. Strict mode refuses instead, since it exists
 * to guarantee a confirmed warm-up happened.
 */
function promoteWithoutWarmup(
  root: string,
  upload: WranglerVersionUploadResult,
  options: CdnWarmupOptions,
): CdnWarmupDeployResult {
  const message =
    "CDN pre-warm requires the current deployment to contain exactly one version at 100%.";
  if (options.warmCdnStrict) {
    throw new Error(`${message} Uploaded Worker version ${upload.versionId} remains undeployed.`);
  }
  console.warn(`  ${message} Promoting without pre-warming.`);
  const deployed = runWranglerVersionDeploy(
    root,
    [{ versionId: upload.versionId, percentage: 100 }],
    options,
    "promote-uploaded",
  );
  const triggers = applyTriggersAfterPromotion(root, options);
  return {
    url: pickDeployedUrl(deployed.deployedUrl, triggers.deployedUrl, upload.previewUrl),
    warmed: false,
  };
}

/**
 * Stage the uploaded version at 0%, attempt a verified warm-up through a
 * version override, then promote to 100% and apply triggers.
 *
 * Triggers (routes/schedules/custom domains) are applied AFTER promotion, not
 * before warming. `wrangler triggers deploy` PUTs the script's routes and can
 * detach the current production hostname; running it inside the warm window
 * means a warm/promote failure leaves production routing pointed at a version
 * that never got promoted. Warming instead targets the already-attached
 * production host via the version-override header, so the risky window only
 * ever leaves the new version staged at 0% — already the safe state.
 */
async function warmAndPromote(
  root: string,
  paths: readonly string[],
  target: WranglerDeploymentTarget,
  upload: WranglerVersionUploadResult,
  previousVersionId: string,
  stagingTraffic: readonly WranglerVersionTraffic[],
  options: CdnWarmupOptions,
): Promise<CdnWarmupDeployResult> {
  // Workers Cache includes the invoked Worker version in its key unless
  // cross_version_cache is enabled. Staging lets overrides warm the uploaded
  // version's partition while a failed override can only touch the old one.
  const staged = runWranglerVersionDeploy(root, stagingTraffic, options, "stage");

  let warmed = false;
  try {
    // A workers.dev URL is the production cache key only when the deployment
    // has no custom routes. Falling back to it for a path-scoped route would
    // verify the right Worker version on the wrong hostname and falsely report
    // the production cache as warm.
    const targetUrl = target.productionHost
      ? `https://${target.productionHost}`
      : target.hasProductionRoute
        ? undefined
        : staged.deployedUrl;
    const headers = buildVersionOverrideHeaders(target.workerName, upload.versionId);
    if (!targetUrl || !headers) {
      const message =
        target.hasProductionRoute && !target.productionHost
          ? "CDN pre-warm cannot safely warm path-scoped Worker routes because workers.dev uses a different cache key."
          : "CDN pre-warm requires a production URL and Worker name for version overrides.";
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
      if (!warmed) {
        console.warn(
          `  CDN pre-warm did not confirm all ${result.total} path(s) served the uploaded ` +
            "version. Promoting anyway (non-strict) — the deployed version's cache is not " +
            "confirmed pre-warmed.",
        );
      }
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
      promotionPhaseFor(warmed),
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
  return {
    url: pickDeployedUrl(
      deployed.deployedUrl,
      staged.deployedUrl,
      triggers.deployedUrl,
      upload.previewUrl,
    ),
    warmed,
  };
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
  options: Pick<DeployOptions, "preview" | "env" | "name" | "config">,
): WranglerDeploymentTarget {
  const target = resolveWranglerDeploymentTarget(root, options);
  const envName = getWranglerTargetEnv(options);
  const targetLabel = envName
    ? `Wrangler environment "${envName}"`
    : "the top-level Wrangler config";
  if (!target || target.versionMetadataBinding !== VINEXT_VERSION_METADATA_BINDING) {
    throw new Error(
      `CDN warmup requires a version_metadata binding named "${VINEXT_VERSION_METADATA_BINDING}" in ${targetLabel}. ` +
        "Re-run vinext init with CDN warmup enabled or configure the binding before deploying.",
    );
  }
  if (target.crossVersionCache) {
    throw new Error(
      "CDN warmup requires cache.cross_version_cache to be false because shared cache entries cannot prove the uploaded version populated an isolated cache partition.",
    );
  }
  if (!target.cacheEnabled) {
    throw new Error(
      "CDN warmup requires Cloudflare Workers caching to be enabled with cache.enabled = true.",
    );
  }
  return target;
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
  const productionVersions = current.filter((version) => version.percentage === 100);
  if (
    productionVersions.length !== 1 ||
    current.some((version) => version.percentage !== 0 && version.percentage !== 100)
  ) {
    return null;
  }
  const productionVersion = productionVersions[0];
  // If the upload ever returns the same version ID already at 100% traffic,
  // staging it would produce a duplicate-version split (v@100% v@0%) — fail
  // closed instead of handing wrangler a nonsensical traffic split.
  if (productionVersion.versionId === versionId) return null;
  // A failed strict warmup intentionally leaves its upload at 0%. Omit stale
  // 0% versions from the replacement split so a fresh attempt can retry from
  // the same safe production-at-100% state without manual cleanup.
  return [productionVersion, { versionId, percentage: 0 }];
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
