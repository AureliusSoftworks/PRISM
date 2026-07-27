import type { PrismCompanionSurfaceId } from "./prismCompanion.js";

export const PRISM_ORCHESTRATION_VERSION = 1 as const;
export const PRISM_CONTEXT_TOKEN_TTL_MS = 30 * 60 * 1_000;
export const PRISM_ACTION_UNDO_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export type PrismJsonPrimitive = string | number | boolean | null;
export type PrismJsonValue =
  | PrismJsonPrimitive
  | PrismJsonValue[]
  | { [key: string]: PrismJsonValue };
export type PrismJsonObject = { [key: string]: PrismJsonValue };

export type PrismCapabilityExecutionV1 = "server" | "client" | "hybrid";
export type PrismCapabilityRiskV1 =
  | "query"
  | "navigation"
  | "reversible"
  | "bulk"
  | "destructive"
  | "costly"
  | "privacy-sensitive"
  | "irreversible";
export type PrismCapabilityProviderV1 =
  | "none"
  | "local-only"
  | "local-or-online"
  | "online-required";
export type PrismCapabilityUndoV1 = "none" | "inverse" | "quarantine";
export type PrismConfirmationPolicyV1 =
  | "none"
  | "preview"
  | "explicit-confirmation";

export interface PrismEntityReferenceV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  entityType: string;
  id: string;
  label: string;
  revision: string | null;
}

export interface PrismCapabilityDescriptorV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  id: string;
  version: number;
  label: string;
  description: string;
  execution: PrismCapabilityExecutionV1;
  inputSchema: PrismJsonObject;
  resultSchema: PrismJsonObject;
  surfaces: PrismCompanionSurfaceId[];
  unavailableWhileLive: boolean;
  risk: PrismCapabilityRiskV1;
  confirmation: PrismConfirmationPolicyV1;
  privacy: "normal" | "private" | "sensitive";
  provider: PrismCapabilityProviderV1;
  cost: "none" | "estimated" | "paid";
  undo: PrismCapabilityUndoV1;
  idempotent: boolean;
}

export type PrismIntentKindV1 =
  | "query"
  | "action"
  | "workflow"
  | "clarification"
  | "undo";

export interface PrismIntentPlanStepV1 {
  capabilityId: string;
  input: PrismJsonObject;
  dependsOn: number[];
}

export interface PrismIntentPlanV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  kind: PrismIntentKindV1;
  confidence: number;
  capabilityId: string | null;
  input: PrismJsonObject;
  steps: PrismIntentPlanStepV1[];
  contextTokenIds: string[];
  clarification: string | null;
}

export interface PrismActionPreviewV1 {
  summary: string;
  consequences: string[];
  targets: PrismEntityReferenceV1[];
  diffs: Array<{
    entity: PrismEntityReferenceV1;
    before: PrismJsonValue;
    after: PrismJsonValue;
  }>;
  provider: string | null;
  model: string | null;
  estimatedCostMicroUsd: number | null;
}

export interface PrismActionProposalV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  id: string;
  capabilityId: string;
  capabilityVersion: number;
  input: PrismJsonObject;
  preview: PrismActionPreviewV1;
  risk: PrismCapabilityRiskV1;
  confirmation: PrismConfirmationPolicyV1;
  status: "ready" | "stale" | "expired";
  createdAt: string;
  expiresAt: string;
}

export type PrismActionRunStatusV1 =
  | "running"
  | "committed"
  | "failed"
  | "undone"
  | "undo-failed";

export interface PrismActionRunV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  id: string;
  parentRunId: string | null;
  capabilityId: string;
  capabilityVersion: number;
  source: "prism" | "ui";
  status: PrismActionRunStatusV1;
  affectedEntities: PrismEntityReferenceV1[];
  result: PrismJsonValue | null;
  error: string | null;
  costMicroUsd: number | null;
  undoAvailable: boolean;
  nonReversibleConsequences: string[];
  createdAt: string;
  committedAt: string | null;
  undoneAt: string | null;
  undoExpiresAt: string | null;
}

export interface PrismContextTokenV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  id: string;
  purpose: string;
  entities: PrismEntityReferenceV1[];
  createdAt: string;
  expiresAt: string;
}

export interface PrismMonitorV1 {
  schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
  id: string;
  kind: "elevenlabs-credit-threshold";
  status: "active" | "paused-local" | "triggered" | "disabled";
  thresholdRatio: number;
  lastObservedRatio: number | null;
  billingCycleKey: string | null;
  lastCheckedAt: string | null;
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PrismCompanionCardV1 =
  | {
      schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
      type: "answer";
      title: string;
      body: string;
      contextToken: PrismContextTokenV1 | null;
    }
  | {
      schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
      type: "proposal";
      title: string;
      proposal: PrismActionProposalV1;
    }
  | {
      schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
      type: "progress";
      title: string;
      run: PrismActionRunV1;
      progress: number | null;
    }
  | {
      schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
      type: "result";
      title: string;
      run: PrismActionRunV1;
    }
  | {
      schemaVersion: typeof PRISM_ORCHESTRATION_VERSION;
      type: "clarification";
      title: string;
      question: string;
      choices: Array<{ id: string; label: string }>;
    };

export interface PrismExecuteProposalRequestV1 {
  proposalId: string;
  confirmation: boolean;
  idempotencyKey: string;
}

export interface PrismUndoRequestV1 {
  runId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  maximum: number,
  fallback = "",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : normalized.slice(0, maximum);
}

function jsonValue(value: unknown, depth = 0): PrismJsonValue | undefined {
  if (depth > 8) return undefined;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const output: PrismJsonValue[] = [];
    for (const item of value.slice(0, 100)) {
      const normalized = jsonValue(item, depth + 1);
      if (normalized !== undefined) output.push(normalized);
    }
    return output;
  }
  if (!isRecord(value)) return undefined;
  const output: PrismJsonObject = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const normalizedKey = boundedString(key, 120);
    const normalized = jsonValue(item, depth + 1);
    if (normalizedKey && normalized !== undefined) {
      output[normalizedKey] = normalized;
    }
  }
  return output;
}

export function normalizePrismJsonObject(value: unknown): PrismJsonObject {
  const normalized = jsonValue(value);
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    return {};
  }
  return normalized;
}

export function normalizePrismIntentPlanV1(
  value: unknown,
  allowedCapabilityIds: readonly string[],
): PrismIntentPlanV1 {
  if (!isRecord(value)) throw new Error("Prism returned an invalid plan.");
  const allowed = new Set(allowedCapabilityIds);
  const kinds: PrismIntentKindV1[] = [
    "query",
    "action",
    "workflow",
    "clarification",
    "undo",
  ];
  if (!kinds.includes(value.kind as PrismIntentKindV1)) {
    throw new Error("Prism returned an unsupported intent.");
  }
  const kind = value.kind as PrismIntentKindV1;
  const capabilityId = boundedString(value.capabilityId, 160) || null;
  if (capabilityId && !allowed.has(capabilityId)) {
    throw new Error("Prism selected an unavailable capability.");
  }
  const steps = Array.isArray(value.steps)
    ? value.steps.slice(0, 12).flatMap((step): PrismIntentPlanStepV1[] => {
        if (!isRecord(step)) return [];
        const stepCapabilityId = boundedString(step.capabilityId, 160);
        if (!stepCapabilityId || !allowed.has(stepCapabilityId)) return [];
        return [
          {
            capabilityId: stepCapabilityId,
            input: normalizePrismJsonObject(step.input),
            dependsOn: Array.isArray(step.dependsOn)
              ? step.dependsOn
                  .filter(
                    (index): index is number =>
                      typeof index === "number" &&
                      Number.isInteger(index) &&
                      index >= 0 &&
                      index < 12,
                  )
                  .slice(0, 12)
              : [],
          },
        ];
      })
    : [];
  const confidence =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.min(1, Math.max(0, value.confidence))
      : 0;
  const clarification = boundedString(value.clarification, 500) || null;
  if (
    (kind === "action" || kind === "query") &&
    !capabilityId
  ) {
    throw new Error("Prism omitted the requested capability.");
  }
  if (kind === "workflow" && steps.length === 0) {
    throw new Error("Prism returned an empty workflow.");
  }
  if (kind === "clarification" && !clarification) {
    throw new Error("Prism returned an empty clarification.");
  }
  return {
    schemaVersion: PRISM_ORCHESTRATION_VERSION,
    kind,
    confidence,
    capabilityId,
    input: normalizePrismJsonObject(value.input),
    steps,
    contextTokenIds: Array.isArray(value.contextTokenIds)
      ? Array.from(
          new Set(
            value.contextTokenIds
              .map((id) => boundedString(id, 160))
              .filter(Boolean),
          ),
        ).slice(0, 8)
      : [],
    clarification,
  };
}

export function normalizePrismExecuteProposalRequestV1(
  value: unknown,
): PrismExecuteProposalRequestV1 {
  if (!isRecord(value)) throw new Error("A proposal request is required.");
  const proposalId = boundedString(value.proposalId, 160);
  const idempotencyKey = boundedString(value.idempotencyKey, 160);
  if (!proposalId || !idempotencyKey) {
    throw new Error("Proposal and idempotency IDs are required.");
  }
  return {
    proposalId,
    confirmation: value.confirmation === true,
    idempotencyKey,
  };
}

export function normalizePrismUndoRequestV1(
  value: unknown,
): PrismUndoRequestV1 {
  if (!isRecord(value)) return {};
  const runId = boundedString(value.runId, 160);
  return runId ? { runId } : {};
}
