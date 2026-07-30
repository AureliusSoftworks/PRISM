import type {
  SlateDocumentAnchor,
  SlateDirectorScope,
} from "./slateManuscriptDocument";

export type SlateWritingOperationStatus =
  | "compiling"
  | "awaiting_clarification"
  | "generating"
  | "interrupted"
  | "proposed"
  | "applied"
  | "rejected"
  | "stale"
  | "cancelled"
  | "failed";

export interface SlateWritingRevisionFingerprint {
  value: string;
  sectionRevision: number;
  documentHash: string;
  proseHash: string;
  locksHash: string;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
}

export interface SlateWritingProposal {
  id: string;
  operationId: string;
  prose: string;
  proseHash: string;
  replacementAnchor: SlateDocumentAnchor | null;
  provider: "local" | "openai" | "anthropic";
  model: string;
  createdAt: string;
}

export interface SlateWritingOperation {
  schemaVersion: 1;
  id: string;
  seriesId: string;
  projectId: string;
  sectionId: string;
  intent: {
    schemaVersion: 1;
    operation:
      | "draft"
      | "continue"
      | "redirect"
      | "deepen"
      | "condense"
      | "rewrite"
      | "reframe"
      | "cut"
      | "direct"
      | "unstick";
    target: {
      projectId: string;
      sectionId: string;
      selection: SlateDocumentAnchor | null;
    };
    direction: string;
    scope: SlateDirectorScope;
    scopeSource: "explicit" | "inferred" | "default";
    wordTarget: number;
    wordTargetSource:
      | "explicit"
      | "scope"
      | "project_norm"
      | "prompt_detail"
      | "fallback";
    pov: string | null;
    tense: string | null;
    pacing: string | null;
    sceneObjective: string | null;
    constraints: string[];
    mustInclude: string[];
    mustAvoid: string[];
  };
  status: SlateWritingOperationStatus;
  revisionFingerprint: SlateWritingRevisionFingerprint;
  idempotencyKey: string;
  continuationOfOperationId: string | null;
  redirectOfOperationId: string | null;
  clarificationId: string | null;
  provider: "local" | "openai" | "anthropic" | null;
  model: string | null;
  proposal: SlateWritingProposal | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  interruptedAt: string | null;
  proposedAt: string | null;
  appliedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
}

export interface SlateClarificationChoice {
  id: string;
  label: string;
  description: string;
  resolution: {
    action: string;
    intentPatch: Record<string, unknown>;
  };
}

export interface SlateClarificationRequest {
  schemaVersion: 1;
  id: string;
  operationId: string;
  trigger: "hard_continuity_conflict" | "unstick_me";
  status: "pending" | "answered" | "stale" | "cancelled";
  prompt: string;
  choices: readonly [
    SlateClarificationChoice,
    SlateClarificationChoice,
    SlateClarificationChoice,
  ];
  customVibe: {
    id: "custom-vibe";
    label: "Describe the vibe…";
    placeholder: string;
  };
  sourceEvidence: Array<{
    concernId: string | null;
    summary: string;
    anchors: SlateDocumentAnchor[];
  }>;
  revisionFingerprint: string;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
  idempotencyKey: string;
  answer: Record<string, unknown> | null;
  resumeOperationId: string | null;
  createdAt: string;
  answeredAt: string | null;
  staleAt: string | null;
}

export interface SlateWritingOperationResponse {
  ok: true;
  operation: SlateWritingOperation;
  clarification: SlateClarificationRequest | null;
}

export interface SlateWritingProposalPreview {
  text: string;
  wordCount: number;
  characterCount: number;
  truncated: boolean;
}

export function slateWritingProposalPreview(
  value: string,
  maximumCharacters = 3_200,
): SlateWritingProposalPreview {
  const normalizedMaximum = Math.max(320, Math.floor(maximumCharacters));
  const wordCount = value.trim()
    ? value.trim().split(/\s+/u).length
    : 0;
  if (value.length <= normalizedMaximum) {
    return {
      text: value,
      wordCount,
      characterCount: value.length,
      truncated: false,
    };
  }
  const edgeLength = Math.floor((normalizedMaximum - 120) / 2);
  const hiddenCharacters = value.length - edgeLength * 2;
  return {
    text: `${value.slice(0, edgeLength)}\n\n… ${hiddenCharacters.toLocaleString("en-US")} characters hidden from this review excerpt …\n\n${value.slice(-edgeLength)}`,
    wordCount,
    characterCount: value.length,
    truncated: true,
  };
}

export function slateWritingOperationCanStop(
  operation: SlateWritingOperation | null,
): boolean {
  return Boolean(
    operation &&
      (operation.status === "compiling" ||
        operation.status === "awaiting_clarification" ||
        operation.status === "generating"),
  );
}

export function slateWritingOperationCanContinue(
  operation: SlateWritingOperation | null,
): boolean {
  return Boolean(
    operation &&
      (operation.status === "interrupted" ||
        operation.status === "proposed" ||
        operation.status === "applied"),
  );
}

export function slateWritingOperationCanRedirect(
  operation: SlateWritingOperation | null,
): boolean {
  return Boolean(
    operation &&
      (operation.status === "generating" ||
        operation.status === "interrupted" ||
        operation.status === "proposed"),
  );
}

export function slateWritingOperationStorageKey(
  projectId: string,
  sectionId: string,
): string {
  return `prism_slate_writing_operation_v1:${projectId}:${sectionId}`;
}

export function slateWritingOperationStatusLabel(
  status: SlateWritingOperationStatus,
): string {
  if (status === "awaiting_clarification") return "Waiting for your direction";
  if (status === "generating" || status === "compiling") {
    return "Composing a proposal";
  }
  if (status === "interrupted") return "Interrupted safely";
  if (status === "proposed") return "Proposal ready";
  if (status === "applied") return "Accepted into the manuscript";
  if (status === "rejected") return "Proposal rejected";
  if (status === "stale") return "Context changed";
  if (status === "cancelled") return "Cancelled";
  return "Writing operation failed";
}
