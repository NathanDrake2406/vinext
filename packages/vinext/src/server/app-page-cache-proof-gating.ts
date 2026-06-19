import type { ClientReuseManifestParseResult } from "./client-reuse-manifest.js";

type AppPageCacheProofConsumerInput = Readonly<{
  clientReuseManifest?: ClientReuseManifestParseResult;
  debugClassification?: boolean;
  isDraftMode: boolean;
  isForceDynamic: boolean;
  isPrerender?: boolean;
  isProduction: boolean;
  isProgressiveActionRender?: boolean;
  isRscRequest: boolean;
  revalidateSeconds: number | null;
}>;

function hasIncomingStaticLayoutReuseConsumer(
  clientReuseManifest: ClientReuseManifestParseResult | undefined,
): boolean {
  return clientReuseManifest?.kind === "parsed" && clientReuseManifest.manifest.entries.length > 0;
}

function isKnownNoStoreAppPageRender(input: {
  isDraftMode: boolean;
  isForceDynamic: boolean;
  isProgressiveActionRender?: boolean;
  revalidateSeconds: number | null;
}): boolean {
  return (
    input.isDraftMode ||
    input.isForceDynamic ||
    input.isProgressiveActionRender === true ||
    (input.revalidateSeconds !== null && input.revalidateSeconds <= 0)
  );
}

export function shouldTrackRenderObservation(input: AppPageCacheProofConsumerInput): boolean {
  if (isKnownNoStoreAppPageRender(input)) {
    return false;
  }

  return input.isProduction || input.isPrerender === true;
}

export function shouldCollectCacheProof(input: AppPageCacheProofConsumerInput): boolean {
  if (input.debugClassification === true) {
    return true;
  }
  if (!input.isProduction && input.isPrerender !== true) {
    return true;
  }
  if (isKnownNoStoreAppPageRender(input)) {
    return false;
  }
  if (input.isRscRequest && hasIncomingStaticLayoutReuseConsumer(input.clientReuseManifest)) {
    return true;
  }

  return shouldTrackRenderObservation(input);
}
