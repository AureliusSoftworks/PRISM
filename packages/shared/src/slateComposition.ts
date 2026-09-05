import type { SlateAiProvider } from "./slate.js";
import type { SlateDocumentAnchor } from "./slateDocument.js";

export const SLATE_COMPOSITION_SCHEMA_VERSION = 1 as const;
export const SLATE_CLARIFICATION_CHOICE_COUNT = 3 as const;
export const SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL =
  "Describe the vibe…" as const;

export const SLATE_SCOPE_WORD_TARGETS = Object.freeze({
  beat: 180,
  passage: 500,
  scene: 1_200,
});

export type SlateDirectionScope = keyof typeof SLATE_SCOPE_WORD_TARGETS;
export type SlateDirectionScopeSource = "explicit" | "inferred" | "default";
export type SlateWordTargetSource =
  | "explicit"
  | "scope"
  | "project_norm"
  | "prompt_detail"
  | "fallback";

export type SlateDirectionOperation =
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

export interface SlateDirectionTarget {
  projectId: string;
  sectionId: string;
  selection: SlateDocumentAnchor | null;
}

export interface SlateDirectionIntent {
  schemaVersion: typeof SLATE_COMPOSITION_SCHEMA_VERSION;
  operation: SlateDirectionOperation;
  target: SlateDirectionTarget;
  direction: string;
  scope: SlateDirectionScope;
  scopeSource: SlateDirectionScopeSource;
  wordTarget: number;
  wordTargetSource: SlateWordTargetSource;
  pov: string | null;
  tense: string | null;
  pacing: string | null;
  sceneObjective: string | null;
  constraints: string[];
  mustInclude: string[];
  mustAvoid: string[];
}

export interface SlateDirectionIntentPatch {
  direction?: string;
  scope?: SlateDirectionScope;
  wordTarget?: number;
  pov?: string | null;
  tense?: string | null;
  pacing?: string | null;
  sceneObjective?: string | null;
  constraints?: string[];
  mustInclude?: string[];
  mustAvoid?: string[];
}

export interface SlateWordTargetResolutionInput {
  explicitWordTarget?: number | null;
  scope?: SlateDirectionScope | null;
  projectNormWordTarget?: number | null;
  promptDetailWordTarget?: number | null;
  fallbackWordTarget?: number | null;
}

export interface SlateWordTargetResolution {
  wordTarget: number;
  source: SlateWordTargetSource;
}

function normalizedWordTarget(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(25, Math.min(50_000, Math.round(value)));
}

export function normalizeSlateDirectionScope(
  value: unknown,
  fallback: SlateDirectionScope = "passage",
): SlateDirectionScope {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "beat" || normalized === "beats") return "beat";
  if (
    normalized === "passage" ||
    normalized === "selection" ||
    normalized === "paragraph"
  ) {
    return "passage";
  }
  if (
    normalized === "scene" ||
    normalized === "full scene" ||
    normalized === "full-scene"
  ) {
    return "scene";
  }
  return fallback;
}

/**
 * Keeps output length independent from Mirror/style density. The fixed
 * precedence is explicit request, editable scope, project rhythm, prompt
 * detail, then a defensive fallback.
 */
export function resolveSlateWordTarget(
  input: SlateWordTargetResolutionInput,
): SlateWordTargetResolution {
  const explicit = normalizedWordTarget(input.explicitWordTarget);
  if (explicit !== null) return { wordTarget: explicit, source: "explicit" };
  if (input.scope) {
    return {
      wordTarget: SLATE_SCOPE_WORD_TARGETS[input.scope],
      source: "scope",
    };
  }
  const projectNorm = normalizedWordTarget(input.projectNormWordTarget);
  if (projectNorm !== null) {
    return { wordTarget: projectNorm, source: "project_norm" };
  }
  const promptDetail = normalizedWordTarget(input.promptDetailWordTarget);
  if (promptDetail !== null) {
    return { wordTarget: promptDetail, source: "prompt_detail" };
  }
  return {
    wordTarget: normalizedWordTarget(input.fallbackWordTarget) ?? 500,
    source: "fallback",
  };
}

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
  provider: SlateAiProvider;
  model: string;
  createdAt: string;
}

/**
 * Durable state machine record. Generated prose never becomes evidence merely
 * because this record reached `proposed`; only `applied` has manuscript
 * authority.
 */
export interface SlateWritingOperation {
  schemaVersion: typeof SLATE_COMPOSITION_SCHEMA_VERSION;
  id: string;
  seriesId: string;
  projectId: string;
  sectionId: string;
  intent: SlateDirectionIntent;
  status: SlateWritingOperationStatus;
  revisionFingerprint: SlateWritingRevisionFingerprint;
  idempotencyKey: string;
  continuationOfOperationId: string | null;
  redirectOfOperationId: string | null;
  clarificationId: string | null;
  provider: SlateAiProvider | null;
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

export interface SlateWritingOperationMutationRequest {
  revisionFingerprint: string;
  idempotencyKey: string;
}

export interface SlateWritingOperationRedirectRequest
  extends SlateWritingOperationMutationRequest {
  direction: string;
}

export type SlateClarificationAnswerInput =
  | {
      kind: "choice";
      choiceId: string;
    }
  | {
      kind: "custom_vibe";
      vibe: string;
    };

export interface SlateClarificationAnswerRequest
  extends SlateWritingOperationMutationRequest {
  answer: SlateClarificationAnswerInput;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
}

export type SlateClarificationTrigger =
  | "hard_continuity_conflict"
  | "unstick_me";
export type SlateClarificationStatus =
  | "pending"
  | "answered"
  | "stale"
  | "cancelled";

export type SlateClarificationResolutionAction =
  | "preserve_canon"
  | "revise_direction"
  | "mark_intentional"
  | "defer"
  | "follow_thread"
  | "raise_cost"
  | "change_approach";

export interface SlateClarificationResolution {
  action: SlateClarificationResolutionAction;
  intentPatch: SlateDirectionIntentPatch;
}

export interface SlateClarificationChoice {
  id: string;
  label: string;
  description: string;
  resolution: SlateClarificationResolution;
}

export type SlateClarificationChoices = readonly [
  SlateClarificationChoice,
  SlateClarificationChoice,
  SlateClarificationChoice,
];

export interface SlateClarificationCustomVibeOption {
  id: "custom-vibe";
  label: typeof SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL;
  placeholder: string;
}

export interface SlateClarificationEvidence {
  concernId: string | null;
  summary: string;
  anchors: SlateDocumentAnchor[];
}

export type SlateClarificationAnswer =
  | {
      kind: "choice";
      choiceId: string;
      answeredAt: string;
    }
  | {
      kind: "custom_vibe";
      vibe: string;
      compiledIntentPatch: SlateDirectionIntentPatch;
      answeredAt: string;
    };

export interface SlateClarificationRequest {
  schemaVersion: typeof SLATE_COMPOSITION_SCHEMA_VERSION;
  id: string;
  operationId: string;
  trigger: SlateClarificationTrigger;
  status: SlateClarificationStatus;
  prompt: string;
  choices: SlateClarificationChoices;
  customVibe: SlateClarificationCustomVibeOption;
  sourceEvidence: SlateClarificationEvidence[];
  revisionFingerprint: string;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
  idempotencyKey: string;
  answer: SlateClarificationAnswer | null;
  resumeOperationId: string | null;
  createdAt: string;
  answeredAt: string | null;
  staleAt: string | null;
}

export interface SlateClarificationValidationResult {
  ok: boolean;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const CLARIFICATION_STATUSES = new Set<SlateClarificationStatus>([
  "pending",
  "answered",
  "stale",
  "cancelled",
]);

const CLARIFICATION_RESOLUTION_ACTIONS =
  new Set<SlateClarificationResolutionAction>([
    "preserve_canon",
    "revise_direction",
    "mark_intentional",
    "defer",
    "follow_thread",
    "raise_cost",
    "change_approach",
  ]);

/**
 * Runtime shield for provider-produced clarification cards. It intentionally
 * validates the interaction invariant more strictly than TypeScript can.
 */
export function validateSlateClarificationRequest(
  value: unknown,
): SlateClarificationValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: ["clarification must be an object"] };
  }
  if (value.schemaVersion !== SLATE_COMPOSITION_SCHEMA_VERSION) {
    issues.push("unsupported clarification schema");
  }
  if (!nonEmptyString(value.id)) issues.push("clarification id is required");
  if (!nonEmptyString(value.operationId)) {
    issues.push("operation id is required");
  }
  if (
    value.trigger !== "hard_continuity_conflict" &&
    value.trigger !== "unstick_me"
  ) {
    issues.push("clarification trigger is not permitted");
  }
  if (!CLARIFICATION_STATUSES.has(value.status as SlateClarificationStatus)) {
    issues.push("clarification status is invalid");
  }
  if (!nonEmptyString(value.prompt)) issues.push("prompt is required");
  const choiceIds = new Set<string>();
  if (!Array.isArray(value.choices)) {
    issues.push("choices must be an array");
  } else if (value.choices.length !== SLATE_CLARIFICATION_CHOICE_COUNT) {
    issues.push(
      `clarification must provide exactly ${SLATE_CLARIFICATION_CHOICE_COUNT} fixed choices`,
    );
  } else {
    value.choices.forEach((candidate, index) => {
      if (!isRecord(candidate)) {
        issues.push(`choice ${index} must be an object`);
        return;
      }
      const id = nonEmptyString(candidate.id) ? String(candidate.id).trim() : "";
      if (!id) issues.push(`choice ${index} id is required`);
      if (choiceIds.has(id)) issues.push(`duplicate choice id: ${id}`);
      choiceIds.add(id);
      if (!nonEmptyString(candidate.label)) {
        issues.push(`choice ${index} label is required`);
      }
      if (!nonEmptyString(candidate.description)) {
        issues.push(`choice ${index} description is required`);
      }
      if (!isRecord(candidate.resolution)) {
        issues.push(`choice ${index} resolution is required`);
      } else {
        if (
          !CLARIFICATION_RESOLUTION_ACTIONS.has(
            candidate.resolution
              .action as SlateClarificationResolutionAction,
          )
        ) {
          issues.push(`choice ${index} resolution action is invalid`);
        }
        if (!isRecord(candidate.resolution.intentPatch)) {
          issues.push(`choice ${index} intent patch is required`);
        }
      }
    });
  }
  if (!isRecord(value.customVibe)) {
    issues.push("custom vibe option is required");
  } else {
    if (value.customVibe.id !== "custom-vibe") {
      issues.push("custom vibe option must use the stable id");
    }
    if (value.customVibe.label !== SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL) {
      issues.push("custom vibe option must use the canonical label");
    }
    if (!nonEmptyString(value.customVibe.placeholder)) {
      issues.push("custom vibe placeholder is required");
    }
  }
  if (!Array.isArray(value.sourceEvidence)) {
    issues.push("source evidence must be an array");
  }
  if (!nonEmptyString(value.revisionFingerprint)) {
    issues.push("revision fingerprint is required");
  }
  if (
    typeof value.continuityGeneration !== "number" ||
    !Number.isInteger(value.continuityGeneration) ||
    value.continuityGeneration < 0
  ) {
    issues.push("continuity generation must be a non-negative integer");
  }
  if (!nonEmptyString(value.idempotencyKey)) {
    issues.push("idempotency key is required");
  }
  if (
    value.mirrorProfileVersionId !== null &&
    typeof value.mirrorProfileVersionId !== "string"
  ) {
    issues.push("Mirror profile version must be a string or null");
  }
  if (value.status === "answered") {
    if (!isRecord(value.answer)) {
      issues.push("answered clarification must retain its answer");
    } else if (value.answer.kind === "choice") {
      if (!nonEmptyString(value.answer.choiceId)) {
        issues.push("choice answer id is required");
      } else if (!choiceIds.has(String(value.answer.choiceId))) {
        issues.push("choice answer must reference a fixed choice");
      }
    } else if (value.answer.kind === "custom_vibe") {
      if (!nonEmptyString(value.answer.vibe)) {
        issues.push("custom vibe answer is required");
      }
      if (!isRecord(value.answer.compiledIntentPatch)) {
        issues.push("custom vibe answer must retain its compiled intent");
      }
    } else {
      issues.push("clarification answer kind is invalid");
    }
    if (!nonEmptyString(value.answeredAt)) {
      issues.push("answered clarification must retain its timestamp");
    }
  }
  if (value.status === "pending" && value.answer !== null) {
    issues.push("pending clarification cannot already have an answer");
  }
  if (value.status === "stale" && !nonEmptyString(value.staleAt)) {
    issues.push("stale clarification must retain its timestamp");
  }
  return { ok: issues.length === 0, issues };
}

export function isSlateClarificationRequest(
  value: unknown,
): value is SlateClarificationRequest {
  return validateSlateClarificationRequest(value).ok;
}

export interface SlateClarificationFreshnessInput {
  revisionFingerprint: string;
  continuityGeneration: number;
  mirrorProfileVersionId: string | null;
}

export function slateClarificationIsCurrent(
  request: Pick<
    SlateClarificationRequest,
    | "revisionFingerprint"
    | "continuityGeneration"
    | "mirrorProfileVersionId"
  >,
  current: SlateClarificationFreshnessInput,
): boolean {
  return (
    request.revisionFingerprint === current.revisionFingerprint &&
    request.continuityGeneration === current.continuityGeneration &&
    request.mirrorProfileVersionId === current.mirrorProfileVersionId
  );
}
