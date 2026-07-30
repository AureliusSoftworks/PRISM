import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
  SLATE_DEVELOPER_EVENT_DISCLOSURE,
  SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION,
  SLATE_REVIEW_EXPORT_FORMAT,
  isSlateReviewExportV1,
  slateSha256,
  type SlateClarificationAnswer,
  type SlateClarificationChoice,
  type SlateClarificationChoices,
  type SlateClarificationEvidence,
  type SlateClarificationRequest,
  type SlateDeveloperEvent,
  type SlateDeveloperEventStage,
  type SlateDirectionIntent,
  type SlateDocumentAnchor,
  type SlateMirrorVoiceCard,
  type SlateMomentumSnapshot,
  type SlateReviewConcernProjectionV1,
  type SlateReviewExportV1,
  type SlateReviewOperationV1,
  type SlateReviewSourceV1,
  type SlateReviewStoryBibleV1,
  type SlateWritingOperationStatus,
} from "@localai/shared";
import { randomId } from "./security.ts";
import { ensureSlateSectionDocument } from "./slate-section-documents.ts";
import { projectActiveSlateStoryBible } from "./slate-story-bible-projection.ts";

export { SLATE_REVIEW_EXPORT_FORMAT } from "@localai/shared";
export type {
  SlateDeveloperEvent,
  SlateDeveloperEventStage,
  SlateReviewExportV1,
} from "@localai/shared";

export interface SlateDeveloperEventInput {
  userId: string;
  projectId: string;
  sectionId?: string | null;
  sectionRevision?: number | null;
  stage: SlateDeveloperEventStage;
  kind: string;
  summary: string;
  detail?: unknown;
  sourceIds?: readonly string[];
  operationId?: string | null;
  clarificationId?: string | null;
  provider?: string | null;
  model?: string | null;
  continuityGeneration?: number;
  createdAt?: string;
}

const FORBIDDEN_DETAIL_KEY =
  /(?:authorization|cookie|password|passphrase|api.?key|access.?token|refresh.?token|secret|credential|chain.?of.?thought|hidden.?reasoning|private.?reasoning|internal.?reasoning|raw.?headers?)/iu;
const MAX_DETAIL_DEPTH = 12;
const MAX_DETAIL_ITEMS = 256;
const MAX_DETAIL_STRING = 32_000;

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const normalized = value.normalize("NFKC").trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} is too long.`);
  return normalized;
}

function safeDetailValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DETAIL_DEPTH) return "[depth omitted]";
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "string") return value.slice(0, MAX_DETAIL_STRING);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DETAIL_ITEMS)
      .map((item) => safeDetailValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") return String(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_DETAIL_ITEMS)) {
    output[key] = FORBIDDEN_DETAIL_KEY.test(key)
      ? "[redacted]"
      : safeDetailValue(item, depth + 1);
  }
  return output;
}

export function sanitizeSlateDeveloperEventDetail(
  value: unknown,
): Record<string, unknown> {
  const sanitized = safeDetailValue(value ?? {});
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : { value: sanitized };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface ProjectRow {
  id: string;
  series_id: string;
  title: string;
  prose_mode: string;
  continuity_active_version: string;
  continuity_active_generation: number;
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectRow {
  const row = db
    .prepare(
      `SELECT id, series_id, title, prose_mode, continuity_active_version,
              continuity_active_generation
         FROM slate_projects
        WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as unknown as ProjectRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

interface DeveloperEventRow {
  id: string;
  project_id: string;
  section_id: string;
  section_revision: number;
  sequence: number;
  stage: SlateDeveloperEventStage;
  kind: string;
  summary: string;
  detail_json: string;
  source_ids_json: string;
  operation_id: string | null;
  clarification_id: string | null;
  provider: string | null;
  model: string | null;
  continuity_generation: number;
  created_at: string;
}

function developerEventFromRow(row: DeveloperEventRow): SlateDeveloperEvent {
  return {
    schemaVersion: SLATE_DEVELOPER_TRANSCRIPT_SCHEMA_VERSION,
    disclosure: SLATE_DEVELOPER_EVENT_DISCLOSURE,
    id: row.id,
    sequence: Number(row.sequence),
    projectId: row.project_id,
    sectionId: row.section_id,
    sectionRevision: Number(row.section_revision),
    stage: row.stage,
    kind: row.kind,
    summary: row.summary,
    detail: parseJson(row.detail_json, {}),
    sourceIds: parseJson(row.source_ids_json, []),
    operationId: row.operation_id,
    clarificationId: row.clarification_id,
    provider: row.provider,
    model: row.model,
    continuityGeneration: Number(row.continuity_generation),
    createdAt: row.created_at,
  } as unknown as SlateDeveloperEvent;
}

/**
 * Appends a section-scoped operational provenance record. It deliberately
 * rejects project-wide or revision-less events so focused review exports cannot
 * accidentally mingle unrelated manuscript history.
 */
export function recordSlateDeveloperEvent(
  db: DatabaseSync,
  input: SlateDeveloperEventInput,
): SlateDeveloperEvent {
  const project = projectRow(db, input.userId, input.projectId);
  if (!input.sectionId) {
    throw new Error("Slate developer events require a focused section.");
  }
  const section = db
    .prepare(
      `SELECT revision FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(input.sectionId, input.projectId, input.userId) as
    | { revision: number }
    | undefined;
  if (!section) throw new Error("Slate section not found.");
  const sectionRevision =
    input.sectionRevision === null || input.sectionRevision === undefined
      ? Number(section.revision)
      : Number(input.sectionRevision);
  if (!Number.isInteger(sectionRevision) || sectionRevision < 0) {
    throw new Error("Slate developer event section revision is invalid.");
  }
  const kind = boundedText(input.kind, "Slate developer event kind", 160);
  const summary = boundedText(
    input.summary,
    "Slate developer event summary",
    2_000,
  );
  const sourceIds = Array.from(
    new Set(
      (input.sourceIds ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 128),
    ),
  );
  const detail = sanitizeSlateDeveloperEventDetail(input.detail);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const id = randomId();
  const generation = Number.isInteger(input.continuityGeneration)
    ? Math.max(0, Number(input.continuityGeneration))
    : Number(project.continuity_active_generation ?? 0);
  db.prepare(
    `INSERT INTO slate_continuity_developer_events
      (id, user_id, series_id, project_id, section_id, section_revision,
       sequence, stage, kind, summary, detail_json, source_ids_json,
       operation_id, clarification_id, provider, model,
       continuity_generation, created_at)
     SELECT ?, ?, ?, ?, ?, ?,
            COALESCE(MAX(sequence), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM slate_continuity_developer_events
      WHERE user_id = ? AND project_id = ?`,
  ).run(
    id,
    input.userId,
    project.series_id,
    input.projectId,
    input.sectionId,
    sectionRevision,
    input.stage,
    kind,
    summary,
    JSON.stringify(detail),
    JSON.stringify(sourceIds),
    input.operationId ?? null,
    input.clarificationId ?? null,
    input.provider ?? null,
    input.model ?? null,
    generation,
    createdAt,
    input.userId,
    input.projectId,
  );
  const row = db
    .prepare(
      `SELECT id, project_id, section_id, section_revision, sequence, stage,
              kind, summary, detail_json, source_ids_json, operation_id,
              clarification_id, provider, model, continuity_generation,
              created_at
         FROM slate_continuity_developer_events
        WHERE id = ? AND user_id = ?`,
    )
    .get(id, input.userId) as unknown as DeveloperEventRow;
  return developerEventFromRow(row);
}

function listDeveloperEvents(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  sectionRevision: number,
): SlateDeveloperEvent[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, section_id, section_revision, sequence, stage,
              kind, summary, detail_json, source_ids_json, operation_id,
              clarification_id, provider, model, continuity_generation,
              created_at
         FROM slate_continuity_developer_events
        WHERE user_id = ? AND project_id = ? AND section_id = ?
          AND section_revision <= ?
        ORDER BY sequence ASC`,
    )
    .all(
      userId,
      projectId,
      sectionId,
      sectionRevision,
    ) as unknown as DeveloperEventRow[];
  return rows.map(developerEventFromRow);
}

interface OperationExportRow {
  id: string;
  status: string;
  direction_intent_json: string;
  revision_fingerprint: string;
  provider: string | null;
  model: string | null;
  proposal_text: string | null;
  proposal_hash: string | null;
  created_at: string;
  completed_at: string | null;
  resolved_at: string | null;
}

function operationRecords(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateReviewOperationV1[] {
  const rows = db
    .prepare(
      `SELECT id, status, direction_intent_json, revision_fingerprint,
              provider, model, proposal_text, proposal_hash, created_at,
              completed_at, resolved_at
         FROM slate_writing_operations
        WHERE user_id = ? AND project_id = ? AND section_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(userId, projectId, sectionId) as unknown as OperationExportRow[];
  return rows.map((row) => {
    const intent = parseJson<SlateDirectionIntent>(
      row.direction_intent_json,
      {} as SlateDirectionIntent,
    );
    const status = row.status as SlateWritingOperationStatus;
    return {
      id: row.id,
      intent,
      scope: intent.scope,
      revisionFingerprint: row.revision_fingerprint,
      provider: row.provider,
      model: row.model,
      status,
      proposalHash: row.proposal_hash,
      proposalText: row.proposal_text,
      acceptanceOutcome:
        status === "applied"
          ? "accepted"
          : status === "rejected"
            ? "rejected"
            : null,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? row.resolved_at,
    };
  });
}

interface ClarificationExportRow {
  id: string;
  operation_id: string;
  kind: string;
  status: string;
  prompt: string;
  choices_json: string;
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
  operation_idempotency_key: string;
  created_at: string;
  answered_at: string | null;
  stale_at: string | null;
}

function clarificationRecords(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateClarificationRequest[] {
  const rows = db
    .prepare(
      `SELECT clarifications.*, operations.idempotency_key AS operation_idempotency_key
         FROM slate_clarification_requests clarifications
         JOIN slate_writing_operations operations
           ON operations.id = clarifications.operation_id
          AND operations.user_id = clarifications.user_id
        WHERE clarifications.user_id = ?
          AND clarifications.project_id = ?
          AND operations.section_id = ?
        ORDER BY clarifications.created_at ASC, clarifications.id ASC`,
    )
    .all(userId, projectId, sectionId) as unknown as ClarificationExportRow[];
  return rows.map((row) => {
    const choices = parseJson<SlateClarificationChoice[]>(
      row.choices_json,
      [],
    ) as unknown as SlateClarificationChoices;
    const sourceEvidence = parseJson<SlateClarificationEvidence[]>(
      row.evidence_json,
      [],
    );
    let answer: SlateClarificationAnswer | null = null;
    if (
      row.answer_kind === "choice" &&
      row.answer_choice_id &&
      row.answered_at
    ) {
      answer = {
        kind: "choice",
        choiceId: row.answer_choice_id,
        answeredAt: row.answered_at,
      };
    } else if (
      row.answer_kind === "custom_vibe" &&
      row.custom_vibe &&
      row.answered_at
    ) {
      answer = {
        kind: "custom_vibe",
        vibe: row.custom_vibe,
        compiledIntentPatch: parseJson(
          row.structured_direction_json,
          {},
        ),
        answeredAt: row.answered_at,
      };
    }
    return {
      schemaVersion: 1,
      id: row.id,
      operationId: row.operation_id,
      trigger:
        row.kind === "unstick_me"
          ? "unstick_me"
          : "hard_continuity_conflict",
      status:
        row.status === "answered" ||
        row.status === "stale" ||
        row.status === "cancelled"
          ? row.status
          : "pending",
      prompt: row.prompt,
      choices,
      customVibe: {
        id: "custom-vibe",
        label: SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
        placeholder: "Describe the feeling, pressure, or turn you want.",
      },
      sourceEvidence,
      revisionFingerprint: row.revision_fingerprint,
      continuityGeneration: Number(row.continuity_generation),
      mirrorProfileVersionId: row.mirror_profile_version_id,
      idempotencyKey:
        row.answer_idempotency_key ??
        `${row.operation_idempotency_key}:clarification`,
      answer,
      resumeOperationId: row.resume_operation_id,
      createdAt: row.created_at,
      answeredAt: row.answered_at,
      staleAt: row.stale_at,
    };
  });
}

function sourceRecords(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  generation: number,
): SlateReviewSourceV1[] {
  const rows = db
    .prepare(
      `SELECT id, kind, source_revision, content_hash, authority, provider,
              model, created_at
         FROM slate_continuity_sources
        WHERE user_id = ? AND project_id = ? AND section_id = ?
          AND generation = ?
        ORDER BY source_revision ASC, created_at ASC, id ASC`,
    )
    .all(userId, projectId, sectionId, generation) as Array<
    Record<string, string | number | null>
  >;
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    sourceRevision: Number(row.source_revision),
    contentHash: String(row.content_hash),
    authority:
      row.authority === "ai" || row.authority === "procedural"
        ? row.authority
        : "human",
    provider: typeof row.provider === "string" ? row.provider : null,
    model: typeof row.model === "string" ? row.model : null,
    anchors: [] as SlateDocumentAnchor[],
    createdAt: String(row.created_at),
  }));
}

function concernRecords(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  seriesId: string,
  sectionId: string,
  generation: number,
): SlateReviewConcernProjectionV1[] {
  const rows = db
    .prepare(
      `SELECT id, kind, severity, status, summary, anchors_json,
              resolution_json, resolved_at
         FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? AND series_id = ?
          AND generation = ? AND (section_id = ? OR section_id IS NULL)
        ORDER BY created_at ASC, id ASC`,
    )
    .all(
      userId,
      projectId,
      seriesId,
      generation,
      sectionId,
    ) as Array<Record<string, string>>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    severity:
      row.severity === "critical" || row.severity === "important"
        ? row.severity
        : "note",
    status: row.status,
    summary: row.summary,
    anchors: parseJson<SlateDocumentAnchor[]>(row.anchors_json, []),
    sourceIds: [],
    resolution: parseJson<Record<string, unknown> | null>(
      row.resolution_json,
      null,
    ),
    resolvedAt:
      typeof row.resolved_at === "string" ? row.resolved_at : null,
  }));
}

function storyBibleRecord(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  seriesId: string,
  sectionId: string,
  generation: number,
): SlateReviewStoryBibleV1 {
  // Normalized projection tables are intentionally not dumped raw. Each family
  // gets a typed curator before entering this public review contract.
  return {
    characters: [],
    arcs: [],
    threads: [],
    timeline: [],
    causalEdges: [],
    relationships: [],
    knowledge: [],
    world: [],
    concerns: concernRecords(
      db,
      userId,
      projectId,
      seriesId,
      sectionId,
      generation,
    ),
  };
}

function voiceCardOrNull(value: string | null): SlateMirrorVoiceCard | null {
  const parsed = parseJson<Partial<SlateMirrorVoiceCard> | null>(value, null);
  if (!parsed) return null;
  const listKeys: Array<keyof SlateMirrorVoiceCard> = [
    "diction",
    "rhythm",
    "imagery",
    "dialogueHabits",
    "exposition",
    "humor",
    "density",
    "preferences",
    "avoidances",
    "exemplars",
  ];
  if (
    typeof parsed.narrativeDistance !== "string" ||
    listKeys.some(
      (key) =>
        !Array.isArray(parsed[key]) ||
        !(parsed[key] as unknown[]).every((item) => typeof item === "string"),
    )
  ) {
    return null;
  }
  return parsed as SlateMirrorVoiceCard;
}

function momentumRecord(
  row: Record<string, unknown> | undefined,
  sectionId: string,
  sectionRevision: number,
  generation: number,
): SlateMomentumSnapshot | null {
  if (!row) return null;
  const state = parseJson<Record<string, unknown>>(
    typeof row.state_json === "string" ? row.state_json : null,
    {},
  );
  return {
    schemaVersion: 1,
    id: String(row.id),
    projectId: String(row.project_id),
    sectionId,
    sectionRevision,
    continuityGeneration: generation,
    sourceFingerprint: String(row.source_fingerprint),
    liveWire: (state.liveWire ?? null) as SlateMomentumSnapshot["liveWire"],
    litMatch: (state.litMatch ?? null) as SlateMomentumSnapshot["litMatch"],
    createdAt: String(row.created_at),
    supersededAt: null,
  };
}

export function createSlateReviewExport(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateReviewExportV1 {
  const project = projectRow(db, userId, projectId);
  const section = db
    .prepare(
      `SELECT id, title, kind, ordinal, revision, prose
         FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(sectionId, projectId, userId) as
    | {
        id: string;
        title: string;
        kind: string;
        ordinal: number;
        revision: number;
        prose: string;
      }
    | undefined;
  if (!section) throw new Error("Slate section not found.");
  const document = ensureSlateSectionDocument(db, {
    userId,
    projectId,
    sectionId,
  });
  const mirror = db
    .prepare(
      `SELECT bindings.profile_version_id, bindings.project_overlay_json,
              bindings.pov_overlays_json, versions.voice_card_json
         FROM slate_project_mirror_bindings bindings
         JOIN slate_mirror_profile_versions versions
           ON versions.id = bindings.profile_version_id
          AND versions.user_id = bindings.user_id
        WHERE bindings.project_id = ? AND bindings.user_id = ?`,
    )
    .get(projectId, userId) as
    | {
        profile_version_id: string;
        project_overlay_json: string;
        pov_overlays_json: string;
        voice_card_json: string;
      }
    | undefined;
  const projectOverlay = parseJson<Record<string, unknown>>(
    mirror?.project_overlay_json,
    {},
  );
  const povOverlays = parseJson<Record<string, unknown>>(
    mirror?.pov_overlays_json,
    {},
  );
  const generation = Number(project.continuity_active_generation ?? 0);
  const activeProjection = projectActiveSlateStoryBible(db, {
    userId,
    projectId,
    sectionId,
  });
  const envelope: SlateReviewExportV1 = {
    format: SLATE_REVIEW_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      proseMode:
        project.prose_mode === "offline" || project.prose_mode === "online"
          ? project.prose_mode
          : "auto",
      continuityVersion: project.continuity_active_version,
      activeGeneration: generation,
      mirrorProfileVersionId: mirror?.profile_version_id ?? null,
      codeRevision:
        process.env.PRISM_CODE_REVISION?.trim() ||
        process.env.GIT_COMMIT_SHA?.trim() ||
        null,
    },
    sections: [
      {
        section: {
          id: section.id,
          title: section.title,
          kind:
            section.kind === "act" ||
            section.kind === "chapter" ||
            section.kind === "scene"
              ? section.kind
              : "imported",
          ordinal: Number(section.ordinal),
          revision: Number(section.revision),
          documentHash: document.documentHash,
          proseHash: document.proseHash,
        },
        acceptedProse: section.prose,
        sources: sourceRecords(
          db,
          userId,
          projectId,
          sectionId,
          generation,
        ),
        operations: operationRecords(db, userId, projectId, sectionId),
        clarifications: clarificationRecords(
          db,
          userId,
          projectId,
          sectionId,
        ),
        developerEvents: listDeveloperEvents(
          db,
          userId,
          projectId,
          sectionId,
          Number(section.revision),
        ),
        storyBible: activeProjection.storyBible,
        mirror: {
          profileVersionId: mirror?.profile_version_id ?? null,
          projectOverlayId:
            typeof projectOverlay.id === "string" ? projectOverlay.id : null,
          povOverlayId:
            typeof povOverlays.id === "string" ? povOverlays.id : null,
          voiceCard: voiceCardOrNull(mirror?.voice_card_json ?? null),
          sourceFingerprint: mirror
            ? slateSha256(
                `${mirror.profile_version_id}\0${mirror.voice_card_json}`,
              )
            : null,
        },
        momentum: activeProjection.momentum,
      },
    ],
  };
  if (!isSlateReviewExportV1(envelope)) {
    throw new Error("Slate review export failed schema validation.");
  }
  return envelope;
}

export function slateReviewExportMarkdown(
  envelope: SlateReviewExportV1,
): string {
  const section = envelope.sections[0]!;
  return [
    `# Slate Review Export: ${envelope.project.title}`,
    "",
    `- Format: \`${envelope.format}\``,
    `- Project: \`${envelope.project.id}\``,
    `- Section: ${section.section.title} (\`${section.section.id}\`)`,
    `- Revision: ${section.section.revision}`,
    `- Document hash: \`${section.section.documentHash}\``,
    `- Prose hash: \`${section.section.proseHash}\``,
    `- Continuity: ${envelope.project.continuityVersion}, generation ${envelope.project.activeGeneration}`,
    "",
    "## Accepted prose",
    "",
    "````text",
    section.acceptedProse,
    "````",
    "",
    "## Writing operations and clarification decisions",
    "",
    ...(section.operations.length
      ? section.operations.map(
          (operation) =>
            `- \`${operation.id}\` — ${operation.intent.operation} — ${operation.status} — ${operation.provider ?? "unrouted"}/${operation.model ?? "unrouted"}`,
        )
      : ["- No writing operations recorded."]),
    ...(section.clarifications.length
      ? section.clarifications.map(
          (clarification) =>
            `- Clarification \`${clarification.id}\` — ${clarification.status} — answer: ${
              clarification.answer?.kind === "choice"
                ? clarification.answer.choiceId
                : clarification.answer?.kind === "custom_vibe"
                  ? "custom vibe"
                  : "none"
            }`,
        )
      : ["- No clarifications recorded."]),
    "",
    "## Continuity developer transcript",
    "",
    ...(section.developerEvents.length
      ? section.developerEvents.map(
          (event) =>
            `${event.sequence}. **${event.stage}/${event.kind}** — ${event.summary}`,
        )
      : ["No developer events recorded."]),
    "",
    "## Story Bible, Mirror, and momentum",
    "",
    "- Story Bible projection included: yes",
    `- Mirror profile version: ${section.mirror.profileVersionId ?? "none"}`,
    `- Momentum snapshot: ${section.momentum ? "included" : "none"}`,
    "",
    "## Machine-readable envelope",
    "",
    "````json",
    JSON.stringify(envelope, null, 2),
    "````",
    "",
  ].join("\n");
}
