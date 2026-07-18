/**
 * Staged CDN-warmup deployment transaction.
 *
 * Warms Cloudflare's version-isolated CDN cache before a new Worker version
 * takes production traffic:
 *
 *   validate → upload → inspect deployment → stage new version at 0% →
 *   warm through a version override → verify the producing version →
 *   re-verify the staged split is still active → promote → apply triggers
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
import { formatUnknownError } from "./utils/format-unknown-error.js";
import type { WranglerTargetOptions } from "./wrangler-cli.js";
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

export type CdnWarmupOptions = WranglerTargetOptions & {
  /** Maximum number of CDN warmup requests to issue in parallel */
  warmCdnConcurrency?: number;
  /** Per-request CDN warmup timeout in milliseconds */
  warmCdnTimeout?: number;
  /** Number of CDN warmup retries */
  warmCdnRetries?: number;
  /** Fail deployment if any CDN warmup request fails */
  warmCdnStrict?: boolean;
};

export async function deployWithCdnWarmup(
  root: string,
  paths: readonly string[],
  options: CdnWarmupOptions,
): Promise<CdnWarmupDeployResult> {
  const target = validateCdnWarmupConfiguration(root, options);
  const upload = runWranglerVersionUpload(root, options);
  const statusRead = readWranglerDeploymentStatus(root, options);
  if ("error" in statusRead) {
    return promoteWithoutWarmup(
      root,
      upload,
      options,
      `CDN pre-warm could not read the current deployment (${statusRead.error}).`,
    );
  }
  const currentVersions = statusRead.deployment.versions;
  const stagingTraffic = getZeroPercentStagingTraffic(currentVersions, upload.versionId);

  if (!stagingTraffic) {
    if (
      currentVersions.some(
        (version) => version.versionId === upload.versionId && version.percentage === 100,
      )
    ) {
      return finishAlreadyCurrentVersion(root, upload, options);
    }
    const observedTraffic = currentVersions.length
      ? currentVersions.map((version) => `${version.versionId}@${version.percentage}%`).join(", ")
      : "no deployed versions";
    return promoteWithoutWarmup(
      root,
      upload,
      options,
      `CDN pre-warm requires the current deployment to contain exactly one version at 100%. Observed traffic: ${observedTraffic}.`,
    );
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

function finishAlreadyCurrentVersion(
  root: string,
  upload: WranglerVersionUploadResult,
  options: CdnWarmupOptions,
): CdnWarmupDeployResult {
  const message = `CDN pre-warm cannot stage Worker version ${upload.versionId} because it is already serving 100% traffic.`;
  if (options.warmCdnStrict) throw new Error(message);
  console.warn(`  ${message} Skipping pre-warm and re-promotion.`);
  const triggers = applyTriggersAfterPromotion(
    root,
    options,
    `Worker version ${upload.versionId} is already serving 100% traffic, but applying triggers ` +
      "(routes/schedules) failed. Production still serves that version on the previously " +
      "deployed routes. Re-run `wrangler triggers deploy` to apply the route changes.",
  );
  return {
    url: pickDeployedUrl(triggers.deployedUrl, upload.previewUrl),
    warmed: false,
  };
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
  message = "CDN pre-warm requires the current deployment to contain exactly one version at 100%.",
  strictUploadState = `Uploaded Worker version ${upload.versionId} remains undeployed.`,
): CdnWarmupDeployResult {
  if (options.warmCdnStrict) {
    throw new Error(`${message} ${strictUploadState}`);
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
    //
    // The hostname is part of Cloudflare's cache key, so every attached
    // host-wide origin is a separate cache partition: warming one route's host
    // proves nothing about another's, and "warmed" may only be reported when
    // every origin × path pair is confirmed.
    const targetUrls = target.productionHosts.length
      ? target.productionHosts.map((host) => `https://${host}`)
      : !target.hasProductionRoute && staged.deployedUrl
        ? [staged.deployedUrl]
        : [];
    const headers = buildVersionOverrideHeaders(target.workerName, upload.versionId);
    if (targetUrls.length === 0 || !headers) {
      const message =
        target.hasProductionRoute && target.productionHosts.length === 0
          ? "CDN pre-warm cannot safely warm path-scoped Worker routes because workers.dev uses a different cache key."
          : "CDN pre-warm requires a production URL and Worker name for version overrides.";
      if (options.warmCdnStrict) throw new Error(message);
      console.warn(`  ${message} Promoting without pre-warming.`);
    } else {
      // A path-scoped or wildcard-host route has a cache partition this
      // transaction cannot reach, so its presence makes `productionHosts` an
      // incomplete picture of the production cache surface: strict mode must
      // refuse, and non-strict may warm the reachable origins but must not
      // report the deployment as confirmed pre-warmed.
      if (target.hasUnwarmableProductionRoute) {
        const message =
          "CDN pre-warm cannot cover every production route: an enabled route is " +
          "path-scoped or wildcard-hosted, so its cache partition cannot be verified.";
        if (options.warmCdnStrict) throw new Error(message);
        console.warn(`  ${message} The deployment will not be reported as confirmed pre-warmed.`);
      }
      let confirmedPaths = 0;
      let totalPaths = 0;
      let allPathsConfirmed = true;
      for (const targetUrl of targetUrls) {
        if (targetUrls.length > 1) {
          console.log(`  CDN pre-warm origin: ${targetUrl}`);
        }
        // In strict mode warmCdnCache throws on the first unconfirmed origin,
        // which the surrounding catch reports with the staged-at-0% state.
        const result = await warmCdnCache({
          targetUrl,
          paths,
          headers,
          expectedVersionId: upload.versionId,
          // The deployment summary claims "pre-warmed and confirmed", so a
          // producer-only 200 is not enough — require cf-cache-status proof
          // that the entry was stored and is servable from cache.
          confirmCache: true,
          concurrency: options.warmCdnConcurrency,
          timeoutMs: options.warmCdnTimeout,
          retries: options.warmCdnRetries,
          strict: options.warmCdnStrict,
        });
        confirmedPaths += result.warmed;
        totalPaths += result.total;
        if (result.failed !== 0) allPathsConfirmed = false;
      }
      if (!allPathsConfirmed) {
        const originSuffix = targetUrls.length > 1 ? ` across ${targetUrls.length} origins` : "";
        console.warn(
          `  CDN pre-warm confirmed ${confirmedPaths}/${totalPaths} path(s)${originSuffix} ` +
            "served the uploaded version. Promoting anyway (non-strict) — the deployed " +
            "version's cache is not confirmed pre-warmed.",
        );
      }
      warmed = allPathsConfirmed && !target.hasUnwarmableProductionRoute;
    }
  } catch (error) {
    throw new Error(
      `${formatUnknownError(error)}\n\n` +
        `CDN warmup failed. The previous Worker version (${previousVersionId}) remains at 100% ` +
        `traffic; the uploaded version (${upload.versionId}) is staged at 0% and was not promoted.`,
    );
  }

  verifyStagedSplitBeforePromotion(root, options, previousVersionId, upload.versionId);

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
  options: WranglerTargetOptions,
  failureMessage = "The uploaded Worker version was promoted to 100%, but applying triggers " +
    "(routes/schedules) failed. Production serves the new version on the previously " +
    "deployed routes. Re-run `wrangler triggers deploy` to apply the route changes.",
): WranglerVersionDeployResult {
  try {
    return runWranglerTriggersDeploy(root, options);
  } catch (error) {
    throw new Error(`${formatUnknownError(error)}\n\n${failureMessage}`);
  }
}

function validateCdnWarmupConfiguration(
  root: string,
  options: WranglerTargetOptions,
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

/**
 * Promotion mutates whatever deployment is currently active, so it must first
 * prove that deployment is still the split this transaction staged. If another
 * deploy promoted its own version during the warmup window, this upload's
 * version overrides stopped applying (overrides only resolve inside the
 * current deployment) and promoting here would silently overwrite the other
 * actor's deployment — a warmup degradation never grants that permission, in
 * strict or non-strict mode. Wrangler offers no compare-and-swap, so a race
 * remains between this read and the promote command; revalidating shrinks the
 * exposed window from the whole warmup duration to that gap.
 */
function verifyStagedSplitBeforePromotion(
  root: string,
  options: WranglerTargetOptions,
  previousVersionId: string,
  uploadedVersionId: string,
): void {
  const unpromotedState =
    `Worker version ${uploadedVersionId} was not promoted; ` +
    "re-run the deploy once the current deployment state is understood.";
  const recheck = readWranglerDeploymentStatus(root, options);
  if ("error" in recheck) {
    throw new Error(
      `Could not re-read the current deployment before promotion (${recheck.error}). ` +
        `Promotion requires confirming the staged traffic split is still active. ${unpromotedState}`,
    );
  }
  const expectedSplit = new Map([
    [previousVersionId, 100],
    [uploadedVersionId, 0],
  ]);
  const versions = recheck.deployment.versions;
  const matchesStagedSplit =
    versions.length === expectedSplit.size &&
    new Set(versions.map((version) => version.versionId)).size === versions.length &&
    versions.every((version) => expectedSplit.get(version.versionId) === version.percentage);
  if (!matchesStagedSplit) {
    const observedTraffic = versions.length
      ? versions.map((version) => `${version.versionId}@${version.percentage}%`).join(", ")
      : "no deployed versions";
    throw new Error(
      "The current deployment no longer matches the staged traffic split " +
        `(expected ${previousVersionId}@100%, ${uploadedVersionId}@0%; observed ${observedTraffic}). ` +
        `Another deploy likely ran during the warmup window. ${unpromotedState}`,
    );
  }
}

function readWranglerDeploymentStatus(
  root: string,
  options: WranglerTargetOptions,
): { deployment: WranglerDeploymentStatus } | { error: string } {
  try {
    return { deployment: runWranglerDeploymentStatus(root, options) };
  } catch (error) {
    return { error: formatUnknownError(error) };
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
