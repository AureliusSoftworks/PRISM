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

export const SLATE_RECOVERY_FORMAT = "prism-slate-recovery-v1" as const;
export const SLATE_ARCHIVE_FORMAT = "prism-slate-project-v1" as const;
export const SLATE_RECOVERY_VERSION = 1 as const;
export const SLATE_ARCHIVE_VERSION = 1 as const;

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

export interface SlateRecoverySnapshotV1 {
  format: typeof SLATE_RECOVERY_FORMAT;
  version: typeof SLATE_RECOVERY_VERSION;
  capturedAt: string;
  projectId: string;
  seriesId: string;
  contentHash: string;
  snapshotHash: string;
  content: SlateSafetyContentV1;
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

export interface SlateArchiveManifestV1 {
  format: typeof SLATE_ARCHIVE_FORMAT;
  version: typeof SLATE_ARCHIVE_VERSION;
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

/** A dependency-free bundle ready for a future ZIP transport adapter. */
export interface SlateArchiveBundleV1 {
  manifest: SlateArchiveManifestV1;
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

const SERIES_COLUMNS = ["id", "title", "description", "created_at", "updated_at"] as const;

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
      "direction", "prose", "locked", "status", "content_hash", "created_at",
    ],
    orderBy: "section_id, revision, id",
  },
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
      "producer_versions_json", "supersedes_source_id", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "entities",
    table: "slate_continuity_entities",
    columns: [
      "id", "series_id", "kind", "canonical_name", "description", "locked",
      "anchors_json", "source_id", "producer_versions_json", "created_at", "updated_at",
    ],
    orderBy: "canonical_name, id",
  },
  {
    output: "aliases",
    table: "slate_continuity_aliases",
    columns: [
      "id", "series_id", "entity_id", "alias", "normalized_alias", "source_id", "created_at",
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
      "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "events",
    table: "slate_continuity_events",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "title", "description",
      "chronology_key", "participant_entity_ids_json", "location_entity_id", "anchors_json",
      "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "chronology_key, created_at, id",
  },
  {
    output: "relationships",
    table: "slate_continuity_relationships",
    columns: [
      "id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "knowledge",
    table: "slate_continuity_knowledge",
    columns: [
      "id", "series_id", "character_entity_id", "claim_id", "learned_event_id", "status",
      "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    output: "threads",
    table: "slate_continuity_threads",
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "label", "status",
      "due_section_id", "anchors_json", "source_id", "producer_versions_json",
      "created_at", "updated_at",
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
      "created_at", "resolved_at",
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
    generations: continuityRows(
      db,
      "generations",
      "user_id = ? AND project_id = ?",
      userId,
      projectId,
    ),
  };
}

function onlyRow(rows: SlateSafetyRow[], label: string): SlateSafetyRow {
  const row = rows[0];
  if (!row) throw new Error(label);
  return row;
}

export function captureSlateSafetyContent(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSafetyContentV1 {
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

  const content: SlateSafetyContentV1 = {
    schemaVersion: 1,
    series,
    project,
    revisions: [],
    versions: [],
    sections: [],
    sectionVersions: [],
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

function markdownFallback(content: SlateSafetyContentV1): string {
  const title = typeof content.project.title === "string" ? content.project.title : "Untitled";
  const sections = content.sections
    .filter((section) => typeof section.prose === "string" && section.prose.length > 0)
    .map((section) => {
      const heading = typeof section.title === "string" && section.title ? section.title : "Untitled section";
      return `## ${heading}\n\n${String(section.prose)}`;
    });
  return [`# ${title}`, ...sections].join("\n\n").trimEnd() + "\n";
}

export function createSlateArchiveBundle(
  snapshot: SlateRecoverySnapshotV1,
  exportedAt = new Date(),
): SlateArchiveBundleV1 {
  verifySlateRecoverySnapshot(snapshot);
  const dataFiles = [
    archiveFile("data/project.json", "application/json", {
      schemaVersion: 1,
      series: snapshot.content.series,
      project: snapshot.content.project,
    }),
    archiveFile("data/manuscript.json", "application/json", {
      schemaVersion: 1,
      revisions: snapshot.content.revisions,
      versions: snapshot.content.versions,
      sections: snapshot.content.sections,
      sectionVersions: snapshot.content.sectionVersions,
    }),
    archiveFile("data/continuity.json", "application/json", {
      schemaVersion: 1,
      ...snapshot.content.continuity,
    }),
    archiveFile("manuscript.md", "text/markdown", markdownFallback(snapshot.content)),
  ];
  const project = snapshot.content.project;
  const manifest: SlateArchiveManifestV1 = {
    format: SLATE_ARCHIVE_FORMAT,
    version: SLATE_ARCHIVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    project: {
      id: String(project.id),
      title: String(project.title),
      seriesId: String(project.series_id),
    },
    continuity: {
      activeVersion: String(project.continuity_active_version),
      targetVersion: String(project.continuity_target_version),
      activeGeneration: Number(project.continuity_active_generation),
    },
    contentHash: snapshot.contentHash,
    files: dataFiles.map((file) => file.manifest).sort((left, right) => left.path.localeCompare(right.path)),
  };
  return {
    manifest,
    files: Object.fromEntries(dataFiles.map((file) => [file.path, file.content])),
  };
}

export function verifySlateArchiveBundle(bundle: SlateArchiveBundleV1): SlateArchiveBundleV1 {
  if (
    bundle.manifest.format !== SLATE_ARCHIVE_FORMAT ||
    bundle.manifest.version !== SLATE_ARCHIVE_VERSION
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
    SlateSafetyContentV1,
    "series" | "project"
  > & { schemaVersion: number };
  const parsedManuscript = JSON.parse(manuscriptData) as Pick<
    SlateSafetyContentV1,
    "revisions" | "versions" | "sections" | "sectionVersions"
  > & { schemaVersion: number };
  const parsedContinuity = JSON.parse(continuityData) as SlateSafetyContentV1["continuity"] & {
    schemaVersion: number;
  };
  if (
    parsedProject.schemaVersion !== 1 ||
    parsedManuscript.schemaVersion !== 1 ||
    parsedContinuity.schemaVersion !== 1
  ) {
    throw new Error("Unsupported Slate archive data schema.");
  }
  const { schemaVersion: _projectSchemaVersion, ...projectContent } = parsedProject;
  const { schemaVersion: _manuscriptSchemaVersion, ...manuscriptContent } = parsedManuscript;
  const { schemaVersion: _continuitySchemaVersion, ...continuityContent } = parsedContinuity;
  const content = {
    schemaVersion: 1 as const,
    ...projectContent,
    ...manuscriptContent,
    continuity: continuityContent,
  };
  if (sha256(canonicalSlateJson(content)) !== bundle.manifest.contentHash) {
    throw new Error("Slate archive authoritative content checksum does not match.");
  }
  if (
    bundle.manifest.project.id !== String(content.project.id) ||
    bundle.manifest.project.title !== String(content.project.title) ||
    bundle.manifest.project.seriesId !== String(content.project.series_id) ||
    bundle.manifest.continuity.activeVersion !== String(content.project.continuity_active_version) ||
    bundle.manifest.continuity.targetVersion !== String(content.project.continuity_target_version) ||
    bundle.manifest.continuity.activeGeneration !== Number(content.project.continuity_active_generation)
  ) {
    throw new Error("Slate archive manifest does not match its project data.");
  }
  return bundle;
}

export function serializeSlateArchiveManifest(manifest: SlateArchiveManifestV1): string {
  return `${canonicalSlateJson(manifest)}\n`;
}

export function slateRecoveryProjectDirectory(rootDirectory: string, projectId: string): string {
  return safeProjectDirectory(rootDirectory, projectId);
}

export function isSlateRecoveryFilename(filename: string): boolean {
  return basename(filename) === filename && filename.endsWith(RECOVERY_FILE_SUFFIX);
}
