import type {
  SlateClarificationRequest,
  SlateDirectionIntent,
  SlateWritingOperationStatus,
} from "./slateComposition.js";
import type {
  SlateMomentumKind,
  SlateMomentumSnapshot,
} from "./slateCreativeStudios.js";
import type { SlateDocumentAnchor } from "./slateDocument.js";
import type {
  SlateMirrorVoiceCard,
} from "./slateMirror.js";
import type {
  SlateCharacterArc,
  SlateCharacterKnowledgeProjection,
  SlateCharacterProfile,
  SlateCharacterRelationshipState,
  SlateNarrativeEdge,
  SlateNarrativeThread,
  SlateStoryBibleLayer,
  SlateStoryBibleProvenance,
  SlateTimelineBranch,
} from "./slateStoryBible.js";

export const SLATE_REVIEW_EXPORT_FORMAT = "prism-slate-review-v1" as const;
export const SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION = 1 as const;
export const SLATE_DEVELOPER_EVENT_DISCLOSURE =
  "operational_provenance_only" as const;

export type SlateDeveloperEventStage =
  | "intent"
  | "brief"
  | "preflight"
  | "clarification"
  | "generation"
  | "proposal"
  | "acceptance"
  | "extraction"
  | "reconciliation"
  | "promotion"
  | "concern"
  | "mirror"
  | "momentum";

export interface SlateDeveloperIntentDetail {
  intent: SlateDirectionIntent;
}

export interface SlateDeveloperBriefDetail {
  sourceFingerprint: string;
  sourceIds: string[];
  tokenEstimate: number;
  renderedBrief: string | null;
  continuitySummary: string;
}

export interface SlateDeveloperPreflightDetail {
  outcome: "clear" | "soft_concerns" | "blocked";
  concernIds: string[];
  explicitRationale: string;
}

export interface SlateDeveloperClarificationDetail {
  requestId: string;
  trigger: SlateClarificationRequest["trigger"];
  status: SlateClarificationRequest["status"];
  selectedChoiceId: string | null;
  customVibeUsed: boolean;
  stale: boolean;
  resumeOperationId: string | null;
}

export interface SlateDeveloperGenerationDetail {
  transition:
    | "started"
    | "stopped"
    | "continued"
    | "redirected"
    | "completed"
    | "interrupted"
    | "failed";
  requestHash: string;
  outputHash: string | null;
  receiptId: string | null;
  durationMs: number | null;
  failureCode: string | null;
}

export interface SlateDeveloperProposalDetail {
  proposalId: string;
  proposalHash: string;
  /** Retained only when the writer/export request permits user-owned prose. */
  proposalText: string | null;
}

export interface SlateDeveloperAcceptanceDetail {
  outcome: "accepted" | "rejected" | "incorporated_by_human_edit";
  proposalId: string | null;
  acceptedProseHash: string;
  continuitySourceId: string | null;
}

export interface SlateDeveloperExtractionDetail {
  sourceId: string;
  sourceRevision: number;
  acceptedProseHash: string;
  extractedCounts: {
    entities: number;
    claims: number;
    events: number;
    relationships: number;
    knowledgeStates: number;
    threads: number;
  };
  summary: string;
}

export interface SlateDeveloperReconciliationDetail {
  candidateGeneration: number;
  sourceIds: string[];
  addedRecordCount: number;
  supersededRecordCount: number;
  discardedRecordCount: number;
  summary: string;
}

export interface SlateDeveloperPromotionDetail {
  fromGeneration: number;
  toGeneration: number;
  outcome: "promoted" | "rolled_back" | "deferred" | "failed";
  comparisonSummary: string;
}

export interface SlateDeveloperConcernDetail {
  concernId: string;
  kind: string;
  severity: "note" | "important" | "critical";
  status: string;
  blocking: boolean;
  evidenceAnchorCount: number;
  summary: string;
}

export interface SlateDeveloperMirrorDetail {
  profileVersionId: string | null;
  projectOverlayId: string | null;
  povOverlayId: string | null;
  sourceFingerprint: string;
  summary: string;
}

export interface SlateDeveloperMomentumDetail {
  momentumSnapshotId: string | null;
  liveWireKind: SlateMomentumKind | null;
  summary: string;
}

export interface SlateDeveloperEventDetailByStage {
  intent: SlateDeveloperIntentDetail;
  brief: SlateDeveloperBriefDetail;
  preflight: SlateDeveloperPreflightDetail;
  clarification: SlateDeveloperClarificationDetail;
  generation: SlateDeveloperGenerationDetail;
  proposal: SlateDeveloperProposalDetail;
  acceptance: SlateDeveloperAcceptanceDetail;
  extraction: SlateDeveloperExtractionDetail;
  reconciliation: SlateDeveloperReconciliationDetail;
  promotion: SlateDeveloperPromotionDetail;
  concern: SlateDeveloperConcernDetail;
  mirror: SlateDeveloperMirrorDetail;
  momentum: SlateDeveloperMomentumDetail;
}

export interface SlateDeveloperEventBase {
  schemaVersion: typeof SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION;
  disclosure: typeof SLATE_DEVELOPER_EVENT_DISCLOSURE;
  id: string;
  sequence: number;
  projectId: string;
  sectionId: string;
  sectionRevision: number;
  kind: string;
  summary: string;
  sourceIds: string[];
  operationId: string | null;
  clarificationId: string | null;
  provider: string | null;
  model: string | null;
  continuityGeneration: number;
  createdAt: string;
}

/**
 * Append-only diagnostic events expose inputs, receipts, and transitions.
 * There is intentionally no field for hidden reasoning or chain-of-thought.
 */
export type SlateDeveloperEvent = {
  [Stage in SlateDeveloperEventStage]: SlateDeveloperEventBase & {
    stage: Stage;
    detail: SlateDeveloperEventDetailByStage[Stage];
  };
}[SlateDeveloperEventStage];

export interface SlateDeveloperTranscriptV1 {
  schemaVersion: typeof SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION;
  disclosure: typeof SLATE_DEVELOPER_EVENT_DISCLOSURE;
  projectId: string;
  sectionId: string;
  sectionRevision: number;
  events: SlateDeveloperEvent[];
}

export interface SlateReviewProjectV1 {
  id: string;
  title: string;
  proseMode: "offline" | "auto" | "online";
  continuityVersion: string;
  activeGeneration: number;
  mirrorProfileVersionId: string | null;
  codeRevision: string | null;
}

export interface SlateReviewSectionMetadataV1 {
  id: string;
  title: string;
  kind: "act" | "chapter" | "scene" | "imported";
  ordinal: number;
  revision: number;
  documentHash: string;
  proseHash: string;
}

export interface SlateReviewSourceV1 {
  id: string;
  kind: string;
  contentHash: string;
  sourceRevision: number;
  authority: "human" | "ai" | "procedural";
  provider: string | null;
  model: string | null;
  anchors: SlateDocumentAnchor[];
  createdAt: string;
}

export interface SlateReviewOperationV1 {
  id: string;
  intent: SlateDirectionIntent;
  scope: SlateDirectionIntent["scope"];
  revisionFingerprint: string;
  provider: string | null;
  model: string | null;
  status: SlateWritingOperationStatus;
  proposalHash: string | null;
  proposalText: string | null;
  acceptanceOutcome:
    | "accepted"
    | "rejected"
    | "incorporated_by_human_edit"
    | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SlateReviewWorldProjectionV1 {
  id: string;
  label: string;
  description: string;
  layer: SlateStoryBibleLayer;
  writerLocked: boolean;
  provenance: SlateStoryBibleProvenance;
}

export interface SlateReviewConcernProjectionV1 {
  id: string;
  kind: string;
  severity: "note" | "important" | "critical";
  status: string;
  summary: string;
  anchors: SlateDocumentAnchor[];
  sourceIds: string[];
  resolution: Record<string, unknown> | null;
  resolvedAt: string | null;
}

export interface SlateReviewStoryBibleV1 {
  characters: SlateCharacterProfile[];
  arcs: SlateCharacterArc[];
  threads: SlateNarrativeThread[];
  timeline: SlateTimelineBranch[];
  causalEdges: SlateNarrativeEdge[];
  relationships: SlateCharacterRelationshipState[];
  knowledge: SlateCharacterKnowledgeProjection[];
  world: SlateReviewWorldProjectionV1[];
  concerns: SlateReviewConcernProjectionV1[];
}

export interface SlateReviewMirrorV1 {
  profileVersionId: string | null;
  projectOverlayId: string | null;
  povOverlayId: string | null;
  voiceCard: SlateMirrorVoiceCard | null;
  sourceFingerprint: string | null;
}

export interface SlateReviewSectionV1 {
  section: SlateReviewSectionMetadataV1;
  /** Exact writer-visible prose at export time. */
  acceptedProse: string;
  sources: SlateReviewSourceV1[];
  operations: SlateReviewOperationV1[];
  clarifications: SlateClarificationRequest[];
  developerEvents: SlateDeveloperEvent[];
  storyBible: SlateReviewStoryBibleV1;
  mirror: SlateReviewMirrorV1;
  momentum: SlateMomentumSnapshot | null;
}

/**
 * Section-scoped diagnostic envelope. Callers must add sections explicitly;
 * sibling-book prose has no implicit inclusion path.
 */
export interface SlateReviewExportV1 {
  format: typeof SLATE_REVIEW_EXPORT_FORMAT;
  exportedAt: string;
  project: SlateReviewProjectV1;
  sections: SlateReviewSectionV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isSlateReviewProjectV1(value: unknown): value is SlateReviewProjectV1 {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.proseMode === "offline" ||
      value.proseMode === "auto" ||
      value.proseMode === "online") &&
    typeof value.continuityVersion === "string" &&
    Number.isInteger(value.activeGeneration) &&
    Number(value.activeGeneration) >= 0 &&
    isStringOrNull(value.mirrorProfileVersionId) &&
    isStringOrNull(value.codeRevision)
  );
}

function isSlateReviewOperationV1(
  value: unknown,
): value is SlateReviewOperationV1 {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.intent) &&
    (value.scope === "beat" ||
      value.scope === "passage" ||
      value.scope === "scene") &&
    typeof value.revisionFingerprint === "string" &&
    isStringOrNull(value.provider) &&
    isStringOrNull(value.model) &&
    typeof value.status === "string" &&
    isStringOrNull(value.proposalHash) &&
    isStringOrNull(value.proposalText) &&
    (value.acceptanceOutcome === null ||
      value.acceptanceOutcome === "accepted" ||
      value.acceptanceOutcome === "rejected" ||
      value.acceptanceOutcome === "incorporated_by_human_edit") &&
    typeof value.createdAt === "string" &&
    isStringOrNull(value.completedAt)
  );
}

function isSlateReviewClarificationRequest(
  value: unknown,
): value is SlateClarificationRequest {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    typeof value.operationId === "string" &&
    (value.trigger === "hard_continuity_conflict" ||
      value.trigger === "unstick_me") &&
    (value.status === "pending" ||
      value.status === "answered" ||
      value.status === "stale" ||
      value.status === "cancelled") &&
    typeof value.prompt === "string" &&
    Array.isArray(value.choices) &&
    value.choices.length === 3 &&
    value.choices.every(
      (choice) =>
        isRecord(choice) &&
        typeof choice.id === "string" &&
        typeof choice.label === "string" &&
        typeof choice.description === "string" &&
        isRecord(choice.resolution) &&
        isRecord(choice.resolution.intentPatch),
    ) &&
    isRecord(value.customVibe) &&
    value.customVibe.id === "custom-vibe" &&
    value.customVibe.label === "Describe the vibe…" &&
    typeof value.customVibe.placeholder === "string" &&
    Array.isArray(value.sourceEvidence) &&
    typeof value.revisionFingerprint === "string" &&
    Number.isInteger(value.continuityGeneration) &&
    Number(value.continuityGeneration) >= 0 &&
    isStringOrNull(value.mirrorProfileVersionId) &&
    typeof value.idempotencyKey === "string" &&
    (value.answer === null ||
      (isRecord(value.answer) &&
        (value.answer.kind === "choice" ||
          value.answer.kind === "custom_vibe"))) &&
    isStringOrNull(value.resumeOperationId) &&
    typeof value.createdAt === "string" &&
    isStringOrNull(value.answeredAt) &&
    isStringOrNull(value.staleAt)
  );
}

function isSlateDeveloperEvent(value: unknown): value is SlateDeveloperEvent {
  return (
    isRecord(value) &&
    value.schemaVersion === SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION &&
    value.disclosure === SLATE_DEVELOPER_EVENT_DISCLOSURE &&
    typeof value.id === "string" &&
    Number.isInteger(value.sequence) &&
    Number(value.sequence) >= 1 &&
    typeof value.projectId === "string" &&
    typeof value.sectionId === "string" &&
    Number.isInteger(value.sectionRevision) &&
    Number(value.sectionRevision) >= 0 &&
    typeof value.stage === "string" &&
    typeof value.kind === "string" &&
    typeof value.summary === "string" &&
    isRecord(value.detail) &&
    Array.isArray(value.sourceIds) &&
    value.sourceIds.every((sourceId) => typeof sourceId === "string") &&
    isStringOrNull(value.operationId) &&
    isStringOrNull(value.clarificationId) &&
    isStringOrNull(value.provider) &&
    isStringOrNull(value.model) &&
    Number.isInteger(value.continuityGeneration) &&
    Number(value.continuityGeneration) >= 0 &&
    typeof value.createdAt === "string"
  );
}

function isSlateReviewSectionV1(
  value: unknown,
): value is SlateReviewSectionV1 {
  if (!isRecord(value) || !isRecord(value.section)) return false;
  const section = value.section;
  return (
    typeof section.id === "string" &&
    typeof section.title === "string" &&
    (section.kind === "act" ||
      section.kind === "chapter" ||
      section.kind === "scene" ||
      section.kind === "imported") &&
    Number.isInteger(section.ordinal) &&
    Number(section.ordinal) >= 0 &&
    Number.isInteger(section.revision) &&
    Number(section.revision) >= 0 &&
    typeof section.documentHash === "string" &&
    typeof section.proseHash === "string" &&
    typeof value.acceptedProse === "string" &&
    Array.isArray(value.sources) &&
    Array.isArray(value.operations) &&
    value.operations.every(isSlateReviewOperationV1) &&
    Array.isArray(value.clarifications) &&
    value.clarifications.every(isSlateReviewClarificationRequest) &&
    Array.isArray(value.developerEvents) &&
    value.developerEvents.every(isSlateDeveloperEvent) &&
    isRecord(value.storyBible) &&
    isRecord(value.mirror) &&
    (value.momentum === null || isRecord(value.momentum))
  );
}

export function isSlateReviewExportV1(value: unknown): value is SlateReviewExportV1 {
  if (!isRecord(value) || value.format !== SLATE_REVIEW_EXPORT_FORMAT) {
    return false;
  }
  if (
    typeof value.exportedAt !== "string" ||
    !isSlateReviewProjectV1(value.project)
  ) {
    return false;
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    return false;
  }
  return value.sections.every(isSlateReviewSectionV1);
}
