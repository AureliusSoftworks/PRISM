import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
  normalizeSlateDirectionScope,
  resolveSlateWordTarget,
  slateImportedSectionRequiresPassageScope,
  slateSha256,
  type SlateClarificationAnswerRequest,
  type SlateClarificationChoice,
  type SlateClarificationChoices,
  type SlateClarificationRequest,
  type SlateDirectionIntent,
  type SlateDirectionIntentPatch,
  type SlateDirectionOperation,
  type SlateWritingOperation,
  type SlateWritingOperationStatus,
  type SlateWritingRevisionFingerprint,
} from "@localai/shared";
import { randomId } from "./security.ts";
import {
  recordSlateDeveloperEvent,
} from "./slate-developer-events.ts";
import { ensureSlateSectionDocument } from "./slate-section-documents.ts";

const DIRECTION_MAX = 8_000;
const VIBE_MAX = 4_000;
const IDEMPOTENCY_MAX = 240;
const LIST_ITEM_MAX = 120;

interface ProjectSnapshotRow {
  id: string;
  series_id: string;
  prose_mode: string;
  continuity_active_generation: number;
  structure_json: string;
  updated_at: string;
}

interface SectionSnapshotRow {
  id: string;
  structure_item_id: string | null;
  kind: string;
  title: string;
  revision: number;
  prose: string;
  content_hash: string;
  locked: number;
  locked_ranges_json: string;
}

interface OperationRow {
  id: string;
  user_id: string;
  project_id: string;
  section_id: string | null;
  parent_operation_id: string | null;
  kind: string;
  status: string;
  direction_intent_json: string;
  validated_snapshot_json: string;
  revision_fingerprint: string;
  continuity_generation: number;
  mirror_profile_version_id: string | null;
  provider: string | null;
  model: string | null;
  proposal_text: string | null;
  proposal_hash: string | null;
  revision_id: string | null;
  idempotency_key: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  resolved_at: string | null;
}

interface ClarificationRow {
  id: string;
  user_id: string;
  project_id: string;
  section_id: string | null;
  operation_id: string;
  kind: string;
  status: string;
  prompt: string;
  choices_json: string;
  allows_custom_vibe: number;
  evidence_json: string;
  revision_fingerprint: string;
  continuity_generation: number;
  mirror_profile_version_id: string | null;
  answer_kind: string | null;
  answer_choice_id: string | null;
  custom_vibe: string | null;
  structured_direction_json: string | null;
  answer_idempotency_key: string | null;
  resume_operation_id: string | null;
  created_at: string;
  answered_at: string | null;
  stale_at: string | null;
}

export class SlateWritingOperationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code = "slate_writing_operation",
    detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SlateWritingOperationError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (required) throw new SlateWritingOperationError(`${label} is required.`);
    return "";
  }
  const normalized = value.normalize("NFKC").trim();
  if (required && !normalized) {
    throw new SlateWritingOperationError(`${label} is required.`);
  }
  if (normalized.length > maximum) {
    throw new SlateWritingOperationError(`${label} is too long.`);
  }
  return normalized;
}

function stringList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > LIST_ITEM_MAX) {
    throw new SlateWritingOperationError(`${label} must be a short list.`);
  }
  return value.map((item, index) =>
    text(item, `${label} item ${index + 1}`, 1_000),
  );
}

function directionOperation(value: unknown): SlateDirectionOperation {
  if (
    value === "draft" ||
    value === "continue" ||
    value === "redirect" ||
    value === "deepen" ||
    value === "condense" ||
    value === "rewrite" ||
    value === "reframe" ||
    value === "cut" ||
    value === "direct" ||
    value === "unstick"
  ) {
    return value;
  }
  return "draft";
}

function projectSnapshot(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectSnapshotRow {
  const row = db
    .prepare(
      `SELECT id, series_id, prose_mode, continuity_active_generation,
              structure_json, updated_at
         FROM slate_projects
        WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as ProjectSnapshotRow | undefined;
  if (!row) {
    throw new SlateWritingOperationError(
      "Slate project not found.",
      404,
      "slate_project_not_found",
    );
  }
  return row;
}

function sectionSnapshot(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SectionSnapshotRow {
  const row = db
    .prepare(
      `SELECT id, structure_item_id, kind, title, revision, prose,
              content_hash, locked, locked_ranges_json
         FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(sectionId, projectId, userId) as SectionSnapshotRow | undefined;
  if (!row) {
    throw new SlateWritingOperationError(
      "Slate section not found.",
      404,
      "slate_section_not_found",
    );
  }
  return row;
}

function intentHasValidSelection(
  intent: SlateDirectionIntent,
  section: SectionSnapshotRow,
): boolean {
  const selection = intent.target.selection;
  return Boolean(
    selection &&
      selection.sectionId === section.id &&
      Number.isInteger(selection.start) &&
      Number.isInteger(selection.end) &&
      selection.start >= 0 &&
      selection.end > selection.start &&
      selection.end <= section.prose.length,
  );
}

function assertImportedManuscriptScope(
  section: SectionSnapshotRow,
  intent: SlateDirectionIntent,
): void {
  if (
    !slateImportedSectionRequiresPassageScope({
      kind: section.kind,
      title: section.title,
      prose: section.prose,
      hasSelection: intentHasValidSelection(intent, section),
    })
  ) {
    return;
  }
  throw new SlateWritingOperationError(
    "This direction would replace the entire imported manuscript. Select the passage you want Slate to revise, then try again.",
    409,
    "slate_writing_import_scope_too_broad",
  );
}

function mirrorVersionId(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT profile_version_id
         FROM slate_project_mirror_bindings
        WHERE project_id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as { profile_version_id: string } | undefined;
  return row?.profile_version_id ?? null;
}

export function getSlateWritingRevisionFingerprint(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateWritingRevisionFingerprint {
  const project = projectSnapshot(db, userId, projectId);
  const section = sectionSnapshot(db, userId, projectId, sectionId);
  const document = ensureSlateSectionDocument(db, {
    userId,
    projectId,
    sectionId,
  });
  const locksHash = slateSha256(
    JSON.stringify([section.locked === 1, section.locked_ranges_json]),
  );
  const mirrorProfileVersionId = mirrorVersionId(db, userId, projectId);
  const continuityGeneration = Number(
    project.continuity_active_generation ?? 0,
  );
  return {
    value: slateSha256(
      JSON.stringify([
        "slate-writing-revision-fingerprint-v1",
        projectId,
        sectionId,
        Number(section.revision),
        document.documentHash,
        document.proseHash,
        locksHash,
        continuityGeneration,
        mirrorProfileVersionId,
      ]),
    ),
    sectionRevision: Number(section.revision),
    documentHash: document.documentHash,
    proseHash: document.proseHash,
    locksHash,
    continuityGeneration,
    mirrorProfileVersionId,
  };
}

function projectNormWordTarget(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): number | null {
  const row = db
    .prepare(
      `SELECT AVG(
          CASE
            WHEN TRIM(prose) = '' THEN NULL
            ELSE LENGTH(TRIM(prose)) - LENGTH(REPLACE(TRIM(prose), ' ', '')) + 1
          END
        ) AS average_words
         FROM slate_sections
        WHERE user_id = ? AND project_id = ? AND TRIM(prose) <> ''`,
    )
    .get(userId, projectId) as { average_words: number | null };
  return row.average_words === null ? null : Number(row.average_words);
}

function normalizeIntent(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  input: Record<string, unknown>,
): SlateDirectionIntent {
  const operation = directionOperation(input.operation);
  const direction = text(
    input.direction,
    "Slate direction",
    DIRECTION_MAX,
    operation !== "unstick",
  );
  const explicitScope =
    typeof input.scope === "string" && input.scope.trim().length > 0;
  const scope = normalizeSlateDirectionScope(
    input.scope,
    input.selection ? "passage" : "scene",
  );
  const wordTarget = resolveSlateWordTarget({
    explicitWordTarget:
      typeof input.wordTarget === "number" ? input.wordTarget : null,
    scope: explicitScope ? scope : null,
    projectNormWordTarget: projectNormWordTarget(
      db,
      userId,
      projectId,
    ),
    promptDetailWordTarget:
      direction.length > 1_200 ? 800 : direction.length > 500 ? 500 : null,
    fallbackWordTarget: 500,
  });
  return {
    schemaVersion: 1,
    operation,
    target: {
      projectId,
      sectionId,
      selection:
        input.selection && typeof input.selection === "object"
          ? (input.selection as SlateDirectionIntent["target"]["selection"])
          : null,
    },
    direction,
    scope,
    scopeSource: explicitScope
      ? "explicit"
      : input.selection
        ? "inferred"
        : "default",
    wordTarget: wordTarget.wordTarget,
    wordTargetSource: wordTarget.source,
    pov:
      typeof input.pov === "string" && input.pov.trim()
        ? input.pov.trim().slice(0, 240)
        : null,
    tense:
      typeof input.tense === "string" && input.tense.trim()
        ? input.tense.trim().slice(0, 120)
        : null,
    pacing:
      typeof input.pacing === "string" && input.pacing.trim()
        ? input.pacing.trim().slice(0, 240)
        : null,
    sceneObjective:
      typeof input.sceneObjective === "string" && input.sceneObjective.trim()
        ? input.sceneObjective.trim().slice(0, 1_000)
        : null,
    constraints: stringList(input.constraints, "Direction constraints"),
    mustInclude: stringList(input.mustInclude, "Must-include details"),
    mustAvoid: stringList(input.mustAvoid, "Must-avoid details"),
  };
}

function status(value: string): SlateWritingOperationStatus {
  if (
    value === "compiling" ||
    value === "awaiting_clarification" ||
    value === "generating" ||
    value === "interrupted" ||
    value === "proposed" ||
    value === "applied" ||
    value === "rejected" ||
    value === "stale" ||
    value === "cancelled" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
}

function operationRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
): OperationRow {
  const row = db
    .prepare(
      `SELECT * FROM slate_writing_operations
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(operationId, projectId, userId) as OperationRow | undefined;
  if (!row) {
    throw new SlateWritingOperationError(
      "Slate writing operation not found.",
      404,
      "slate_writing_operation_not_found",
    );
  }
  return row;
}

function clarificationIdForOperation(
  db: DatabaseSync,
  userId: string,
  operationId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT id FROM slate_clarification_requests
        WHERE user_id = ? AND operation_id = ?`,
    )
    .get(userId, operationId) as { id: string } | undefined;
  return row?.id ?? null;
}

function operationFromRow(
  db: DatabaseSync,
  row: OperationRow,
): SlateWritingOperation {
  const snapshot = parseJson<{
    fingerprint?: SlateWritingRevisionFingerprint;
  }>(row.validated_snapshot_json, {});
  const fingerprint =
    snapshot.fingerprint ??
    ({
      value: row.revision_fingerprint,
      sectionRevision: 0,
      documentHash: "",
      proseHash: "",
      locksHash: "",
      continuityGeneration: Number(row.continuity_generation),
      mirrorProfileVersionId: row.mirror_profile_version_id,
    } satisfies SlateWritingRevisionFingerprint);
  const intent = parseJson<SlateDirectionIntent>(
    row.direction_intent_json,
    null as unknown as SlateDirectionIntent,
  );
  const operationStatus = status(row.status);
  return {
    schemaVersion: 1,
    id: row.id,
    seriesId: projectSnapshot(db, row.user_id, row.project_id).series_id,
    projectId: row.project_id,
    sectionId: row.section_id ?? intent.target.sectionId,
    intent,
    status: operationStatus,
    revisionFingerprint: fingerprint,
    idempotencyKey: row.idempotency_key,
    continuationOfOperationId:
      row.kind === "continue" ? row.parent_operation_id : null,
    redirectOfOperationId:
      row.kind === "redirect" ? row.parent_operation_id : null,
    clarificationId: clarificationIdForOperation(db, row.user_id, row.id),
    provider:
      row.provider === "local" ||
      row.provider === "openai" ||
      row.provider === "anthropic"
        ? row.provider
        : null,
    model: row.model,
    proposal:
      row.proposal_text !== null && row.proposal_hash
        ? {
            id: `proposal-${row.id}`,
            operationId: row.id,
            prose: row.proposal_text,
            proseHash: row.proposal_hash,
            replacementAnchor: intent.target.selection,
            provider:
              row.provider === "openai" || row.provider === "anthropic"
                ? row.provider
                : "local",
            model: row.model ?? "",
            createdAt: row.completed_at ?? row.updated_at,
          }
        : null,
    failureCode: operationStatus === "failed" ? "generation_failed" : null,
    failureMessage: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    interruptedAt:
      operationStatus === "interrupted" ? row.completed_at ?? row.updated_at : null,
    proposedAt: operationStatus === "proposed" ? row.completed_at : null,
    appliedAt: operationStatus === "applied" ? row.resolved_at : null,
    rejectedAt: operationStatus === "rejected" ? row.resolved_at : null,
    completedAt:
      operationStatus === "applied" ||
      operationStatus === "rejected" ||
      operationStatus === "cancelled" ||
      operationStatus === "failed"
        ? row.resolved_at ?? row.completed_at
        : null,
  };
}

export interface SlateWritingOperationView {
  operation: SlateWritingOperation;
  clarification: SlateClarificationRequest | null;
}

export interface SlateGroundedContinuityConflict {
  id: string;
  summary: string;
  explanation: string;
  anchors: Array<Record<string, unknown>>;
}

function choicesFor(
  trigger: "hard_continuity_conflict" | "unstick_me",
  concernSummary: string | null,
): SlateClarificationChoices {
  if (trigger === "unstick_me") {
    return [
      {
        id: "follow-live-thread",
        label: "Pull the live thread",
        description: "Advance the nearest unresolved desire, promise, or mystery.",
        resolution: {
          action: "follow_thread",
          intentPatch: {
            direction:
              "Advance the strongest unresolved thread already alive in the scene.",
          },
        },
      },
      {
        id: "raise-the-cost",
        label: "Raise the cost",
        description: "Force a meaningful consequence or sacrifice now.",
        resolution: {
          action: "raise_cost",
          intentPatch: {
            direction:
              "Force the viewpoint character to pay a meaningful cost for progress.",
          },
        },
      },
      {
        id: "change-the-approach",
        label: "Change the approach",
        description: "Let the character pursue the objective from a surprising angle.",
        resolution: {
          action: "change_approach",
          intentPatch: {
            direction:
              "Keep the objective, but change how the character tries to reach it.",
          },
        },
      },
    ];
  }
  const context = concernSummary ? ` (${concernSummary})` : "";
  return [
    {
      id: "preserve-canon",
      label: "Honor established canon",
      description: "Adjust this beat so the accepted story truth remains intact.",
      resolution: {
        action: "preserve_canon",
        intentPatch: {
          constraints: [`Preserve the conflicting accepted canon${context}.`],
        },
      },
    },
    {
      id: "mark-intentional",
      label: "Make it intentional",
      description: "Keep the apparent contradiction as a deliberate story signal.",
      resolution: {
        action: "mark_intentional",
        intentPatch: {
          constraints: [
            `Treat the apparent contradiction as intentional and legible${context}.`,
          ],
        },
      },
    },
    {
      id: "change-approach",
      label: "Take another route",
      description: "Avoid the conflict while preserving the scene objective.",
      resolution: {
        action: "change_approach",
        intentPatch: {
          direction:
            "Preserve the scene objective, but reach it through a different beat.",
        },
      },
    },
  ];
}

function clarificationFromRow(row: ClarificationRow): SlateClarificationRequest {
  const choices = parseJson<SlateClarificationChoice[]>(row.choices_json, []);
  if (choices.length !== 3) {
    throw new SlateWritingOperationError(
      "Stored Slate clarification choices are invalid.",
      500,
      "slate_clarification_corrupt",
    );
  }
  const statusValue =
    row.status === "answered" ||
    row.status === "stale" ||
    row.status === "cancelled"
      ? row.status
      : "pending";
  const answer =
    row.answer_kind === "choice" && row.answer_choice_id && row.answered_at
      ? {
          kind: "choice" as const,
          choiceId: row.answer_choice_id,
          answeredAt: row.answered_at,
        }
      : row.answer_kind === "custom_vibe" &&
          row.custom_vibe &&
          row.answered_at
        ? {
            kind: "custom_vibe" as const,
            vibe: row.custom_vibe,
            compiledIntentPatch: parseJson<SlateDirectionIntentPatch>(
              row.structured_direction_json,
              {},
            ),
            answeredAt: row.answered_at,
          }
        : null;
  return {
    schemaVersion: 1,
    id: row.id,
    operationId: row.operation_id,
    trigger:
      row.kind === "unstick_me" ? "unstick_me" : "hard_continuity_conflict",
    status: statusValue,
    prompt: row.prompt,
    choices: choices as unknown as SlateClarificationChoices,
    customVibe: {
      id: "custom-vibe",
      label: SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
      placeholder: "Describe the emotional shape, energy, or texture you want…",
    },
    sourceEvidence: parseJson(row.evidence_json, []),
    revisionFingerprint: row.revision_fingerprint,
    continuityGeneration: Number(row.continuity_generation),
    mirrorProfileVersionId: row.mirror_profile_version_id,
    idempotencyKey: `clarification:${row.operation_id}`,
    answer,
    resumeOperationId: row.resume_operation_id,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    staleAt: row.stale_at,
  };
}

function clarificationForOperation(
  db: DatabaseSync,
  userId: string,
  operationId: string,
): SlateClarificationRequest | null {
  const row = db
    .prepare(
      `SELECT * FROM slate_clarification_requests
        WHERE user_id = ? AND operation_id = ?`,
    )
    .get(userId, operationId) as ClarificationRow | undefined;
  return row ? clarificationFromRow(row) : null;
}

export function getSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
): SlateWritingOperationView {
  const row = operationRow(db, userId, projectId, operationId);
  return {
    operation: operationFromRow(db, row),
    clarification: clarificationForOperation(db, userId, operationId),
  };
}

function hardConflict(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  generation: number,
): {
  id: string;
  summary: string;
  explanation: string;
  anchors_json: string;
  kind: string;
} | null {
  const row = db
    .prepare(
      `SELECT id, summary, explanation, anchors_json, kind
         FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? AND generation = ?
          AND status = 'open' AND severity = 'critical'
          AND kind <> 'ambiguous_extraction'
          AND (section_id = ? OR section_id IS NULL)
        ORDER BY CASE WHEN section_id = ? THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`,
    )
    .get(
      userId,
      projectId,
      generation,
      sectionId,
      sectionId,
    ) as
    | {
        id: string;
        summary: string;
        explanation: string;
        anchors_json: string;
        kind: string;
      }
    | undefined;
  return row ?? null;
}

function insertClarification(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    sectionId: string;
    operationId: string;
    trigger: "hard_continuity_conflict" | "unstick_me";
    revisionFingerprint: SlateWritingRevisionFingerprint;
    concern: ReturnType<typeof hardConflict>;
    createdAt: string;
  },
): SlateClarificationRequest {
  const id = randomId();
  const choices = choicesFor(input.trigger, input.concern?.summary ?? null);
  const prompt =
    input.trigger === "unstick_me"
      ? "Which pressure should Slate follow next?"
      : `Continuity found a material conflict: ${input.concern!.summary}`;
  const evidence = input.concern
    ? [
        {
          concernId: input.concern.id,
          summary:
            input.concern.explanation || input.concern.summary,
          anchors: parseJson(input.concern.anchors_json, []),
        },
      ]
    : [];
  db.prepare(
    `INSERT INTO slate_clarification_requests
      (id, user_id, project_id, section_id, operation_id, kind, status,
       prompt, choices_json, allows_custom_vibe, evidence_json,
       revision_fingerprint, continuity_generation, mirror_profile_version_id,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.projectId,
    input.sectionId,
    input.operationId,
    input.trigger,
    prompt,
    JSON.stringify(choices),
    JSON.stringify(evidence),
    input.revisionFingerprint.value,
    input.revisionFingerprint.continuityGeneration,
    input.revisionFingerprint.mirrorProfileVersionId,
    input.createdAt,
  );
  const row = db
    .prepare("SELECT * FROM slate_clarification_requests WHERE id = ?")
    .get(id) as unknown as ClarificationRow;
  return clarificationFromRow(row);
}

export function createSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: Record<string, unknown>,
): SlateWritingOperationView {
  const sectionId = text(input.sectionId, "Slate section id", 180);
  const idempotencyKey = text(
    input.idempotencyKey,
    "Writing operation idempotency key",
    IDEMPOTENCY_MAX,
  );
  const existing = db
    .prepare(
      `SELECT id FROM slate_writing_operations
        WHERE user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .get(userId, projectId, idempotencyKey) as { id: string } | undefined;
  if (existing) {
    return getSlateWritingOperation(db, userId, projectId, existing.id);
  }
  const project = projectSnapshot(db, userId, projectId);
  const section = sectionSnapshot(db, userId, projectId, sectionId);
  const fingerprint = getSlateWritingRevisionFingerprint(
    db,
    userId,
    projectId,
    sectionId,
  );
  const suppliedFingerprint =
    input.revisionFingerprint === undefined
      ? null
      : text(
          input.revisionFingerprint,
          "Writing revision fingerprint",
          180,
        );
  if (suppliedFingerprint && suppliedFingerprint !== fingerprint.value) {
    throw new SlateWritingOperationError(
      "The section changed before Slate could compile this direction.",
      409,
      "slate_writing_fingerprint_stale",
      { currentRevisionFingerprint: fingerprint },
    );
  }
  const intent = normalizeIntent(
    db,
    userId,
    projectId,
    sectionId,
    input,
  );
  assertImportedManuscriptScope(section, intent);
  const operationId = randomId();
  const now = new Date().toISOString();
  const snapshot = {
    fingerprint,
    structureItemId: section.structure_item_id,
    expectedStructureJson: project.structure_json,
    sectionContentHash: section.content_hash,
  };
  db.prepare(
    `INSERT INTO slate_writing_operations
      (id, user_id, project_id, section_id, parent_operation_id, kind, status,
       direction_intent_json, validated_snapshot_json, revision_fingerprint,
       continuity_generation, mirror_profile_version_id, idempotency_key,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 'compiling', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    operationId,
    userId,
    projectId,
    sectionId,
    intent.operation,
    JSON.stringify(intent),
    JSON.stringify(snapshot),
    fingerprint.value,
    fingerprint.continuityGeneration,
    fingerprint.mirrorProfileVersionId,
    idempotencyKey,
    now,
    now,
  );
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId,
    sectionRevision: fingerprint.sectionRevision,
    stage: "intent",
    kind: "direction_compiled",
    summary: `Compiled ${intent.operation} direction at ${intent.scope} scope.`,
    detail: { intent },
    operationId,
    continuityGeneration: fingerprint.continuityGeneration,
    createdAt: now,
  });
  const concern = hardConflict(
    db,
    userId,
    projectId,
    sectionId,
    fingerprint.continuityGeneration,
  );
  const requiresClarification = intent.operation === "unstick" || concern;
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId,
    sectionRevision: fingerprint.sectionRevision,
    stage: "preflight",
    kind: requiresClarification
      ? intent.operation === "unstick"
        ? "writer_requested_unstick"
        : "hard_conflict_blocked"
      : "preflight_clear",
    summary: requiresClarification
      ? intent.operation === "unstick"
        ? "Paused for writer-directed Unstick me paths."
        : "Paused before prose generation for a critical Continuity conflict."
      : "Continuity preflight found no blocking conflict.",
    detail: {
      outcome: requiresClarification ? "blocked" : "clear",
      concernIds: concern ? [concern.id] : [],
      explicitRationale: requiresClarification
        ? "Only a critical open concern or writer-invoked Unstick me may interrupt."
        : "No critical open concern matched the focused section.",
    },
    sourceIds: [],
    operationId,
    continuityGeneration: fingerprint.continuityGeneration,
    createdAt: now,
  });
  let clarification: SlateClarificationRequest | null = null;
  if (requiresClarification) {
    clarification = insertClarification(db, {
      userId,
      projectId,
      sectionId,
      operationId,
      trigger:
        intent.operation === "unstick"
          ? "unstick_me"
          : "hard_continuity_conflict",
      revisionFingerprint: fingerprint,
      concern,
      createdAt: now,
    });
    db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'awaiting_clarification', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, operationId, userId);
    recordSlateDeveloperEvent(db, {
      userId,
      projectId,
      sectionId,
      sectionRevision: fingerprint.sectionRevision,
      stage: "clarification",
      kind: "clarification_created",
      summary:
        "Created exactly three grounded choices plus a custom vibe option.",
      detail: {
        requestId: clarification.id,
        trigger: clarification.trigger,
        status: clarification.status,
        selectedChoiceId: null,
        customVibeUsed: false,
        stale: false,
        resumeOperationId: null,
      },
      operationId,
      clarificationId: clarification.id,
      continuityGeneration: fingerprint.continuityGeneration,
      createdAt: now,
    });
  } else {
    db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'generating', started_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, now, operationId, userId);
    recordSlateDeveloperEvent(db, {
      userId,
      projectId,
      sectionId,
      sectionRevision: fingerprint.sectionRevision,
      stage: "brief",
      kind: "continuity_brief_bound",
      summary:
        "Bound the active Continuity generation and validated manuscript snapshot.",
      detail: {
        sourceFingerprint: fingerprint.value,
        sourceIds: [],
        tokenEstimate: 0,
        renderedBrief: null,
        continuitySummary:
          "The composer will use the server-compiled focused Continuity brief.",
      },
      operationId,
      continuityGeneration: fingerprint.continuityGeneration,
      createdAt: now,
    });
  }
  return {
    operation: operationFromRow(
      db,
      operationRow(db, userId, projectId, operationId),
    ),
    clarification,
  };
}

/**
 * Pauses a compiled operation when the bounded semantic preflight discovers a
 * material conflict that was not already represented in the active ledger.
 * The direction remains a plan; this creates a clarification, not manuscript
 * evidence or silently promoted canon.
 */
export function pauseSlateWritingOperationForContinuityConflict(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  conflict: SlateGroundedContinuityConflict,
): SlateWritingOperationView {
  const row = operationRow(db, userId, projectId, operationId);
  const existing = clarificationForOperation(db, userId, operationId);
  if (row.status === "awaiting_clarification" && existing) {
    return {
      operation: operationFromRow(db, row),
      clarification: existing,
    };
  }
  if (row.status !== "generating") {
    throw new SlateWritingOperationError(
      "Only a validated generating operation can pause for Continuity.",
      409,
      "slate_writing_preflight_state",
    );
  }
  const currentFingerprint = getSlateWritingRevisionFingerprint(
    db,
    userId,
    projectId,
    row.section_id!,
  );
  if (currentFingerprint.value !== row.revision_fingerprint) {
    throw new SlateWritingOperationError(
      "The manuscript changed while Continuity checked this direction.",
      409,
      "slate_writing_fingerprint_stale",
      { currentRevisionFingerprint: currentFingerprint },
    );
  }
  const now = new Date().toISOString();
  const clarification = insertClarification(db, {
    userId,
    projectId,
    sectionId: row.section_id!,
    operationId,
    trigger: "hard_continuity_conflict",
    revisionFingerprint: currentFingerprint,
    concern: {
      id: conflict.id,
      summary: conflict.summary.slice(0, 240),
      explanation: conflict.explanation.slice(0, 800),
      anchors_json: JSON.stringify(conflict.anchors.slice(0, 16)),
      kind: "direction_conflict",
    },
    createdAt: now,
  });
  const update = db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'awaiting_clarification', started_at = NULL,
            updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'generating'`,
  ).run(now, operationId, userId);
  if (update.changes !== 1) {
    throw new SlateWritingOperationError(
      "Slate changed before Continuity could present its question.",
      409,
      "slate_writing_preflight_race",
    );
  }
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    sectionRevision: currentFingerprint.sectionRevision,
    stage: "preflight",
    kind: "semantic_direction_conflict_blocked",
    summary:
      "Paused before composition because the direction materially conflicts with accepted prose.",
    detail: {
      outcome: "blocked",
      concernIds: [conflict.id],
      explicitRationale: conflict.explanation,
      evidenceCount: conflict.anchors.length,
    },
    operationId,
    continuityGeneration: currentFingerprint.continuityGeneration,
    createdAt: now,
  });
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    sectionRevision: currentFingerprint.sectionRevision,
    stage: "clarification",
    kind: "clarification_created",
    summary:
      "Created exactly three grounded choices plus a custom vibe option.",
    detail: {
      requestId: clarification.id,
      trigger: clarification.trigger,
      status: clarification.status,
      selectedChoiceId: null,
      customVibeUsed: false,
      stale: false,
      resumeOperationId: null,
    },
    operationId,
    clarificationId: clarification.id,
    continuityGeneration: currentFingerprint.continuityGeneration,
    createdAt: now,
  });
  return getSlateWritingOperation(
    db,
    userId,
    projectId,
    operationId,
  );
}

function applyIntentPatch(
  intent: SlateDirectionIntent,
  patch: SlateDirectionIntentPatch,
): SlateDirectionIntent {
  return {
    ...intent,
    ...(typeof patch.direction === "string" && patch.direction.trim()
      ? {
          direction: [intent.direction, patch.direction.trim()]
            .filter(Boolean)
            .join("\n\n"),
        }
      : {}),
    ...(patch.scope ? { scope: patch.scope, scopeSource: "explicit" as const } : {}),
    ...(typeof patch.wordTarget === "number"
      ? {
          wordTarget: Math.max(25, Math.min(50_000, Math.round(patch.wordTarget))),
          wordTargetSource: "explicit" as const,
        }
      : {}),
    ...(patch.pov !== undefined ? { pov: patch.pov } : {}),
    ...(patch.tense !== undefined ? { tense: patch.tense } : {}),
    ...(patch.pacing !== undefined ? { pacing: patch.pacing } : {}),
    ...(patch.sceneObjective !== undefined
      ? { sceneObjective: patch.sceneObjective }
      : {}),
    constraints: [...intent.constraints, ...(patch.constraints ?? [])],
    mustInclude: [...intent.mustInclude, ...(patch.mustInclude ?? [])],
    mustAvoid: [...intent.mustAvoid, ...(patch.mustAvoid ?? [])],
  };
}

export function answerSlateClarification(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  clarificationId: string,
  request: SlateClarificationAnswerRequest,
  compiledVibePatch?: SlateDirectionIntentPatch,
): SlateWritingOperationView {
  const idempotencyKey = text(
    request.idempotencyKey,
    "Clarification answer idempotency key",
    IDEMPOTENCY_MAX,
  );
  const row = db
    .prepare(
      `SELECT * FROM slate_clarification_requests
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(clarificationId, projectId, userId) as ClarificationRow | undefined;
  if (!row) {
    throw new SlateWritingOperationError(
      "Slate clarification not found.",
      404,
      "slate_clarification_not_found",
    );
  }
  if (row.status === "answered" && row.answer_idempotency_key === idempotencyKey) {
    return getSlateWritingOperation(db, userId, projectId, row.operation_id);
  }
  if (row.status !== "pending") {
    throw new SlateWritingOperationError(
      "This Slate clarification has already been resolved.",
      409,
      "slate_clarification_resolved",
    );
  }
  const operation = operationRow(db, userId, projectId, row.operation_id);
  if (!operation.section_id) {
    throw new SlateWritingOperationError("Slate operation lost its section.");
  }
  const current = getSlateWritingRevisionFingerprint(
    db,
    userId,
    projectId,
    operation.section_id,
  );
  const fresh =
    request.revisionFingerprint === row.revision_fingerprint &&
    request.revisionFingerprint === current.value &&
    Number(request.continuityGeneration) ===
      Number(row.continuity_generation) &&
    Number(request.continuityGeneration) === current.continuityGeneration &&
    request.mirrorProfileVersionId === row.mirror_profile_version_id &&
    request.mirrorProfileVersionId === current.mirrorProfileVersionId;
  const now = new Date().toISOString();
  if (!fresh) {
    db.prepare(
      `UPDATE slate_clarification_requests
          SET status = 'stale', stale_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending'`,
    ).run(now, clarificationId, userId);
    db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'stale', error = ?, updated_at = ?, resolved_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      "The manuscript, locks, Mirror binding, or Continuity generation changed.",
      now,
      now,
      operation.id,
      userId,
    );
    recordSlateDeveloperEvent(db, {
      userId,
      projectId,
      sectionId: operation.section_id,
      sectionRevision: current.sectionRevision,
      stage: "clarification",
      kind: "clarification_stale",
      summary:
        "Rejected a clarification answer against an obsolete validated snapshot.",
      detail: {
        requestId: clarificationId,
        trigger:
          row.kind === "unstick_me"
            ? "unstick_me"
            : "hard_continuity_conflict",
        status: "stale",
        selectedChoiceId: null,
        customVibeUsed: false,
        stale: true,
        resumeOperationId: null,
      },
      operationId: operation.id,
      clarificationId,
      continuityGeneration: current.continuityGeneration,
      createdAt: now,
    });
    throw new SlateWritingOperationError(
      "The section changed while this question was open. Slate left the answer unapplied.",
      409,
      "slate_clarification_stale",
      { currentRevisionFingerprint: current },
    );
  }
  const choices = parseJson<SlateClarificationChoice[]>(row.choices_json, []);
  let patch: SlateDirectionIntentPatch;
  let answerKind: "choice" | "custom_vibe";
  let answerChoiceId: string | null = null;
  let customVibe: string | null = null;
  if (request.answer.kind === "choice") {
    const requestedChoiceId = request.answer.choiceId;
    const choice = choices.find(
      (candidate) => candidate.id === requestedChoiceId,
    );
    if (!choice) {
      throw new SlateWritingOperationError(
        "Choose one of the three current Slate directions.",
        400,
        "slate_clarification_choice_invalid",
      );
    }
    answerKind = "choice";
    answerChoiceId = choice.id;
    patch = choice.resolution.intentPatch;
  } else {
    answerKind = "custom_vibe";
    customVibe = text(
      request.answer.vibe,
      "Custom vibe",
      VIBE_MAX,
    );
    patch = compiledVibePatch ?? {
      direction: `Shape the continuation around this requested vibe: ${customVibe}`,
    };
  }
  const intent = parseJson<SlateDirectionIntent>(
    operation.direction_intent_json,
    null as unknown as SlateDirectionIntent,
  );
  const nextIntent = applyIntentPatch(intent, patch);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const clarificationUpdate = db.prepare(
      `UPDATE slate_clarification_requests
          SET status = 'answered', answer_kind = ?, answer_choice_id = ?,
              custom_vibe = ?, structured_direction_json = ?,
              answer_idempotency_key = ?, resume_operation_id = ?,
              answered_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending'`,
    ).run(
      answerKind,
      answerChoiceId,
      customVibe,
      JSON.stringify(patch),
      idempotencyKey,
      operation.id,
      now,
      clarificationId,
      userId,
    );
    if (clarificationUpdate.changes !== 1) {
      throw new SlateWritingOperationError(
        "This Slate clarification was answered elsewhere.",
        409,
        "slate_clarification_race",
      );
    }
    db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'generating', direction_intent_json = ?,
              started_at = COALESCE(started_at, ?), updated_at = ?, error = NULL
        WHERE id = ? AND user_id = ? AND status = 'awaiting_clarification'`,
    ).run(JSON.stringify(nextIntent), now, now, operation.id, userId);
    recordSlateDeveloperEvent(db, {
      userId,
      projectId,
      sectionId: operation.section_id,
      sectionRevision: current.sectionRevision,
      stage: "clarification",
      kind: "clarification_answered",
      summary:
        answerKind === "choice"
          ? "Applied the writer's fixed direction and resumed exactly once."
          : "Compiled the writer's custom vibe into structured direction and resumed exactly once.",
      detail: {
        requestId: clarificationId,
        trigger:
          row.kind === "unstick_me"
            ? "unstick_me"
            : "hard_continuity_conflict",
        status: "answered",
        selectedChoiceId: answerChoiceId,
        customVibeUsed: answerKind === "custom_vibe",
        stale: false,
        resumeOperationId: operation.id,
      },
      operationId: operation.id,
      clarificationId,
      continuityGeneration: current.continuityGeneration,
      createdAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateWritingOperation(db, userId, projectId, operation.id);
}

export function setSlateWritingOperationProposal(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  input: {
    prose: string;
    provider: "local" | "openai" | "anthropic";
    model: string;
    revisionId?: string | null;
    validatedSnapshotPatch?: Record<string, unknown>;
  },
): SlateWritingOperationView {
  const row = operationRow(db, userId, projectId, operationId);
  if (row.status === "proposed") {
    return getSlateWritingOperation(db, userId, projectId, operationId);
  }
  if (row.status !== "generating") {
    throw new SlateWritingOperationError(
      "Slate operation is not generating.",
      409,
      "slate_writing_transition_invalid",
    );
  }
  const now = new Date().toISOString();
  const proposalHash = slateSha256(input.prose);
  const snapshot = {
    ...parseJson<Record<string, unknown>>(row.validated_snapshot_json, {}),
    ...(input.validatedSnapshotPatch ?? {}),
  };
  const update = db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'proposed', provider = ?, model = ?, proposal_text = ?,
            proposal_hash = ?, revision_id = ?, validated_snapshot_json = ?,
            completed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ? AND status = 'generating'`,
  ).run(
    input.provider,
    input.model,
    input.prose,
    proposalHash,
    input.revisionId ?? null,
    JSON.stringify(snapshot),
    now,
    now,
    operationId,
    userId,
    projectId,
  );
  if (update.changes !== 1) {
    throw new SlateWritingOperationError(
      "Slate operation changed before its proposal could be preserved.",
      409,
      "slate_writing_transition_race",
    );
  }
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    stage: "generation",
    kind: "generation_completed",
    summary: "Composer output was preserved as an unapplied proposal.",
    detail: {
      transition: "completed",
      requestHash: row.revision_fingerprint,
      outputHash: proposalHash,
      receiptId: null,
      durationMs: null,
      failureCode: null,
    },
    operationId,
    provider: input.provider,
    model: input.model,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: now,
  });
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    stage: "proposal",
    kind: "proposal_created",
    summary: "AI prose remains outside manuscript evidence until accepted.",
    detail: {
      proposalId: `proposal-${operationId}`,
      proposalHash,
      proposalText: null,
    },
    operationId,
    provider: input.provider,
    model: input.model,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: now,
  });
  return getSlateWritingOperation(db, userId, projectId, operationId);
}

function mutationResult(
  db: DatabaseSync,
  userId: string,
  operationId: string,
  action: string,
  idempotencyKey: string,
): string | null {
  const row = db
    .prepare(
      `SELECT result_operation_id
         FROM slate_writing_operation_mutations
        WHERE user_id = ? AND operation_id = ? AND action = ?
          AND idempotency_key = ?`,
    )
    .get(userId, operationId, action, idempotencyKey) as
    | { result_operation_id: string }
    | undefined;
  return row?.result_operation_id ?? null;
}

function recordMutation(
  db: DatabaseSync,
  row: OperationRow,
  action: string,
  idempotencyKey: string,
  resultOperationId: string,
  now: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO slate_writing_operation_mutations
      (id, user_id, project_id, operation_id, action, idempotency_key,
       result_operation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomId(),
    row.user_id,
    row.project_id,
    row.id,
    action,
    idempotencyKey,
    resultOperationId,
    now,
  );
}

function mutationRequest(
  input: Record<string, unknown>,
  label: string,
): { idempotencyKey: string; revisionFingerprint: string } {
  return {
    idempotencyKey: text(
      input.idempotencyKey,
      `${label} idempotency key`,
      IDEMPOTENCY_MAX,
    ),
    revisionFingerprint: text(
      input.revisionFingerprint,
      `${label} revision fingerprint`,
      256,
    ),
  };
}

function assertOperationFingerprint(
  row: OperationRow,
  requestedFingerprint: string,
): void {
  if (row.revision_fingerprint !== requestedFingerprint) {
    throw new SlateWritingOperationError(
      "This action targets a different Slate writing snapshot.",
      409,
      "slate_writing_fingerprint_mismatch",
      { expectedRevisionFingerprint: row.revision_fingerprint },
    );
  }
}

export function stopSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  input: Record<string, unknown>,
): SlateWritingOperationView {
  const { idempotencyKey, revisionFingerprint } = mutationRequest(
    input,
    "Stop",
  );
  const prior = mutationResult(
    db,
    userId,
    operationId,
    "stop",
    idempotencyKey,
  );
  if (prior) return getSlateWritingOperation(db, userId, projectId, prior);
  const row = operationRow(db, userId, projectId, operationId);
  assertOperationFingerprint(row, revisionFingerprint);
  if (
    row.status !== "generating" &&
    row.status !== "compiling" &&
    row.status !== "awaiting_clarification"
  ) {
    throw new SlateWritingOperationError(
      "Only an active Slate operation can be stopped.",
      409,
      "slate_writing_transition_invalid",
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'interrupted', completed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(now, now, operationId, userId);
  if (row.status === "awaiting_clarification") {
    db.prepare(
      `UPDATE slate_clarification_requests
          SET status = 'cancelled'
        WHERE operation_id = ? AND user_id = ? AND status = 'pending'`,
    ).run(operationId, userId);
  }
  recordMutation(db, row, "stop", idempotencyKey, operationId, now);
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    stage: "generation",
    kind: "generation_interrupted",
    summary: "Stopped the active provider operation without applying prose.",
    detail: {
      transition: "stopped",
      requestHash: row.revision_fingerprint,
      outputHash: null,
      receiptId: null,
      durationMs: null,
      failureCode: null,
    },
    operationId,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: now,
  });
  return getSlateWritingOperation(db, userId, projectId, operationId);
}

function forkOperation(
  db: DatabaseSync,
  row: OperationRow,
  action: "continue" | "redirect",
  idempotencyKey: string,
  direction?: string,
): SlateWritingOperationView {
  if (!row.section_id) {
    throw new SlateWritingOperationError("Slate operation lost its section.");
  }
  const current = getSlateWritingRevisionFingerprint(
    db,
    row.user_id,
    row.project_id,
    row.section_id,
  );
  const intent = parseJson<SlateDirectionIntent>(
    row.direction_intent_json,
    null as unknown as SlateDirectionIntent,
  );
  const nextIntent: SlateDirectionIntent = {
    ...intent,
    operation: action,
    ...(direction
      ? {
          direction:
            action === "redirect"
              ? direction
              : [intent.direction, direction].filter(Boolean).join("\n\n"),
        }
      : {}),
  };
  const id = randomId();
  const now = new Date().toISOString();
  const section = sectionSnapshot(
    db,
    row.user_id,
    row.project_id,
    row.section_id,
  );
  assertImportedManuscriptScope(section, nextIntent);
  const project = projectSnapshot(db, row.user_id, row.project_id);
  db.prepare(
    `INSERT INTO slate_writing_operations
      (id, user_id, project_id, section_id, parent_operation_id, kind, status,
       direction_intent_json, validated_snapshot_json, revision_fingerprint,
       continuity_generation, mirror_profile_version_id, idempotency_key,
       created_at, updated_at, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'generating', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.user_id,
    row.project_id,
    row.section_id,
    row.id,
    action,
    JSON.stringify(nextIntent),
    JSON.stringify({
      fingerprint: current,
      structureItemId: section.structure_item_id,
      expectedStructureJson: project.structure_json,
      sectionContentHash: section.content_hash,
      endpointProposalHash: row.proposal_hash,
    }),
    current.value,
    current.continuityGeneration,
    current.mirrorProfileVersionId,
    idempotencyKey,
    now,
    now,
    now,
  );
  recordMutation(db, row, action, idempotencyKey, id, now);
  recordSlateDeveloperEvent(db, {
    userId: row.user_id,
    projectId: row.project_id,
    sectionId: row.section_id,
    sectionRevision: current.sectionRevision,
    stage: "generation",
    kind:
      action === "continue" ? "generation_continued" : "generation_redirected",
    summary:
      action === "continue"
        ? "Started a continuation from the latest preserved endpoint."
        : "Cancelled the prior direction and restarted from a fresh validated snapshot.",
    detail: {
      transition: action === "continue" ? "continued" : "redirected",
      requestHash: current.value,
      outputHash: null,
      receiptId: null,
      durationMs: null,
      failureCode: null,
    },
    operationId: id,
    continuityGeneration: current.continuityGeneration,
    createdAt: now,
  });
  return getSlateWritingOperation(db, row.user_id, row.project_id, id);
}

export function continueSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  input: Record<string, unknown>,
): SlateWritingOperationView {
  const { idempotencyKey, revisionFingerprint } = mutationRequest(
    input,
    "Continue",
  );
  const prior = mutationResult(
    db,
    userId,
    operationId,
    "continue",
    idempotencyKey,
  );
  if (prior) return getSlateWritingOperation(db, userId, projectId, prior);
  const row = operationRow(db, userId, projectId, operationId);
  assertOperationFingerprint(row, revisionFingerprint);
  if (
    row.status !== "interrupted" &&
    row.status !== "proposed" &&
    row.status !== "applied"
  ) {
    throw new SlateWritingOperationError(
      "Continue is available after an interruption or preserved endpoint.",
      409,
      "slate_writing_transition_invalid",
    );
  }
  return forkOperation(
    db,
    row,
    "continue",
    idempotencyKey,
    typeof input.direction === "string" ? input.direction.trim() : undefined,
  );
}

export function redirectSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  input: Record<string, unknown>,
): SlateWritingOperationView {
  const { idempotencyKey, revisionFingerprint } = mutationRequest(
    input,
    "Redirect",
  );
  const direction = text(
    input.direction,
    "Redirect direction",
    DIRECTION_MAX,
  );
  const prior = mutationResult(
    db,
    userId,
    operationId,
    "redirect",
    idempotencyKey,
  );
  if (prior) return getSlateWritingOperation(db, userId, projectId, prior);
  const row = operationRow(db, userId, projectId, operationId);
  assertOperationFingerprint(row, revisionFingerprint);
  if (
    row.status !== "generating" &&
    row.status !== "interrupted" &&
    row.status !== "proposed"
  ) {
    throw new SlateWritingOperationError(
      "Redirect is unavailable after this operation was resolved.",
      409,
      "slate_writing_transition_invalid",
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'cancelled', resolved_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(now, now, row.id, userId);
  return forkOperation(db, row, "redirect", idempotencyKey, direction);
}

export function resolveSlateWritingOperationProposal(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  outcome: "applied" | "rejected",
  input: Record<string, unknown>,
): SlateWritingOperationView {
  if (outcome === "applied") {
    throw new SlateWritingOperationError(
      "Apply the proposal through the atomic manuscript acceptance service.",
      500,
      "slate_writing_atomic_apply_required",
    );
  }
  const { idempotencyKey, revisionFingerprint } = mutationRequest(
    input,
    "Proposal resolution",
  );
  const prior = mutationResult(
    db,
    userId,
    operationId,
    outcome,
    idempotencyKey,
  );
  if (prior) return getSlateWritingOperation(db, userId, projectId, prior);
  const row = operationRow(db, userId, projectId, operationId);
  assertOperationFingerprint(row, revisionFingerprint);
  if (row.status !== "proposed") {
    throw new SlateWritingOperationError(
      "This Slate proposal has already been resolved.",
      409,
      "slate_writing_proposal_resolved",
    );
  }
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE slate_writing_operations
        SET status = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ? AND status = 'proposed'`,
  ).run(outcome, now, now, operationId, userId, projectId);
  if (update.changes !== 1) {
    throw new SlateWritingOperationError(
      "This Slate proposal was resolved elsewhere.",
      409,
      "slate_writing_transition_race",
    );
  }
  recordMutation(db, row, outcome, idempotencyKey, operationId, now);
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    stage: "acceptance",
    kind: "proposal_rejected",
    summary:
      "The writer rejected the proposal; it remains outside manuscript evidence.",
    detail: {
      outcome: "rejected",
      proposalId: row.proposal_hash ? `proposal-${operationId}` : null,
      acceptedProseHash:
        row.section_id
          ? (
              db
                .prepare(
                  `SELECT content_hash FROM slate_sections
                    WHERE id = ? AND project_id = ? AND user_id = ?`,
                )
                .get(row.section_id, projectId, userId) as
                | { content_hash: string }
                | undefined
            )?.content_hash ?? ""
          : "",
      continuitySourceId: null,
    },
    operationId,
    provider: row.provider,
    model: row.model,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: now,
  });
  return getSlateWritingOperation(db, userId, projectId, operationId);
}

export interface SlateWritingOperationApplication {
  operationId: string;
  sectionId: string;
  prose: string;
  provider: "local" | "openai" | "anthropic";
  model: string;
  revisionId: string | null;
  validatedSnapshot: Record<string, unknown>;
}

/**
 * Applies manuscript prose and resolves the operation in one SQLite
 * transaction. The callback must participate in the caller-owned transaction
 * and must not commit independently.
 */
export function applySlateWritingOperationProposal(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  input: Record<string, unknown>,
  apply: (application: SlateWritingOperationApplication) => {
    continuitySourceId?: string | null;
  },
): SlateWritingOperationView {
  const { idempotencyKey, revisionFingerprint } = mutationRequest(
    input,
    "Proposal acceptance",
  );
  const prior = mutationResult(
    db,
    userId,
    operationId,
    "applied",
    idempotencyKey,
  );
  if (prior) return getSlateWritingOperation(db, userId, projectId, prior);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const row = operationRow(db, userId, projectId, operationId);
    assertOperationFingerprint(row, revisionFingerprint);
    if (
      row.status !== "proposed" ||
      !row.section_id ||
      row.proposal_text === null ||
      !row.proposal_hash ||
      !row.model ||
      (row.provider !== "local" &&
        row.provider !== "openai" &&
        row.provider !== "anthropic")
    ) {
      throw new SlateWritingOperationError(
        "This Slate proposal is not available to apply.",
        409,
        "slate_writing_proposal_resolved",
      );
    }
    const intent = parseJson<SlateDirectionIntent>(
      row.direction_intent_json,
      null as unknown as SlateDirectionIntent,
    );
    assertImportedManuscriptScope(
      sectionSnapshot(db, userId, projectId, row.section_id),
      intent,
    );
    const current = getSlateWritingRevisionFingerprint(
      db,
      userId,
      projectId,
      row.section_id,
    );
    if (current.value !== row.revision_fingerprint) {
      throw new SlateWritingOperationError(
        "The manuscript, locks, Mirror binding, or Continuity generation changed. Slate left the proposal unapplied.",
        409,
        "slate_writing_proposal_stale",
        { currentRevisionFingerprint: current },
      );
    }
    const applicationResult = apply({
      operationId,
      sectionId: row.section_id,
      prose: row.proposal_text,
      provider: row.provider,
      model: row.model,
      revisionId: row.revision_id,
      validatedSnapshot: parseJson<Record<string, unknown>>(
        row.validated_snapshot_json,
        {},
      ),
    });
    const savedSection = db
      .prepare(
        `SELECT revision, content_hash FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(row.section_id, projectId, userId) as
      | { revision: number; content_hash: string }
      | undefined;
    if (!savedSection) {
      throw new SlateWritingOperationError(
        "Slate could not verify the accepted section.",
        500,
        "slate_writing_apply_missing_section",
      );
    }
    const continuitySourceId =
      applicationResult.continuitySourceId ??
      (
        db
          .prepare(
            `SELECT id FROM slate_continuity_sources
              WHERE user_id = ? AND project_id = ? AND section_id = ?
                AND source_revision = ?
              ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .get(
            userId,
            projectId,
            row.section_id,
            Number(savedSection.revision),
          ) as { id: string } | undefined
      )?.id ??
      null;
    const now = new Date().toISOString();
    const update = db.prepare(
      `UPDATE slate_writing_operations
          SET status = 'applied', resolved_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ? AND status = 'proposed'`,
    ).run(now, now, operationId, userId, projectId);
    if (update.changes !== 1) {
      throw new SlateWritingOperationError(
        "This Slate proposal was resolved elsewhere.",
        409,
        "slate_writing_transition_race",
      );
    }
    recordMutation(db, row, "applied", idempotencyKey, operationId, now);
    recordSlateDeveloperEvent(db, {
      userId,
      projectId,
      sectionId: row.section_id,
      sectionRevision: Number(savedSection.revision),
      stage: "acceptance",
      kind: "proposal_accepted",
      summary:
        "The writer accepted the proposal into the authoritative manuscript.",
      detail: {
        outcome: "accepted",
        proposalId: `proposal-${operationId}`,
        acceptedProseHash: savedSection.content_hash,
        continuitySourceId,
      },
      sourceIds: continuitySourceId ? [continuitySourceId] : [],
      operationId,
      provider: row.provider,
      model: row.model,
      continuityGeneration: Number(row.continuity_generation),
      createdAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateWritingOperation(db, userId, projectId, operationId);
}

export function failSlateWritingOperation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  operationId: string,
  error: unknown,
): SlateWritingOperationView {
  const row = operationRow(db, userId, projectId, operationId);
  const message =
    error instanceof Error
      ? error.message.slice(0, 2_000)
      : "Slate generation failed.";
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'failed', error = ?, completed_at = ?, resolved_at = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'generating'`,
  ).run(message, now, now, now, operationId, userId);
  recordSlateDeveloperEvent(db, {
    userId,
    projectId,
    sectionId: row.section_id,
    stage: "generation",
    kind: "generation_failed",
    summary: "The composer failed without applying manuscript prose.",
    detail: {
      transition: "failed",
      requestHash: row.revision_fingerprint,
      outputHash: null,
      receiptId: null,
      durationMs: null,
      failureCode: "generation_failed",
    },
    operationId,
    provider: row.provider,
    model: row.model,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: now,
  });
  return getSlateWritingOperation(db, userId, projectId, operationId);
}

/** Restart safety: never guess whether an unfinished provider response applied. */
export function interruptUnfinishedSlateWritingOperations(
  db: DatabaseSync,
): number {
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE slate_writing_operations
        SET status = 'interrupted',
            error = 'Server restarted before generation completed.',
            completed_at = ?, updated_at = ?
      WHERE status IN ('compiling', 'generating')`,
  ).run(now, now);
  return Number(result.changes);
}
