import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, posix, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  createSlateSectionDocumentV1,
  slateSectionDocumentSnapshot,
} from "./slate-section-documents.ts";

export const SLATE_RECOVERY_FORMAT = "prism-slate-recovery-v1" as const;
export const SLATE_ARCHIVE_FORMAT = "prism-slate-project-v1" as const;
export const SLATE_RECOVERY_VERSION = 1 as const;
export const SLATE_ARCHIVE_LEGACY_VERSION = 1 as const;
export const SLATE_ARCHIVE_VERSION = 2 as const;

const RECOVERY_FILE_SUFFIX = ".slate-recovery.json";
const MAX_ARCHIVE_PATH_LENGTH = 512;
const MAX_ARCHIVE_SEGMENT_LENGTH = 180;

type SlateScalar = string | number | null;
export type SlateSafetyRow = Record<string, SlateScalar>;

/**
 * Authoritative, portable project data. Deliberately absent are user ids,
 * credentials, account-level provider configuration, temporary jobs,
 * compatibility caches, vector indexes, and rebuildable Continuity processing
 * state. Versioned generation metadata is authoritative and travels with its
 * project pointers.
 */
export interface SlateSafetyContentV1 {
  schemaVersion: 1;
  series: SlateSafetyRow;
  project: SlateSafetyRow;
  revisions: SlateSafetyRow[];
  versions: SlateSafetyRow[];
  sections: SlateSafetyRow[];
  sectionVersions: SlateSafetyRow[];
  continuity: {
    sources: SlateSafetyRow[];
    entities: SlateSafetyRow[];
    aliases: SlateSafetyRow[];
    claims: SlateSafetyRow[];
    events: SlateSafetyRow[];
    relationships: SlateSafetyRow[];
    knowledge: SlateSafetyRow[];
    threads: SlateSafetyRow[];
    concerns: SlateSafetyRow[];
    generations: SlateSafetyRow[];
  };
}

/**
 * V2 keeps the V1 authorial payload intact and adds the rich manuscript and
 * safely portable operation receipts needed to restore Slate's cockpit.
 * Idempotency keys, provider credentials, raw requests, hidden prompts, jobs,
 * and caches are deliberately excluded.
 */
export interface SlateSafetyContentV2
  extends Omit<SlateSafetyContentV1, "schemaVersion"> {
  schemaVersion: 2;
  documents: SlateSafetyRow[];
  annotations: SlateSafetyRow[];
  writing: {
    operations: SlateSafetyRow[];
    clarifications: SlateSafetyRow[];
    mutations: SlateSafetyRow[];
    developerEvents: SlateSafetyRow[];
  };
  studios: {
    characterProfiles: SlateSafetyRow[];
    characterArcs: SlateSafetyRow[];
    characterArcBeats: SlateSafetyRow[];
    narrativeEdges: SlateSafetyRow[];
    mirror: {
      profiles: SlateSafetyRow[];
      versions: SlateSafetyRow[];
      binding: SlateSafetyRow | null;
    };
    sourceShelf: SlateSafetyRow[];
    visualReferences: SlateSafetyRow[];
    reviewCircle: {
      sessions: SlateSafetyRow[];
      results: SlateSafetyRow[];
      roomNotes: SlateSafetyRow[];
    };
    momentumSnapshots: SlateSafetyRow[];
  };
}

export type SlateSafetyContent = SlateSafetyContentV1 | SlateSafetyContentV2;

export interface SlateRecoverySnapshotV1 {
  format: typeof SLATE_RECOVERY_FORMAT;
  version: typeof SLATE_RECOVERY_VERSION;
  capturedAt: string;
  projectId: string;
  seriesId: string;
  contentHash: string;
  snapshotHash: string;
  content: SlateSafetyContent;
}

export interface SlateRecoveryGeneration {
  path: string;
  filename: string;
  capturedAt: string;
  contentHash: string | null;
  status: "verified" | "corrupt";
  snapshot: SlateRecoverySnapshotV1 | null;
  error: string | null;
}

export interface SlateRecoveryMirrorResult {
  status: "written" | "skipped" | "failed" | "disabled";
  path: string | null;
  error: string | null;
}

export interface SlateRecoveryWriteResult {
  created: boolean;
  path: string;
  snapshot: SlateRecoverySnapshotV1;
  prunedPaths: string[];
  mirror: SlateRecoveryMirrorResult;
}

export interface SlateRecoveryRetentionPolicy {
  recent: number;
  hourly: number;
  daily: number;
  monthly: number;
}

export const DEFAULT_SLATE_RECOVERY_RETENTION: SlateRecoveryRetentionPolicy = {
  recent: 12,
  hourly: 24,
  daily: 30,
  monthly: 12,
};

export interface WriteSlateRecoveryOptions {
  capturedAt?: Date;
  mirrorDirectory?: string | null;
  retention?: SlateRecoveryRetentionPolicy;
}

export interface SlateArchiveFileManifestV1 {
  path: string;
  mediaType: "application/json" | "text/markdown";
  bytes: number;
  sha256: string;
}

interface SlateArchiveManifestBase {
  format: typeof SLATE_ARCHIVE_FORMAT;
  exportedAt: string;
  project: {
    id: string;
    title: string;
    seriesId: string;
  };
  continuity: {
    activeVersion: string;
    targetVersion: string;
    activeGeneration: number;
  };
  contentHash: string;
  files: SlateArchiveFileManifestV1[];
}

export interface SlateArchiveManifestV1 extends SlateArchiveManifestBase {
  version: typeof SLATE_ARCHIVE_LEGACY_VERSION;
}

export interface SlateArchiveManifestV2 extends SlateArchiveManifestBase {
  version: typeof SLATE_ARCHIVE_VERSION;
}

export type SlateArchiveManifest =
  | SlateArchiveManifestV1
  | SlateArchiveManifestV2;

/** A dependency-free bundle ready for a future ZIP transport adapter. */
export interface SlateArchiveBundleV1 {
  manifest: SlateArchiveManifest;
  files: Record<string, string>;
}

const PROJECT_COLUMNS = [
  "id",
  "series_id",
  "book_ordinal",
  "title",
  "title_origin",
  "spark",
  "spark_wildcards_json",
  "premise",
  "voice",
  "non_negotiables_json",
  "phase",
  "structure_json",
  "characters_json",
  "unresolved_threads_json",
  "direction",
  "locked_ranges_json",
  "last_provider",
  "last_model",
  "prose_mode",
  "prose_model",
  "prose_provider",
  "deliberation_config_json",
  "continuity_active_version",
  "continuity_target_version",
  "continuity_active_generation",
  "continuity_previous_generation",
  "continuity_upgrade_status",
  "continuity_last_success_at",
  "created_at",
  "updated_at",
] as const;

const SERIES_COLUMNS = [
  "id",
  "title",
  "description",
  "continuity_active_generation",
  "continuity_previous_generation",
  "created_at",
  "updated_at",
] as const;

interface CollectionSpec {
  readonly output: keyof Pick<
    SlateSafetyContentV1,
    "revisions" | "versions" | "sections" | "sectionVersions"
  >;
  readonly table: string;
  readonly columns: readonly string[];
  readonly orderBy: string;
}

const PROJECT_COLLECTIONS: readonly CollectionSpec[] = [
  {
    output: "revisions",
    table: "slate_revisions",
    columns: [
      "id", "project_id", "action", "scope", "structure_item_id",
      "selection_start", "selection_end", "direction", "original_text",
      "proposed_text", "status", "provider", "model", "created_at", "resolved_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "versions",
    table: "slate_versions",
    columns: ["id", "project_id", "reason", "structure_json", "manuscript", "created_at"],
    orderBy: "created_at, id",
  },
  {
    output: "sections",
    table: "slate_sections",
    columns: [
      "id", "project_id", "series_id", "parent_section_id", "structure_item_id",
      "kind", "ordinal", "title", "summary", "direction", "prose",
      "locked_ranges_json", "locked", "status", "revision", "content_hash",
      "created_at", "updated_at",
    ],
    orderBy: "ordinal, id",
  },
  {
    output: "sectionVersions",
    table: "slate_section_versions",
    columns: [
      "id", "project_id", "section_id", "revision", "reason", "title", "summary",
      "direction", "prose", "locked", "status", "content_hash", "document_json",
      "document_hash", "prose_hash", "created_at",
    ],
    orderBy: "section_id, revision, id",
  },
] as const;

const DOCUMENT_COLUMNS = [
  "section_id", "project_id", "schema_version", "section_revision",
  "document_json", "document_hash", "prose_hash", "created_at", "updated_at",
] as const;

const ANNOTATION_COLUMNS = [
  "id", "project_id", "section_id", "block_id", "anchor_json", "kind", "body",
  "resolved", "created_at", "updated_at",
] as const;

const WRITING_OPERATION_COLUMNS = [
  "id", "project_id", "section_id", "parent_operation_id", "kind", "status",
  "direction_intent_json", "validated_snapshot_json", "revision_fingerprint",
  "continuity_generation", "mirror_profile_version_id", "provider", "model",
  "proposal_text", "proposal_hash", "revision_id", "created_at", "updated_at",
  "started_at", "completed_at", "resolved_at",
] as const;

const CLARIFICATION_COLUMNS = [
  "id", "project_id", "section_id", "operation_id", "kind", "status", "prompt",
  "choices_json", "allows_custom_vibe", "evidence_json", "revision_fingerprint",
  "continuity_generation", "mirror_profile_version_id", "answer_kind",
  "answer_choice_id", "custom_vibe", "structured_direction_json",
  "resume_operation_id", "created_at", "answered_at", "stale_at",
] as const;

const WRITING_MUTATION_COLUMNS = [
  "id", "project_id", "operation_id", "action", "result_operation_id",
  "created_at",
] as const;

const DEVELOPER_EVENT_COLUMNS = [
  "id", "series_id", "project_id", "section_id", "section_revision", "sequence",
  "stage", "kind", "summary", "detail_json", "source_ids_json", "operation_id",
  "clarification_id", "provider", "model", "continuity_generation", "created_at",
] as const;

const CHARACTER_PROFILE_COLUMNS = [
  "id", "series_id", "project_id", "entity_id", "generation", "layer",
  "profile_json", "field_locks_json", "provenance_json", "created_at",
  "updated_at",
] as const;

const CHARACTER_ARC_COLUMNS = [
  "id", "series_id", "project_id", "character_profile_id", "generation",
  "intended_json", "observed_json", "provenance_json", "created_at",
  "updated_at",
] as const;

const CHARACTER_ARC_BEAT_COLUMNS = [
  "id", "series_id", "project_id", "character_arc_id", "section_id",
  "generation", "track", "ordinal", "beat_json", "provenance_json",
  "created_at", "updated_at",
] as const;

const NARRATIVE_EDGE_COLUMNS = [
  "id", "series_id", "project_id", "generation", "from_ref_json",
  "to_ref_json", "kind", "branch_id", "story_time_json",
  "manuscript_order_json", "provenance_json", "created_at", "updated_at",
] as const;

const MIRROR_PROFILE_COLUMNS = [
  "id", "name", "pen_name", "frozen", "created_at", "updated_at",
] as const;

const MIRROR_VERSION_COLUMNS = [
  "id", "profile_id", "version", "voice_card_json",
  "eligibility_summary_json", "created_at",
] as const;

const MIRROR_BINDING_COLUMNS = [
  "project_id", "profile_version_id", "project_overlay_json",
  "pov_overlays_json", "created_at", "updated_at",
] as const;

const SOURCE_SHELF_COLUMNS = [
  "id", "project_id", "title", "kind", "content", "metadata_json",
  "promoted_source_id", "mirror_eligible", "created_at", "updated_at",
] as const;

const VISUAL_REFERENCE_COLUMNS = [
  "id", "project_id", "section_id", "entity_id", "kind", "status",
  "image_id", "prompt", "reference_state_json", "visual_style_version",
  "provider", "model", "created_at", "pinned_at",
] as const;

const REVIEW_SESSION_COLUMNS = [
  "id", "project_id", "section_id", "artifact_json",
  "section_revisions_json", "continuity_version", "continuity_generation",
  "provider", "model", "created_at",
] as const;

const REVIEW_RESULT_COLUMNS = [
  "id", "session_id", "ordinal", "reviewer_id", "reviewer_snapshot_json",
  "result_json", "created_at",
] as const;

const REVIEW_ROOM_NOTE_COLUMNS = [
  "session_id", "room_note_json", "created_at",
] as const;

const MOMENTUM_SNAPSHOT_COLUMNS = [
  "id", "project_id", "section_id", "kind", "state_json",
  "source_fingerprint", "created_at",
] as const;

interface ContinuityCollectionSpec {
  readonly output: keyof SlateSafetyContentV1["continuity"];
  readonly table: string;
  readonly columns: readonly string[];
  readonly orderBy: string;
}

const CONTINUITY_COLLECTIONS: readonly ContinuityCollectionSpec[] = [
  {
    output: "sources",
    table: "slate_continuity_sources",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "source_revision", "content", "content_hash", "authority", "provider", "model",
      "producer_versions_json", "generation", "supersedes_source_id", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "entities",
    table: "slate_continuity_entities",
    columns: [
      "id", "series_id", "kind", "canonical_name", "description", "locked",
      "anchors_json", "source_id", "producer_versions_json", "generation",
      "created_at", "updated_at",
    ],
    orderBy: "canonical_name, id",
  },
  {
    output: "aliases",
    table: "slate_continuity_aliases",
    columns: [
      "id", "series_id", "entity_id", "alias", "normalized_alias", "source_id",
      "generation", "created_at",
    ],
    orderBy: "normalized_alias, id",
  },
  {
    output: "claims",
    table: "slate_continuity_claims",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "subject_entity_id",
      "predicate", "object_entity_id", "value", "epistemic_status", "perspective_entity_id",
      "confidence", "anchors_json", "source_id", "supersedes_claim_id",
      "producer_versions_json", "generation", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "events",
    table: "slate_continuity_events",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "title", "description",
      "chronology_key", "participant_entity_ids_json", "location_entity_id", "anchors_json",
      "source_id", "producer_versions_json", "generation", "created_at",
    ],
    orderBy: "chronology_key, created_at, id",
  },
  {
    output: "relationships",
    table: "slate_continuity_relationships",
    columns: [
      "id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "knowledge",
    table: "slate_continuity_knowledge",
    columns: [
      "id", "series_id", "character_entity_id", "claim_id", "learned_event_id", "status",
      "anchors_json", "source_id", "producer_versions_json", "generation", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "threads",
    table: "slate_continuity_threads",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "label", "status",
      "due_section_id", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at", "updated_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "concerns",
    table: "slate_continuity_concerns",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind", "severity",
      "status", "summary", "explanation", "claim_ids_json", "anchors_json",
      "recommended_resolution", "resolution_json", "producer_versions_json",
      "generation", "created_at", "resolved_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "generations",
    table: "slate_continuity_generations",
    columns: [
      "id", "project_id", "generation", "status", "target_version",
      "source_fingerprint", "comparison_summary", "producer_versions_json",
      "created_at", "completed_at",
    ],
    orderBy: "generation, id",
  },
] as const;

const CONTINUITY_REFERENCE_PROJECTION = canonicalSlateJson({
  projection: "slate-project-reference-v1",
});

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalSlateJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function scalarRows(
  db: DatabaseSync,
  sql: string,
  ...parameters: Array<string | number | null>
): SlateSafetyRow[] {
  const rows = db.prepare(sql).all(...parameters) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const output: SlateSafetyRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Slate recovery cannot serialize non-scalar field ${key}.`);
      }
      output[key] = value;
    }
    return output;
  });
}

function continuitySpec(
  output: keyof SlateSafetyContentV1["continuity"],
): ContinuityCollectionSpec {
  const spec = CONTINUITY_COLLECTIONS.find((candidate) => candidate.output === output);
  if (!spec) throw new Error(`Unknown Slate Continuity collection ${output}.`);
  return spec;
}

function continuityRows(
  db: DatabaseSync,
  output: keyof SlateSafetyContentV1["continuity"],
  where: string,
  ...parameters: Array<string | number | null>
): SlateSafetyRow[] {
  const spec = continuitySpec(output);
  return scalarRows(
    db,
    `SELECT ${spec.columns.join(", ")} FROM ${spec.table}
      WHERE ${where} ORDER BY ${spec.orderBy}`,
    ...parameters,
  );
}

function rowString(row: SlateSafetyRow, key: string): string | null {
  return typeof row[key] === "string" ? row[key] : null;
}

function stringArray(value: SlateScalar): string[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function scopedAnchors(
  value: SlateScalar,
  sourceIds: ReadonlySet<string>,
  sectionIds: ReadonlySet<string>,
): string {
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return "[]";
    return JSON.stringify(parsed.filter((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
      const anchor = candidate as Record<string, unknown>;
      return (
        typeof anchor.sourceId === "string" &&
        sourceIds.has(anchor.sourceId) &&
        (anchor.sectionId === null ||
          (typeof anchor.sectionId === "string" && sectionIds.has(anchor.sectionId)))
      );
    }));
  } catch {
    return "[]";
  }
}

function scopedResolution(
  value: SlateScalar,
  sourceIds: ReadonlySet<string>,
  revisionIds: ReadonlySet<string>,
): string | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const resolution = parsed as Record<string, unknown>;
    return JSON.stringify({
      ...resolution,
      sourceId:
        typeof resolution.sourceId === "string" && sourceIds.has(resolution.sourceId)
          ? resolution.sourceId
          : null,
      revisionId:
        typeof resolution.revisionId === "string" && revisionIds.has(resolution.revisionId)
          ? resolution.revisionId
          : null,
    });
  } catch {
    return null;
  }
}

function rowsByIds(
  db: DatabaseSync,
  output: keyof SlateSafetyContentV1["continuity"],
  userId: string,
  seriesId: string,
  ids: ReadonlySet<string>,
): SlateSafetyRow[] {
  const allIds = [...ids];
  const rows: SlateSafetyRow[] = [];
  for (let offset = 0; offset < allIds.length; offset += 400) {
    const chunk = allIds.slice(offset, offset + 400);
    if (chunk.length === 0) continue;
    rows.push(...continuityRows(
      db,
      output,
      `user_id = ? AND series_id = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
      userId,
      seriesId,
      ...chunk,
    ));
  }
  return rows;
}

function capturePortableSeriesGenerations(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  seriesId: string,
): SlateSafetyRow[] {
  const spec = continuitySpec("generations");
  const series = scalarRows(
    db,
    `SELECT continuity_active_generation, continuity_previous_generation
       FROM slate_series
      WHERE id = ? AND user_id = ?`,
    seriesId,
    userId,
  )[0];
  const activeGeneration = Number(series?.continuity_active_generation ?? 0);
  const previousGeneration =
    series?.continuity_previous_generation === null ||
    series?.continuity_previous_generation === undefined
      ? null
      : Number(series.continuity_previous_generation);
  const rows = scalarRows(
    db,
    `SELECT ${spec.columns.map((column) => `generations.${column}`).join(", ")}
       FROM slate_continuity_generations AS generations
       JOIN slate_projects AS projects
         ON projects.id = generations.project_id
        AND projects.user_id = generations.user_id
      WHERE generations.user_id = ? AND projects.series_id = ?
      ORDER BY generations.generation, generations.created_at, generations.id`,
    userId,
    seriesId,
  );
  const selected = new Map<number, SlateSafetyRow>();
  const rank = (row: SlateSafetyRow): number => {
    const generation = Number(row.generation);
    const expectedStatus = generation === activeGeneration
      ? "active"
      : generation === previousGeneration
        ? "superseded"
        : null;
    return (
      (row.status === expectedStatus ? 100 : 0) +
      (row.project_id === projectId ? 10 : 0)
    );
  };
  for (const row of rows) {
    const generation = Number(row.generation);
    const current = selected.get(generation);
    if (!current || rank(row) > rank(current)) selected.set(generation, row);
  }
  return [...selected.values()]
    .map((row): SlateSafetyRow => ({
      ...row,
      project_id: projectId,
      comparison_summary:
        row.project_id === projectId
          ? row.comparison_summary
          : "Series Continuity generation metadata.",
    }))
    .sort((left, right) =>
      Number(left.generation) - Number(right.generation) ||
      String(left.id).localeCompare(String(right.id)),
    );
}

function captureProjectContinuity(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  seriesId: string,
  sectionIds: ReadonlySet<string>,
  revisionIds: ReadonlySet<string>,
): SlateSafetyContentV1["continuity"] {
  let sources = continuityRows(
    db,
    "sources",
    "user_id = ? AND series_id = ? AND project_id = ?",
    userId,
    seriesId,
    projectId,
  );
  const sourceIds = new Set(sources.map((row) => rowString(row, "id")).filter(Boolean) as string[]);
  sources = sources.map((row) => ({
    ...row,
    section_id:
      rowString(row, "section_id") && sectionIds.has(String(row.section_id))
        ? row.section_id
        : null,
    supersedes_source_id:
      rowString(row, "supersedes_source_id") && sourceIds.has(String(row.supersedes_source_id))
        ? row.supersedes_source_id
        : null,
  }));

  const sourceIsProjectOwned =
    `source_id IN (SELECT id FROM slate_continuity_sources
      WHERE user_id = ? AND series_id = ? AND project_id = ?)`;
  let claims = continuityRows(
    db,
    "claims",
    `user_id = ? AND series_id = ? AND project_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    projectId,
    userId,
    seriesId,
    projectId,
  );
  const claimIds = new Set(claims.map((row) => rowString(row, "id")).filter(Boolean) as string[]);
  claims = claims.map((row) => ({
    ...row,
    section_id:
      rowString(row, "section_id") && sectionIds.has(String(row.section_id))
        ? row.section_id
        : null,
    supersedes_claim_id:
      rowString(row, "supersedes_claim_id") && claimIds.has(String(row.supersedes_claim_id))
        ? row.supersedes_claim_id
        : null,
    anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
  }));

  let events: SlateSafetyRow[] = continuityRows(
    db,
    "events",
    `user_id = ? AND series_id = ? AND project_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    projectId,
    userId,
    seriesId,
    projectId,
  ).map((row) => ({
    ...row,
    section_id:
      rowString(row, "section_id") && sectionIds.has(String(row.section_id))
        ? row.section_id
        : null,
    anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
  }));
  const eventIds = new Set(events.map((row) => rowString(row, "id")).filter(Boolean) as string[]);

  let relationships: SlateSafetyRow[] = continuityRows(
    db,
    "relationships",
    `user_id = ? AND series_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    userId,
    seriesId,
    projectId,
  ).map((row) => ({
    ...row,
    anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
  }));

  let knowledge: SlateSafetyRow[] = continuityRows(
    db,
    "knowledge",
    `user_id = ? AND series_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    userId,
    seriesId,
    projectId,
  )
    .filter((row) => claimIds.has(String(row.claim_id)))
    .map((row) => ({
      ...row,
      learned_event_id:
        rowString(row, "learned_event_id") && eventIds.has(String(row.learned_event_id))
          ? row.learned_event_id
          : null,
      anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
    }));

  const threads: SlateSafetyRow[] = continuityRows(
    db,
    "threads",
    `user_id = ? AND series_id = ? AND project_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    projectId,
    userId,
    seriesId,
    projectId,
  ).map((row) => ({
    ...row,
    section_id:
      rowString(row, "section_id") && sectionIds.has(String(row.section_id))
        ? row.section_id
        : null,
    due_section_id:
      rowString(row, "due_section_id") && sectionIds.has(String(row.due_section_id))
        ? row.due_section_id
        : null,
    anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
  }));

  const concerns: SlateSafetyRow[] = continuityRows(
    db,
    "concerns",
    "user_id = ? AND series_id = ? AND project_id = ?",
    userId,
    seriesId,
    projectId,
  ).map((row) => ({
    ...row,
    section_id:
      rowString(row, "section_id") && sectionIds.has(String(row.section_id))
        ? row.section_id
        : null,
    claim_ids_json: JSON.stringify(
      stringArray(row.claim_ids_json).filter((id) => claimIds.has(id)),
    ),
    anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
    resolution_json: scopedResolution(row.resolution_json, sourceIds, revisionIds),
  }));

  let aliases = continuityRows(
    db,
    "aliases",
    `user_id = ? AND series_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    userId,
    seriesId,
    projectId,
  );

  const entityIds = new Set<string>();
  const addEntity = (value: SlateScalar) => {
    if (typeof value === "string" && value) entityIds.add(value);
  };
  for (const row of claims) {
    addEntity(row.subject_entity_id);
    addEntity(row.object_entity_id);
    addEntity(row.perspective_entity_id);
  }
  for (const row of events) {
    addEntity(row.location_entity_id);
    for (const id of stringArray(row.participant_entity_ids_json)) addEntity(id);
  }
  for (const row of relationships) {
    addEntity(row.from_entity_id);
    addEntity(row.to_entity_id);
  }
  for (const row of knowledge) addEntity(row.character_entity_id);
  for (const row of aliases) addEntity(row.entity_id);

  const projectEntities = continuityRows(
    db,
    "entities",
    `user_id = ? AND series_id = ? AND ${sourceIsProjectOwned}`,
    userId,
    seriesId,
    userId,
    seriesId,
    projectId,
  );
  for (const row of projectEntities) addEntity(row.id);
  const entityRows = rowsByIds(db, "entities", userId, seriesId, entityIds);
  const entities: SlateSafetyRow[] = entityRows.map((row): SlateSafetyRow => {
    const projectOwned = rowString(row, "source_id") !== null && sourceIds.has(String(row.source_id));
    if (!projectOwned) {
      return {
        ...row,
        description: "",
        anchors_json: "[]",
        source_id: null,
        producer_versions_json: CONTINUITY_REFERENCE_PROJECTION,
      };
    }
    return {
      ...row,
      anchors_json: scopedAnchors(row.anchors_json, sourceIds, sectionIds),
    };
  }).sort((left, right) =>
    String(left.canonical_name).localeCompare(String(right.canonical_name)) ||
    String(left.id).localeCompare(String(right.id)),
  );
  const capturedEntityIds = new Set(
    entities.map((row) => rowString(row, "id")).filter(Boolean) as string[],
  );

  const optionalEntity = (value: SlateScalar): string | null =>
    typeof value === "string" && capturedEntityIds.has(value) ? value : null;
  claims = claims.map((row) => ({
    ...row,
    subject_entity_id: optionalEntity(row.subject_entity_id),
    object_entity_id: optionalEntity(row.object_entity_id),
    perspective_entity_id: optionalEntity(row.perspective_entity_id),
  }));
  events = events.map((row) => ({
    ...row,
    participant_entity_ids_json: JSON.stringify(
      stringArray(row.participant_entity_ids_json).filter((id) => capturedEntityIds.has(id)),
    ),
    location_entity_id: optionalEntity(row.location_entity_id),
  }));
  relationships = relationships.filter(
    (row) => capturedEntityIds.has(String(row.from_entity_id)) && capturedEntityIds.has(String(row.to_entity_id)),
  );
  knowledge = knowledge.filter((row) => capturedEntityIds.has(String(row.character_entity_id)));
  aliases = aliases.filter((row) => capturedEntityIds.has(String(row.entity_id)));

  return {
    sources,
    entities,
    aliases,
    claims,
    events,
    relationships,
    knowledge,
    threads,
    concerns,
    generations: capturePortableSeriesGenerations(
      db,
      userId,
      projectId,
      seriesId,
    ),
  };
}

function onlyRow(rows: SlateSafetyRow[], label: string): SlateSafetyRow {
  const row = rows[0];
  if (!row) throw new Error(label);
  return row;
}

function captureSectionDocuments(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sections: SlateSafetyRow[],
): SlateSafetyRow[] {
  const stored = scalarRows(
    db,
    `SELECT ${DOCUMENT_COLUMNS.join(", ")}
       FROM slate_section_documents
      WHERE project_id = ? AND user_id = ?
      ORDER BY section_id`,
    projectId,
    userId,
  );
  const bySection = new Map(
    stored.map((row) => [String(row.section_id), row] as const),
  );
  for (const section of sections) {
    const sectionId = String(section.id);
    const prose = String(section.prose);
    const existing = bySection.get(sectionId);
    if (existing) {
      try {
        const snapshot = slateSectionDocumentSnapshot(
          JSON.parse(String(existing.document_json)),
          Number(existing.section_revision),
        );
        if (
          Number(existing.section_revision) === Number(section.revision) &&
          snapshot.prose === prose &&
          snapshot.documentHash === existing.document_hash &&
          snapshot.proseHash === existing.prose_hash
        ) {
          continue;
        }
      } catch {
        // Replace corrupt or stale rich state with an exact legacy projection.
      }
    }
    const snapshot = slateSectionDocumentSnapshot(
      createSlateSectionDocumentV1(sectionId, prose),
      Number(section.revision),
    );
    bySection.set(sectionId, {
      section_id: sectionId,
      project_id: projectId,
      schema_version: 1,
      section_revision: Number(section.revision),
      document_json: JSON.stringify(snapshot.document),
      document_hash: snapshot.documentHash,
      prose_hash: snapshot.proseHash,
      created_at: String(section.created_at),
      updated_at: String(section.updated_at),
    });
  }
  return [...bySection.values()].sort((left, right) =>
    String(left.section_id).localeCompare(String(right.section_id)),
  );
}

function emptySlateStudioContent(): SlateSafetyContentV2["studios"] {
  return {
    characterProfiles: [],
    characterArcs: [],
    characterArcBeats: [],
    narrativeEdges: [],
    mirror: {
      profiles: [],
      versions: [],
      binding: null,
    },
    sourceShelf: [],
    visualReferences: [],
    reviewCircle: {
      sessions: [],
      results: [],
      roomNotes: [],
    },
    momentumSnapshots: [],
  };
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parsedJsonRecord(value: SlateScalar): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    return jsonRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function referencedSourceIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) referencedSourceIds(item, output);
    return output;
  }
  const object = jsonRecord(value);
  if (!object) return output;
  if (typeof object.sourceId === "string" && object.sourceId) {
    output.add(object.sourceId);
  }
  if (Array.isArray(object.sourceIds)) {
    for (const sourceId of object.sourceIds) {
      if (typeof sourceId === "string" && sourceId) output.add(sourceId);
    }
  }
  for (const child of Object.values(object)) {
    referencedSourceIds(child, output);
  }
  return output;
}

function portableJsonReferences(
  value: unknown,
  sourceIds: ReadonlySet<string>,
  sectionIds: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => portableJsonReferences(item, sourceIds, sectionIds));
  }
  const object = jsonRecord(value);
  if (!object) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object)) {
    if (key === "sourceId") {
      result[key] =
        typeof child === "string" && sourceIds.has(child) ? child : null;
      continue;
    }
    if (key === "sourceIds" && Array.isArray(child)) {
      result[key] = child.filter(
        (sourceId): sourceId is string =>
          typeof sourceId === "string" && sourceIds.has(sourceId),
      );
      continue;
    }
    if (
      (key === "sectionId" ||
        key === "sourceSectionId" ||
        key === "expectedSectionId" ||
        key === "observedSectionId" ||
        key === "openedSectionId" ||
        key === "resolvedSectionId" ||
        key === "expectedPayoffStartSectionId" ||
        key === "expectedPayoffEndSectionId") &&
      child !== null
    ) {
      result[key] =
        typeof child === "string" && sectionIds.has(child) ? child : null;
      continue;
    }
    if (key === "anchors" && Array.isArray(child)) {
      result[key] = child.filter((candidate) => {
        const anchor = jsonRecord(candidate);
        return Boolean(
          anchor &&
          typeof anchor.sourceId === "string" &&
          sourceIds.has(anchor.sourceId) &&
          (
            anchor.sectionId === null ||
            (typeof anchor.sectionId === "string" && sectionIds.has(anchor.sectionId))
          ),
        );
      }).map((anchor) => portableJsonReferences(anchor, sourceIds, sectionIds));
      continue;
    }
    result[key] = portableJsonReferences(child, sourceIds, sectionIds);
  }
  return result;
}

function jsonHasOnlyPortableSources(
  value: unknown,
  sourceIds: ReadonlySet<string>,
): boolean {
  const references = referencedSourceIds(value);
  return references.size > 0 && [...references].every((id) => sourceIds.has(id));
}

function sanitizedMirrorVersionMetadata(
  row: SlateSafetyRow,
  capturedVersionIds: ReadonlySet<string>,
): string {
  const metadata = parsedJsonRecord(row.eligibility_summary_json) ?? {};
  return JSON.stringify({
    ...metadata,
    parentVersionId:
      typeof metadata.parentVersionId === "string" &&
      capturedVersionIds.has(metadata.parentVersionId)
        ? metadata.parentVersionId
        : null,
    sampleIds: [],
    eligibleSampleCount: 0,
    excludedSampleCount: 0,
    archiveNote:
      "Writer samples are intentionally excluded from portable Slate archives.",
  });
}

function captureSlateStudios(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  seriesId: string,
  sectionIds: ReadonlySet<string>,
  content: SlateSafetyContentV2,
): SlateSafetyContentV2["studios"] {
  const studios = emptySlateStudioContent();
  const entityIds = new Set(
    content.continuity.entities
      .map((row) => rowString(row, "id"))
      .filter((id): id is string => Boolean(id)),
  );
  const initialSourceIds = new Set(
    content.continuity.sources
      .map((row) => rowString(row, "id"))
      .filter((id): id is string => Boolean(id)),
  );

  const profileCandidates = scalarRows(
    db,
    `SELECT ${CHARACTER_PROFILE_COLUMNS.join(", ")}
       FROM slate_character_profiles
      WHERE user_id = ? AND series_id = ?
      ORDER BY generation, created_at, id`,
    userId,
    seriesId,
  ).filter((row) =>
    row.project_id === projectId ||
    (typeof row.entity_id === "string" && entityIds.has(row.entity_id)),
  );
  const profileCandidateIds = new Set(
    profileCandidates.map((row) => String(row.id)),
  );
  const arcCandidates = scalarRows(
    db,
    `SELECT ${CHARACTER_ARC_COLUMNS.join(", ")}
       FROM slate_character_arcs
      WHERE user_id = ? AND series_id = ?
      ORDER BY generation, created_at, id`,
    userId,
    seriesId,
  ).filter((row) =>
    row.project_id === projectId ||
    profileCandidateIds.has(String(row.character_profile_id)),
  );
  const arcCandidateIds = new Set(arcCandidates.map((row) => String(row.id)));
  const beatCandidates = scalarRows(
    db,
    `SELECT ${CHARACTER_ARC_BEAT_COLUMNS.join(", ")}
       FROM slate_character_arc_beats
      WHERE user_id = ? AND series_id = ?
      ORDER BY generation, character_arc_id, track, ordinal, id`,
    userId,
    seriesId,
  ).filter((row) =>
    arcCandidateIds.has(String(row.character_arc_id)) &&
    (
      row.section_id === null ||
      (typeof row.section_id === "string" && sectionIds.has(row.section_id))
    ),
  );
  const edgeCandidates = scalarRows(
    db,
    `SELECT ${NARRATIVE_EDGE_COLUMNS.join(", ")}
       FROM slate_narrative_edges
      WHERE user_id = ? AND series_id = ?
      ORDER BY generation, created_at, id`,
    userId,
    seriesId,
  ).filter((row) => row.project_id === projectId || row.project_id === null);

  const referencedCharacterSourceIds = new Set<string>();
  for (const row of [
    ...profileCandidates,
    ...arcCandidates,
    ...beatCandidates,
    ...edgeCandidates,
  ]) {
    for (const column of [
      "profile_json", "provenance_json", "intended_json", "observed_json",
      "beat_json", "from_ref_json", "to_ref_json",
    ]) {
      const parsed = parsedJsonRecord(row[column]);
      if (!parsed) continue;
      for (const sourceId of referencedSourceIds(parsed)) {
        referencedCharacterSourceIds.add(sourceId);
      }
    }
  }
  const missingSourceIds = new Set(
    [...referencedCharacterSourceIds].filter((id) => !initialSourceIds.has(id)),
  );
  const writerAuthoritySources = rowsByIds(
    db,
    "sources",
    userId,
    seriesId,
    missingSourceIds,
  ).filter((row) =>
    row.project_id === null &&
    row.section_id === null &&
    row.scope_kind === "series" &&
    row.authority === "human" &&
    row.kind === "review_direction",
  ).map((row) => ({
    ...row,
    supersedes_source_id: null,
  }));
  content.continuity.sources.push(...writerAuthoritySources);
  content.continuity.sources.sort((left, right) =>
    String(left.created_at).localeCompare(String(right.created_at)) ||
    String(left.id).localeCompare(String(right.id)),
  );
  const portableSourceIds = new Set(
    content.continuity.sources
      .map((row) => rowString(row, "id"))
      .filter((id): id is string => Boolean(id)),
  );

  studios.characterProfiles = profileCandidates.flatMap((row) => {
    const profile = parsedJsonRecord(row.profile_json);
    const provenance = parsedJsonRecord(row.provenance_json);
    if (!profile || !provenance) return [];
    const sanitizedProfile = Object.fromEntries(
      Object.entries(profile).flatMap(([field, raw]) => {
        const stored = jsonRecord(raw);
        if (!stored) return [[field, raw]];
        const fieldProvenance = jsonRecord(stored.provenance);
        if (
          fieldProvenance &&
          !jsonHasOnlyPortableSources(fieldProvenance, portableSourceIds)
        ) {
          return [];
        }
        return [[
          field,
          portableJsonReferences(stored, portableSourceIds, sectionIds),
        ]];
      }),
    );
    if (
      Object.keys(sanitizedProfile).length === 0 ||
      !jsonHasOnlyPortableSources(provenance, portableSourceIds)
    ) {
      return [];
    }
    return [{
      ...row,
      project_id: row.project_id === projectId ? projectId : null,
      entity_id:
        typeof row.entity_id === "string" && entityIds.has(row.entity_id)
          ? row.entity_id
          : null,
      profile_json: JSON.stringify(sanitizedProfile),
      provenance_json: JSON.stringify(
        portableJsonReferences(provenance, portableSourceIds, sectionIds),
      ),
    }];
  });
  const capturedProfileIds = new Set(
    studios.characterProfiles.map((row) => String(row.id)),
  );
  studios.characterArcs = arcCandidates.flatMap((row) => {
    const provenance = parsedJsonRecord(row.provenance_json);
    if (
      !capturedProfileIds.has(String(row.character_profile_id)) ||
      !provenance ||
      !jsonHasOnlyPortableSources(provenance, portableSourceIds)
    ) {
      return [];
    }
    return [{
      ...row,
      project_id: row.project_id === projectId ? projectId : null,
      intended_json: JSON.stringify(
        portableJsonReferences(
          parsedJsonRecord(row.intended_json) ?? {},
          portableSourceIds,
          sectionIds,
        ),
      ),
      observed_json: JSON.stringify(
        portableJsonReferences(
          parsedJsonRecord(row.observed_json) ?? {},
          portableSourceIds,
          sectionIds,
        ),
      ),
      provenance_json: JSON.stringify(
        portableJsonReferences(provenance, portableSourceIds, sectionIds),
      ),
    }];
  });
  const capturedArcIds = new Set(
    studios.characterArcs.map((row) => String(row.id)),
  );
  studios.characterArcBeats = beatCandidates.flatMap((row) => {
    const provenance = parsedJsonRecord(row.provenance_json);
    const beat = parsedJsonRecord(row.beat_json);
    if (
      !capturedArcIds.has(String(row.character_arc_id)) ||
      !provenance ||
      !beat ||
      !jsonHasOnlyPortableSources(provenance, portableSourceIds)
    ) {
      return [];
    }
    return [{
      ...row,
      project_id: row.project_id === projectId ? projectId : null,
      beat_json: JSON.stringify(
        portableJsonReferences(beat, portableSourceIds, sectionIds),
      ),
      provenance_json: JSON.stringify(
        portableJsonReferences(provenance, portableSourceIds, sectionIds),
      ),
    }];
  });
  const capturedBeatIds = new Set(
    studios.characterArcBeats.map((row) => String(row.id)),
  );
  const endpointIsPortable = (row: SlateSafetyRow): boolean => {
    for (const column of ["from_ref_json", "to_ref_json"]) {
      const endpoint = parsedJsonRecord(row[column]);
      if (
        !endpoint ||
        typeof endpoint.kind !== "string" ||
        typeof endpoint.id !== "string"
      ) {
        return false;
      }
      const ids =
        endpoint.kind === "event"
          ? new Set(content.continuity.events.map((item) => String(item.id)))
          : endpoint.kind === "claim"
            ? new Set(content.continuity.claims.map((item) => String(item.id)))
            : endpoint.kind === "thread"
              ? new Set(content.continuity.threads.map((item) => String(item.id)))
              : endpoint.kind === "arc_beat"
                ? capturedBeatIds
                : endpoint.kind === "section"
                  ? sectionIds
                  : new Set<string>();
      if (!ids.has(endpoint.id)) return false;
    }
    return true;
  };
  studios.narrativeEdges = edgeCandidates.flatMap((row) => {
    const provenance = parsedJsonRecord(row.provenance_json);
    if (
      !provenance ||
      !jsonHasOnlyPortableSources(provenance, portableSourceIds) ||
      !endpointIsPortable(row)
    ) {
      return [];
    }
    return [{
      ...row,
      project_id: row.project_id === projectId ? projectId : null,
      provenance_json: JSON.stringify(
        portableJsonReferences(provenance, portableSourceIds, sectionIds),
      ),
    }];
  });

  const binding = scalarRows(
    db,
    `SELECT ${MIRROR_BINDING_COLUMNS.join(", ")}
       FROM slate_project_mirror_bindings
      WHERE project_id = ? AND user_id = ?`,
    projectId,
    userId,
  )[0] ?? null;
  const mirrorVersionIds = new Set<string>();
  if (binding?.profile_version_id) {
    mirrorVersionIds.add(String(binding.profile_version_id));
  }
  for (const row of [
    ...content.writing.operations,
    ...content.writing.clarifications,
  ]) {
    if (typeof row.mirror_profile_version_id === "string") {
      mirrorVersionIds.add(row.mirror_profile_version_id);
    }
  }
  const versionRows = mirrorVersionIds.size === 0
    ? []
    : scalarRows(
        db,
        `SELECT ${MIRROR_VERSION_COLUMNS.map((column) => `versions.${column}`).join(", ")}
           FROM slate_mirror_profile_versions AS versions
           JOIN slate_mirror_profiles AS profiles
             ON profiles.id = versions.profile_id
            AND profiles.user_id = versions.user_id
          WHERE versions.user_id = ?
            AND versions.id IN (${[...mirrorVersionIds].map(() => "?").join(", ")})
          ORDER BY versions.profile_id, versions.version, versions.id`,
        userId,
        ...mirrorVersionIds,
      );
  const capturedVersionIds = new Set(versionRows.map((row) => String(row.id)));
  studios.mirror.versions = versionRows.map((row) => ({
    ...row,
    eligibility_summary_json: sanitizedMirrorVersionMetadata(
      row,
      capturedVersionIds,
    ),
  }));
  const mirrorProfileIds = new Set(
    studios.mirror.versions.map((row) => String(row.profile_id)),
  );
  studios.mirror.profiles = mirrorProfileIds.size === 0
    ? []
    : scalarRows(
        db,
        `SELECT ${MIRROR_PROFILE_COLUMNS.join(", ")}
           FROM slate_mirror_profiles
          WHERE user_id = ?
            AND id IN (${[...mirrorProfileIds].map(() => "?").join(", ")})
          ORDER BY created_at, id`,
        userId,
        ...mirrorProfileIds,
      );
  studios.mirror.binding =
    binding && capturedVersionIds.has(String(binding.profile_version_id))
      ? binding
      : null;
  content.writing.operations = content.writing.operations.map((row) => ({
    ...row,
    mirror_profile_version_id:
      typeof row.mirror_profile_version_id === "string" &&
      capturedVersionIds.has(row.mirror_profile_version_id)
        ? row.mirror_profile_version_id
        : null,
  }));
  content.writing.clarifications = content.writing.clarifications.map((row) => ({
    ...row,
    mirror_profile_version_id:
      typeof row.mirror_profile_version_id === "string" &&
      capturedVersionIds.has(row.mirror_profile_version_id)
        ? row.mirror_profile_version_id
        : null,
  }));

  studios.sourceShelf = scalarRows(
    db,
    `SELECT ${SOURCE_SHELF_COLUMNS.join(", ")}
       FROM slate_source_shelf_items
      WHERE user_id = ? AND project_id = ?
      ORDER BY created_at, id`,
    userId,
    projectId,
  ).map((row) => ({
    ...row,
    promoted_source_id:
      typeof row.promoted_source_id === "string" &&
      portableSourceIds.has(row.promoted_source_id)
        ? row.promoted_source_id
        : null,
    mirror_eligible: 0,
  }));
  studios.visualReferences = scalarRows(
    db,
    `SELECT ${VISUAL_REFERENCE_COLUMNS.join(", ")}
       FROM slate_visual_references
      WHERE user_id = ? AND project_id = ?
      ORDER BY created_at, id`,
    userId,
    projectId,
  ).map((row) => ({
    ...row,
    section_id:
      typeof row.section_id === "string" && sectionIds.has(row.section_id)
        ? row.section_id
        : null,
    entity_id:
      typeof row.entity_id === "string" && entityIds.has(row.entity_id)
        ? row.entity_id
        : null,
    reference_state_json: JSON.stringify(
      portableJsonReferences(
        parsedJsonRecord(row.reference_state_json) ?? {},
        portableSourceIds,
        sectionIds,
      ),
    ),
  }));
  studios.reviewCircle.sessions = scalarRows(
    db,
    `SELECT ${REVIEW_SESSION_COLUMNS.join(", ")}
       FROM slate_review_circle_sessions
      WHERE user_id = ? AND project_id = ?
      ORDER BY created_at, id`,
    userId,
    projectId,
  );
  const reviewSessionIds = new Set(
    studios.reviewCircle.sessions.map((row) => String(row.id)),
  );
  if (reviewSessionIds.size > 0) {
    studios.reviewCircle.results = scalarRows(
      db,
      `SELECT ${REVIEW_RESULT_COLUMNS.join(", ")}
         FROM slate_review_circle_results
        WHERE user_id = ?
          AND session_id IN (${[...reviewSessionIds].map(() => "?").join(", ")})
        ORDER BY session_id, ordinal, id`,
      userId,
      ...reviewSessionIds,
    );
    studios.reviewCircle.roomNotes = scalarRows(
      db,
      `SELECT ${REVIEW_ROOM_NOTE_COLUMNS.join(", ")}
         FROM slate_review_circle_room_notes
        WHERE user_id = ?
          AND session_id IN (${[...reviewSessionIds].map(() => "?").join(", ")})
        ORDER BY session_id`,
      userId,
      ...reviewSessionIds,
    );
  }
  studios.momentumSnapshots = scalarRows(
    db,
    `SELECT ${MOMENTUM_SNAPSHOT_COLUMNS.join(", ")}
       FROM slate_momentum_snapshots
      WHERE user_id = ? AND project_id = ?
      ORDER BY created_at, id`,
    userId,
    projectId,
  ).map((row) => ({
    ...row,
    section_id:
      typeof row.section_id === "string" && sectionIds.has(row.section_id)
        ? row.section_id
        : null,
    state_json: JSON.stringify(
      portableJsonReferences(
        parsedJsonRecord(row.state_json) ?? {},
        portableSourceIds,
        sectionIds,
      ),
    ),
  }));
  return studios;
}

export function captureSlateSafetyContent(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSafetyContentV2 {
  const project = onlyRow(
    scalarRows(
      db,
      `SELECT ${PROJECT_COLUMNS.join(", ")} FROM slate_projects WHERE id = ? AND user_id = ?`,
      projectId,
      userId,
    ),
    "Slate project not found.",
  );
  const seriesId = project.series_id;
  if (typeof seriesId !== "string" || !seriesId) {
    throw new Error("Slate project does not have a recoverable series.");
  }
  const series = onlyRow(
    scalarRows(
      db,
      `SELECT ${SERIES_COLUMNS.join(", ")} FROM slate_series WHERE id = ? AND user_id = ?`,
      seriesId,
      userId,
    ),
    "Slate series not found.",
  );

  const content: SlateSafetyContentV2 = {
    schemaVersion: 2,
    series,
    project,
    revisions: [],
    versions: [],
    sections: [],
    sectionVersions: [],
    documents: [],
    annotations: [],
    writing: {
      operations: [],
      clarifications: [],
      mutations: [],
      developerEvents: [],
    },
    studios: emptySlateStudioContent(),
    continuity: {
      sources: [],
      entities: [],
      aliases: [],
      claims: [],
      events: [],
      relationships: [],
      knowledge: [],
      threads: [],
      concerns: [],
      generations: [],
    },
  };

  for (const spec of PROJECT_COLLECTIONS) {
    content[spec.output] = scalarRows(
      db,
      `SELECT ${spec.columns.join(", ")} FROM ${spec.table}
       WHERE project_id = ? AND user_id = ? ORDER BY ${spec.orderBy}`,
      projectId,
      userId,
    );
  }
  const sectionIds = new Set(
    content.sections.map((row) => rowString(row, "id")).filter(Boolean) as string[],
  );
  const revisionIds = new Set(
    content.revisions.map((row) => rowString(row, "id")).filter(Boolean) as string[],
  );
  content.continuity = captureProjectContinuity(
    db,
    userId,
    projectId,
    seriesId,
    sectionIds,
    revisionIds,
  );
  content.documents = captureSectionDocuments(
    db,
    userId,
    projectId,
    content.sections,
  );
  const capturedSourceIds = new Set(
    content.continuity.sources
      .map((row) => rowString(row, "id"))
      .filter((id): id is string => Boolean(id)),
  );
  content.annotations = scalarRows(
    db,
    `SELECT ${ANNOTATION_COLUMNS.join(", ")}
       FROM slate_section_annotations
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at, id`,
    projectId,
    userId,
  ).map((row) => {
    try {
      const parsed = JSON.parse(String(row.anchor_json)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return row;
      const anchor = parsed as Record<string, unknown>;
      const sectionId = String(row.section_id);
      const sectionRevision = Number(anchor.sectionRevision);
      const sourceId = typeof anchor.sourceId === "string" &&
        (
          capturedSourceIds.has(anchor.sourceId) ||
          anchor.sourceId.startsWith("document:")
        )
        ? anchor.sourceId
        : `document:${sectionId}:revision:${sectionRevision}`;
      return {
        ...row,
        anchor_json: JSON.stringify({
          ...anchor,
          sourceId,
          sectionId,
        }),
      };
    } catch {
      return row;
    }
  });
  content.writing.operations = scalarRows(
    db,
    `SELECT ${WRITING_OPERATION_COLUMNS.join(", ")}
       FROM slate_writing_operations
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at, id`,
    projectId,
    userId,
  );
  content.writing.clarifications = scalarRows(
    db,
    `SELECT ${CLARIFICATION_COLUMNS.join(", ")}
       FROM slate_clarification_requests
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at, id`,
    projectId,
    userId,
  );
  content.writing.mutations = scalarRows(
    db,
    `SELECT ${WRITING_MUTATION_COLUMNS.join(", ")}
       FROM slate_writing_operation_mutations
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at, id`,
    projectId,
    userId,
  );
  content.writing.developerEvents = scalarRows(
    db,
    `SELECT ${DEVELOPER_EVENT_COLUMNS.join(", ")}
       FROM slate_continuity_developer_events
      WHERE project_id = ? AND user_id = ?
      ORDER BY sequence, id`,
    projectId,
    userId,
  ).map((row) => ({
    ...row,
    source_ids_json: JSON.stringify(
      stringArray(row.source_ids_json).filter((id) => capturedSourceIds.has(id)),
    ),
  }));
  content.studios = captureSlateStudios(
    db,
    userId,
    projectId,
    seriesId,
    sectionIds,
    content,
  );
  return content;
}

export function createSlateRecoverySnapshot(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  capturedAt = new Date(),
): SlateRecoverySnapshotV1 {
  const content = captureSlateSafetyContent(db, userId, projectId);
  const contentHash = sha256(canonicalSlateJson(content));
  const unsigned = {
    format: SLATE_RECOVERY_FORMAT,
    version: SLATE_RECOVERY_VERSION,
    capturedAt: capturedAt.toISOString(),
    projectId,
    seriesId: String(content.project.series_id),
    contentHash,
    content,
  };
  return {
    ...unsigned,
    snapshotHash: sha256(canonicalSlateJson(unsigned)),
  };
}

function parseRecoverySnapshot(value: unknown): SlateRecoverySnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Recovery generation is not an object.");
  }
  const candidate = value as Partial<SlateRecoverySnapshotV1>;
  if (candidate.format !== SLATE_RECOVERY_FORMAT || candidate.version !== 1) {
    throw new Error("Unsupported Slate recovery generation format.");
  }
  if (
    typeof candidate.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.capturedAt)) ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.seriesId !== "string" ||
    typeof candidate.contentHash !== "string" ||
    typeof candidate.snapshotHash !== "string" ||
    !candidate.content
  ) {
    throw new Error("Recovery generation metadata is incomplete.");
  }
  const contentHash = sha256(canonicalSlateJson(candidate.content));
  if (contentHash !== candidate.contentHash) {
    throw new Error("Recovery generation content checksum does not match.");
  }
  if (
    String(candidate.content.project?.id) !== candidate.projectId ||
    String(candidate.content.project?.series_id) !== candidate.seriesId ||
    String(candidate.content.series?.id) !== candidate.seriesId
  ) {
    throw new Error("Recovery generation project identity does not match its content.");
  }
  const { snapshotHash, ...unsigned } = candidate as SlateRecoverySnapshotV1;
  if (sha256(canonicalSlateJson(unsigned)) !== snapshotHash) {
    throw new Error("Recovery generation envelope checksum does not match.");
  }
  return candidate as SlateRecoverySnapshotV1;
}

export function verifySlateRecoverySnapshot(
  input: string | Buffer | SlateRecoverySnapshotV1,
): SlateRecoverySnapshotV1 {
  const parsed =
    typeof input === "string" || Buffer.isBuffer(input)
      ? JSON.parse(input.toString()) as unknown
      : input;
  return parseRecoverySnapshot(parsed);
}

function safeProjectDirectory(rootDirectory: string, projectId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(projectId)) {
    throw new Error("Slate project id cannot be used as a recovery path.");
  }
  const root = resolve(rootDirectory);
  const projectDirectory = resolve(root, projectId);
  if (projectDirectory !== root && !projectDirectory.startsWith(`${root}${sep}`)) {
    throw new Error("Slate recovery path escapes its configured root.");
  }
  return projectDirectory;
}

function recoveryFilename(snapshot: SlateRecoverySnapshotV1): string {
  const timestamp = snapshot.capturedAt.replace(/[-:.TZ]/g, "");
  return `${timestamp}-${snapshot.contentHash.slice(0, 16)}${RECOVERY_FILE_SUFFIX}`;
}

function ensureOwnerOnlyDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Slate recovery directory must be a real local directory.");
  }
  chmodSync(directory, 0o700);
}

function fsyncDirectory(directory: string): void {
  const fd = openSync(directory, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeSnapshotAtomically(
  directory: string,
  snapshot: SlateRecoverySnapshotV1,
  ownerOnly: boolean,
): string {
  if (ownerOnly) ensureOwnerOnlyDirectory(directory);
  else mkdirSync(directory, { recursive: true });
  const filename = recoveryFilename(snapshot);
  const finalPath = join(directory, filename);
  const temporaryPath = join(
    directory,
    `.${filename}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  const serialized = `${canonicalSlateJson(snapshot)}\n`;
  let fd: number | null = null;
  try {
    fd = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(fd, serialized, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    verifySlateRecoverySnapshot(readFileSync(temporaryPath));
    if (ownerOnly) chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, finalPath);
    fsyncDirectory(directory);
    return finalPath;
  } catch (error) {
    if (fd !== null) closeSync(fd);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function listSlateRecoveryGenerations(
  rootDirectory: string,
  projectId: string,
): SlateRecoveryGeneration[] {
  const directory = safeProjectDirectory(rootDirectory, projectId);
  if (!existsSync(directory)) return [];
  const generations: SlateRecoveryGeneration[] = [];
  for (const filename of readdirSync(directory).filter((name) => name.endsWith(RECOVERY_FILE_SUFFIX))) {
    const path = join(directory, filename);
    try {
      if (!lstatSync(path).isFile()) continue;
      const snapshot = verifySlateRecoverySnapshot(readFileSync(path));
      if (snapshot.projectId !== projectId) {
        throw new Error("Recovery generation belongs to a different project.");
      }
      if (!filename.includes(snapshot.contentHash.slice(0, 16))) {
        throw new Error("Recovery generation filename checksum does not match.");
      }
      generations.push({
        path,
        filename,
        capturedAt: snapshot.capturedAt,
        contentHash: snapshot.contentHash,
        status: "verified",
        snapshot,
        error: null,
      });
    } catch (error) {
      let capturedAt: string;
      try {
        capturedAt = statSync(path).mtime.toISOString();
      } catch {
        capturedAt = new Date(0).toISOString();
      }
      generations.push({
        path,
        filename,
        capturedAt,
        contentHash: null,
        status: "corrupt",
        snapshot: null,
        error: error instanceof Error ? error.message : "Recovery generation is unreadable.",
      });
    }
  }
  return generations.sort((left, right) => {
    const byTime = Date.parse(right.capturedAt) - Date.parse(left.capturedAt);
    return byTime || right.filename.localeCompare(left.filename);
  });
}

/**
 * Removes every local generation for one already-authorized project without
 * ever following a project-directory symlink. Callers must establish tenant
 * ownership before invoking this filesystem-only boundary.
 */
export function purgeSlateRecoveryProjectGenerations(
  rootDirectory: string,
  projectId: string,
): { path: string; removed: boolean } {
  const directory = safeProjectDirectory(rootDirectory, projectId);
  if (!existsSync(directory)) return { path: directory, removed: false };

  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    rmSync(directory, { force: true });
  } else {
    rmSync(directory, { force: true, recursive: true });
  }

  const root = resolve(rootDirectory);
  if (existsSync(root)) {
    const rootMetadata = lstatSync(root);
    if (rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink()) {
      fsyncDirectory(root);
    }
  }
  return { path: directory, removed: true };
}

export function newestVerifiedSlateRecovery(
  rootDirectory: string,
  projectId: string,
): SlateRecoveryGeneration | null {
  return listSlateRecoveryGenerations(rootDirectory, projectId)
    .find((generation) => generation.status === "verified") ?? null;
}

function bucketKey(date: Date, granularity: "hour" | "day" | "month"): string {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  if (granularity === "month") return `${year}-${month}`;
  const day = date.getUTCDate().toString().padStart(2, "0");
  if (granularity === "day") return `${year}-${month}-${day}`;
  const hour = date.getUTCHours().toString().padStart(2, "0");
  return `${year}-${month}-${day}T${hour}`;
}

export function selectSlateRecoveryRetention(
  generations: readonly SlateRecoveryGeneration[],
  policy: SlateRecoveryRetentionPolicy = DEFAULT_SLATE_RECOVERY_RETENTION,
): Set<string> {
  const verified = generations
    .filter((generation) => generation.status === "verified")
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
  const keep = new Set<string>();
  for (const generation of verified.slice(0, Math.max(0, policy.recent))) {
    keep.add(generation.path);
  }
  const selectBuckets = (granularity: "hour" | "day" | "month", limit: number) => {
    const seen = new Set<string>();
    for (const generation of verified) {
      if (seen.size >= Math.max(0, limit)) break;
      const key = bucketKey(new Date(generation.capturedAt), granularity);
      if (seen.has(key)) continue;
      seen.add(key);
      keep.add(generation.path);
    }
  };
  selectBuckets("hour", policy.hourly);
  selectBuckets("day", policy.daily);
  selectBuckets("month", policy.monthly);
  return keep;
}

export function pruneSlateRecoveryGenerations(
  rootDirectory: string,
  projectId: string,
  policy: SlateRecoveryRetentionPolicy = DEFAULT_SLATE_RECOVERY_RETENTION,
): string[] {
  const generations = listSlateRecoveryGenerations(rootDirectory, projectId);
  const keep = selectSlateRecoveryRetention(generations, policy);
  const removed: string[] = [];
  for (const generation of generations) {
    if (generation.status !== "verified" || keep.has(generation.path)) continue;
    rmSync(generation.path, { force: true });
    removed.push(generation.path);
  }
  return removed;
}

export function writeSlateRecoveryGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  rootDirectory: string,
  options: WriteSlateRecoveryOptions = {},
): SlateRecoveryWriteResult {
  const snapshot = createSlateRecoverySnapshot(
    db,
    userId,
    projectId,
    options.capturedAt ?? new Date(),
  );
  const existing = listSlateRecoveryGenerations(rootDirectory, projectId)
    .find(
      (generation) =>
        generation.status === "verified" && generation.contentHash === snapshot.contentHash,
    );
  if (existing?.snapshot) {
    return {
      created: false,
      path: existing.path,
      snapshot: existing.snapshot,
      prunedPaths: [],
      mirror: { status: options.mirrorDirectory ? "skipped" : "disabled", path: null, error: null },
    };
  }

  const localDirectory = safeProjectDirectory(rootDirectory, projectId);
  const path = writeSnapshotAtomically(localDirectory, snapshot, true);
  const prunedPaths = pruneSlateRecoveryGenerations(
    rootDirectory,
    projectId,
    options.retention ?? DEFAULT_SLATE_RECOVERY_RETENTION,
  );
  let mirror: SlateRecoveryMirrorResult = {
    status: "disabled",
    path: null,
    error: null,
  };
  if (options.mirrorDirectory) {
    try {
      const mirrorDirectory = safeProjectDirectory(options.mirrorDirectory, projectId);
      mirror = {
        status: "written",
        path: writeSnapshotAtomically(mirrorDirectory, snapshot, false),
        error: null,
      };
    } catch (error) {
      mirror = {
        status: "failed",
        path: null,
        error: error instanceof Error ? error.message : "Slate recovery mirror failed.",
      };
    }
  }
  return { created: true, path, snapshot, prunedPaths, mirror };
}

export function assertSafeSlateArchivePath(path: string): void {
  if (
    !path ||
    path.length > MAX_ARCHIVE_PATH_LENGTH ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    posix.normalize(path) !== path
  ) {
    throw new Error(`Unsafe Slate archive path: ${path || "(empty)"}`);
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > MAX_ARCHIVE_SEGMENT_LENGTH ||
        /[\u0000-\u001f\u007f:]/.test(segment) ||
        /[. ]$/.test(segment),
    )
  ) {
    throw new Error(`Unsafe Slate archive path: ${path}`);
  }
}

function archiveFile(path: string, mediaType: SlateArchiveFileManifestV1["mediaType"], value: unknown) {
  assertSafeSlateArchivePath(path);
  const content = typeof value === "string" ? value : `${canonicalSlateJson(value)}\n`;
  return {
    path,
    content,
    manifest: {
      path,
      mediaType,
      bytes: Buffer.byteLength(content, "utf8"),
      sha256: sha256(content),
    } satisfies SlateArchiveFileManifestV1,
  };
}

function markdownFallback(content: SlateSafetyContent): string {
  const title = typeof content.project.title === "string" ? content.project.title : "Untitled";
  const sections = content.sections
    .filter((section) => typeof section.prose === "string" && section.prose.length > 0)
    .map((section) => {
      const heading = typeof section.title === "string" && section.title ? section.title : "Untitled section";
      return `## ${heading}\n\n${String(section.prose)}`;
    });
  return [`# ${title}`, ...sections].join("\n\n").trimEnd() + "\n";
}

function portableActiveContinuityGeneration(
  content: SlateSafetyContent,
): number {
  const seriesGeneration = Number(
    content.series.continuity_active_generation ?? 0,
  );
  return Number.isSafeInteger(seriesGeneration) && seriesGeneration > 0
    ? seriesGeneration
    : Number(content.project.continuity_active_generation);
}

export function createSlateArchiveBundle(
  snapshot: SlateRecoverySnapshotV1,
  exportedAt = new Date(),
): SlateArchiveBundleV1 {
  verifySlateRecoverySnapshot(snapshot);
  const archiveVersion = snapshot.content.schemaVersion === 2
    ? SLATE_ARCHIVE_VERSION
    : SLATE_ARCHIVE_LEGACY_VERSION;
  const manuscriptPayload = snapshot.content.schemaVersion === 2
    ? {
        schemaVersion: 2,
        revisions: snapshot.content.revisions,
        versions: snapshot.content.versions,
        sections: snapshot.content.sections,
        sectionVersions: snapshot.content.sectionVersions,
        documents: snapshot.content.documents,
        annotations: snapshot.content.annotations,
        writing: snapshot.content.writing,
      }
    : {
        schemaVersion: 1,
        revisions: snapshot.content.revisions,
        versions: snapshot.content.versions,
        sections: snapshot.content.sections,
        sectionVersions: snapshot.content.sectionVersions,
      };
  const dataFiles = [
    archiveFile("data/project.json", "application/json", {
      schemaVersion: archiveVersion,
      series: snapshot.content.series,
      project: snapshot.content.project,
      ...(snapshot.content.schemaVersion === 2
        ? { studios: snapshot.content.studios }
        : {}),
    }),
    archiveFile("data/manuscript.json", "application/json", manuscriptPayload),
    archiveFile("data/continuity.json", "application/json", {
      schemaVersion: archiveVersion,
      ...snapshot.content.continuity,
    }),
    archiveFile("manuscript.md", "text/markdown", markdownFallback(snapshot.content)),
  ];
  const project = snapshot.content.project;
  const manifestBase = {
    format: SLATE_ARCHIVE_FORMAT,
    exportedAt: exportedAt.toISOString(),
    project: {
      id: String(project.id),
      title: String(project.title),
      seriesId: String(project.series_id),
    },
    continuity: {
      activeVersion: String(project.continuity_active_version),
      targetVersion: String(project.continuity_target_version),
      activeGeneration: portableActiveContinuityGeneration(snapshot.content),
    },
    contentHash: snapshot.contentHash,
    files: dataFiles.map((file) => file.manifest).sort((left, right) => left.path.localeCompare(right.path)),
  };
  const manifest: SlateArchiveManifest = archiveVersion === SLATE_ARCHIVE_VERSION
    ? { ...manifestBase, version: SLATE_ARCHIVE_VERSION }
    : { ...manifestBase, version: SLATE_ARCHIVE_LEGACY_VERSION };
  return {
    manifest,
    files: Object.fromEntries(dataFiles.map((file) => [file.path, file.content])),
  };
}

export function verifySlateArchiveBundle(bundle: SlateArchiveBundleV1): SlateArchiveBundleV1 {
  if (
    bundle.manifest.format !== SLATE_ARCHIVE_FORMAT ||
    (
      bundle.manifest.version !== SLATE_ARCHIVE_LEGACY_VERSION &&
      bundle.manifest.version !== SLATE_ARCHIVE_VERSION
    )
  ) {
    throw new Error("Unsupported Slate archive format.");
  }
  if (
    !Number.isFinite(Date.parse(bundle.manifest.exportedAt)) ||
    !/^[a-f0-9]{64}$/.test(bundle.manifest.contentHash)
  ) {
    throw new Error("Slate archive manifest metadata is invalid.");
  }
  const expectedPaths = new Set<string>();
  for (const file of bundle.manifest.files) {
    assertSafeSlateArchivePath(file.path);
    if (expectedPaths.has(file.path)) throw new Error(`Duplicate Slate archive path: ${file.path}`);
    if (
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error(`Slate archive manifest metadata is invalid for ${file.path}.`);
    }
    expectedPaths.add(file.path);
    const content = bundle.files[file.path];
    if (typeof content !== "string") throw new Error(`Slate archive is missing ${file.path}.`);
    if (Buffer.byteLength(content, "utf8") !== file.bytes || sha256(content) !== file.sha256) {
      throw new Error(`Slate archive checksum failed for ${file.path}.`);
    }
  }
  for (const path of Object.keys(bundle.files)) {
    assertSafeSlateArchivePath(path);
    if (!expectedPaths.has(path)) throw new Error(`Slate archive contains undeclared file ${path}.`);
  }
  const projectData = bundle.files["data/project.json"];
  const manuscriptData = bundle.files["data/manuscript.json"];
  const continuityData = bundle.files["data/continuity.json"];
  if (!projectData || !manuscriptData || !continuityData || !bundle.files["manuscript.md"]) {
    throw new Error("Slate archive is missing a required data file.");
  }
  const parsedProject = JSON.parse(projectData) as Pick<
    SlateSafetyContent,
    "series" | "project"
  > & Partial<Pick<SlateSafetyContentV2, "studios">> & {
    schemaVersion: number;
  };
  const parsedManuscript = JSON.parse(manuscriptData) as Pick<
    SlateSafetyContentV1,
    "revisions" | "versions" | "sections" | "sectionVersions"
  > & Partial<Pick<SlateSafetyContentV2, "documents" | "annotations" | "writing">> & {
    schemaVersion: number;
  };
  const parsedContinuity = JSON.parse(continuityData) as SlateSafetyContentV1["continuity"] & {
    schemaVersion: number;
  };
  const archiveVersion = bundle.manifest.version;
  if (
    parsedProject.schemaVersion !== archiveVersion ||
    parsedManuscript.schemaVersion !== archiveVersion ||
    parsedContinuity.schemaVersion !== archiveVersion
  ) {
    throw new Error("Unsupported Slate archive data schema.");
  }
  const { schemaVersion: _projectSchemaVersion, ...projectContent } = parsedProject;
  const { schemaVersion: _manuscriptSchemaVersion, ...manuscriptContent } = parsedManuscript;
  const { schemaVersion: _continuitySchemaVersion, ...continuityContent } = parsedContinuity;
  const contentForHash: SlateSafetyContent | Omit<SlateSafetyContentV2, "studios"> =
    archiveVersion === SLATE_ARCHIVE_VERSION
      ? {
        schemaVersion: 2,
        ...projectContent,
        ...manuscriptContent,
        documents: parsedManuscript.documents ?? [],
        annotations: parsedManuscript.annotations ?? [],
        writing: parsedManuscript.writing ?? {
          operations: [],
          clarifications: [],
          mutations: [],
          developerEvents: [],
        },
        continuity: continuityContent,
      }
      : {
        schemaVersion: 1,
        ...projectContent,
        ...manuscriptContent,
        continuity: continuityContent,
      };
  if (sha256(canonicalSlateJson(contentForHash)) !== bundle.manifest.contentHash) {
    throw new Error("Slate archive authoritative content checksum does not match.");
  }
  const content: SlateSafetyContent =
    archiveVersion === SLATE_ARCHIVE_VERSION
      ? {
          ...(contentForHash as Omit<SlateSafetyContentV2, "studios">),
          studios: parsedProject.studios ?? emptySlateStudioContent(),
        }
      : contentForHash as SlateSafetyContentV1;
  if (
    bundle.manifest.project.id !== String(content.project.id) ||
    bundle.manifest.project.title !== String(content.project.title) ||
    bundle.manifest.project.seriesId !== String(content.project.series_id) ||
    bundle.manifest.continuity.activeVersion !== String(content.project.continuity_active_version) ||
    bundle.manifest.continuity.targetVersion !== String(content.project.continuity_target_version) ||
    bundle.manifest.continuity.activeGeneration !==
      portableActiveContinuityGeneration(content)
  ) {
    throw new Error("Slate archive manifest does not match its project data.");
  }
  return bundle;
}

export function serializeSlateArchiveManifest(manifest: SlateArchiveManifest): string {
  return `${canonicalSlateJson(manifest)}\n`;
}

export function slateRecoveryProjectDirectory(rootDirectory: string, projectId: string): string {
  return safeProjectDirectory(rootDirectory, projectId);
}

export function isSlateRecoveryFilename(filename: string): boolean {
  return basename(filename) === filename && filename.endsWith(RECOVERY_FILE_SUFFIX);
}
