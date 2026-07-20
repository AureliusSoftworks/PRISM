import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  normalizePromptWildcardRunMetadata,
  transformSlateLockedRangesForTextEdit,
  type PromptWildcardRunMetadata,
  type SlateAiProvider,
  type SlateCharacter,
  type SlateDeliberationConfig,
  type SlateDeliberationHemisphereConfig,
  type SlateLockedRange,
  type SlateProjectDetail,
  type SlateProjectCover,
  type SlateProjectTitleOrigin,
  type SlateProjectPatchRequest,
  type SlateProjectPhase,
  type SlateProjectSummary,
  type SlateProseMode,
  type SlateRevision,
  type SlateRevisionAction,
  type SlateRevisionRequest,
  type SlateRevisionScope,
  type SlateStructureItem,
  type SlateTitleSuggestion,
  type SlateUnresolvedThread,
  type SlateVersionSummary,
} from "@localai/shared";
import { defaultModelIdForProvider, type LlmProvider, type ProviderName } from "./providers.ts";
import {
  promptWildcardNames,
  resolvePromptBotWildcards,
  resolvePromptWildcardsWithModel,
  type PromptBotWildcardCandidate,
} from "./prompt-wildcards.ts";
import { randomId } from "./security.ts";
import { compileSlateDraftContinuityContext } from "./slate-continuity-processing.ts";
import {
  applyAcceptedSlateRevisionWithinTransaction,
  assertSlateRevisionTargetUnlocked,
  ensureSlateProjectSections,
  getSlateProjectSection,
  listSlateProjectSections,
  replaceSlateSectionWithAiProse,
  replaceSlateProjectStructure,
  replaceSlateProjectStructureWithinTransaction,
  resolveSlateSeriesPlacementForNewProject,
  SlateSectionAiWriteConflictError,
  slateSectionProjectionSpans,
  synchronizeSlateStructureSections,
} from "./slate-continuity.ts";

const SLATE_TITLE_MAX = 180;
const SLATE_SPARK_MAX = 8_000;
const SLATE_MANUSCRIPT_MAX = 2_000_000;
const SLATE_DIRECTION_MAX = 8_000;
const SLATE_STRUCTURE_MAX = 240;
const SLATE_CHARACTER_MAX = 120;
const SLATE_THREAD_MAX = 160;
const SLATE_DELIBERATION_DIRECTIVE_MAX = 4_000;

interface SlateProjectRow {
  id: string;
  user_id: string;
  series_id: string;
  book_ordinal: number;
  title: string;
  title_origin: string;
  spark: string;
  spark_wildcards_json: string;
  cover_json: string;
  premise: string;
  voice: string;
  non_negotiables_json: string;
  phase: string;
  structure_json: string;
  characters_json: string;
  unresolved_threads_json: string;
  manuscript: string;
  direction: string;
  locked_ranges_json: string;
  last_provider: string | null;
  last_model: string | null;
  prose_mode: string;
  prose_model: string | null;
  prose_provider: string | null;
  deliberation_config_json: string;
  created_at: string;
  updated_at: string;
}

function defaultSlateDeliberationHemisphereConfig(): SlateDeliberationHemisphereConfig {
  return { provider: null, model: null, directive: "" };
}

function defaultSlateDeliberationConfig(): SlateDeliberationConfig {
  return {
    lux: defaultSlateDeliberationHemisphereConfig(),
    umbra: defaultSlateDeliberationHemisphereConfig(),
  };
}

function normalizeSlateDeliberationHemisphereConfig(
  value: unknown,
  label: string,
): SlateDeliberationHemisphereConfig {
  if (!isRecord(value)) throw new Error(`${label} settings are invalid.`);
  const provider = optionalProviderValue(value.provider);
  const model = boundedString(value.model, `${label} model`, 240) || null;
  if (Boolean(provider) !== Boolean(model)) {
    throw new Error(`${label} model and provider must be selected together.`);
  }
  return {
    provider,
    model,
    directive: boundedString(
      value.directive,
      `${label} creative lens`,
      SLATE_DELIBERATION_DIRECTIVE_MAX,
    ),
  };
}

function normalizeSlateDeliberationConfig(
  value: unknown,
): SlateDeliberationConfig {
  if (!isRecord(value)) throw new Error("Slate hemisphere settings are invalid.");
  return {
    lux: normalizeSlateDeliberationHemisphereConfig(value.lux, "Lux"),
    umbra: normalizeSlateDeliberationHemisphereConfig(value.umbra, "Umbra"),
  };
}

function storedSlateDeliberationConfig(
  row: SlateProjectRow,
): SlateDeliberationConfig {
  const fallback = defaultSlateDeliberationConfig();
  const parsed = parseJson(row.deliberation_config_json, null);
  if (!isRecord(parsed)) return fallback;
  try {
    return {
      lux: isRecord(parsed.lux)
        ? normalizeSlateDeliberationHemisphereConfig(parsed.lux, "Lux")
        : fallback.lux,
      umbra: isRecord(parsed.umbra)
        ? normalizeSlateDeliberationHemisphereConfig(parsed.umbra, "Umbra")
        : fallback.umbra,
    };
  } catch {
    return fallback;
  }
}

interface SlateRevisionRow {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  scope: string;
  structure_item_id: string | null;
  selection_start: number | null;
  selection_end: number | null;
  direction: string;
  original_text: string;
  proposed_text: string;
  status: string;
  provider: string;
  model: string;
  created_at: string;
  resolved_at: string | null;
}

interface SlateVersionRow {
  id: string;
  reason: string;
  created_at: string;
}

interface SlateShapeSectionStateRow {
  id: string;
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
  updated_at: string;
}

export interface SlateAiOperationInput {
  provider: LlmProvider;
  providerName: ProviderName;
  model: string;
}

export type SlateShapeWriteConflictReason =
  | "changed"
  | "locked"
  | "structure_changed";

/** A recoverable refusal to replace newer writer-owned Shape state. */
export class SlateShapeWriteConflictError extends Error {
  readonly code = "slate_shape_write_conflict";
  readonly projectId: string;
  readonly currentUpdatedAt: string | null;
  readonly reason: SlateShapeWriteConflictReason;

  constructor(
    projectId: string,
    currentUpdatedAt: string | null,
    reason: SlateShapeWriteConflictReason,
  ) {
    const message =
      reason === "locked"
        ? "Slate found material the writer locked, so the story plan was left untouched. Unlock it before reshaping."
        : reason === "structure_changed"
          ? "The story plan changed while Slate was shaping it. The newer writer structure was kept."
          : "The project changed while Slate was shaping it. The newer writer work was kept.";
    super(message);
    this.name = "SlateShapeWriteConflictError";
    this.projectId = projectId;
    this.currentUpdatedAt = currentUpdatedAt;
    this.reason = reason;
  }
}

export interface SlateAccountDefaults {
  preferredProvider: ProviderName;
  preferredLocalModel?: string | null;
  preferredOnlineModel?: string | null;
}

export function resolveSlateAccountDefaults(
  defaults: SlateAccountDefaults,
): { provider: ProviderName; model: string } {
  const provider = defaults.preferredProvider;
  const preferred =
    provider === "local"
      ? defaults.preferredLocalModel
      : defaults.preferredOnlineModel;
  return {
    provider,
    model: preferred?.trim() || defaultModelIdForProvider(provider),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function boundedString(
  value: unknown,
  label: string,
  max: number,
  { required = false }: { required?: boolean } = {},
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

function phaseValue(value: unknown): SlateProjectPhase {
  if (value === "draft" || value === "refine") return value;
  return "shape";
}

function providerValue(value: unknown): ProviderName | null {
  if (value === "local" || value === "openai" || value === "anthropic") return value;
  return null;
}

function proseModeValue(value: unknown): SlateProseMode {
  if (value === "online" || value === "offline") return value;
  return "auto";
}

function optionalProviderValue(
  value: unknown,
  label = "Slate prose provider",
): SlateAiProvider | null {
  if (value === null || value === undefined || value === "") return null;
  const provider = providerValue(value);
  if (!provider) throw new Error(`${label} is invalid.`);
  return provider;
}

function artifactHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function recordSlateGenerationReceipt(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    sectionId?: string | null;
    revisionId?: string | null;
    operation: "draft" | "revision";
    artifact: string;
    provider: ProviderName;
    model: string;
    status: "accepted" | "proposed";
    createdAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO slate_generation_receipts
      (id, user_id, project_id, section_id, revision_id, operation,
       artifact_hash, provider, model, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomId(),
    input.userId,
    input.projectId,
    input.sectionId ?? null,
    input.revisionId ?? null,
    input.operation,
    artifactHash(input.artifact),
    input.provider,
    input.model,
    input.status,
    input.createdAt,
  );
}

function stringArray(value: unknown, label: string, maxItems: number): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maxItems) throw new Error(`${label} has too many items.`);
  return value.map((item, index) => boundedString(item, `${label} item ${index + 1}`, 1_000, { required: true }));
}

function normalizeStructure(value: unknown): SlateStructureItem[] {
  if (!Array.isArray(value)) throw new Error("Slate structure must be an array.");
  if (value.length > SLATE_STRUCTURE_MAX) throw new Error("Slate structure has too many items.");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Structure item ${index + 1} is invalid.`);
    const id = boundedString(item.id, `Structure item ${index + 1} id`, 120, { required: true });
    if (seen.has(id)) throw new Error(`Structure item id "${id}" is duplicated.`);
    seen.add(id);
    const kind = item.kind === "act" || item.kind === "chapter" ? item.kind : "scene";
    return {
      id,
      kind,
      title: boundedString(item.title, `Structure item ${index + 1} title`, 240, { required: true }),
      summary: boundedString(item.summary, `Structure item ${index + 1} summary`, 4_000),
      direction: boundedString(item.direction, `Structure item ${index + 1} direction`, 2_000),
      status: item.status === "drafted" ? "drafted" : "planned",
      locked: item.locked === true,
    };
  });
}

function normalizeCharacters(value: unknown): SlateCharacter[] {
  if (!Array.isArray(value)) throw new Error("Slate characters must be an array.");
  if (value.length > SLATE_CHARACTER_MAX) throw new Error("Slate has too many characters.");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Character ${index + 1} is invalid.`);
    const id = boundedString(item.id, `Character ${index + 1} id`, 120, { required: true });
    if (seen.has(id)) throw new Error(`Character id "${id}" is duplicated.`);
    seen.add(id);
    return {
      id,
      name: boundedString(item.name, `Character ${index + 1} name`, 180, { required: true }),
      role: boundedString(item.role, `Character ${index + 1} role`, 1_000),
      voice: boundedString(item.voice, `Character ${index + 1} voice`, 1_000),
      locked: item.locked === true,
    };
  });
}

function normalizeThreads(value: unknown): SlateUnresolvedThread[] {
  if (!Array.isArray(value)) throw new Error("Slate unresolved threads must be an array.");
  if (value.length > SLATE_THREAD_MAX) throw new Error("Slate has too many unresolved threads.");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Unresolved thread ${index + 1} is invalid.`);
    const id = boundedString(item.id, `Unresolved thread ${index + 1} id`, 120, { required: true });
    if (seen.has(id)) throw new Error(`Unresolved thread id "${id}" is duplicated.`);
    seen.add(id);
    return {
      id,
      label: boundedString(item.label, `Unresolved thread ${index + 1} label`, 1_000, { required: true }),
      resolved: item.resolved === true,
      locked: item.locked === true,
    };
  });
}

function normalizeLockedRanges(value: unknown, manuscriptLength: number): SlateLockedRange[] {
  if (!Array.isArray(value)) throw new Error("Slate locked ranges must be an array.");
  const seen = new Set<string>();
  const ranges = value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Locked range ${index + 1} is invalid.`);
    const id = boundedString(item.id, `Locked range ${index + 1} id`, 120, { required: true });
    if (seen.has(id)) throw new Error(`Locked range id "${id}" is duplicated.`);
    seen.add(id);
    const start = typeof item.start === "number" && Number.isInteger(item.start) ? item.start : -1;
    const end = typeof item.end === "number" && Number.isInteger(item.end) ? item.end : -1;
    if (start < 0 || end <= start || end > manuscriptLength) {
      throw new Error(`Locked range ${index + 1} is outside the manuscript.`);
    }
    return {
      id,
      start,
      end,
      label: boundedString(item.label, `Locked range ${index + 1} label`, 240),
    };
  });
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index]!.start < ranges[index - 1]!.end) {
      throw new Error("Locked manuscript ranges cannot overlap.");
    }
  }
  return ranges;
}

function storedStructure(row: SlateProjectRow): SlateStructureItem[] {
  try {
    return normalizeStructure(parseJson(row.structure_json, []));
  } catch {
    return [];
  }
}

function storedCharacters(row: SlateProjectRow): SlateCharacter[] {
  try {
    return normalizeCharacters(parseJson(row.characters_json, []));
  } catch {
    return [];
  }
}

function storedThreads(row: SlateProjectRow): SlateUnresolvedThread[] {
  try {
    return normalizeThreads(parseJson(row.unresolved_threads_json, []));
  } catch {
    return [];
  }
}

function storedLockedRanges(row: SlateProjectRow): SlateLockedRange[] {
  try {
    return normalizeLockedRanges(parseJson(row.locked_ranges_json, []), row.manuscript.length);
  } catch {
    return [];
  }
}

function slateShapeSectionStateRows(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateShapeSectionStateRow[] {
  return db.prepare(
    `SELECT id, parent_section_id, structure_item_id, kind, ordinal, title,
            summary, direction, prose, locked_ranges_json, locked, status,
            revision, content_hash, updated_at
       FROM slate_sections
      WHERE project_id = ? AND user_id = ?
      ORDER BY ordinal ASC, id ASC`,
  ).all(projectId, userId) as unknown as SlateShapeSectionStateRow[];
}

function slateShapeProjectStateToken(row: SlateProjectRow): string {
  return JSON.stringify([
    row.series_id,
    row.book_ordinal,
    row.title,
    row.spark,
    row.spark_wildcards_json,
    row.premise,
    row.voice,
    row.non_negotiables_json,
    row.phase,
    row.structure_json,
    row.characters_json,
    row.unresolved_threads_json,
    row.manuscript,
    row.direction,
    row.locked_ranges_json,
    row.last_provider,
    row.last_model,
    row.prose_mode,
    row.prose_model,
    row.prose_provider,
    row.deliberation_config_json,
    row.updated_at,
  ]);
}

function slateShapeSectionStateToken(
  rows: readonly SlateShapeSectionStateRow[],
): string {
  return JSON.stringify(rows);
}

function storedLockPayloadHasRanges(raw: string): boolean {
  const parsed = parseJson(raw, null);
  return !Array.isArray(parsed) || parsed.length > 0;
}

function slateShapeStateHasLocks(
  project: SlateProjectRow,
  sections: readonly SlateShapeSectionStateRow[],
): boolean {
  return (
    storedStructure(project).some((item) => item.locked) ||
    storedCharacters(project).some((character) => character.locked) ||
    storedThreads(project).some((thread) => thread.locked) ||
    storedLockPayloadHasRanges(project.locked_ranges_json) ||
    sections.some(
      (section) =>
        section.locked === 1 ||
        storedLockPayloadHasRanges(section.locked_ranges_json),
    )
  );
}

function normalizedSparkWildcards(
  value: unknown,
  resolvedSpark: string,
): PromptWildcardRunMetadata | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizePromptWildcardRunMetadata(value);
  if (!normalized) throw new Error("Slate wildcard provenance is invalid.");
  const template = boundedString(
    normalized.template,
    "Wildcard spark template",
    SLATE_SPARK_MAX,
    { required: true },
  );
  const resolvedPrompt = boundedString(
    normalized.resolvedPrompt,
    "Resolved wildcard spark",
    SLATE_SPARK_MAX,
    { required: true },
  );
  if (resolvedPrompt !== resolvedSpark) {
    throw new Error("Resolved wildcard spark does not match the project spark.");
  }
  return {
    ...normalized,
    template,
    resolvedPrompt,
  };
}

function storedSparkWildcards(row: SlateProjectRow): PromptWildcardRunMetadata | null {
  if (!row.spark_wildcards_json?.trim()) return null;
  try {
    return normalizedSparkWildcards(
      parseJson(row.spark_wildcards_json, null),
      row.spark,
    );
  } catch {
    return null;
  }
}

function storedProjectCover(row: SlateProjectRow): SlateProjectCover {
  const fallback: SlateProjectCover = {
    seed: row.id,
    prompt: "",
    imageUrl: null,
    imageId: null,
    revision: 0,
    status: "fallback",
  };
  const parsed = parseJson(row.cover_json, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }
  const cover = parsed as Record<string, unknown>;
  const status =
    cover.status === "generating" ||
    cover.status === "ready" ||
    cover.status === "failed"
      ? cover.status
      : "fallback";
  return {
    seed:
      typeof cover.seed === "string" && cover.seed.trim()
        ? cover.seed.trim().slice(0, 240)
        : row.id,
    prompt:
      typeof cover.prompt === "string" ? cover.prompt.trim().slice(0, 12_000) : "",
    imageUrl:
      typeof cover.imageUrl === "string" && cover.imageUrl.trim()
        ? cover.imageUrl.trim().slice(0, 2_000)
        : null,
    imageId:
      typeof cover.imageId === "string" && cover.imageId.trim()
        ? cover.imageId.trim().slice(0, 240)
        : null,
    revision:
      typeof cover.revision === "number" && Number.isSafeInteger(cover.revision)
        ? Math.max(0, cover.revision)
        : 0,
    status,
  };
}

function revisionAction(value: unknown): SlateRevisionAction {
  if (
    value === "deepen" ||
    value === "condense" ||
    value === "rewrite" ||
    value === "reframe" ||
    value === "cut"
  ) {
    return value;
  }
  return "direct";
}

function revisionScope(value: unknown): SlateRevisionScope {
  if (value === "selection" || value === "scene") return value;
  return "project";
}

function revisionFromRow(row: SlateRevisionRow): SlateRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    action: revisionAction(row.action),
    scope: revisionScope(row.scope),
    structureItemId: row.structure_item_id,
    selectionStart: row.selection_start,
    selectionEnd: row.selection_end,
    direction: row.direction,
    originalText: row.original_text,
    proposedText: row.proposed_text,
    status: row.status === "accepted" || row.status === "rejected" ? row.status : "pending",
    provider: providerValue(row.provider) ?? "local",
    model: row.model,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function versionsForProject(db: DatabaseSync, userId: string, projectId: string): SlateVersionSummary[] {
  return (db.prepare(
    `SELECT id, reason, created_at
      FROM slate_versions
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 50`,
  ).all(projectId, userId) as unknown as SlateVersionRow[]).map((row) => ({
    id: row.id,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

function revisionsForProject(db: DatabaseSync, userId: string, projectId: string): SlateRevision[] {
  return (db.prepare(
    `SELECT * FROM slate_revisions
      WHERE project_id = ? AND user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 50`,
  ).all(projectId, userId) as unknown as SlateRevisionRow[]).map(revisionFromRow);
}

function pendingTitleSuggestionForProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateTitleSuggestion | null {
  const row = db.prepare(
    `SELECT id, suggested_title, reason, provider, model, created_at
       FROM slate_title_suggestions
      WHERE project_id = ? AND user_id = ? AND status = 'pending'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
  ).get(projectId, userId) as
    | {
        id: string;
        suggested_title: string;
        reason: string;
        provider: string;
        model: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    title: row.suggested_title,
    reason: row.reason,
    provider: providerValue(row.provider) ?? "local",
    model: row.model,
    createdAt: row.created_at,
  };
}

function summaryFromRow(row: SlateProjectRow): SlateProjectSummary {
  return {
    id: row.id,
    seriesId: row.series_id,
    bookOrdinal: row.book_ordinal,
    title: row.title,
    titleOrigin: titleOriginValue(row.title_origin),
    spark: row.spark,
    premise: row.premise,
    phase: phaseValue(row.phase),
    cover: storedProjectCover(row),
    manuscriptLength: row.manuscript.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function titleOriginValue(value: unknown): SlateProjectTitleOrigin {
  return value === "spark" || value === "material" ? value : "writer";
}

function detailFromRow(db: DatabaseSync, row: SlateProjectRow): SlateProjectDetail {
  return {
    ...summaryFromRow(row),
    sparkWildcards: storedSparkWildcards(row),
    voice: row.voice,
    nonNegotiables: Array.isArray(parseJson(row.non_negotiables_json, []))
      ? (parseJson(row.non_negotiables_json, []) as unknown[]).filter((item): item is string => typeof item === "string")
      : [],
    structure: storedStructure(row),
    characters: storedCharacters(row),
    unresolvedThreads: storedThreads(row),
    manuscript: row.manuscript,
    direction: row.direction,
    lockedRanges: storedLockedRanges(row),
    lastProvider: providerValue(row.last_provider),
    lastModel: row.last_model,
    proseMode: proseModeValue(row.prose_mode),
    proseModel: row.prose_model,
    proseProvider: providerValue(row.prose_provider),
    deliberationConfig: storedSlateDeliberationConfig(row),
    titleSuggestion: pendingTitleSuggestionForProject(db, row.user_id, row.id),
    revisions: revisionsForProject(db, row.user_id, row.id),
    versions: versionsForProject(db, row.user_id, row.id),
  };
}

function projectRow(db: DatabaseSync, userId: string, projectId: string): SlateProjectRow {
  const row = db.prepare(
    "SELECT * FROM slate_projects WHERE id = ? AND user_id = ?",
  ).get(projectId, userId) as SlateProjectRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

export function listSlateProjects(db: DatabaseSync, userId: string): SlateProjectSummary[] {
  return (db.prepare(
    `SELECT * FROM slate_projects
      WHERE user_id = ?
      ORDER BY updated_at DESC`,
  ).all(userId) as unknown as SlateProjectRow[]).map(summaryFromRow);
}

export function getSlateProject(db: DatabaseSync, userId: string, projectId: string): SlateProjectDetail {
  return detailFromRow(db, projectRow(db, userId, projectId));
}

export function setSlateProjectCover(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  cover: SlateProjectCover,
): SlateProjectDetail {
  projectRow(db, userId, projectId);
  db.prepare(
    "UPDATE slate_projects SET cover_json = ? WHERE id = ? AND user_id = ?",
  ).run(JSON.stringify(cover), projectId, userId);
  return getSlateProject(db, userId, projectId);
}

export function createSlateProject(
  db: DatabaseSync,
  userId: string,
  input: {
    title: unknown;
    titleOrigin?: unknown;
    spark: unknown;
    sparkWildcards?: unknown;
    seriesId?: unknown;
  },
): SlateProjectDetail {
  const id = randomId();
  const now = new Date().toISOString();
  const title = boundedString(input.title, "Project title", SLATE_TITLE_MAX, { required: true });
  const titleOrigin = titleOriginValue(input.titleOrigin);
  const spark = boundedString(input.spark, "Creative spark", SLATE_SPARK_MAX, { required: true });
  const sparkWildcards = normalizedSparkWildcards(input.sparkWildcards, spark);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const placement = resolveSlateSeriesPlacementForNewProject(
      db,
      userId,
      title,
      input.seriesId,
    );
    db.prepare(
      `INSERT INTO slate_projects
        (id, user_id, series_id, book_ordinal, title, title_origin, spark,
         spark_wildcards_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      placement.seriesId,
      placement.ordinal,
      title,
      titleOrigin,
      spark,
      sparkWildcards ? JSON.stringify(sparkWildcards) : "",
      now,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateProject(db, userId, id);
}

export function updateSlateProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  rawPatch: unknown,
): SlateProjectDetail {
  if (!isRecord(rawPatch)) throw new Error("Slate project update must be an object.");
  const current = projectRow(db, userId, projectId);
  const patch = rawPatch as SlateProjectPatchRequest & Record<string, unknown>;
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  let nextManuscript = current.manuscript;
  let nextSpark = current.spark;
  let nextStructure: SlateStructureItem[] | null = null;

  const assign = (column: string, value: string | null): void => {
    assignments.push(`${column} = ?`);
    values.push(value);
  };
  if (Object.hasOwn(patch, "title")) {
    assign("title", boundedString(patch.title, "Project title", SLATE_TITLE_MAX, { required: true }));
    assign("title_origin", "writer");
  }
  if (Object.hasOwn(patch, "spark")) {
    nextSpark = boundedString(patch.spark, "Creative spark", SLATE_SPARK_MAX, { required: true });
    assign("spark", nextSpark);
    if (!Object.hasOwn(patch, "sparkWildcards")) assign("spark_wildcards_json", "");
  }
  if (Object.hasOwn(patch, "sparkWildcards")) {
    const sparkWildcards = normalizedSparkWildcards(patch.sparkWildcards, nextSpark);
    assign("spark_wildcards_json", sparkWildcards ? JSON.stringify(sparkWildcards) : "");
  }
  if (Object.hasOwn(patch, "premise")) assign("premise", boundedString(patch.premise, "Premise", 16_000));
  if (Object.hasOwn(patch, "voice")) assign("voice", boundedString(patch.voice, "Voice", 8_000));
  if (Object.hasOwn(patch, "direction")) assign("direction", boundedString(patch.direction, "Direction", SLATE_DIRECTION_MAX));
  if (Object.hasOwn(patch, "phase")) assign("phase", phaseValue(patch.phase));
  if (Object.hasOwn(patch, "proseMode")) {
    if (
      patch.proseMode !== "auto" &&
      patch.proseMode !== "online" &&
      patch.proseMode !== "offline"
    ) {
      throw new Error("Slate prose mode is invalid.");
    }
    assign("prose_mode", patch.proseMode);
  }
  if (Object.hasOwn(patch, "proseModel")) {
    const model = boundedString(patch.proseModel, "Slate prose model", 240);
    assign("prose_model", model || null);
  }
  if (Object.hasOwn(patch, "proseProvider")) {
    assign("prose_provider", optionalProviderValue(patch.proseProvider));
  }
  if (Object.hasOwn(patch, "deliberationConfig")) {
    assign(
      "deliberation_config_json",
      JSON.stringify(normalizeSlateDeliberationConfig(patch.deliberationConfig)),
    );
  }
  if (Object.hasOwn(patch, "nonNegotiables")) assign("non_negotiables_json", JSON.stringify(stringArray(patch.nonNegotiables, "Non-negotiables", 60)));
  if (Object.hasOwn(patch, "structure")) {
    nextStructure = normalizeStructure(patch.structure);
  }
  if (Object.hasOwn(patch, "characters")) assign("characters_json", JSON.stringify(normalizeCharacters(patch.characters)));
  if (Object.hasOwn(patch, "unresolvedThreads")) assign("unresolved_threads_json", JSON.stringify(normalizeThreads(patch.unresolvedThreads)));
  if (Object.hasOwn(patch, "manuscript")) {
    if (typeof patch.manuscript !== "string") throw new Error("Manuscript must be text.");
    if (patch.manuscript.length > SLATE_MANUSCRIPT_MAX) throw new Error("Manuscript is too large for Slate V1.");
    nextManuscript = patch.manuscript;
    assign("manuscript", nextManuscript);
  }
  if (Object.hasOwn(patch, "lockedRanges")) {
    const currentLockedRanges = storedLockedRanges(current);
    let suppliedCurrentRanges: SlateLockedRange[] | null = null;
    try {
      suppliedCurrentRanges = normalizeLockedRanges(
        patch.lockedRanges,
        current.manuscript.length,
      );
    } catch {
      // It may be an intentional range authored against the new manuscript.
    }
    const lockedRanges =
      current.manuscript !== nextManuscript &&
      JSON.stringify(suppliedCurrentRanges) === JSON.stringify(currentLockedRanges)
        ? transformSlateLockedRangesForTextEdit(
            current.manuscript,
            nextManuscript,
            currentLockedRanges,
          )
        : normalizeLockedRanges(patch.lockedRanges, nextManuscript.length);
    assign("locked_ranges_json", JSON.stringify(lockedRanges));
  } else if (nextManuscript !== current.manuscript) {
    assign(
      "locked_ranges_json",
      JSON.stringify(
        transformSlateLockedRangesForTextEdit(
          current.manuscript,
          nextManuscript,
          storedLockedRanges(current),
        ),
      ),
    );
  }

  if (assignments.length === 0 && !nextStructure) return detailFromRow(db, current);
  if (assignments.length > 0) {
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString(), projectId, userId);
    db.prepare(
      `UPDATE slate_projects SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`,
    ).run(...values);
  }
  if (nextStructure) {
    replaceSlateProjectStructure(db, userId, projectId, nextStructure);
  }
  return getSlateProject(db, userId, projectId);
}

export function deleteSlateProject(db: DatabaseSync, userId: string, projectId: string): void {
  const result = db.prepare("DELETE FROM slate_projects WHERE id = ? AND user_id = ?").run(projectId, userId);
  if (result.changes === 0) throw new Error("Slate project not found.");
}

export async function resolveSlateProjectSparkWildcards(
  templateInput: unknown,
  ai: SlateAiOperationInput,
  botCandidates: readonly PromptBotWildcardCandidate[] = [],
): Promise<{ spark: string; sparkWildcards: PromptWildcardRunMetadata }> {
  const template = boundedString(
    templateInput,
    "Wildcard spark template",
    SLATE_SPARK_MAX,
    { required: true },
  );
  const names = promptWildcardNames(template);
  if (names.length === 0) {
    throw new Error("Add at least one supported uppercase {WILDCARD} to the creative spark.");
  }

  let prompt = template;
  let replacements: PromptWildcardRunMetadata["wildcardReplacements"] = [];
  if (names.includes("BOT")) {
    if (botCandidates.length === 0) {
      throw new Error("Add a bot to your library before using {BOT} in Slate.");
    }
    const botResolution = resolvePromptBotWildcards({
      prompt,
      candidates: botCandidates,
      existingReplacements: replacements,
    });
    prompt = botResolution.prompt;
    replacements = botResolution.replacements;
  }

  const resolution = await resolvePromptWildcardsWithModel({
    prompt,
    provider: ai.provider,
    generationOverrides: {
      model: ai.model,
      temperature: 0.72,
      maxTokens: 900,
      usagePurpose: "prompt_wildcard",
    },
    existingReplacements: replacements,
  });
  const spark = boundedString(
    resolution.prompt,
    "Resolved wildcard spark",
    SLATE_SPARK_MAX,
    { required: true },
  );
  return {
    spark,
    sparkWildcards: {
      v: 1,
      template,
      resolvedPrompt: spark,
      ...(resolution.replacements.length > 0
        ? { wildcardReplacements: resolution.replacements }
        : {}),
    },
  };
}

function parseGeneratedJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const attempts = [trimmed];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(trimmed.slice(first, last + 1));
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Try the next bounded candidate.
    }
  }
  throw new Error("Slate could not read the generated story plan.");
}

function generatedShape(value: Record<string, unknown>): {
  premise: string;
  voice: string;
  nonNegotiables: string[];
  structure: SlateStructureItem[];
  characters: SlateCharacter[];
  unresolvedThreads: SlateUnresolvedThread[];
} {
  const items = Array.isArray(value.structure) ? value.structure : [];
  if (items.length < 1) throw new Error("Slate's generated plan did not include any scenes.");
  const structure = items.slice(0, 24).map((item, index): SlateStructureItem => {
    if (!isRecord(item)) throw new Error(`Generated structure item ${index + 1} is invalid.`);
    return {
      id: randomId(8),
      kind: item.kind === "act" || item.kind === "chapter" ? item.kind : "scene",
      title: boundedString(item.title, `Generated structure item ${index + 1} title`, 240, { required: true }),
      summary: boundedString(item.summary, `Generated structure item ${index + 1} summary`, 4_000, { required: true }),
      direction: boundedString(item.direction, `Generated structure item ${index + 1} direction`, 2_000),
      status: "planned",
      locked: false,
    };
  });
  const generatedCharacters = Array.isArray(value.characters) ? value.characters : [];
  const characters = generatedCharacters.slice(0, 24).map((item, index): SlateCharacter => {
    const record = typeof item === "string" ? { name: item } : item;
    if (!isRecord(record)) throw new Error(`Generated character ${index + 1} is invalid.`);
    return {
      id: randomId(8),
      name: boundedString(record.name, `Generated character ${index + 1} name`, 180, { required: true }),
      role: boundedString(record.role, `Generated character ${index + 1} role`, 1_000),
      voice: boundedString(record.voice, `Generated character ${index + 1} voice`, 1_000),
      locked: false,
    };
  });
  const generatedThreads = Array.isArray(value.unresolvedThreads) ? value.unresolvedThreads : [];
  const unresolvedThreads = generatedThreads.slice(0, 30).map((item, index): SlateUnresolvedThread => ({
    id: randomId(8),
    label: boundedString(
      typeof item === "string" ? item : isRecord(item) ? item.label : "",
      `Generated unresolved thread ${index + 1}`,
      1_000,
      { required: true },
    ),
    resolved: false,
    locked: false,
  }));
  return {
    premise: boundedString(value.premise, "Generated premise", 16_000, { required: true }),
    voice: boundedString(value.voice, "Generated voice", 8_000),
    nonNegotiables: Array.isArray(value.nonNegotiables)
      ? stringArray(value.nonNegotiables, "Generated non-negotiables", 30)
      : [],
    structure,
    characters,
    unresolvedThreads,
  };
}

const SLATE_SHAPE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["premise", "voice", "nonNegotiables", "structure", "characters", "unresolvedThreads"],
  properties: {
    premise: { type: "string" },
    voice: { type: "string" },
    nonNegotiables: { type: "array", items: { type: "string" } },
    structure: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "summary", "direction"],
        properties: {
          kind: { enum: ["act", "chapter", "scene"] },
          title: { type: "string" },
          summary: { type: "string" },
          direction: { type: "string" },
        },
      },
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "voice"],
        properties: { name: { type: "string" }, role: { type: "string" }, voice: { type: "string" } },
      },
    },
    unresolvedThreads: { type: "array", items: { type: "string" } },
  },
};

export async function generateSlateShape(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  ai: SlateAiOperationInput,
): Promise<SlateProjectDetail> {
  // Section migration and its hierarchy backfill must settle before capturing
  // the Shape compare-and-swap token. No migration is attempted inside the
  // later atomic commit.
  ensureSlateProjectSections(db, userId, projectId);
  const projectSnapshot = projectRow(db, userId, projectId);
  const sectionSnapshot = slateShapeSectionStateRows(db, userId, projectId);
  if (slateShapeStateHasLocks(projectSnapshot, sectionSnapshot)) {
    throw new SlateShapeWriteConflictError(
      projectId,
      projectSnapshot.updated_at,
      "locked",
    );
  }
  const project = detailFromRow(db, projectSnapshot);
  const raw = await ai.provider.generateResponse(
    [
      {
        role: "system",
        content: "You are Slate, PRISM's prose-fiction story architect. The writer directs; you turn their spark into a practical, specific plan. Return strict JSON only.",
      },
      {
        role: "user",
        content: [
          `Project title: ${project.title}`,
          `Creative spark: ${project.spark}`,
          "Propose a concise premise, prose voice, non-negotiables, characters, unresolved dramatic threads, and an ordered plan of acts, chapters, or scenes appropriate to the idea.",
          "Prefer 3-8 concrete scene-sized items for a short idea. Every item needs kind, title, summary, and useful drafting direction.",
        ].join("\n"),
      },
    ],
    {
      model: ai.model,
      temperature: 0.7,
      maxTokens: 3_000,
      jsonMode: true,
      jsonSchema: SLATE_SHAPE_JSON_SCHEMA,
      jsonSchemaName: "prism_slate_shape",
      usagePurpose: "slate_shape",
    },
  );
  const shape = generatedShape(parseGeneratedJson(raw));
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const current = db.prepare(
      "SELECT * FROM slate_projects WHERE id = ? AND user_id = ?",
    ).get(projectId, userId) as SlateProjectRow | undefined;
    if (!current) {
      throw new SlateShapeWriteConflictError(projectId, null, "changed");
    }
    const currentSections = slateShapeSectionStateRows(db, userId, projectId);
    const projectChanged =
      slateShapeProjectStateToken(current) !==
      slateShapeProjectStateToken(projectSnapshot);
    const sectionsChanged =
      slateShapeSectionStateToken(currentSections) !==
      slateShapeSectionStateToken(sectionSnapshot);
    if (projectChanged || sectionsChanged) {
      const reason: SlateShapeWriteConflictReason = slateShapeStateHasLocks(
        current,
        currentSections,
      )
        ? "locked"
        : current.structure_json !== projectSnapshot.structure_json || sectionsChanged
          ? "structure_changed"
          : "changed";
      throw new SlateShapeWriteConflictError(
        projectId,
        current.updated_at,
        reason,
      );
    }

    const projectUpdate = db.prepare(
      `UPDATE slate_projects
          SET premise = ?, voice = ?, non_negotiables_json = ?,
              characters_json = ?, unresolved_threads_json = ?, last_provider = ?,
              last_model = ?, phase = 'shape', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      shape.premise,
      shape.voice,
      JSON.stringify(shape.nonNegotiables),
      JSON.stringify(shape.characters),
      JSON.stringify(shape.unresolvedThreads),
      ai.providerName,
      ai.model,
      now,
      projectId,
      userId,
    );
    if (projectUpdate.changes !== 1) {
      throw new SlateShapeWriteConflictError(projectId, null, "changed");
    }
    replaceSlateProjectStructureWithinTransaction(
      db,
      userId,
      projectId,
      shape.structure,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateProject(db, userId, projectId);
}

function cleanGeneratedProse(raw: string, allowEmpty = false): string {
  const cleaned = raw.trim().replace(/^```(?:markdown|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!cleaned && !allowEmpty) throw new Error("Slate returned an empty draft.");
  return cleaned;
}

function structureContext(structure: readonly SlateStructureItem[]): string {
  return structure.map((item, index) => `${index + 1}. [${item.kind}] ${item.title}: ${item.summary}${item.locked ? " (LOCKED)" : ""}`).join("\n");
}

function focusedStructureContext(
  structure: readonly SlateStructureItem[],
  structureItemId: string,
): string {
  const index = structure.findIndex((item) => item.id === structureItemId);
  if (index < 0) return structureContext(structure.slice(0, 5));
  const start = Math.max(0, index - 2);
  return structureContext(structure.slice(start, index + 3));
}

export async function draftSlateStructureItem(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  structureItemId: string,
  direction: unknown,
  ai: SlateAiOperationInput,
): Promise<SlateProjectDetail> {
  synchronizeSlateStructureSections(db, userId, projectId);
  const projectSnapshot = projectRow(db, userId, projectId);
  const project = detailFromRow(db, projectSnapshot);
  const item = project.structure.find((candidate) => candidate.id === structureItemId);
  if (!item) throw new Error("Slate structure item not found.");
  if (item.status === "drafted") {
    throw new Error("This section is already drafted. Use Refine to propose a replacement.");
  }
  const sectionSummary = listSlateProjectSections(db, userId, projectId).find(
    (section) => section.structureItemId === structureItemId,
  );
  if (!sectionSummary) throw new Error("Slate section not found.");
  const sectionSnapshot = getSlateProjectSection(
    db,
    userId,
    projectId,
    sectionSummary.id,
  );
  if (item.locked || sectionSnapshot.locked || sectionSnapshot.lockedRanges.length > 0) {
    throw new SlateSectionAiWriteConflictError(
      sectionSnapshot.id,
      sectionSnapshot.revision,
      sectionSnapshot.contentHash,
      "locked",
    );
  }
  if (sectionSnapshot.prose.length > 0) {
    throw new SlateSectionAiWriteConflictError(
      sectionSnapshot.id,
      sectionSnapshot.revision,
      sectionSnapshot.contentHash,
      "contains_prose",
    );
  }
  const focusedDirection = boundedString(direction, "Draft direction", SLATE_DIRECTION_MAX);
  const continuity = compileSlateDraftContinuityContext(
    db,
    userId,
    projectId,
    item.id,
    focusedDirection,
  );
  const raw = await ai.provider.generateResponse(
    [
      {
        role: "system",
        content: "You are Slate, a prose-fiction drafting engine. Write finished manuscript prose, not commentary, planning notes, or a chat reply. Respect every locked fact and non-negotiable.",
      },
      {
        role: "user",
        content: [
          `Project: ${project.title}`,
          `Premise: ${project.premise || project.spark}`,
          `Voice: ${project.voice || "Choose a voice that serves the premise."}`,
          `Non-negotiables: ${project.nonNegotiables.join("; ") || "None stated."}`,
          `Characters: ${project.characters.slice(0, 16).map((character) => `${character.name} — ${character.role}; voice: ${character.voice}`).join(" | ") || "Infer only what the scene needs."}`,
          "Approved nearby structure:",
          focusedStructureContext(project.structure, item.id),
          "Private Continuity brief:",
          continuity.renderedBrief,
          `Write now: ${item.kind} "${item.title}" — ${item.summary}`,
          `Section direction: ${item.direction || "Follow the approved summary."}`,
          `Writer's immediate direction: ${focusedDirection || project.direction || "Draft the section cleanly and move the story."}`,
          "Return only the new prose for this section. Do not repeat the section title.",
        ].join("\n\n"),
      },
    ],
    {
      model: ai.model,
      temperature: 0.82,
      maxTokens: 4_000,
      usagePurpose: "slate_draft",
    },
  );
  const prose = cleanGeneratedProse(raw);
  replaceSlateSectionWithAiProse(
    db,
    userId,
    projectId,
    item.id,
    {
      prose,
      status: "drafted",
      sourceKind: "ai_draft",
      provider: ai.providerName,
      model: ai.model,
      expectedSectionId: sectionSnapshot.id,
      expectedRevision: sectionSnapshot.revision,
      expectedContentHash: sectionSnapshot.contentHash,
      expectedStructureJson: projectSnapshot.structure_json,
    },
  );
  return getSlateProject(db, userId, projectId);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function sceneRange(project: SlateProjectDetail, structureItemId: string): { start: number; end: number } {
  const index = project.structure.findIndex((item) => item.id === structureItemId);
  if (index < 0) throw new Error("Slate structure item not found.");
  const item = project.structure[index]!;
  if (item.locked) throw new Error("This structure item is locked and cannot be revised.");
  const marker = `${item.title}\n`;
  const start = project.manuscript.indexOf(marker);
  if (start < 0) throw new Error("Slate could not locate this section in the manuscript.");
  let end = project.manuscript.length;
  for (const next of project.structure.slice(index + 1)) {
    const nextStart = project.manuscript.indexOf(`${next.title}\n`, start + marker.length);
    if (nextStart >= 0) {
      end = nextStart;
      break;
    }
  }
  return { start, end };
}

function revisionTarget(
  project: SlateProjectDetail,
  request: SlateRevisionRequest,
): { scope: SlateRevisionScope; structureItemId: string | null; start: number | null; end: number | null; text: string } {
  const scope = revisionScope(request.scope);
  if (!project.manuscript.trim()) throw new Error("Draft manuscript prose before requesting a revision.");
  if (scope === "project") {
    if (project.lockedRanges.length > 0 || project.structure.some((item) => item.locked && item.status === "drafted")) {
      throw new Error("Project-wide revision is unavailable while manuscript material is locked. Revise an unlocked selection instead.");
    }
    return { scope, structureItemId: null, start: null, end: null, text: project.manuscript };
  }
  let start: number;
  let end: number;
  let structureItemId: string | null = null;
  if (scope === "scene") {
    structureItemId = boundedString(request.structureItemId, "Structure item", 120, { required: true });
    ({ start, end } = sceneRange(project, structureItemId));
  } else {
    start = typeof request.selectionStart === "number" && Number.isInteger(request.selectionStart) ? request.selectionStart : -1;
    end = typeof request.selectionEnd === "number" && Number.isInteger(request.selectionEnd) ? request.selectionEnd : -1;
    if (start < 0 || end <= start || end > project.manuscript.length) {
      throw new Error("Select manuscript prose before requesting a selection revision.");
    }
  }
  if (project.lockedRanges.some((range) => rangesOverlap(start, end, range.start, range.end))) {
    throw new Error("The requested revision overlaps locked manuscript text.");
  }
  return { scope, structureItemId, start, end, text: project.manuscript.slice(start, end) };
}

export async function proposeSlateRevision(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  rawRequest: unknown,
  ai: SlateAiOperationInput,
): Promise<SlateProjectDetail> {
  if (!isRecord(rawRequest)) throw new Error("Slate revision request must be an object.");
  const request = rawRequest as unknown as SlateRevisionRequest;
  const action = revisionAction(request.action);
  ensureSlateProjectSections(db, userId, projectId);
  const project = getSlateProject(db, userId, projectId);
  if (project.revisions.some((revision) => revision.status === "pending")) {
    throw new Error("Accept or reject the current Slate revision before requesting another.");
  }
  const target = revisionTarget(project, request);
  const projectionSpans = slateSectionProjectionSpans(db, userId, projectId);
  if (target.scope === "project" && projectionSpans.length > 1) {
    throw new Error(
      "Project-wide revision spans multiple sections. Refine one section or selection at a time.",
    );
  }
  if (
    target.scope === "selection" &&
    !projectionSpans.some(
      (span) => target.start! >= span.bodyStart && target.end! <= span.bodyEnd,
    )
  ) {
    throw new Error("Select prose within one section before requesting a revision.");
  }
  assertSlateRevisionTargetUnlocked(db, userId, projectId, {
    structureItemId: target.structureItemId,
    start: target.start,
    end: target.end,
  });
  const direction = boundedString(request.direction, "Revision direction", SLATE_DIRECTION_MAX);
  const raw = await ai.provider.generateResponse(
    [
      {
        role: "system",
        content: "You are Slate, a precise prose-fiction reviser. Return only the proposed replacement prose. Preserve facts, voice, intent, and any direction not explicitly changed. Never explain your work.",
      },
      {
        role: "user",
        content: [
          `Project: ${project.title}`,
          `Premise: ${project.premise || project.spark}`,
          `Voice: ${project.voice || "Preserve the manuscript's voice."}`,
          `Revision action: ${action}`,
          `Writer direction: ${direction || project.direction || "Improve the passage according to the action."}`,
          `Scope: ${target.scope}`,
          "Original prose:",
          target.text,
          action === "cut" ? "Return the smallest coherent replacement, which may be empty when the passage should be removed entirely." : "Return the complete replacement prose only.",
        ].join("\n\n"),
      },
    ],
    {
      model: ai.model,
      temperature: 0.65,
      maxTokens: 5_000,
      usagePurpose: "slate_revision",
    },
  );
  const proposedText = cleanGeneratedProse(raw, action === "cut");
  const id = randomId();
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `INSERT INTO slate_revisions
        (id, project_id, user_id, action, scope, structure_item_id, selection_start,
         selection_end, direction, original_text, proposed_text, status, provider,
         model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(
      id,
      projectId,
      userId,
      action,
      target.scope,
      target.structureItemId,
      target.start,
      target.end,
      direction,
      target.text,
      proposedText,
      ai.providerName,
      ai.model,
      now,
    );
    recordSlateGenerationReceipt(db, {
      userId,
      projectId,
      revisionId: id,
      operation: "revision",
      artifact: proposedText,
      provider: ai.providerName,
      model: ai.model,
      status: "proposed",
      createdAt: now,
    });
    db.prepare(
      `UPDATE slate_projects SET phase = 'refine', last_provider = ?, last_model = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(ai.providerName, ai.model, now, projectId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateProject(db, userId, projectId);
}

function pendingRevisionRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  revisionId: string,
): SlateRevisionRow {
  const row = db.prepare(
    `SELECT * FROM slate_revisions
      WHERE id = ? AND project_id = ? AND user_id = ?`,
  ).get(revisionId, projectId, userId) as SlateRevisionRow | undefined;
  if (!row) throw new Error("Slate revision not found.");
  if (row.status !== "pending") throw new Error("This Slate revision has already been resolved.");
  return row;
}

export function acceptSlateRevision(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  revisionId: string,
): SlateProjectDetail {
  const revision = pendingRevisionRow(db, userId, projectId, revisionId);
  ensureSlateProjectSections(db, userId, projectId);
  const project = projectRow(db, userId, projectId);
  const currentLockedRanges = storedLockedRanges(project);
  let manuscript: string;
  let lockedRanges = currentLockedRanges;
  if (revision.selection_start === null || revision.selection_end === null) {
    if (currentLockedRanges.length > 0) {
      throw new Error("The manuscript now contains locked prose. Request a scoped revision that leaves it untouched.");
    }
    if (project.manuscript !== revision.original_text) {
      throw new Error("The manuscript changed after this proposal. Request a fresh revision so your edits stay authoritative.");
    }
    manuscript = revision.proposed_text;
  } else {
    const selectionStart = revision.selection_start;
    const selectionEnd = revision.selection_end;
    if (
      currentLockedRanges.some((range) =>
        rangesOverlap(
          selectionStart,
          selectionEnd,
          range.start,
          range.end,
        ),
      )
    ) {
      throw new Error("This proposal now overlaps locked manuscript text. Unlock it or request a fresh revision.");
    }
    const current = project.manuscript.slice(selectionStart, selectionEnd);
    if (current !== revision.original_text) {
      throw new Error("The revised passage changed after this proposal. Request a fresh revision so your edits stay authoritative.");
    }
    manuscript = `${project.manuscript.slice(0, selectionStart)}${revision.proposed_text}${project.manuscript.slice(selectionEnd)}`;
    lockedRanges = transformSlateLockedRangesForTextEdit(
      project.manuscript,
      manuscript,
      currentLockedRanges,
    );
  }
  if (manuscript.length > SLATE_MANUSCRIPT_MAX) throw new Error("This revision would exceed Slate V1's manuscript size limit.");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `INSERT INTO slate_versions
        (id, project_id, user_id, reason, structure_json, manuscript, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomId(), projectId, userId, `Before ${revision.action} revision`, project.structure_json, project.manuscript, now);
    manuscript = applyAcceptedSlateRevisionWithinTransaction(db, {
      userId,
      projectId,
      structureItemId: revision.structure_item_id,
      selectionStart: revision.selection_start,
      selectionEnd: revision.selection_end,
      originalText: revision.original_text,
      proposedText: revision.proposed_text,
      provider: providerValue(revision.provider) ?? "local",
      model: revision.model,
      reason: `Before ${revision.action} revision`,
      now,
    });
    db.prepare(
      `UPDATE slate_projects
          SET manuscript = ?, locked_ranges_json = ?, phase = 'refine', updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(manuscript, JSON.stringify(lockedRanges), now, projectId, userId);
    db.prepare(
      `UPDATE slate_revisions SET status = 'accepted', resolved_at = ?
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    ).run(now, revisionId, projectId, userId);
    db.prepare(
      `UPDATE slate_generation_receipts
          SET status = 'accepted', resolved_at = ?
        WHERE revision_id = ? AND project_id = ? AND user_id = ?`,
    ).run(now, revisionId, projectId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getSlateProject(db, userId, projectId);
}

export function rejectSlateRevision(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  revisionId: string,
): SlateProjectDetail {
  pendingRevisionRow(db, userId, projectId, revisionId);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_revisions SET status = 'rejected', resolved_at = ?
      WHERE id = ? AND project_id = ? AND user_id = ?`,
  ).run(now, revisionId, projectId, userId);
  db.prepare(
    `UPDATE slate_generation_receipts
        SET status = 'rejected', resolved_at = ?
      WHERE revision_id = ? AND project_id = ? AND user_id = ?`,
  ).run(now, revisionId, projectId, userId);
  db.prepare("UPDATE slate_projects SET updated_at = ? WHERE id = ? AND user_id = ?").run(now, projectId, userId);
  return getSlateProject(db, userId, projectId);
}
