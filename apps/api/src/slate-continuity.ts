import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CONTINUITY_FRAMEWORK,
  currentContinuityProducerVersions,
  transformSlateLockedRangesForTextEdit,
  type SlateBookSummary,
  type SlateContinuityClaim,
  type SlateContinuityConcernStatus,
  type SlateContinuityEntity,
  type SlateContinuityEntityKind,
  type SlateContinuityEpistemicStatus,
  type SlateContinuityScope,
  type SlateContinuitySource,
  type SlateContinuitySourceAnchor,
  type SlateContinuitySourceKind,
  type SlateContinuityStatus,
  type SlateLockedRange,
  type SlateManuscriptPageResponse,
  type SlateSectionDetail,
  type SlateSectionKind,
  type SlateSectionSaveRequest,
  type SlateSectionStatus,
  type SlateSectionSummary,
  type SlateSeriesDetail,
  type SlateSeriesSummary,
  type SlateStructureItem,
} from "@localai/shared";
import { randomId } from "./security.ts";

const SERIES_TITLE_MAX = 180;
const SERIES_DESCRIPTION_MAX = 8_000;
const SECTION_TITLE_MAX = 240;
const SECTION_SUMMARY_MAX = 8_000;
const SECTION_DIRECTION_MAX = 8_000;
const SECTION_PROSE_MAX = 2_000_000;
const SECTION_PAGE_LIMIT_MAX = 100;

interface SeriesRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  book_count?: number;
}

interface ProjectRow {
  id: string;
  user_id: string;
  series_id: string;
  book_ordinal: number;
  title: string;
  phase: string;
  manuscript: string;
  structure_json: string;
  locked_ranges_json: string;
  created_at: string;
  updated_at: string;
  continuity_active_version: string;
  continuity_target_version: string;
  continuity_active_generation: number;
  continuity_previous_generation: number | null;
  continuity_upgrade_status: string;
  continuity_last_success_at: string | null;
}

interface SectionRow {
  id: string;
  project_id: string;
  series_id: string;
  user_id: string;
  parent_section_id: string | null;
  structure_item_id: string | null;
  kind: string;
  ordinal: number;
  title: string;
  summary: string;
  direction: string;
  prose: string;
  locked_ranges_json: string;
  locked: number;
  status: string;
  revision: number;
  content_hash: string;
  last_mutation_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string | null;
  section_id: string | null;
  scope_kind: string;
  kind: string;
  source_revision: number;
  content_hash: string;
  authority: string;
  provider: string | null;
  model: string | null;
  producer_versions_json: string;
  supersedes_source_id: string | null;
  created_at: string;
}

interface EntityRow {
  id: string;
  user_id: string;
  series_id: string;
  kind: string;
  canonical_name: string;
  description: string;
  locked: number;
  anchors_json: string;
  source_id: string | null;
  producer_versions_json: string;
  created_at: string;
  updated_at: string;
}

interface ClaimRow {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string | null;
  section_id: string | null;
  scope_kind: string;
  subject_entity_id: string | null;
  predicate: string;
  object_entity_id: string | null;
  value: string;
  epistemic_status: string;
  perspective_entity_id: string | null;
  confidence: number;
  anchors_json: string;
  source_id: string;
  supersedes_claim_id: string | null;
  producer_versions_json: string;
  created_at: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) {
    throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  }
  return normalized;
}

function exactText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  if (value.length > max) {
    throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  }
  return value;
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectRow {
  const row = db
    .prepare("SELECT * FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

function seriesRow(db: DatabaseSync, userId: string, seriesId: string): SeriesRow {
  const row = db
    .prepare("SELECT * FROM slate_series WHERE id = ? AND user_id = ?")
    .get(seriesId, userId) as SeriesRow | undefined;
  if (!row) throw new Error("Slate series not found.");
  return row;
}

function sectionKind(value: unknown): SlateSectionKind {
  if (value === "act" || value === "chapter" || value === "scene") return value;
  return "imported";
}

function sectionStatus(value: unknown): SlateSectionStatus {
  if (
    value === "drafting" ||
    value === "drafted" ||
    value === "revising" ||
    value === "complete"
  ) {
    return value;
  }
  return "planned";
}

function projectPhase(value: string): "shape" | "draft" | "refine" {
  if (value === "draft" || value === "refine") return value;
  return "shape";
}

function normalizeLockedRanges(value: unknown, proseLength: number): SlateLockedRange[] {
  if (!Array.isArray(value)) throw new Error("Section locks must be an array.");
  const seen = new Set<string>();
  const ranges = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Section lock ${index + 1} is invalid.`);
    }
    const item = candidate as Record<string, unknown>;
    const id = text(item.id, `Section lock ${index + 1} id`, 120, true);
    if (seen.has(id)) throw new Error(`Section lock id "${id}" is duplicated.`);
    seen.add(id);
    const start = Number.isInteger(item.start) ? Number(item.start) : -1;
    const end = Number.isInteger(item.end) ? Number(item.end) : -1;
    if (start < 0 || end <= start || end > proseLength) {
      throw new Error(`Section lock ${index + 1} is outside the prose.`);
    }
    return {
      id,
      start,
      end,
      label: text(item.label, `Section lock ${index + 1} label`, 240),
    };
  });
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index]!.start < ranges[index - 1]!.end) {
      throw new Error("Section locks cannot overlap.");
    }
  }
  return ranges;
}

function storedLockedRanges(row: SectionRow): SlateLockedRange[] {
  try {
    return normalizeLockedRanges(parseJson(row.locked_ranges_json, []), row.prose.length);
  } catch {
    return [];
  }
}

function sectionFromRow(row: SectionRow): SlateSectionDetail {
  return {
    id: row.id,
    projectId: row.project_id,
    seriesId: row.series_id,
    parentSectionId: row.parent_section_id,
    structureItemId: row.structure_item_id,
    kind: sectionKind(row.kind),
    ordinal: row.ordinal,
    title: row.title,
    summary: row.summary,
    direction: row.direction,
    locked: row.locked === 1,
    lockedRanges: storedLockedRanges(row),
    status: sectionStatus(row.status),
    revision: row.revision,
    proseLength: row.prose.length,
    contentHash: row.content_hash,
    prose: row.prose,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summaryFromSection(row: SectionRow): SlateSectionSummary {
  const { prose: _prose, lockedRanges: _lockedRanges, ...summary } =
    sectionFromRow(row);
  return summary;
}

interface SlateSectionHierarchyProjection {
  rows: SectionRow[];
  changed: boolean;
}

/**
 * Slate's generated plan is intentionally flat. Persisted sections carry the
 * inferred hierarchy so bounded readers and exporters do not have to guess:
 * an act opens a new act, a chapter belongs to that act, and a scene belongs
 * to the nearest open chapter or act. Imported material is a root boundary.
 */
function inferSlateSectionHierarchy(
  rows: readonly SectionRow[],
): SlateSectionHierarchyProjection {
  let activeActId: string | null = null;
  let activeChapterId: string | null = null;
  let changed = false;
  const projected = rows.map((row): SectionRow => {
    const kind = sectionKind(row.kind);
    let parentSectionId: string | null;
    if (kind === "act") {
      parentSectionId = null;
      activeActId = row.id;
      activeChapterId = null;
    } else if (kind === "chapter") {
      parentSectionId = activeActId;
      activeChapterId = row.id;
    } else if (kind === "scene") {
      parentSectionId = activeChapterId ?? activeActId;
    } else {
      parentSectionId = null;
      activeActId = null;
      activeChapterId = null;
    }
    if (row.parent_section_id === parentSectionId) return row;
    changed = true;
    return { ...row, parent_section_id: parentSectionId };
  });
  return { rows: projected, changed };
}

function persistSlateSectionHierarchyWithinTransaction(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  original: readonly SectionRow[],
  projection: SlateSectionHierarchyProjection,
): void {
  if (!projection.changed) return;
  const update = db.prepare(
    `UPDATE slate_sections
        SET parent_section_id = ?
      WHERE id = ? AND project_id = ? AND user_id = ?`,
  );
  projection.rows.forEach((row, index) => {
    if (row.parent_section_id === original[index]!.parent_section_id) return;
    const result = update.run(row.parent_section_id, row.id, projectId, userId);
    if (result.changes !== 1) {
      throw new Error("Slate section hierarchy changed during persistence.");
    }
  });
}

function orderedSlateSectionRows(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SectionRow[] {
  return db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as SectionRow[];
}

function seriesFromRow(row: SeriesRow): SlateSeriesSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    bookCount: Number(row.book_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSlateSeries(
  db: DatabaseSync,
  userId: string,
  input: { title: unknown; description?: unknown },
): SlateSeriesDetail {
  const id = randomId();
  const now = new Date().toISOString();
  const title = text(input.title, "Series title", SERIES_TITLE_MAX, true);
  const description = text(
    input.description,
    "Series description",
    SERIES_DESCRIPTION_MAX,
  );
  db.prepare(
    `INSERT INTO slate_series
      (id, user_id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, title, description, now, now);
  return getSlateSeries(db, userId, id);
}

export function listSlateSeries(
  db: DatabaseSync,
  userId: string,
): SlateSeriesSummary[] {
  return (
    db
      .prepare(
        `SELECT series.*, COUNT(projects.id) AS book_count
           FROM slate_series series
           LEFT JOIN slate_projects projects
             ON projects.series_id = series.id AND projects.user_id = series.user_id
          WHERE series.user_id = ?
          GROUP BY series.id
          ORDER BY series.updated_at DESC, series.created_at DESC`,
      )
      .all(userId) as unknown as SeriesRow[]
  ).map(seriesFromRow);
}

export function getSlateSeries(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
): SlateSeriesDetail {
  const row = seriesRow(db, userId, seriesId);
  const books = (
    db
      .prepare(
        `SELECT projects.*,
                (SELECT COUNT(*) FROM slate_sections sections
                  WHERE sections.project_id = projects.id
                    AND sections.user_id = projects.user_id) AS section_count
           FROM slate_projects projects
          WHERE projects.series_id = ? AND projects.user_id = ?
          ORDER BY projects.book_ordinal ASC, projects.created_at ASC`,
      )
      .all(seriesId, userId) as unknown as Array<
      ProjectRow & { section_count: number }
    >
  ).map(
    (project): SlateBookSummary => ({
      projectId: project.id,
      seriesId: project.series_id,
      ordinal: project.book_ordinal,
      title: project.title,
      phase: projectPhase(project.phase),
      sectionCount: Number(project.section_count ?? 0),
      manuscriptLength: project.manuscript.length,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    }),
  );
  return { ...seriesFromRow({ ...row, book_count: books.length }), books };
}

/** Called inside the project creation transaction. */
export function resolveSlateSeriesPlacementForNewProject(
  db: DatabaseSync,
  userId: string,
  projectTitle: string,
  requestedSeriesId?: unknown,
): { seriesId: string; ordinal: number } {
  let seriesId: string;
  if (typeof requestedSeriesId === "string" && requestedSeriesId.trim()) {
    seriesId = seriesRow(db, userId, requestedSeriesId.trim()).id;
  } else {
    seriesId = randomId();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO slate_series
        (id, user_id, title, description, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?)`,
    ).run(seriesId, userId, projectTitle, now, now);
  }
  const ordinalRow = db
    .prepare(
      `SELECT COALESCE(MAX(book_ordinal), -1) + 1 AS next_ordinal
         FROM slate_projects
        WHERE user_id = ? AND series_id = ?`,
    )
    .get(userId, seriesId) as { next_ordinal: number };
  return { seriesId, ordinal: Number(ordinalRow.next_ordinal ?? 0) };
}

function structureItems(project: ProjectRow): SlateStructureItem[] {
  const value = parseJson<unknown>(project.structure_json, []);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SlateStructureItem =>
      !!item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { title?: unknown }).title === "string",
  );
}

function insertSourceWithinTransaction(
  db: DatabaseSync,
  input: {
    userId: string;
    seriesId: string;
    projectId: string | null;
    sectionId: string | null;
    scopeKind: "series" | "book" | "section";
    kind: SlateContinuitySourceKind;
    sourceRevision: number;
    content: string;
    authority: "human" | "ai" | "procedural";
    provider?: "local" | "openai" | "anthropic" | null;
    model?: string | null;
  },
): SourceRow {
  seriesRow(db, input.userId, input.seriesId);
  if (input.projectId) projectRow(db, input.userId, input.projectId);
  const previous = input.sectionId
    ? (db
        .prepare(
          `SELECT id FROM slate_continuity_sources
            WHERE user_id = ? AND section_id = ?
            ORDER BY source_revision DESC, created_at DESC
            LIMIT 1`,
        )
        .get(input.userId, input.sectionId) as { id: string } | undefined)
    : undefined;
  const id = randomId();
  const createdAt = new Date().toISOString();
  const producerVersions = currentContinuityProducerVersions();
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority, provider, model,
       producer_versions_json, supersedes_source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.seriesId,
    input.projectId,
    input.sectionId,
    input.scopeKind,
    input.kind,
    input.sourceRevision,
    input.content,
    sha256(input.content),
    input.authority,
    input.provider ?? null,
    input.model ?? null,
    JSON.stringify(producerVersions),
    previous?.id ?? null,
    createdAt,
  );
  return db
    .prepare("SELECT * FROM slate_continuity_sources WHERE id = ?")
    .get(id) as unknown as SourceRow;
}

function sourceFromRow(row: SourceRow): SlateContinuitySource {
  return {
    id: row.id,
    scope: {
      kind:
        row.scope_kind === "series" || row.scope_kind === "section"
          ? row.scope_kind
          : "book",
      seriesId: row.series_id,
      projectId: row.project_id,
      sectionId: row.section_id,
    },
    kind: row.kind as SlateContinuitySourceKind,
    sourceRevision: row.source_revision,
    contentHash: row.content_hash,
    supersedesSourceId: row.supersedes_source_id,
    provenance: {
      authority:
        row.authority === "ai" || row.authority === "procedural"
          ? row.authority
          : "human",
      provider:
        row.provider === "local" ||
        row.provider === "openai" ||
        row.provider === "anthropic"
          ? row.provider
          : null,
      model: row.model,
      producerVersions: parseJson(
        row.producer_versions_json,
        currentContinuityProducerVersions(),
      ),
      createdAt: row.created_at,
    },
  };
}

export function createSlateContinuitySource(
  db: DatabaseSync,
  input: Parameters<typeof insertSourceWithinTransaction>[1],
): SlateContinuitySource {
  return sourceFromRow(insertSourceWithinTransaction(db, input));
}

export class SlateSectionRevisionConflictError extends Error {
  readonly code = "slate_section_revision_conflict";
  readonly sectionId: string;
  readonly currentRevision: number;
  readonly currentContentHash: string;

  constructor(
    sectionId: string,
    currentRevision: number,
    currentContentHash: string,
  ) {
    super("This section changed after the edit began. Reopen it before saving.");
    this.name = "SlateSectionRevisionConflictError";
    this.sectionId = sectionId;
    this.currentRevision = currentRevision;
    this.currentContentHash = currentContentHash;
  }
}

export type SlateSectionAiWriteConflictReason =
  | "changed"
  | "contains_prose"
  | "locked"
  | "structure_changed";

/**
 * A recoverable refusal to let an AI write replace newer writer-owned state.
 * The section coordinates let HTTP clients reopen or compare the authoritative
 * copy without accepting the generated prose.
 */
export class SlateSectionAiWriteConflictError extends Error {
  readonly code = "slate_section_ai_write_conflict";
  readonly sectionId: string;
  readonly currentRevision: number;
  readonly currentContentHash: string;
  readonly reason: SlateSectionAiWriteConflictReason;

  constructor(
    sectionId: string,
    currentRevision: number,
    currentContentHash: string,
    reason: SlateSectionAiWriteConflictReason,
  ) {
    const message =
      reason === "locked"
        ? "This section contains material the writer locked. Slate left it untouched."
        : reason === "contains_prose"
          ? "This planned section already contains writer prose. Use Refine so Slate proposes changes instead of replacing it."
          : reason === "structure_changed"
            ? "The section plan changed while Slate was drafting. The newer writer direction was kept."
            : "This section changed while Slate was drafting. The newer writer edits were kept.";
    super(message);
    this.name = "SlateSectionAiWriteConflictError";
    this.sectionId = sectionId;
    this.currentRevision = currentRevision;
    this.currentContentHash = currentContentHash;
    this.reason = reason;
  }
}

export class SlateSectionMigrationPendingError extends Error {
  constructor() {
    super("Resolve the current Slate revision proposal before section migration.");
    this.name = "SlateSectionMigrationPendingError";
  }
}

export function ensureSlateProjectSections(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSectionSummary[] {
  const existing = orderedSlateSectionRows(db, userId, projectId);
  const existingHierarchy = inferSlateSectionHierarchy(existing);
  if (existing.length > 0 && !existingHierarchy.changed) {
    return existing.map(summaryFromSection);
  }
  if (existing.length > 0) {
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const current = orderedSlateSectionRows(db, userId, projectId);
      const currentHierarchy = inferSlateSectionHierarchy(current);
      persistSlateSectionHierarchyWithinTransaction(
        db,
        userId,
        projectId,
        current,
        currentHierarchy,
      );
      db.exec("COMMIT");
      return currentHierarchy.rows.map(summaryFromSection);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const project = projectRow(db, userId, projectId);
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS count FROM slate_revisions
        WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
    )
    .get(projectId, userId) as { count: number };
  if (Number(pending.count) > 0) throw new SlateSectionMigrationPendingError();

  const now = new Date().toISOString();
  const originalHash = sha256(project.manuscript);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const raced = db
      .prepare(
        "SELECT COUNT(*) AS count FROM slate_sections WHERE project_id = ? AND user_id = ?",
      )
      .get(projectId, userId) as { count: number };
    if (Number(raced.count) === 0) {
      db.prepare(
        `INSERT INTO slate_versions
          (id, project_id, user_id, reason, structure_json, manuscript, created_at)
         VALUES (?, ?, ?, 'Before long-form section migration', ?, ?, ?)`,
      ).run(
        randomId(),
        projectId,
        userId,
        project.structure_json,
        project.manuscript,
        now,
      );

      if (project.manuscript.length > 0) {
        const sectionId = randomId();
        db.prepare(
          `INSERT INTO slate_sections
            (id, project_id, series_id, user_id, parent_section_id,
             structure_item_id, kind, ordinal, title, summary, direction, prose,
             locked_ranges_json, locked, status, revision, content_hash,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, NULL, 'imported', 0,
                   'Imported manuscript', '', '', ?, ?, 0, 'drafted', 0, ?, ?, ?)`,
        ).run(
          sectionId,
          projectId,
          project.series_id,
          userId,
          project.manuscript,
          project.locked_ranges_json,
          originalHash,
          now,
          now,
        );
        const source = insertSourceWithinTransaction(db, {
          userId,
          seriesId: project.series_id,
          projectId,
          sectionId,
          scopeKind: "section",
          kind: "import",
          sourceRevision: 0,
          content: project.manuscript,
          authority: "human",
        });
        queueContinuityExtraction(db, {
          userId,
          seriesId: project.series_id,
          projectId,
          sectionId,
          sourceId: source.id,
          sourceRevision: 0,
          contentHash: originalHash,
          now,
        });
      } else {
        const structure = structureItems(project);
        const seeds = structure.length > 0
          ? structure
          : [
              {
                id: randomId(8),
                kind: "scene" as const,
                title: "Opening",
                summary: "",
                direction: "",
                status: "planned" as const,
                locked: false,
              },
            ];
        const insert = db.prepare(
          `INSERT INTO slate_sections
            (id, project_id, series_id, user_id, parent_section_id,
             structure_item_id, kind, ordinal, title, summary, direction, prose,
             locked_ranges_json, locked, status, revision, content_hash,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, 0, ?, ?, ?)`,
        );
        seeds.forEach((item, ordinal) => {
          insert.run(
            randomId(),
            projectId,
            project.series_id,
            userId,
            item.id,
            item.kind,
            ordinal,
            item.title,
            item.summary,
            item.direction,
            item.locked ? 1 : 0,
            item.status === "drafted" ? "drafted" : "planned",
            sha256(""),
            now,
            now,
          );
        });
      }
      db.prepare(
        `INSERT INTO slate_manuscript_state
          (project_id, user_id, storage_version, structure_revision,
           original_manuscript_hash, migrated_at, updated_at)
         VALUES (?, ?, 2, 0, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           storage_version = 2,
           original_manuscript_hash = excluded.original_manuscript_hash,
           migrated_at = excluded.migrated_at,
           updated_at = excluded.updated_at`,
      ).run(projectId, userId, originalHash, now, now);
    }
    const migratedRows = orderedSlateSectionRows(db, userId, projectId);
    persistSlateSectionHierarchyWithinTransaction(
      db,
      userId,
      projectId,
      migratedRows,
      inferSlateSectionHierarchy(migratedRows),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return (
    db
      .prepare(
        `SELECT * FROM slate_sections
          WHERE project_id = ? AND user_id = ?
          ORDER BY ordinal ASC`,
      )
      .all(projectId, userId) as unknown as SectionRow[]
  ).map(summaryFromSection);
}

export function listSlateProjectSections(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSectionSummary[] {
  projectRow(db, userId, projectId);
  return ensureSlateProjectSections(db, userId, projectId);
}

export function getSlateProjectSection(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateSectionDetail {
  ensureSlateProjectSections(db, userId, projectId);
  const row = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(sectionId, projectId, userId) as SectionRow | undefined;
  if (!row) throw new Error("Slate section not found.");
  return sectionFromRow(row);
}

function legacyProjection(db: DatabaseSync, userId: string, projectId: string): string {
  const rows = db
    .prepare(
      `SELECT kind, title, prose FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as Array<{
      kind: string;
      title: string;
      prose: string;
    }>;
  return rows
    .filter((row) => row.prose.trim().length > 0)
    .map((row) =>
      row.kind === "imported"
        ? row.prose
        : `${row.title}\n\n${row.prose}`,
    )
    .join("\n\n\n");
}

export interface SlateSectionProjectionSpan {
  sectionId: string;
  structureItemId: string | null;
  kind: SlateSectionKind;
  title: string;
  representationStart: number;
  bodyStart: number;
  bodyEnd: number;
  representationEnd: number;
}

export function slateSectionProjectionSpans(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSectionProjectionSpan[] {
  ensureSlateProjectSections(db, userId, projectId);
  const rows = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as SectionRow[];
  const spans: SlateSectionProjectionSpan[] = [];
  let cursor = 0;
  for (const row of rows) {
    if (!row.prose.trim()) continue;
    if (spans.length > 0) cursor += 3;
    const representationStart = cursor;
    const titlePrefixLength = row.kind === "imported" ? 0 : row.title.length + 2;
    const bodyStart = representationStart + titlePrefixLength;
    const bodyEnd = bodyStart + row.prose.length;
    const representationEnd = bodyEnd;
    spans.push({
      sectionId: row.id,
      structureItemId: row.structure_item_id,
      kind: sectionKind(row.kind),
      title: row.title,
      representationStart,
      bodyStart,
      bodyEnd,
      representationEnd,
    });
    cursor = representationEnd;
  }
  return spans;
}

export function assertSlateRevisionTargetUnlocked(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  target: {
    structureItemId: string | null;
    start: number | null;
    end: number | null;
  },
): void {
  const spans = slateSectionProjectionSpans(db, userId, projectId);
  let candidates: Array<{
    span: SlateSectionProjectionSpan;
    localStart: number;
    localEnd: number;
  }>;
  if (target.structureItemId) {
    const span = spans.find(
      (candidate) => candidate.structureItemId === target.structureItemId,
    );
    if (!span) throw new Error("Slate section not found.");
    candidates = [
      { span, localStart: 0, localEnd: span.bodyEnd - span.bodyStart },
    ];
  } else if (target.start !== null && target.end !== null) {
    const span = spans.find(
      (candidate) =>
        target.start! >= candidate.bodyStart && target.end! <= candidate.bodyEnd,
    );
    if (!span) {
      throw new Error("Select prose within one section before requesting a revision.");
    }
    candidates = [
      {
        span,
        localStart: target.start - span.bodyStart,
        localEnd: target.end - span.bodyStart,
      },
    ];
  } else {
    candidates = spans.map((span) => ({
      span,
      localStart: 0,
      localEnd: span.bodyEnd - span.bodyStart,
    }));
  }
  for (const candidate of candidates) {
    const row = db
      .prepare(
        `SELECT * FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(candidate.span.sectionId, projectId, userId) as SectionRow | undefined;
    if (!row) throw new Error("Slate section not found.");
    if (row.locked === 1) {
      throw new Error("This section is locked and cannot be revised by Slate.");
    }
    if (
      storedLockedRanges(row).some(
        (range) =>
          range.start < candidate.localEnd && candidate.localStart < range.end,
      )
    ) {
      throw new Error("The requested revision overlaps locked section prose.");
    }
  }
}

function queueContinuityExtraction(
  db: DatabaseSync,
  input: {
    userId: string;
    seriesId: string;
    projectId: string;
    sectionId: string;
    sourceId: string;
    sourceRevision: number;
    contentHash: string;
    now: string;
  },
): void {
  const fingerprint = sha256(
    `${input.sectionId}\u0000${input.sourceRevision}\u0000${input.contentHash}`,
  );
  db.prepare(
    `INSERT OR IGNORE INTO slate_continuity_jobs
      (id, user_id, series_id, project_id, section_id, source_id,
       source_revision, kind, status, attempts, input_fingerprint,
       available_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'extract_source', 'queued', 0, ?, ?, ?, ?)`,
  ).run(
    randomId(),
    input.userId,
    input.seriesId,
    input.projectId,
    input.sectionId,
    input.sourceId,
    input.sourceRevision,
    fingerprint,
    input.now,
    input.now,
    input.now,
  );
}

function insertSectionVersion(
  db: DatabaseSync,
  row: SectionRow,
  reason: string,
  now: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO slate_section_versions
      (id, project_id, section_id, user_id, revision, reason, title, summary,
       direction, prose, locked, status, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomId(),
    row.project_id,
    row.id,
    row.user_id,
    row.revision,
    reason,
    row.title,
    row.summary,
    row.direction,
    row.prose,
    row.locked,
    row.status,
    row.content_hash,
    now,
  );
}

function insertPlannedSection(
  db: DatabaseSync,
  project: ProjectRow,
  item: SlateStructureItem,
  ordinal: number,
  now: string,
): void {
  db.prepare(
    `INSERT INTO slate_sections
      (id, project_id, series_id, user_id, parent_section_id,
       structure_item_id, kind, ordinal, title, summary, direction, prose,
       locked_ranges_json, locked, status, revision, content_hash,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, 0, ?, ?, ?)`,
  ).run(
    randomId(),
    project.id,
    project.series_id,
    project.user_id,
    item.id,
    item.kind,
    ordinal,
    item.title,
    item.summary,
    item.direction,
    item.locked ? 1 : 0,
    item.status === "drafted" ? "drafted" : "planned",
    sha256(""),
    now,
    now,
  );
}

function reconcileSlateStructureWithinTransaction(
  db: DatabaseSync,
  project: ProjectRow,
  structure: readonly SlateStructureItem[],
  existing: readonly SectionRow[],
  now: string,
): void {
  const byStructureId = new Map(
    existing
      .filter((row) => row.structure_item_id)
      .map((row) => [row.structure_item_id!, row]),
  );
  const retainedIds = new Set<string>();
  if (existing.length > 0) {
    db.prepare(
      `UPDATE slate_sections SET ordinal = ordinal + 1000000
        WHERE project_id = ? AND user_id = ?`,
    ).run(project.id, project.user_id);
  }
  structure.forEach((item, ordinal) => {
    const matched = byStructureId.get(item.id);
    if (matched) {
      retainedIds.add(matched.id);
      db.prepare(
        `UPDATE slate_sections
            SET kind = ?, ordinal = ?, title = ?, summary = ?, direction = ?,
                locked = ?, updated_at = ?
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      ).run(
        item.kind,
        ordinal,
        item.title,
        item.summary,
        item.direction,
        item.locked ? 1 : 0,
        now,
        matched.id,
        project.id,
        project.user_id,
      );
      return;
    }
    insertPlannedSection(db, project, item, ordinal, now);
  });

  let nextOrdinal = structure.length;
  const unmatched = existing.filter((row) => !retainedIds.has(row.id));
  const preserveEmptyFallback =
    structure.length === 0 && !unmatched.some((row) => row.prose.trim().length > 0);
  let fallbackPreserved = false;
  for (const row of unmatched) {
    const preserve =
      row.prose.trim().length > 0 ||
      row.kind === "imported" ||
      (preserveEmptyFallback && !fallbackPreserved);
    if (!preserve) {
      db.prepare(
        "DELETE FROM slate_sections WHERE id = ? AND project_id = ? AND user_id = ?",
      ).run(row.id, project.id, project.user_id);
      continue;
    }
    fallbackPreserved = true;
    db.prepare(
      `UPDATE slate_sections
          SET structure_item_id = NULL, kind = 'imported', ordinal = ?,
              locked = 0, updated_at = ?
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    ).run(nextOrdinal, now, row.id, project.id, project.user_id);
    nextOrdinal += 1;
  }
  const reconciledRows = orderedSlateSectionRows(
    db,
    project.user_id,
    project.id,
  );
  persistSlateSectionHierarchyWithinTransaction(
    db,
    project.user_id,
    project.id,
    reconciledRows,
    inferSlateSectionHierarchy(reconciledRows),
  );
}

/** Reconciles structure cards and section order without discarding prose. */
export function synchronizeSlateStructureSections(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateSectionSummary[] {
  const project = projectRow(db, userId, projectId);
  const existing = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as SectionRow[];
  if (existing.length === 0) return ensureSlateProjectSections(db, userId, projectId);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    reconcileSlateStructureWithinTransaction(
      db,
      project,
      structureItems(project),
      existing,
      now,
    );
    db.prepare(
      "UPDATE slate_projects SET manuscript = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(legacyProjection(db, userId, projectId), now, projectId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return (
    db
      .prepare(
        `SELECT * FROM slate_sections
          WHERE project_id = ? AND user_id = ? ORDER BY ordinal ASC`,
      )
      .all(projectId, userId) as unknown as SectionRow[]
  ).map(summaryFromSection);
}

export function replaceSlateProjectStructure(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  structure: readonly SlateStructureItem[],
): void {
  ensureSlateProjectSections(db, userId, projectId);
  const project = projectRow(db, userId, projectId);
  const serialized = JSON.stringify(structure);
  if (serialized === project.structure_json) return;
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    replaceSlateProjectStructureWithinTransaction(
      db,
      userId,
      projectId,
      structure,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Replaces a plan while preserving section prose. The caller owns an active
 * SQLite transaction, allowing Shape metadata and its section reconciliation
 * to commit as one author-safety boundary.
 */
export function replaceSlateProjectStructureWithinTransaction(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  structure: readonly SlateStructureItem[],
  now: string,
): void {
  const project = projectRow(db, userId, projectId);
  const serialized = JSON.stringify(structure);
  if (serialized === project.structure_json) return;
  const existing = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE project_id = ? AND user_id = ? ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as SectionRow[];
  db.prepare(
    `INSERT INTO slate_versions
      (id, project_id, user_id, reason, structure_json, manuscript, created_at)
     VALUES (?, ?, ?, 'Before structure change', ?, ?, ?)`,
  ).run(
    randomId(),
    projectId,
    userId,
    project.structure_json,
    project.manuscript,
    now,
  );
  const update = db.prepare(
    "UPDATE slate_projects SET structure_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(serialized, now, projectId, userId);
  if (update.changes !== 1) throw new Error("Slate project not found.");
  reconcileSlateStructureWithinTransaction(
    db,
    { ...project, structure_json: serialized },
    structure,
    existing,
    now,
  );
  db.prepare(
    "UPDATE slate_projects SET manuscript = ? WHERE id = ? AND user_id = ?",
  ).run(legacyProjection(db, userId, projectId), projectId, userId);
}

export function replaceSlateSectionWithAiProse(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  structureItemId: string,
  input: {
    prose: string;
    status: SlateSectionStatus;
    sourceKind: "ai_draft" | "accepted_revision";
    provider: "local" | "openai" | "anthropic";
    model: string;
    expectedSectionId: string;
    expectedRevision: number;
    expectedContentHash: string;
    expectedStructureJson: string;
  },
): SlateSectionDetail {
  const prose = exactText(input.prose, "Section prose", SECTION_PROSE_MAX);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const current = db
      .prepare(
        `SELECT * FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(input.expectedSectionId, projectId, userId) as SectionRow | undefined;
    if (!current) {
      throw new SlateSectionAiWriteConflictError(
        input.expectedSectionId,
        input.expectedRevision,
        input.expectedContentHash,
        "structure_changed",
      );
    }
    if (
      current.revision !== input.expectedRevision ||
      current.content_hash !== input.expectedContentHash
    ) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "changed",
      );
    }
    const project = projectRow(db, userId, projectId);
    if (project.structure_json !== input.expectedStructureJson) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "structure_changed",
      );
    }
    const structure = structureItems(project);
    const structureItem = structure.find((item) => item.id === structureItemId);
    if (!structureItem) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "structure_changed",
      );
    }
    if (
      current.locked === 1 ||
      structureItem.locked ||
      storedLockedRanges(current).length > 0
    ) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "locked",
      );
    }
    if (current.prose.length > 0) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "contains_prose",
      );
    }
    const now = new Date().toISOString();
    const revision = current.revision + 1;
    const contentHash = sha256(prose);
    const sectionUpdate = db.prepare(
      `UPDATE slate_sections
          SET prose = ?, status = ?, revision = ?, content_hash = ?,
              last_mutation_id = NULL, updated_at = ?
        WHERE id = ? AND project_id = ? AND user_id = ?
          AND revision = ? AND content_hash = ?`,
    ).run(
      prose,
      sectionStatus(input.status),
      revision,
      contentHash,
      now,
      current.id,
      projectId,
      userId,
      input.expectedRevision,
      input.expectedContentHash,
    );
    if (sectionUpdate.changes !== 1) {
      const latest = db
        .prepare("SELECT * FROM slate_sections WHERE id = ? AND user_id = ?")
        .get(current.id, userId) as unknown as SectionRow;
      throw new SlateSectionAiWriteConflictError(
        current.id,
        latest.revision,
        latest.content_hash,
        "changed",
      );
    }
    const source = insertSourceWithinTransaction(db, {
      userId,
      seriesId: current.series_id,
      projectId,
      sectionId: current.id,
      scopeKind: "section",
      kind: input.sourceKind,
      sourceRevision: revision,
      content: prose,
      authority: "ai",
      provider: input.provider,
      model: input.model,
    });
    queueContinuityExtraction(db, {
      userId,
      seriesId: current.series_id,
      projectId,
      sectionId: current.id,
      sourceId: source.id,
      sourceRevision: revision,
      contentHash,
      now,
    });
    db.prepare(
      `INSERT INTO slate_generation_receipts
        (id, user_id, project_id, section_id, operation, artifact_hash,
         provider, model, status, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'accepted', ?)`,
    ).run(
      randomId(),
      userId,
      projectId,
      current.id,
      contentHash,
      input.provider,
      input.model,
      now,
    );
    const projection = legacyProjection(db, userId, projectId);
    const nextStructure = structure.map((item) =>
      item.id === structureItemId
        ? { ...item, status: input.status === "drafted" ? "drafted" as const : item.status }
        : item,
    );
    const projectUpdate = db.prepare(
      `UPDATE slate_projects
          SET manuscript = ?, structure_json = ?, phase = 'draft',
              last_provider = ?, last_model = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND structure_json = ?`,
    ).run(
      projection,
      JSON.stringify(nextStructure),
      input.provider,
      input.model,
      now,
      projectId,
      userId,
      input.expectedStructureJson,
    );
    if (projectUpdate.changes !== 1) {
      throw new SlateSectionAiWriteConflictError(
        current.id,
        current.revision,
        current.content_hash,
        "structure_changed",
      );
    }
    const saved = db
      .prepare("SELECT * FROM slate_sections WHERE id = ? AND user_id = ?")
      .get(current.id, userId) as unknown as SectionRow;
    db.exec("COMMIT");
    return sectionFromRow(saved);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Applies an accepted legacy revision to its authoritative section. The caller
 * owns the surrounding SQLite transaction and must call ensure/synchronize
 * before opening that transaction.
 */
export function applyAcceptedSlateRevisionWithinTransaction(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    structureItemId: string | null;
    selectionStart: number | null;
    selectionEnd: number | null;
    originalText: string;
    proposedText: string;
    provider: "local" | "openai" | "anthropic";
    model: string;
    reason: string;
    now: string;
  },
): string {
  const spans = slateSectionProjectionSpans(
    db,
    input.userId,
    input.projectId,
  );
  let span: SlateSectionProjectionSpan | undefined;
  let localStart: number | null = null;
  let localEnd: number | null = null;

  if (input.structureItemId) {
    span = spans.find(
      (candidate) => candidate.structureItemId === input.structureItemId,
    );
  } else if (input.selectionStart !== null && input.selectionEnd !== null) {
    span = spans.find(
      (candidate) =>
        input.selectionStart! >= candidate.bodyStart &&
        input.selectionEnd! <= candidate.bodyEnd,
    );
    if (span) {
      localStart = input.selectionStart - span.bodyStart;
      localEnd = input.selectionEnd - span.bodyStart;
    }
  } else if (spans.length === 1) {
    span = spans[0];
  }

  if (!span) {
    throw new Error(
      "This revision crosses section boundaries. Refine one section or selection at a time.",
    );
  }
  const current = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(span.sectionId, input.projectId, input.userId) as SectionRow | undefined;
  if (!current) throw new Error("Slate section not found.");
  if (current.locked === 1) {
    throw new Error("This section is locked and cannot be overwritten by Slate.");
  }

  let prose: string;
  let lockedRanges = storedLockedRanges(current);
  if (localStart !== null && localEnd !== null) {
    const original = current.prose.slice(localStart, localEnd);
    if (original !== input.originalText) {
      throw new Error(
        "The revised passage changed after this proposal. Request a fresh revision so your edits stay authoritative.",
      );
    }
    if (
      lockedRanges.some((range) =>
        range.start < localEnd! && localStart! < range.end,
      )
    ) {
      throw new Error("This proposal overlaps locked section prose.");
    }
    prose = `${current.prose.slice(0, localStart)}${input.proposedText}${current.prose.slice(localEnd)}`;
    lockedRanges = transformSlateLockedRangesForTextEdit(
      current.prose,
      prose,
      lockedRanges,
    );
  } else {
    if (lockedRanges.length > 0) {
      throw new Error(
        "This section contains locked prose. Refine an unlocked selection instead.",
      );
    }
    const structuredPrefix = `${current.title}\n\n`;
    prose =
      current.kind !== "imported" && input.proposedText.startsWith(structuredPrefix)
        ? input.proposedText.slice(structuredPrefix.length)
        : input.proposedText;
  }
  exactText(prose, "Section prose", SECTION_PROSE_MAX);
  insertSectionVersion(db, current, input.reason, input.now);
  const revision = current.revision + 1;
  const contentHash = sha256(prose);
  db.prepare(
    `UPDATE slate_sections
        SET prose = ?, locked_ranges_json = ?, revision = ?, content_hash = ?,
            last_mutation_id = NULL, updated_at = ?
      WHERE id = ? AND project_id = ? AND user_id = ?`,
  ).run(
    prose,
    JSON.stringify(lockedRanges),
    revision,
    contentHash,
    input.now,
    current.id,
    input.projectId,
    input.userId,
  );
  const source = insertSourceWithinTransaction(db, {
    userId: input.userId,
    seriesId: current.series_id,
    projectId: input.projectId,
    sectionId: current.id,
    scopeKind: "section",
    kind: "accepted_revision",
    sourceRevision: revision,
    content: prose,
    authority: "ai",
    provider: input.provider,
    model: input.model,
  });
  queueContinuityExtraction(db, {
    userId: input.userId,
    seriesId: current.series_id,
    projectId: input.projectId,
    sectionId: current.id,
    sourceId: source.id,
    sourceRevision: revision,
    contentHash,
    now: input.now,
  });
  return legacyProjection(db, input.userId, input.projectId);
}

export function saveSlateProjectSection(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  rawInput: SlateSectionSaveRequest,
): SlateSectionDetail {
  if (!rawInput || typeof rawInput !== "object") {
    throw new Error("Section update must be an object.");
  }
  const expectedRevision = Number(rawInput.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Section expected revision is invalid.");
  }
  const mutationId = text(rawInput.mutationId, "Section mutation id", 160, true);
  const prose = exactText(rawInput.prose, "Section prose", SECTION_PROSE_MAX);

  ensureSlateProjectSections(db, userId, projectId);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const current = db
      .prepare(
        `SELECT * FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(sectionId, projectId, userId) as SectionRow | undefined;
    if (!current) throw new Error("Slate section not found.");
    if (current.last_mutation_id === mutationId) {
      db.exec("COMMIT");
      return sectionFromRow(current);
    }
    if (current.revision !== expectedRevision) {
      throw new SlateSectionRevisionConflictError(
        current.id,
        current.revision,
        current.content_hash,
      );
    }

    const nextRevision = current.revision + 1;
    const nextHash = sha256(prose);
    const nextTitle = Object.hasOwn(rawInput, "title")
      ? text(rawInput.title, "Section title", SECTION_TITLE_MAX, true)
      : current.title;
    const nextSummary = Object.hasOwn(rawInput, "summary")
      ? text(rawInput.summary, "Section summary", SECTION_SUMMARY_MAX)
      : current.summary;
    const nextDirection = Object.hasOwn(rawInput, "direction")
      ? text(rawInput.direction, "Section direction", SECTION_DIRECTION_MAX)
      : current.direction;
    const nextStatus = Object.hasOwn(rawInput, "status")
      ? sectionStatus(rawInput.status)
      : sectionStatus(current.status);
    const nextLocked = Object.hasOwn(rawInput, "locked")
      ? rawInput.locked === true
      : current.locked === 1;
    const currentLockedRanges = storedLockedRanges(current);
    const transformedLockedRanges = transformSlateLockedRangesForTextEdit(
      current.prose,
      prose,
      currentLockedRanges,
    );
    let nextLockedRanges = transformedLockedRanges;
    if (Object.hasOwn(rawInput, "lockedRanges")) {
      // The current editor contract sends its last known ranges with prose.
      // Detect those stale coordinates against the old text before validating
      // them against the new text, then let the server re-anchor them.
      let suppliedCurrentRanges: SlateLockedRange[] | null = null;
      try {
        suppliedCurrentRanges = normalizeLockedRanges(
          rawInput.lockedRanges,
          current.prose.length,
        );
      } catch {
        // It may be an intentional range authored against the new prose.
      }
      if (
        current.prose === prose ||
        JSON.stringify(suppliedCurrentRanges) !==
          JSON.stringify(currentLockedRanges)
      ) {
        nextLockedRanges = normalizeLockedRanges(
          rawInput.lockedRanges,
          prose.length,
        );
      }
    }
    const now = new Date().toISOString();
    const update = db.prepare(
      `UPDATE slate_sections
          SET title = ?, summary = ?, direction = ?, prose = ?,
              locked_ranges_json = ?, locked = ?, status = ?, revision = ?,
              content_hash = ?, last_mutation_id = ?, updated_at = ?
        WHERE id = ? AND project_id = ? AND user_id = ? AND revision = ?`,
    ).run(
      nextTitle,
      nextSummary,
      nextDirection,
      prose,
      JSON.stringify(nextLockedRanges),
      nextLocked ? 1 : 0,
      nextStatus,
      nextRevision,
      nextHash,
      mutationId,
      now,
      sectionId,
      projectId,
      userId,
      expectedRevision,
    );
    if (update.changes !== 1) {
      const latest = db
        .prepare("SELECT * FROM slate_sections WHERE id = ? AND user_id = ?")
        .get(sectionId, userId) as unknown as SectionRow;
      throw new SlateSectionRevisionConflictError(
        sectionId,
        latest.revision,
        latest.content_hash,
      );
    }

    if (nextHash !== current.content_hash) {
      const source = insertSourceWithinTransaction(db, {
        userId,
        seriesId: current.series_id,
        projectId,
        sectionId,
        scopeKind: "section",
        kind: "human_edit",
        sourceRevision: nextRevision,
        content: prose,
        authority: "human",
      });
      queueContinuityExtraction(db, {
        userId,
        seriesId: current.series_id,
        projectId,
        sectionId,
        sourceId: source.id,
        sourceRevision: nextRevision,
        contentHash: nextHash,
        now,
      });
    }

    const projection = legacyProjection(db, userId, projectId);
    db.prepare(
      "UPDATE slate_projects SET manuscript = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).run(projection, now, projectId, userId);
    db.prepare(
      "UPDATE slate_manuscript_state SET updated_at = ? WHERE project_id = ? AND user_id = ?",
    ).run(now, projectId, userId);
    const saved = db
      .prepare("SELECT * FROM slate_sections WHERE id = ? AND user_id = ?")
      .get(sectionId, userId) as unknown as SectionRow;
    db.exec("COMMIT");
    return sectionFromRow(saved);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSlateManuscriptPage(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  input: { cursor?: string | null; limit?: number } = {},
): SlateManuscriptPageResponse {
  ensureSlateProjectSections(db, userId, projectId);
  const afterOrdinal = input.cursor ? Number.parseInt(input.cursor, 10) : -1;
  if (!Number.isInteger(afterOrdinal) || afterOrdinal < -1) {
    throw new Error("Slate manuscript cursor is invalid.");
  }
  const limit = Math.max(
    1,
    Math.min(SECTION_PAGE_LIMIT_MAX, Math.floor(input.limit ?? 20)),
  );
  const rows = db
    .prepare(
      `SELECT * FROM slate_sections
        WHERE project_id = ? AND user_id = ? AND ordinal > ?
        ORDER BY ordinal ASC
        LIMIT ?`,
    )
    .all(projectId, userId, afterOrdinal, limit + 1) as unknown as SectionRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const total = db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(prose)), 0) AS total
         FROM slate_sections
        WHERE project_id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as { total: number };
  return {
    ok: true,
    sections: pageRows.map(sectionFromRow),
    nextCursor: hasMore ? String(pageRows.at(-1)!.ordinal) : null,
    totalProseLength: Number(total.total ?? 0),
  };
}

export function getSlateContinuityStatus(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateContinuityStatus {
  const project = projectRow(db, userId, projectId);
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS count FROM slate_continuity_jobs
        WHERE project_id = ? AND user_id = ? AND status IN ('queued', 'running')`,
    )
    .get(projectId, userId) as { count: number };
  const concerns = db
    .prepare(
      `SELECT COUNT(*) AS count FROM slate_continuity_concerns
        WHERE project_id = ? AND user_id = ? AND status = 'open'`,
    )
    .get(projectId, userId) as { count: number };
  const upgradeStatus =
    project.continuity_upgrade_status === "building" ||
    project.continuity_upgrade_status === "review" ||
    project.continuity_upgrade_status === "deferred" ||
    project.continuity_upgrade_status === "failed"
      ? project.continuity_upgrade_status
      : "current";
  return {
    projectId,
    activeVersion: project.continuity_active_version || CONTINUITY_FRAMEWORK.version,
    targetVersion: project.continuity_target_version || CONTINUITY_FRAMEWORK.version,
    activeGeneration: Number(project.continuity_active_generation ?? 0),
    previousGeneration:
      project.continuity_previous_generation === null
        ? null
        : Number(project.continuity_previous_generation),
    upgradeStatus,
    pendingJobCount: Number(pending.count ?? 0),
    openConcernCount: Number(concerns.count ?? 0),
    lastSuccessfulAt: project.continuity_last_success_at,
    producerVersions: currentContinuityProducerVersions(),
  };
}

function entityKind(value: unknown): SlateContinuityEntityKind {
  if (
    value === "character" ||
    value === "location" ||
    value === "object" ||
    value === "group" ||
    value === "event" ||
    value === "concept" ||
    value === "world_rule"
  ) {
    return value;
  }
  throw new Error("Continuity entity kind is invalid.");
}

function sourceRow(db: DatabaseSync, userId: string, sourceId: string): SourceRow {
  const row = db
    .prepare("SELECT * FROM slate_continuity_sources WHERE id = ? AND user_id = ?")
    .get(sourceId, userId) as SourceRow | undefined;
  if (!row) throw new Error("Continuity source not found.");
  return row;
}

function entityFromRow(db: DatabaseSync, row: EntityRow): SlateContinuityEntity {
  const aliases = db
    .prepare(
      `SELECT alias FROM slate_continuity_aliases
        WHERE entity_id = ? AND user_id = ?
        ORDER BY created_at ASC, alias ASC`,
    )
    .all(row.id, row.user_id) as Array<{ alias: string }>;
  const source = row.source_id ? sourceRow(db, row.user_id, row.source_id) : null;
  return {
    id: row.id,
    seriesId: row.series_id,
    kind: entityKind(row.kind),
    canonicalName: row.canonical_name,
    aliases: aliases.map((item) => item.alias),
    description: row.description,
    locked: row.locked === 1,
    anchors: parseJson<SlateContinuitySourceAnchor[]>(row.anchors_json, []),
    provenance: source
      ? sourceFromRow(source).provenance
      : {
          authority: "human",
          provider: null,
          model: null,
          producerVersions: parseJson(
            row.producer_versions_json,
            currentContinuityProducerVersions(),
          ),
          createdAt: row.created_at,
        },
  };
}

export function createSlateContinuityEntity(
  db: DatabaseSync,
  userId: string,
  input: {
    seriesId: string;
    kind: SlateContinuityEntityKind;
    canonicalName: string;
    aliases?: string[];
    description?: string;
    locked?: boolean;
    sourceId: string;
  },
): SlateContinuityEntity {
  seriesRow(db, userId, input.seriesId);
  const source = sourceRow(db, userId, input.sourceId);
  if (source.series_id !== input.seriesId) {
    throw new Error("Continuity source belongs to another series.");
  }
  const id = randomId();
  const name = text(input.canonicalName, "Entity name", 240, true);
  const description = text(input.description, "Entity description", 8_000);
  const aliases = Array.isArray(input.aliases)
    ? input.aliases.map((alias, index) =>
        text(alias, `Entity alias ${index + 1}`, 240, true),
      )
    : [];
  const now = new Date().toISOString();
  const versions = JSON.stringify(currentContinuityProducerVersions());
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `INSERT INTO slate_continuity_entities
        (id, user_id, series_id, kind, canonical_name, description, locked,
         source_id, producer_versions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      input.seriesId,
      entityKind(input.kind),
      name,
      description,
      input.locked ? 1 : 0,
      input.sourceId,
      versions,
      now,
      now,
    );
    const seen = new Set<string>();
    for (const alias of aliases) {
      const normalized = alias.normalize("NFKC").trim().toLocaleLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      db.prepare(
        `INSERT INTO slate_continuity_aliases
          (id, user_id, series_id, entity_id, alias, normalized_alias,
           source_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomId(),
        userId,
        input.seriesId,
        id,
        alias,
        normalized,
        input.sourceId,
        now,
      );
    }
    const row = db
      .prepare("SELECT * FROM slate_continuity_entities WHERE id = ?")
      .get(id) as unknown as EntityRow;
    db.exec("COMMIT");
    return entityFromRow(db, row);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listSlateContinuityEntities(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
): SlateContinuityEntity[] {
  seriesRow(db, userId, seriesId);
  return (
    db
      .prepare(
        `SELECT * FROM slate_continuity_entities
          WHERE user_id = ? AND series_id = ?
          ORDER BY kind ASC, canonical_name ASC, created_at ASC`,
      )
      .all(userId, seriesId) as unknown as EntityRow[]
  ).map((row) => entityFromRow(db, row));
}

function epistemicStatus(value: unknown): SlateContinuityEpistemicStatus {
  if (
    value === "fact" ||
    value === "belief" ||
    value === "rumor" ||
    value === "mystery" ||
    value === "ambiguity" ||
    value === "intention" ||
    value === "superseded"
  ) {
    return value;
  }
  throw new Error("Continuity epistemic status is invalid.");
}

function scopeFromRow(row: ClaimRow): SlateContinuityScope {
  return {
    kind:
      row.scope_kind === "series" || row.scope_kind === "section"
        ? row.scope_kind
        : "book",
    seriesId: row.series_id,
    projectId: row.project_id,
    sectionId: row.section_id,
  };
}

function claimFromRow(db: DatabaseSync, row: ClaimRow): SlateContinuityClaim {
  const source = sourceRow(db, row.user_id, row.source_id);
  return {
    id: row.id,
    scope: scopeFromRow(row),
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    objectEntityId: row.object_entity_id,
    value: row.value,
    epistemicStatus: epistemicStatus(row.epistemic_status),
    perspectiveEntityId: row.perspective_entity_id,
    confidence: row.confidence,
    anchors: parseJson<SlateContinuitySourceAnchor[]>(row.anchors_json, []),
    supersedesClaimId: row.supersedes_claim_id,
    provenance: sourceFromRow(source).provenance,
  };
}

export function createSlateContinuityClaim(
  db: DatabaseSync,
  userId: string,
  input: {
    scope: SlateContinuityScope;
    subjectEntityId?: string | null;
    predicate: string;
    objectEntityId?: string | null;
    value?: string;
    epistemicStatus: SlateContinuityEpistemicStatus;
    perspectiveEntityId?: string | null;
    confidence?: number;
    anchors?: SlateContinuitySourceAnchor[];
    sourceId: string;
    supersedesClaimId?: string | null;
  },
): SlateContinuityClaim {
  seriesRow(db, userId, input.scope.seriesId);
  const source = sourceRow(db, userId, input.sourceId);
  if (source.series_id !== input.scope.seriesId) {
    throw new Error("Continuity source belongs to another series.");
  }
  if (input.scope.projectId) projectRow(db, userId, input.scope.projectId);
  const confidence = Math.max(0, Math.min(1, Number(input.confidence ?? 1)));
  const id = randomId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value,
       epistemic_status, perspective_entity_id, confidence, anchors_json,
       source_id, supersedes_claim_id, producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.scope.seriesId,
    input.scope.projectId,
    input.scope.sectionId,
    input.scope.kind,
    input.subjectEntityId ?? null,
    text(input.predicate, "Continuity predicate", 240, true),
    input.objectEntityId ?? null,
    text(input.value, "Continuity claim value", 8_000),
    epistemicStatus(input.epistemicStatus),
    input.perspectiveEntityId ?? null,
    confidence,
    JSON.stringify(input.anchors ?? []),
    input.sourceId,
    input.supersedesClaimId ?? null,
    JSON.stringify(currentContinuityProducerVersions()),
    now,
  );
  return claimFromRow(
    db,
    db
      .prepare("SELECT * FROM slate_continuity_claims WHERE id = ?")
      .get(id) as unknown as ClaimRow,
  );
}

export function listSlateContinuityClaims(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
  projectId?: string | null,
): SlateContinuityClaim[] {
  seriesRow(db, userId, seriesId);
  const rows = projectId
    ? (db
        .prepare(
          `SELECT * FROM slate_continuity_claims
            WHERE user_id = ? AND series_id = ?
              AND (project_id = ? OR project_id IS NULL)
            ORDER BY created_at ASC`,
        )
        .all(userId, seriesId, projectId) as unknown as ClaimRow[])
    : (db
        .prepare(
          `SELECT * FROM slate_continuity_claims
            WHERE user_id = ? AND series_id = ?
            ORDER BY created_at ASC`,
        )
        .all(userId, seriesId) as unknown as ClaimRow[]);
  return rows.map((row) => claimFromRow(db, row));
}

export function countSlateConcernsByStatus(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): Record<SlateContinuityConcernStatus, number> {
  projectRow(db, userId, projectId);
  const counts: Record<SlateContinuityConcernStatus, number> = {
    open: 0,
    intentional: 0,
    deferred: 0,
    resolved: 0,
    dismissed: 0,
  };
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? GROUP BY status`,
    )
    .all(userId, projectId) as Array<{ status: string; count: number }>;
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) {
      counts[row.status as SlateContinuityConcernStatus] = Number(row.count);
    }
  }
  return counts;
}
