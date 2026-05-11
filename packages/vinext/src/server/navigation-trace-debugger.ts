import {
  NAVIGATION_TRACE_SCHEMA_VERSION,
  NavigationTraceReasonCodes,
  NavigationTraceTransactionCodes,
  type NavigationTraceFieldName,
  type NavigationTraceFieldValue,
} from "./navigation-trace.js";
import type { NavigationDecisionV0, NavigationEvent, OperationLane } from "./navigation-planner.js";

type NavigationTraceDebuggerRuntime = "development" | "production" | "test";
type NavigationTraceDebuggerOptions = Readonly<{
  runtime?: NavigationTraceDebuggerRuntime;
}>;

type NavigationTraceDebugSubject = "commitApproval" | "plannerDecision";
type NavigationTraceDebugSource = "commitTransaction" | "lifecycleGate" | "planner";
type NavigationTraceDebugOutcome =
  | "hardNavigate"
  | "noCommit"
  | "requestWork"
  | "stale"
  | "visibleCommit";

type NavigationTraceInvariantIssueCode =
  | "approval-mismatch"
  | "empty-trace"
  | "invalid-field"
  | "invalid-schema"
  | "missing-field"
  | "missing-transaction"
  | "unexpected-code"
  | "unknown-code"
  | "unknown-field";

type NavigationTraceInvariantIssue = Readonly<{
  code: NavigationTraceInvariantIssueCode;
  entryIndex?: number;
  field?: NavigationTraceFieldName;
  message: string;
  source: NavigationTraceDebugSource;
}>;

type NavigationTraceDebugExplanation = Readonly<{
  reasonCode: string | null;
  traceCodes: readonly string[];
  transactionCode: string | null;
}>;

type NavigationTraceDebugReport = Readonly<{
  explanation: NavigationTraceDebugExplanation;
  issues: readonly NavigationTraceInvariantIssue[];
  ok: boolean;
  outcome: NavigationTraceDebugOutcome;
  source: NavigationTraceDebugSource;
  subject: NavigationTraceDebugSubject;
}>;

type NavigationTraceDebugTrace = Readonly<{
  entries: readonly NavigationTraceDebugEntry[];
  schemaVersion: number;
}>;

type NavigationTraceDebugEntry = Readonly<{
  code: string;
  fields: Readonly<Record<string, unknown>>;
}>;

export type NavigationTraceCommitApprovalDebugInput = Readonly<{
  approvedCommit: object | null | undefined;
  decision: Readonly<{
    disposition: "commit" | "hard-navigate" | "no-commit";
    trace: NavigationTraceDebugTrace;
  }>;
}>;

type NavigationTraceDebugSpec = Readonly<{
  expectedReasonCodes: readonly string[];
  expectedTransactionCode: string | null;
  outcome: NavigationTraceDebugOutcome;
  source: NavigationTraceDebugSource;
  subject: NavigationTraceDebugSubject;
}>;

const reasonTraceCodes: ReadonlySet<string> = new Set(Object.values(NavigationTraceReasonCodes));
const transactionTraceCodes: ReadonlySet<string> = new Set(
  Object.values(NavigationTraceTransactionCodes),
);
const knownTraceCodes: ReadonlySet<string> = new Set([
  ...reasonTraceCodes,
  ...transactionTraceCodes,
]);

const navigationTraceFieldRegistry = {
  activeNavigationId: true,
  currentRootLayoutTreePath: true,
  currentVisibleCommitVersion: true,
  eventKind: true,
  nextRootLayoutTreePath: true,
  operationLane: true,
  pendingOperationId: true,
  startedNavigationId: true,
  startedVisibleCommitVersion: true,
  targetHref: true,
} satisfies Readonly<Record<NavigationTraceFieldName, true>>;

type NavigationEventKind = NavigationEvent["kind"];
const navigationEventKindRegistry = {
  flightResponseArrived: true,
  navigate: true,
  prefetch: true,
  refresh: true,
  traverse: true,
} satisfies Readonly<Record<NavigationEventKind, true>>;

const operationLaneRegistry = {
  hmr: true,
  navigation: true,
  prefetch: true,
  refresh: true,
  "server-action": true,
  traverse: true,
} satisfies Readonly<Record<OperationLane, true>>;

const knownFieldNames: ReadonlySet<string> = new Set(Object.keys(navigationTraceFieldRegistry));
const navigationEventKinds: ReadonlySet<string> = new Set(Object.keys(navigationEventKindRegistry));
const operationLanes: ReadonlySet<string> = new Set(Object.keys(operationLaneRegistry));

const requestWorkFields = ["eventKind", "targetHref"] satisfies readonly NavigationTraceFieldName[];
const rootBoundaryFields = [
  "currentRootLayoutTreePath",
  "currentVisibleCommitVersion",
  "nextRootLayoutTreePath",
  "startedVisibleCommitVersion",
] satisfies readonly NavigationTraceFieldName[];
const staleLifecycleFields = [
  "activeNavigationId",
  "currentRootLayoutTreePath",
  "currentVisibleCommitVersion",
  "nextRootLayoutTreePath",
  "startedNavigationId",
  "startedVisibleCommitVersion",
] satisfies readonly NavigationTraceFieldName[];
const transactionFields = [
  "operationLane",
  "pendingOperationId",
  "startedVisibleCommitVersion",
] satisfies readonly NavigationTraceFieldName[];

export function inspectNavigationDecisionTrace(
  decision: NavigationDecisionV0,
  options: NavigationTraceDebuggerOptions = {},
): NavigationTraceDebugReport {
  assertDebuggerRuntime(options);

  const spec = createDecisionDebugSpec(decision);
  return inspectTraceAgainstSpec(decision.trace, spec);
}

export function assertValidNavigationDecisionTrace(
  decision: NavigationDecisionV0,
  options: NavigationTraceDebuggerOptions = {},
): void {
  const report = inspectNavigationDecisionTrace(decision, options);
  assertReportHasNoIssues(report);
}

export function inspectNavigationCommitApprovalTrace(
  approval: NavigationTraceCommitApprovalDebugInput,
  options: NavigationTraceDebuggerOptions = {},
): NavigationTraceDebugReport {
  assertDebuggerRuntime(options);

  const spec = createCommitApprovalDebugSpec(approval);
  const report = inspectTraceAgainstSpec(approval.decision.trace, spec);
  const issues = [...report.issues];

  addApprovalShapeIssues(approval, issues);
  return createReport({
    ...report,
    issues,
  });
}

export function assertValidNavigationCommitApprovalTrace(
  approval: NavigationTraceCommitApprovalDebugInput,
  options: NavigationTraceDebuggerOptions = {},
): void {
  const report = inspectNavigationCommitApprovalTrace(approval, options);
  assertReportHasNoIssues(report);
}

function formatNavigationTraceDebugReport(report: NavigationTraceDebugReport): string {
  const header =
    `NavigationTrace invariant failed ` +
    `[subject=${report.subject} outcome=${report.outcome} source=${report.source}]`;
  const traceCodes = report.explanation.traceCodes.join(" > ") || "<empty>";
  const issueLines = report.issues.map((issue) => `- [${issue.source}] ${issue.message}`);
  return [header, `trace=${traceCodes}`, ...issueLines].join("\n");
}

function assertReportHasNoIssues(report: NavigationTraceDebugReport): void {
  if (!report.ok) {
    throw new Error(formatNavigationTraceDebugReport(report));
  }
}

function createDecisionDebugSpec(decision: NavigationDecisionV0): NavigationTraceDebugSpec {
  switch (decision.kind) {
    case "requestWork":
      return {
        expectedReasonCodes: [NavigationTraceReasonCodes.requestWork],
        expectedTransactionCode: null,
        outcome: "requestWork",
        source: "planner",
        subject: "plannerDecision",
      };
    case "proposeCommit":
      return {
        expectedReasonCodes: [
          decision.proposal.reason === "rootBoundaryUnknownFallback"
            ? NavigationTraceReasonCodes.rootBoundaryUnknown
            : NavigationTraceReasonCodes.commitCurrent,
        ],
        expectedTransactionCode: null,
        outcome: "visibleCommit",
        source: "planner",
        subject: "plannerDecision",
      };
    case "noCommit":
      return {
        expectedReasonCodes: [NavigationTraceReasonCodes.prefetchOnly],
        expectedTransactionCode: null,
        outcome: "noCommit",
        source: "planner",
        subject: "plannerDecision",
      };
    case "hardNavigate":
      return {
        expectedReasonCodes: [NavigationTraceReasonCodes.rootBoundaryChanged],
        expectedTransactionCode: null,
        outcome: "hardNavigate",
        source: "planner",
        subject: "plannerDecision",
      };
    default: {
      const _exhaustive: never = decision;
      throw new Error("[vinext] Unknown navigation decision: " + String(_exhaustive));
    }
  }
}

function createCommitApprovalDebugSpec(
  approval: NavigationTraceCommitApprovalDebugInput,
): NavigationTraceDebugSpec {
  switch (approval.decision.disposition) {
    case "commit":
      return {
        expectedReasonCodes: [
          NavigationTraceReasonCodes.commitCurrent,
          NavigationTraceReasonCodes.rootBoundaryUnknown,
        ],
        expectedTransactionCode: NavigationTraceTransactionCodes.visibleCommit,
        outcome: "visibleCommit",
        source: "commitTransaction",
        subject: "commitApproval",
      };
    case "hard-navigate":
      return {
        expectedReasonCodes: [NavigationTraceReasonCodes.rootBoundaryChanged],
        expectedTransactionCode: NavigationTraceTransactionCodes.hardNavigate,
        outcome: "hardNavigate",
        source: "commitTransaction",
        subject: "commitApproval",
      };
    case "no-commit": {
      const reasonCode = findFirstReasonCode(approval.decision.trace);
      return {
        expectedReasonCodes: [
          NavigationTraceReasonCodes.prefetchOnly,
          NavigationTraceReasonCodes.staleOperation,
        ],
        expectedTransactionCode: NavigationTraceTransactionCodes.noCommit,
        outcome: reasonCode === NavigationTraceReasonCodes.staleOperation ? "stale" : "noCommit",
        source:
          reasonCode === NavigationTraceReasonCodes.staleOperation ? "lifecycleGate" : "planner",
        subject: "commitApproval",
      };
    }
    default: {
      const _exhaustive: never = approval.decision.disposition;
      throw new Error("[vinext] Unknown commit approval disposition: " + String(_exhaustive));
    }
  }
}

function inspectTraceAgainstSpec(
  trace: NavigationTraceDebugTrace,
  spec: NavigationTraceDebugSpec,
): NavigationTraceDebugReport {
  const issues: NavigationTraceInvariantIssue[] = [];

  addTraceShapeIssues(trace, spec.source, issues);
  addTraceCompositionIssues(trace, spec, issues);
  addExpectedTransactionIssues(trace, spec, issues);
  addExpectedReasonIssues(trace, spec, issues);
  addRequiredFieldIssues(trace, spec, issues);

  return createReport({
    explanation: createExplanation(trace),
    issues,
    outcome: spec.outcome,
    source: spec.source,
    subject: spec.subject,
  });
}

function createReport(options: {
  explanation: NavigationTraceDebugExplanation;
  issues: readonly NavigationTraceInvariantIssue[];
  outcome: NavigationTraceDebugOutcome;
  source: NavigationTraceDebugSource;
  subject: NavigationTraceDebugSubject;
}): NavigationTraceDebugReport {
  return {
    explanation: options.explanation,
    issues: [...options.issues],
    ok: options.issues.length === 0,
    outcome: options.outcome,
    source: options.source,
    subject: options.subject,
  };
}

function addTraceShapeIssues(
  trace: NavigationTraceDebugTrace,
  source: NavigationTraceDebugSource,
  issues: NavigationTraceInvariantIssue[],
): void {
  if (trace.schemaVersion !== NAVIGATION_TRACE_SCHEMA_VERSION) {
    issues.push({
      code: "invalid-schema",
      message: `NavigationTrace schemaVersion must be ${NAVIGATION_TRACE_SCHEMA_VERSION}`,
      source,
    });
  }

  if (trace.entries.length === 0) {
    issues.push({
      code: "empty-trace",
      message: "NavigationTrace must include at least one entry",
      source,
    });
    return;
  }

  trace.entries.forEach((entry, entryIndex) => {
    if (!knownTraceCodes.has(entry.code)) {
      issues.push({
        code: "unknown-code",
        entryIndex,
        message: `unknown NavigationTrace code ${entry.code}`,
        source,
      });
    }

    addFieldShapeIssues(entry, entryIndex, source, issues);
  });
}

function addTraceCompositionIssues(
  trace: NavigationTraceDebugTrace,
  spec: NavigationTraceDebugSpec,
  issues: NavigationTraceInvariantIssue[],
): void {
  const transactionEntries = trace.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => transactionTraceCodes.has(entry.code));
  const reasonEntries = trace.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => reasonTraceCodes.has(entry.code));

  if (spec.expectedTransactionCode === null) {
    for (const transactionEntry of transactionEntries) {
      issues.push({
        code: "unexpected-code",
        entryIndex: transactionEntry.index,
        message: `planner decision trace must not include transaction code ${transactionEntry.entry.code}`,
        source: "planner",
      });
    }
  } else if (transactionEntries.length > 1) {
    for (const transactionEntry of transactionEntries.slice(1)) {
      issues.push({
        code: "unexpected-code",
        entryIndex: transactionEntry.index,
        message: "commit approval trace must include exactly one transaction code",
        source: "commitTransaction",
      });
    }
  }

  if (reasonEntries.length > 1) {
    for (const reasonEntry of reasonEntries.slice(1)) {
      issues.push({
        code: "unexpected-code",
        entryIndex: reasonEntry.index,
        message: `${formatSubject(spec.subject)} trace must include exactly one reason code`,
        source: expectedReasonSource(spec),
      });
    }
  }
}

function formatSubject(subject: NavigationTraceDebugSubject): string {
  switch (subject) {
    case "commitApproval":
      return "commit approval";
    case "plannerDecision":
      return "planner decision";
    default: {
      const _exhaustive: never = subject;
      throw new Error("[vinext] Unknown navigation trace debug subject: " + String(_exhaustive));
    }
  }
}

function addFieldShapeIssues(
  entry: NavigationTraceDebugEntry,
  entryIndex: number,
  source: NavigationTraceDebugSource,
  issues: NavigationTraceInvariantIssue[],
): void {
  for (const [field, value] of Object.entries(entry.fields)) {
    if (!knownFieldNames.has(field)) {
      issues.push({
        code: "unknown-field",
        entryIndex,
        message: `${entry.code} includes unknown field ${field}`,
        source,
      });
      continue;
    }

    addFieldValueIssue(entry, entryIndex, field, value, source, issues);
  }
}

function addFieldValueIssue(
  entry: NavigationTraceDebugEntry,
  entryIndex: number,
  field: string,
  value: unknown,
  source: NavigationTraceDebugSource,
  issues: NavigationTraceInvariantIssue[],
): void {
  if (!isStructuredTraceFieldValue(value)) {
    issues.push({
      code: "invalid-field",
      entryIndex,
      message: `${entry.code} field ${field} must be string, number, boolean, or null`,
      source,
    });
    return;
  }

  switch (field) {
    case "activeNavigationId":
    case "currentVisibleCommitVersion":
    case "pendingOperationId":
    case "startedNavigationId":
    case "startedVisibleCommitVersion":
      if (typeof value !== "number") {
        issues.push(createInvalidFieldIssue(entry, entryIndex, field, "number", source));
      }
      return;
    case "currentRootLayoutTreePath":
    case "nextRootLayoutTreePath":
    case "targetHref":
      if (typeof value !== "string" && value !== null) {
        issues.push(createInvalidFieldIssue(entry, entryIndex, field, "string or null", source));
      }
      return;
    case "eventKind":
      if (typeof value !== "string" || !navigationEventKinds.has(value)) {
        issues.push(
          createInvalidFieldIssue(entry, entryIndex, field, "navigation event kind", source),
        );
      }
      return;
    case "operationLane":
      if (typeof value !== "string" || !operationLanes.has(value)) {
        issues.push(createInvalidFieldIssue(entry, entryIndex, field, "operation lane", source));
      }
      return;
    default:
      return;
  }
}

function createInvalidFieldIssue(
  entry: NavigationTraceDebugEntry,
  entryIndex: number,
  field: string,
  expected: string,
  source: NavigationTraceDebugSource,
): NavigationTraceInvariantIssue {
  return {
    code: "invalid-field",
    entryIndex,
    message: `${entry.code} field ${field} must be ${expected}`,
    source,
  };
}

function isStructuredTraceFieldValue(value: unknown): value is NavigationTraceFieldValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function addExpectedTransactionIssues(
  trace: NavigationTraceDebugTrace,
  spec: NavigationTraceDebugSpec,
  issues: NavigationTraceInvariantIssue[],
): void {
  if (spec.expectedTransactionCode === null) {
    return;
  }

  const firstEntry = trace.entries[0];
  if (firstEntry?.code !== spec.expectedTransactionCode) {
    issues.push({
      code: "missing-transaction",
      entryIndex: 0,
      message: `commit approval expected first trace code ${spec.expectedTransactionCode}`,
      source: "commitTransaction",
    });
  }
}

function addExpectedReasonIssues(
  trace: NavigationTraceDebugTrace,
  spec: NavigationTraceDebugSpec,
  issues: NavigationTraceInvariantIssue[],
): void {
  const reasonEntry = findFirstReasonEntry(trace);
  if (reasonEntry === null) {
    issues.push({
      code: "unexpected-code",
      message: `NavigationTrace expected one of ${spec.expectedReasonCodes.join(", ")}`,
      source: expectedReasonSource(spec),
    });
    return;
  }

  if (!spec.expectedReasonCodes.includes(reasonEntry.entry.code)) {
    issues.push({
      code: "unexpected-code",
      entryIndex: reasonEntry.index,
      message:
        `NavigationTrace expected one of ${spec.expectedReasonCodes.join(", ")} ` +
        `but found ${reasonEntry.entry.code}`,
      source: reasonEntrySource(reasonEntry.entry.code, spec),
    });
  }
}

function addRequiredFieldIssues(
  trace: NavigationTraceDebugTrace,
  spec: NavigationTraceDebugSpec,
  issues: NavigationTraceInvariantIssue[],
): void {
  const transactionEntry = findExpectedTransactionEntry(trace, spec.expectedTransactionCode);
  if (transactionEntry !== null) {
    requireFields({
      entry: transactionEntry.entry,
      entryIndex: transactionEntry.index,
      fields: transactionFields,
      issues,
      source: "commitTransaction",
    });
  }

  const reasonEntry = findFirstReasonEntry(trace);
  if (reasonEntry === null) {
    return;
  }

  if (isHmrVisibleCommitTrace(spec, transactionEntry)) {
    return;
  }

  const fields = getRequiredReasonFields(reasonEntry.entry.code);
  requireFields({
    entry: reasonEntry.entry,
    entryIndex: reasonEntry.index,
    fields,
    issues,
    source: reasonEntrySource(reasonEntry.entry.code, spec),
  });
  addReasonInvariantIssues(reasonEntry.entry, reasonEntry.index, spec, issues);
}

function requireFields(options: {
  entry: NavigationTraceDebugEntry;
  entryIndex: number;
  fields: readonly NavigationTraceFieldName[];
  issues: NavigationTraceInvariantIssue[];
  source: NavigationTraceDebugSource;
}): void {
  for (const field of options.fields) {
    if (!(field in options.entry.fields)) {
      options.issues.push({
        code: "missing-field",
        entryIndex: options.entryIndex,
        field,
        message: `${options.entry.code} is missing required field ${field}`,
        source: options.source,
      });
    }
  }
}

function getRequiredReasonFields(code: string): readonly NavigationTraceFieldName[] {
  switch (code) {
    case NavigationTraceReasonCodes.requestWork:
      return requestWorkFields;
    case NavigationTraceReasonCodes.staleOperation:
      return staleLifecycleFields;
    case NavigationTraceReasonCodes.commitCurrent:
    case NavigationTraceReasonCodes.prefetchOnly:
    case NavigationTraceReasonCodes.rootBoundaryChanged:
    case NavigationTraceReasonCodes.rootBoundaryUnknown:
      return rootBoundaryFields;
    default:
      return [];
  }
}

function addApprovalShapeIssues(
  approval: NavigationTraceCommitApprovalDebugInput,
  issues: NavigationTraceInvariantIssue[],
): void {
  if (
    approval.decision.disposition === "commit" &&
    (approval.approvedCommit === null || approval.approvedCommit === undefined)
  ) {
    issues.push({
      code: "approval-mismatch",
      message: "commit approval has commit disposition but no approved visible commit",
      source: "commitTransaction",
    });
  }

  if (approval.decision.disposition !== "commit" && approval.approvedCommit !== null) {
    issues.push({
      code: "approval-mismatch",
      message: `${approval.decision.disposition} approval must not carry an approved visible commit`,
      source: "commitTransaction",
    });
  }
}

function addReasonInvariantIssues(
  entry: NavigationTraceDebugEntry,
  entryIndex: number,
  spec: NavigationTraceDebugSpec,
  issues: NavigationTraceInvariantIssue[],
): void {
  if (entry.code !== NavigationTraceReasonCodes.staleOperation) {
    return;
  }

  const fields = entry.fields;
  const navigationIdChanged = fields.activeNavigationId !== fields.startedNavigationId;
  const visibleCommitVersionChanged =
    fields.currentVisibleCommitVersion !== fields.startedVisibleCommitVersion;

  if (!navigationIdChanged && !visibleCommitVersionChanged) {
    issues.push({
      code: "invalid-field",
      entryIndex,
      message:
        "NC_STALE requires activeNavigationId/startNavigationId or visibleCommitVersion mismatch",
      source: reasonEntrySource(entry.code, spec),
    });
  }
}

function createExplanation(trace: NavigationTraceDebugTrace): NavigationTraceDebugExplanation {
  return {
    reasonCode: findFirstReasonCode(trace),
    traceCodes: trace.entries.map((entry) => entry.code),
    transactionCode: findFirstTransactionCode(trace),
  };
}

function findExpectedTransactionEntry(
  trace: NavigationTraceDebugTrace,
  expectedTransactionCode: string | null,
): { entry: NavigationTraceDebugEntry; index: number } | null {
  if (expectedTransactionCode === null) {
    return null;
  }

  const firstEntry = trace.entries[0];
  if (firstEntry?.code !== expectedTransactionCode) {
    return null;
  }

  return { entry: firstEntry, index: 0 };
}

function findFirstReasonEntry(
  trace: NavigationTraceDebugTrace,
): { entry: NavigationTraceDebugEntry; index: number } | null {
  for (const [index, entry] of trace.entries.entries()) {
    if (reasonTraceCodes.has(entry.code)) {
      return { entry, index };
    }
  }

  return null;
}

function findFirstReasonCode(trace: NavigationTraceDebugTrace): string | null {
  return findFirstReasonEntry(trace)?.entry.code ?? null;
}

function findFirstTransactionCode(trace: NavigationTraceDebugTrace): string | null {
  for (const entry of trace.entries) {
    if (transactionTraceCodes.has(entry.code)) {
      return entry.code;
    }
  }

  return null;
}

function reasonEntrySource(
  code: string,
  spec: NavigationTraceDebugSpec,
): NavigationTraceDebugSource {
  if (code === NavigationTraceReasonCodes.staleOperation) {
    return "lifecycleGate";
  }

  return expectedReasonSource(spec);
}

function expectedReasonSource(spec: NavigationTraceDebugSpec): NavigationTraceDebugSource {
  if (spec.outcome === "stale") {
    return "lifecycleGate";
  }

  return "planner";
}

function isHmrVisibleCommitTrace(
  spec: NavigationTraceDebugSpec,
  transactionEntry: { entry: NavigationTraceDebugEntry; index: number } | null,
): boolean {
  return (
    spec.subject === "commitApproval" &&
    spec.outcome === "visibleCommit" &&
    transactionEntry?.entry.fields.operationLane === "hmr"
  );
}

function assertDebuggerRuntime(options: NavigationTraceDebuggerOptions): void {
  if (resolveDebuggerRuntime(options) === "production") {
    throw new Error("[vinext] NavigationTrace invariant debugger is dev/test-only");
  }
}

function resolveDebuggerRuntime(
  options: NavigationTraceDebuggerOptions,
): NavigationTraceDebuggerRuntime {
  if (options.runtime !== undefined) {
    return options.runtime;
  }

  if (typeof process !== "undefined") {
    if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
      return "test";
    }

    if (process.env.NODE_ENV === "development") {
      return "development";
    }
  }

  return "production";
}
