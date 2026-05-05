export const ARTIFACT_COMPATIBILITY_SCHEMA_VERSION = 1;
export const APP_ELEMENTS_SCHEMA_VERSION = 1;
export const RSC_PAYLOAD_SCHEMA_VERSION = 1;

export type ArtifactCompatibilityEnvelope = Readonly<{
  schemaVersion: typeof ARTIFACT_COMPATIBILITY_SCHEMA_VERSION;
  graphVersion: string | null;
  deploymentVersion: string | null;
  appElementsSchemaVersion: typeof APP_ELEMENTS_SCHEMA_VERSION;
  rscPayloadSchemaVersion: typeof RSC_PAYLOAD_SCHEMA_VERSION;
  rootBoundaryId: string | null;
  renderEpoch: string | null;
}>;

type ArtifactCompatibilityEnvelopeInput = Readonly<{
  graphVersion?: string | null;
  deploymentVersion?: string | null;
  rootBoundaryId?: string | null;
  renderEpoch?: string | null;
}>;

export function createArtifactCompatibilityEnvelope(
  input: ArtifactCompatibilityEnvelopeInput = {},
): ArtifactCompatibilityEnvelope {
  return {
    schemaVersion: ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
    graphVersion: input.graphVersion ?? null,
    deploymentVersion: input.deploymentVersion ?? null,
    appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
    rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
    rootBoundaryId: input.rootBoundaryId ?? null,
    renderEpoch: input.renderEpoch ?? null,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function hasCurrentSchemaVersions(record: Readonly<Record<string, unknown>>): boolean {
  return (
    record.schemaVersion === ARTIFACT_COMPATIBILITY_SCHEMA_VERSION &&
    record.appElementsSchemaVersion === APP_ELEMENTS_SCHEMA_VERSION &&
    record.rscPayloadSchemaVersion === RSC_PAYLOAD_SCHEMA_VERSION
  );
}

export function parseArtifactCompatibilityEnvelope(
  value: unknown,
): ArtifactCompatibilityEnvelope | null {
  if (!isRecord(value)) return null;
  if (!hasCurrentSchemaVersions(value)) return null;
  if (!isStringOrNull(value.graphVersion)) return null;
  if (!isStringOrNull(value.deploymentVersion)) return null;
  if (!isStringOrNull(value.rootBoundaryId)) return null;
  if (!isStringOrNull(value.renderEpoch)) return null;

  return {
    schemaVersion: ARTIFACT_COMPATIBILITY_SCHEMA_VERSION,
    graphVersion: value.graphVersion,
    deploymentVersion: value.deploymentVersion,
    appElementsSchemaVersion: APP_ELEMENTS_SCHEMA_VERSION,
    rscPayloadSchemaVersion: RSC_PAYLOAD_SCHEMA_VERSION,
    rootBoundaryId: value.rootBoundaryId,
    renderEpoch: value.renderEpoch,
  };
}
