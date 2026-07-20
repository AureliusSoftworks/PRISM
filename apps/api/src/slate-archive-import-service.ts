import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createSlateArchiveBundle,
  createSlateRecoverySnapshot,
  type SlateArchiveBundleV1,
  type SlateArchiveManifestV1,
  type SlateSafetyContentV1,
  type SlateSafetyRow,
} from "./slate-author-safety.ts";
import {
  decodeSlateArchiveZip,
  encodeSlateArchiveZip,
} from "./slate-archive-zip.ts";
import { randomId } from "./security.ts";

export const SLATE_ARCHIVE_MEDIA_TYPE = "application/vnd.prism.slate+zip" as const;

const REQUIRED_ARCHIVE_FILES = [
  "data/continuity.json",
  "data/manuscript.json",
  "data/project.json",
  "manuscript.md",
] as const;
const COPY_SUFFIX = " (Recovered copy)";
const IMPORTED_SERIES_SUFFIX = " (Imported)";
const MAX_TITLE_LENGTH = 180;
const MAX_ARCHIVE_ROWS = 500_000;

interface RowSpec {
  columns: readonly string[];
  numeric?: readonly string[];
  nullable?: readonly string[];
  optionalDefaults?: Readonly<Record<string, string | number | null>>;
}

const SERIES_SPEC: RowSpec = {
  columns: ["id", "title", "description", "created_at", "updated_at"],
};

const PROJECT_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "book_ordinal", "title", "title_origin", "spark",
    "spark_wildcards_json", "premise", "voice", "non_negotiables_json",
    "phase", "structure_json", "characters_json", "unresolved_threads_json",
    "direction", "locked_ranges_json", "last_provider", "last_model",
    "prose_mode", "prose_model", "prose_provider", "deliberation_config_json",
    "continuity_active_version", "continuity_target_version",
    "continuity_active_generation", "continuity_previous_generation",
    "continuity_upgrade_status", "continuity_last_success_at", "created_at",
    "updated_at",
  ],
  numeric: [
    "book_ordinal", "continuity_active_generation",
    "continuity_previous_generation",
  ],
  nullable: [
    "last_provider", "last_model", "prose_model", "prose_provider",
    "continuity_previous_generation",
    "continuity_last_success_at",
  ],
  optionalDefaults: {
    title_origin: "writer",
    prose_mode: "auto",
    prose_model: null,
    prose_provider: null,
    deliberation_config_json: "{}",
  },
};

const REVISION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "action", "scope", "structure_item_id",
    "selection_start", "selection_end", "direction", "original_text",
    "proposed_text", "status", "provider", "model", "created_at",
    "resolved_at",
  ],
  numeric: ["selection_start", "selection_end"],
  nullable: [
    "structure_item_id", "selection_start", "selection_end", "resolved_at",
  ],
};

const VERSION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "reason", "structure_json", "manuscript", "created_at",
  ],
};

const SECTION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "series_id", "parent_section_id",
    "structure_item_id", "kind", "ordinal", "title", "summary", "direction",
    "prose", "locked_ranges_json", "locked", "status", "revision",
    "content_hash", "created_at", "updated_at",
  ],
  numeric: ["ordinal", "locked", "revision"],
  nullable: ["parent_section_id", "structure_item_id"],
};

const SECTION_VERSION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "revision", "reason", "title",
    "summary", "direction", "prose", "locked", "status", "content_hash",
    "created_at",
  ],
  numeric: ["revision", "locked"],
};

const CONTINUITY_SPECS = {
  generations: {
    columns: [
      "id", "project_id", "generation", "status", "target_version",
      "source_fingerprint", "comparison_summary", "producer_versions_json",
      "created_at", "completed_at",
    ],
    numeric: ["generation"],
    nullable: ["comparison_summary", "completed_at"],
  },
  sources: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "source_revision", "content", "content_hash", "authority", "provider",
      "model", "producer_versions_json", "supersedes_source_id", "created_at",
    ],
    numeric: ["source_revision"],
    nullable: [
      "project_id", "section_id", "provider", "model", "supersedes_source_id",
    ],
  },
  entities: {
    columns: [
      "id", "series_id", "kind", "canonical_name", "description", "locked",
      "anchors_json", "source_id", "producer_versions_json", "created_at",
      "updated_at",
    ],
    numeric: ["locked"],
    nullable: ["source_id"],
  },
  aliases: {
    columns: [
      "id", "series_id", "entity_id", "alias", "normalized_alias",
      "source_id", "created_at",
    ],
    nullable: ["source_id"],
  },
  claims: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind",
      "subject_entity_id", "predicate", "object_entity_id", "value",
      "epistemic_status", "perspective_entity_id", "confidence", "anchors_json",
      "source_id", "supersedes_claim_id", "producer_versions_json", "created_at",
    ],
    numeric: ["confidence"],
    nullable: [
      "project_id", "section_id", "subject_entity_id", "object_entity_id",
      "perspective_entity_id", "supersedes_claim_id",
    ],
  },
  events: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "title",
      "description", "chronology_key", "participant_entity_ids_json",
      "location_entity_id", "anchors_json", "source_id", "producer_versions_json",
      "created_at",
    ],
    nullable: [
      "project_id", "section_id", "chronology_key", "location_entity_id",
    ],
  },
  relationships: {
    columns: [
      "id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json",
      "created_at",
    ],
  },
  knowledge: {
    columns: [
      "id", "series_id", "character_entity_id", "claim_id", "learned_event_id",
      "status", "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
    nullable: ["learned_event_id"],
  },
  threads: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "label",
      "status", "due_section_id", "anchors_json", "source_id",
      "producer_versions_json", "created_at", "updated_at",
    ],
    nullable: ["project_id", "section_id", "due_section_id"],
  },
  concerns: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "severity", "status", "summary", "explanation", "claim_ids_json",
      "anchors_json", "recommended_resolution", "resolution_json",
      "producer_versions_json", "created_at", "resolved_at",
    ],
    nullable: [
      "project_id", "section_id", "recommended_resolution", "resolution_json",
      "resolved_at",
    ],
  },
} as const satisfies Record<keyof SlateSafetyContentV1["continuity"], RowSpec>;

export interface SlateProjectArchiveExport {
  filename: string;
  mediaType: typeof SLATE_ARCHIVE_MEDIA_TYPE;
  payload: Uint8Array;
  manifest: SlateArchiveManifestV1;
}

export interface SlateArchiveImportCounts {
  revisions: number;
  versions: number;
  sections: number;
  sectionVersions: number;
  continuitySources: number;
  continuityEntities: number;
  continuityAliases: number;
  continuityClaims: number;
  continuityEvents: number;
  continuityRelationships: number;
  continuityKnowledge: number;
  continuityThreads: number;
  continuityConcerns: number;
  continuityGenerations: number;
}

export interface SlateArchiveImportPreview {
  format: "prism-slate-project-v1";
  version: 1;
  title: string;
  seriesTitle: string;
  originalProjectId: string;
  originalSeriesId: string;
  exportedAt: string;
  contentHash: string;
  counts: SlateArchiveImportCounts;
  willCreateCopy: true;
  sourceProjectExistsForCurrentUser: boolean;
}

export interface SlateArchiveImportResult extends SlateArchiveImportPreview {
  projectId: string;
  seriesId: string;
  importedAt: string;
  title: string;
  seriesTitle: string;
}

export interface SlateArchiveImportOptions {
  now?: Date;
  idFactory?: () => string;
}

interface ParsedArchive {
  bundle: SlateArchiveBundleV1;
  content: SlateSafetyContentV1;
  generationMetadataIncluded: boolean;
}

interface ImportMaps {
  seriesId: string;
  projectId: string;
  revisions: Map<string, string>;
  versions: Map<string, string>;
  sections: Map<string, string>;
  sectionVersions: Map<string, string>;
  generations: Map<string, string>;
  sources: Map<string, string>;
  entities: Map<string, string>;
  aliases: Map<string, string>;
  claims: Map<string, string>;
  events: Map<string, string>;
  relationships: Map<string, string>;
  knowledge: Map<string, string>;
  threads: Map<string, string>;
  concerns: Map<string, string>;
}

export class SlateArchiveImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlateArchiveImportError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SlateArchiveImportError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new SlateArchiveImportError(`${label} contains unsupported fields.`);
  }
}

function safeRow(value: unknown, spec: RowSpec, label: string): SlateSafetyRow {
  const candidate = {
    ...(spec.optionalDefaults ?? {}),
    ...record(value, label),
  };
  exactKeys(candidate, spec.columns, label);
  const numeric = new Set(spec.numeric ?? []);
  const nullable = new Set(spec.nullable ?? []);
  const output: SlateSafetyRow = {};
  for (const column of spec.columns) {
    const field = candidate[column];
    if (field === null) {
      if (!nullable.has(column)) {
        throw new SlateArchiveImportError(`${label}.${column} cannot be null.`);
      }
      output[column] = null;
      continue;
    }
    if (numeric.has(column)) {
      if (typeof field !== "number" || !Number.isFinite(field)) {
        throw new SlateArchiveImportError(`${label}.${column} must be a number.`);
      }
      if (column !== "confidence" && !Number.isSafeInteger(field)) {
        throw new SlateArchiveImportError(`${label}.${column} must be an integer.`);
      }
      output[column] = field;
      continue;
    }
    if (typeof field !== "string") {
      throw new SlateArchiveImportError(`${label}.${column} must be text.`);
    }
    if ((column === "id" || column.endsWith("_id")) && field.length === 0) {
      throw new SlateArchiveImportError(`${label}.${column} cannot be empty.`);
    }
    if (column.endsWith("_at") && !Number.isFinite(Date.parse(field))) {
      throw new SlateArchiveImportError(`${label}.${column} is not a valid timestamp.`);
    }
    if (column.endsWith("_json") && field.length > 0) {
      try {
        JSON.parse(field);
      } catch {
        throw new SlateArchiveImportError(`${label}.${column} is not valid JSON.`);
      }
    }
    output[column] = field;
  }
  return output;
}

function safeRows(value: unknown, spec: RowSpec, label: string): SlateSafetyRow[] {
  if (!Array.isArray(value)) {
    throw new SlateArchiveImportError(`${label} must be an array.`);
  }
  if (value.length > MAX_ARCHIVE_ROWS) {
    throw new SlateArchiveImportError(`${label} contains too many rows.`);
  }
  return value.map((row, index) => safeRow(row, spec, `${label}[${index}]`));
}

function parseJsonFile(bundle: SlateArchiveBundleV1, path: string): Record<string, unknown> {
  try {
    return record(JSON.parse(bundle.files[path]!), path);
  } catch (error) {
    if (error instanceof SlateArchiveImportError) throw error;
    throw new SlateArchiveImportError(`${path} is not valid JSON.`);
  }
}

function validateManifest(bundle: SlateArchiveBundleV1): void {
  const manifest = record(bundle.manifest, "manifest.json");
  exactKeys(
    manifest,
    ["format", "version", "exportedAt", "project", "continuity", "contentHash", "files"],
    "manifest.json",
  );
  const project = record(manifest.project, "manifest.json.project");
  exactKeys(project, ["id", "title", "seriesId"], "manifest.json.project");
  const continuity = record(manifest.continuity, "manifest.json.continuity");
  exactKeys(
    continuity,
    ["activeVersion", "targetVersion", "activeGeneration"],
    "manifest.json.continuity",
  );
  if (!Array.isArray(manifest.files)) {
    throw new SlateArchiveImportError("manifest.json.files must be an array.");
  }
  for (const [index, value] of manifest.files.entries()) {
    exactKeys(
      record(value, `manifest.json.files[${index}]`),
      ["path", "mediaType", "bytes", "sha256"],
      `manifest.json.files[${index}]`,
    );
  }
  const paths = Object.keys(bundle.files).sort();
  if (
    paths.length !== REQUIRED_ARCHIVE_FILES.length ||
    paths.some((path, index) => path !== REQUIRED_ARCHIVE_FILES[index])
  ) {
    throw new SlateArchiveImportError(
      "Slate archive must contain only the v1 project, manuscript, Continuity, and Markdown files.",
    );
  }
}

function schemaOne(value: Record<string, unknown>, label: string): void {
  if (value.schemaVersion !== 1) {
    throw new SlateArchiveImportError(`Unsupported ${label} schema version.`);
  }
}

function parseArchive(payload: Uint8Array): ParsedArchive {
  const bundle = decodeSlateArchiveZip(payload);
  validateManifest(bundle);
  const projectData = parseJsonFile(bundle, "data/project.json");
  const manuscriptData = parseJsonFile(bundle, "data/manuscript.json");
  const continuityData = parseJsonFile(bundle, "data/continuity.json");
  exactKeys(projectData, ["schemaVersion", "series", "project"], "data/project.json");
  exactKeys(
    manuscriptData,
    ["schemaVersion", "revisions", "versions", "sections", "sectionVersions"],
    "data/manuscript.json",
  );
  const generationMetadataIncluded = Object.hasOwn(continuityData, "generations");
  const continuityKeys = Object.keys(CONTINUITY_SPECS).filter(
    (key) => generationMetadataIncluded || key !== "generations",
  );
  exactKeys(continuityData, ["schemaVersion", ...continuityKeys], "data/continuity.json");
  schemaOne(projectData, "project data");
  schemaOne(manuscriptData, "manuscript data");
  schemaOne(continuityData, "Continuity data");

  const continuity = Object.fromEntries(
    Object.entries(CONTINUITY_SPECS).map(([key, spec]) => [
      key,
      safeRows(continuityData[key] ?? [], spec, `data/continuity.json.${key}`),
    ]),
  ) as unknown as SlateSafetyContentV1["continuity"];
  const content: SlateSafetyContentV1 = {
    schemaVersion: 1,
    series: safeRow(projectData.series, SERIES_SPEC, "data/project.json.series"),
    project: safeRow(projectData.project, PROJECT_SPEC, "data/project.json.project"),
    revisions: safeRows(
      manuscriptData.revisions,
      REVISION_SPEC,
      "data/manuscript.json.revisions",
    ),
    versions: safeRows(
      manuscriptData.versions,
      VERSION_SPEC,
      "data/manuscript.json.versions",
    ),
    sections: safeRows(
      manuscriptData.sections,
      SECTION_SPEC,
      "data/manuscript.json.sections",
    ),
    sectionVersions: safeRows(
      manuscriptData.sectionVersions,
      SECTION_VERSION_SPEC,
      "data/manuscript.json.sectionVersions",
    ),
    continuity,
  };
  validateContentReferences(content, generationMetadataIncluded);
  return { bundle, content, generationMetadataIncluded };
}

function stringField(row: SlateSafetyRow, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new SlateArchiveImportError(`${label}.${key} must be non-empty text.`);
  }
  return value;
}

function nullableStringField(row: SlateSafetyRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function uniqueIds(rows: SlateSafetyRow[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const id = stringField(row, "id", `${label}[${index}]`);
    if (ids.has(id)) throw new SlateArchiveImportError(`${label} repeats id ${id}.`);
    ids.add(id);
  }
  return ids;
}

function requireReference(
  value: string | null,
  ids: Set<string>,
  label: string,
  nullable = false,
): void {
  if (value === null) {
    if (nullable) return;
    throw new SlateArchiveImportError(`${label} is missing.`);
  }
  if (!ids.has(value)) throw new SlateArchiveImportError(`${label} is not in the archive.`);
}

function validateJsonIdArray(value: string, ids: Set<string>, label: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SlateArchiveImportError(`${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string" || !ids.has(id))) {
    throw new SlateArchiveImportError(`${label} contains an unknown id.`);
  }
}

interface ParsedAnchor {
  sourceId: string;
  sectionId: string | null;
  sectionRevision: number | null;
  start: number;
  end: number;
  quoteHash: string;
}

function parseAnchors(value: SlateSafetyRow[string], label: string): ParsedAnchor[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError(`${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) {
    throw new SlateArchiveImportError(`${label} must be an array.`);
  }
  return parsed.map((item, index) => {
    const anchor = record(item, `${label}[${index}]`);
    exactKeys(
      anchor,
      ["sourceId", "sectionId", "sectionRevision", "start", "end", "quoteHash"],
      `${label}[${index}]`,
    );
    if (
      typeof anchor.sourceId !== "string" ||
      anchor.sourceId.length === 0 ||
      (anchor.sectionId !== null && typeof anchor.sectionId !== "string") ||
      (anchor.sectionRevision !== null && !Number.isSafeInteger(anchor.sectionRevision)) ||
      !Number.isSafeInteger(anchor.start) ||
      !Number.isSafeInteger(anchor.end) ||
      Number(anchor.start) < 0 ||
      Number(anchor.end) < Number(anchor.start) ||
      typeof anchor.quoteHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(anchor.quoteHash)
    ) {
      throw new SlateArchiveImportError(`${label}[${index}] is invalid.`);
    }
    return anchor as unknown as ParsedAnchor;
  });
}

function validateAnchors(
  value: SlateSafetyRow[string],
  sourceIds: Set<string>,
  sectionIds: Set<string>,
  label: string,
): void {
  for (const [index, anchor] of parseAnchors(value, label).entries()) {
    requireReference(anchor.sourceId, sourceIds, `${label}[${index}].sourceId`);
    if (anchor.sectionId !== null && !sectionIds.has(anchor.sectionId)) {
      throw new SlateArchiveImportError(`${label}[${index}].sectionId is not in the archive.`);
    }
  }
}

function validateResolution(
  value: SlateSafetyRow[string],
  sourceIds: Set<string>,
  revisionIds: Set<string>,
  label: string,
): void {
  if (value === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError(`${label} is not valid JSON.`);
  }
  const resolution = record(parsed, label);
  const allowed = ["version", "kind", "direction", "sourceId", "revisionId", "recordedAt"];
  if (Object.hasOwn(resolution, "revisionOutcome")) allowed.push("revisionOutcome");
  exactKeys(resolution, allowed, label);
  if (
    resolution.version !== 1 ||
    typeof resolution.kind !== "string" ||
    typeof resolution.direction !== "string" ||
    (resolution.sourceId !== null && typeof resolution.sourceId !== "string") ||
    (resolution.revisionId !== null && typeof resolution.revisionId !== "string") ||
    typeof resolution.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(resolution.recordedAt)) ||
    (resolution.revisionOutcome !== undefined &&
      resolution.revisionOutcome !== "accepted" &&
      resolution.revisionOutcome !== "rejected")
  ) {
    throw new SlateArchiveImportError(`${label} is invalid.`);
  }
  requireReference(
    typeof resolution.sourceId === "string" ? resolution.sourceId : null,
    sourceIds,
    `${label}.sourceId`,
    true,
  );
  requireReference(
    typeof resolution.revisionId === "string" ? resolution.revisionId : null,
    revisionIds,
    `${label}.revisionId`,
    true,
  );
}

function validateContentReferences(
  content: SlateSafetyContentV1,
  generationMetadataIncluded: boolean,
): void {
  const seriesId = stringField(content.series, "id", "series");
  const projectId = stringField(content.project, "id", "project");
  if (content.project.series_id !== seriesId) {
    throw new SlateArchiveImportError("Slate archive project and series do not match.");
  }
  if (
    content.project.title !== undefined &&
    (typeof content.project.title !== "string" || content.project.title.trim().length === 0)
  ) {
    throw new SlateArchiveImportError("Slate archive project title is empty.");
  }
  if (
    content.project.title_origin !== undefined &&
    !new Set(["writer", "spark", "material"]).has(String(content.project.title_origin))
  ) {
    throw new SlateArchiveImportError("Slate archive has invalid title provenance.");
  }
  if (
    !new Set(["auto", "offline", "online"]).has(
      String(content.project.prose_mode),
    )
  ) {
    throw new SlateArchiveImportError("Slate archive has an invalid prose route.");
  }
  if (
    content.project.prose_provider !== null &&
    !new Set(["local", "openai", "anthropic"]).has(
      String(content.project.prose_provider),
    )
  ) {
    throw new SlateArchiveImportError("Slate archive has an invalid prose provider.");
  }
  const deliberationConfig = JSON.parse(
    String(content.project.deliberation_config_json),
  ) as unknown;
  if (
    !deliberationConfig ||
    typeof deliberationConfig !== "object" ||
    Array.isArray(deliberationConfig)
  ) {
    throw new SlateArchiveImportError("Slate archive has invalid hemisphere settings.");
  }
  const deliberationRecord = deliberationConfig as Record<string, unknown>;
  for (const hemisphere of ["lux", "umbra"] as const) {
    if (!Object.hasOwn(deliberationRecord, hemisphere)) continue;
    const profile = deliberationRecord[hemisphere];
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new SlateArchiveImportError("Slate archive has invalid hemisphere settings.");
    }
    const candidate = profile as Record<string, unknown>;
    const provider = candidate.provider;
    const model = candidate.model;
    if (
      provider !== null &&
      provider !== "local" &&
      provider !== "openai" &&
      provider !== "anthropic"
    ) {
      throw new SlateArchiveImportError(
        "Slate archive has an invalid hemisphere provider.",
      );
    }
    if (model !== null && (typeof model !== "string" || model.length > 240)) {
      throw new SlateArchiveImportError("Slate archive has an invalid hemisphere model.");
    }
    if (Boolean(provider) !== Boolean(model)) {
      throw new SlateArchiveImportError(
        "Slate archive hemisphere model and provider must be selected together.",
      );
    }
    if (
      typeof candidate.directive !== "string" ||
      candidate.directive.length > 4_000
    ) {
      throw new SlateArchiveImportError(
        "Slate archive has an invalid hemisphere creative lens.",
      );
    }
  }
  stringField(content.project, "continuity_active_version", "project");
  stringField(content.project, "continuity_target_version", "project");
  if (!new Set(["current", "building", "review", "deferred", "failed"]).has(
    String(content.project.continuity_upgrade_status),
  )) {
    throw new SlateArchiveImportError("Slate archive has an invalid Continuity upgrade status.");
  }

  const revisions = uniqueIds(content.revisions, "revisions");
  const versions = uniqueIds(content.versions, "versions");
  const sections = uniqueIds(content.sections, "sections");
  const sectionVersions = uniqueIds(content.sectionVersions, "sectionVersions");
  void versions;
  void sectionVersions;
  const continuityIds = Object.fromEntries(
    Object.entries(content.continuity).map(([key, rows]) => [key, uniqueIds(rows, key)]),
  ) as Record<keyof SlateSafetyContentV1["continuity"], Set<string>>;

  const ordinals = new Set<number>();
  for (const [index, row] of content.revisions.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`revisions[${index}] belongs to another project.`);
    }
  }
  for (const [index, row] of content.versions.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`versions[${index}] belongs to another project.`);
    }
  }
  for (const [index, row] of content.sections.entries()) {
    if (row.project_id !== projectId || row.series_id !== seriesId) {
      throw new SlateArchiveImportError(`sections[${index}] belongs to another project.`);
    }
    const ordinal = Number(row.ordinal);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinals.has(ordinal)) {
      throw new SlateArchiveImportError(`sections[${index}] has an invalid ordinal.`);
    }
    ordinals.add(ordinal);
    requireReference(
      nullableStringField(row, "parent_section_id"),
      sections,
      `sections[${index}].parent_section_id`,
      true,
    );
    if (row.content_hash !== sha256(String(row.prose))) {
      throw new SlateArchiveImportError(`sections[${index}] content checksum does not match.`);
    }
  }
  for (const [index, row] of content.sectionVersions.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`sectionVersions[${index}] belongs to another project.`);
    }
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `sectionVersions[${index}].section_id`,
    );
    if (row.content_hash !== sha256(String(row.prose))) {
      throw new SlateArchiveImportError(`sectionVersions[${index}] content checksum does not match.`);
    }
  }

  const sources = continuityIds.sources;
  const entities = continuityIds.entities;
  const claims = continuityIds.claims;
  const events = continuityIds.events;
  const projectScopedContinuity = new Set([
    "sources", "claims", "events", "threads", "concerns",
  ]);
  for (const [collection, rows] of Object.entries(content.continuity)) {
    if (collection === "generations") continue;
    for (const [index, row] of rows.entries()) {
      if (row.series_id !== seriesId) {
        throw new SlateArchiveImportError(`${collection}[${index}] belongs to another series.`);
      }
      const rowProject = nullableStringField(row, "project_id");
      if (projectScopedContinuity.has(collection) && rowProject !== projectId) {
        throw new SlateArchiveImportError(`${collection}[${index}] belongs to another project.`);
      }
      const rowSection = nullableStringField(row, "section_id");
      if (rowSection !== null && !sections.has(rowSection)) {
        throw new SlateArchiveImportError(`${collection}[${index}] has an unknown project section.`);
      }
    }
  }

  const generationsByNumber = new Map<number, SlateSafetyRow>();
  const validGenerationStatuses = new Set([
    "building", "ready", "active", "deferred", "failed", "superseded",
  ]);
  for (const [index, row] of content.continuity.generations.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`generations[${index}] belongs to another project.`);
    }
    const generation = Number(row.generation);
    if (!Number.isSafeInteger(generation) || generation <= 0 || generationsByNumber.has(generation)) {
      throw new SlateArchiveImportError(`generations[${index}] has an invalid generation number.`);
    }
    if (!validGenerationStatuses.has(String(row.status))) {
      throw new SlateArchiveImportError(`generations[${index}] has an invalid status.`);
    }
    stringField(row, "target_version", `generations[${index}]`);
    stringField(row, "source_fingerprint", `generations[${index}]`);
    generationsByNumber.set(generation, row);
  }
  if (generationMetadataIncluded) {
    const activeGeneration = Number(content.project.continuity_active_generation);
    const previousGeneration = content.project.continuity_previous_generation === null
      ? null
      : Number(content.project.continuity_previous_generation);
    if (!Number.isSafeInteger(activeGeneration) || activeGeneration < 0) {
      throw new SlateArchiveImportError("Slate archive has an invalid active Continuity generation.");
    }
    if (
      previousGeneration !== null &&
      (!Number.isSafeInteger(previousGeneration) || previousGeneration <= 0)
    ) {
      throw new SlateArchiveImportError("Slate archive has an invalid previous Continuity generation.");
    }
    if (activeGeneration === 0 && previousGeneration !== null) {
      throw new SlateArchiveImportError("Slate archive Continuity generation pointers are inconsistent.");
    }
    if (activeGeneration > 0 && generationsByNumber.get(activeGeneration)?.status !== "active") {
      throw new SlateArchiveImportError("Slate archive active Continuity generation is missing.");
    }
    if (
      previousGeneration !== null &&
      generationsByNumber.get(previousGeneration)?.status !== "superseded"
    ) {
      throw new SlateArchiveImportError("Slate archive previous Continuity generation is missing.");
    }
    for (const row of content.continuity.generations) {
      if (row.status === "active" && Number(row.generation) !== activeGeneration) {
        throw new SlateArchiveImportError("Slate archive has an unreferenced active Continuity generation.");
      }
    }
  }
  for (const [index, row] of content.continuity.sources.entries()) {
    requireReference(
      nullableStringField(row, "supersedes_source_id"),
      sources,
      `sources[${index}].supersedes_source_id`,
      true,
    );
    if (row.content_hash !== sha256(String(row.content))) {
      throw new SlateArchiveImportError(`sources[${index}] content checksum does not match.`);
    }
  }
  for (const [index, row] of content.continuity.entities.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `entities[${index}].source_id`, true);
    validateAnchors(row.anchors_json, sources, sections, `entities[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.aliases.entries()) {
    requireReference(nullableStringField(row, "entity_id"), entities, `aliases[${index}].entity_id`);
    requireReference(nullableStringField(row, "source_id"), sources, `aliases[${index}].source_id`, true);
  }
  for (const [index, row] of content.continuity.claims.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `claims[${index}].source_id`);
    for (const field of ["subject_entity_id", "object_entity_id", "perspective_entity_id"] as const) {
      requireReference(nullableStringField(row, field), entities, `claims[${index}].${field}`, true);
    }
    requireReference(nullableStringField(row, "supersedes_claim_id"), claims, `claims[${index}].supersedes_claim_id`, true);
    validateAnchors(row.anchors_json, sources, sections, `claims[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.events.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `events[${index}].source_id`);
    requireReference(nullableStringField(row, "location_entity_id"), entities, `events[${index}].location_entity_id`, true);
    validateJsonIdArray(String(row.participant_entity_ids_json), entities, `events[${index}].participant_entity_ids_json`);
    validateAnchors(row.anchors_json, sources, sections, `events[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.relationships.entries()) {
    requireReference(nullableStringField(row, "from_entity_id"), entities, `relationships[${index}].from_entity_id`);
    requireReference(nullableStringField(row, "to_entity_id"), entities, `relationships[${index}].to_entity_id`);
    requireReference(nullableStringField(row, "source_id"), sources, `relationships[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `relationships[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.knowledge.entries()) {
    requireReference(nullableStringField(row, "character_entity_id"), entities, `knowledge[${index}].character_entity_id`);
    requireReference(nullableStringField(row, "claim_id"), claims, `knowledge[${index}].claim_id`);
    requireReference(nullableStringField(row, "learned_event_id"), events, `knowledge[${index}].learned_event_id`, true);
    requireReference(nullableStringField(row, "source_id"), sources, `knowledge[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `knowledge[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.threads.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `threads[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `threads[${index}].anchors_json`);
  }
  for (const [index, row] of content.continuity.concerns.entries()) {
    validateJsonIdArray(String(row.claim_ids_json), claims, `concerns[${index}].claim_ids_json`);
    validateAnchors(row.anchors_json, sources, sections, `concerns[${index}].anchors_json`);
    validateResolution(
      row.resolution_json,
      sources,
      revisions,
      `concerns[${index}].resolution_json`,
    );
  }
}

function archiveCounts(content: SlateSafetyContentV1): SlateArchiveImportCounts {
  return {
    revisions: content.revisions.length,
    versions: content.versions.length,
    sections: content.sections.length,
    sectionVersions: content.sectionVersions.length,
    continuitySources: content.continuity.sources.length,
    continuityEntities: content.continuity.entities.length,
    continuityAliases: content.continuity.aliases.length,
    continuityClaims: content.continuity.claims.length,
    continuityEvents: content.continuity.events.length,
    continuityRelationships: content.continuity.relationships.length,
    continuityKnowledge: content.continuity.knowledge.length,
    continuityThreads: content.continuity.threads.length,
    continuityConcerns: content.continuity.concerns.length,
    continuityGenerations: content.continuity.generations.length,
  };
}

function ensureUser(db: DatabaseSync, userId: string): void {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) throw new SlateArchiveImportError("Account not found.");
}

function previewFor(
  db: DatabaseSync,
  userId: string,
  parsed: ParsedArchive,
): SlateArchiveImportPreview {
  const { manifest } = parsed.bundle;
  return {
    format: manifest.format,
    version: manifest.version,
    title: String(parsed.content.project.title),
    seriesTitle: String(parsed.content.series.title),
    originalProjectId: manifest.project.id,
    originalSeriesId: manifest.project.seriesId,
    exportedAt: manifest.exportedAt,
    contentHash: manifest.contentHash,
    counts: archiveCounts(parsed.content),
    willCreateCopy: true,
    sourceProjectExistsForCurrentUser: Boolean(
      db.prepare("SELECT 1 FROM slate_projects WHERE id = ? AND user_id = ?")
        .get(manifest.project.id, userId),
    ),
  };
}

function boundedCopyTitle(value: string, suffix: string): string {
  const clean = value.trim() || "Untitled";
  return `${clean.slice(0, Math.max(1, MAX_TITLE_LENGTH - suffix.length)).trimEnd()}${suffix}`;
}

export function slateProjectArchiveFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${slug || "slate-project"}.slate`;
}

export function createSlateProjectArchive(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  exportedAt = new Date(),
): SlateProjectArchiveExport {
  ensureUser(db, userId);
  const snapshot = createSlateRecoverySnapshot(db, userId, projectId, exportedAt);
  const bundle = createSlateArchiveBundle(snapshot, exportedAt);
  return {
    filename: slateProjectArchiveFilename(bundle.manifest.project.title),
    mediaType: SLATE_ARCHIVE_MEDIA_TYPE,
    payload: encodeSlateArchiveZip(bundle),
    manifest: bundle.manifest,
  };
}

export function previewSlateProjectArchiveImport(
  db: DatabaseSync,
  userId: string,
  payload: Uint8Array,
): SlateArchiveImportPreview {
  ensureUser(db, userId);
  return previewFor(db, userId, parseArchive(payload));
}

function createIdMap(
  rows: SlateSafetyRow[],
  label: string,
  nextId: () => string,
): Map<string, string> {
  return new Map(rows.map((row, index) => [stringField(row, "id", `${label}[${index}]`), nextId()]));
}

function createImportMaps(content: SlateSafetyContentV1, idFactory: () => string): ImportMaps {
  const generated = new Set<string>();
  const nextId = (): string => {
    const id = idFactory();
    if (typeof id !== "string" || id.length === 0 || generated.has(id)) {
      throw new SlateArchiveImportError("Slate import could not allocate unique ids.");
    }
    generated.add(id);
    return id;
  };
  return {
    seriesId: nextId(),
    projectId: nextId(),
    revisions: createIdMap(content.revisions, "revisions", nextId),
    versions: createIdMap(content.versions, "versions", nextId),
    sections: createIdMap(content.sections, "sections", nextId),
    sectionVersions: createIdMap(content.sectionVersions, "sectionVersions", nextId),
    generations: createIdMap(content.continuity.generations, "generations", nextId),
    sources: createIdMap(content.continuity.sources, "sources", nextId),
    entities: createIdMap(content.continuity.entities, "entities", nextId),
    aliases: createIdMap(content.continuity.aliases, "aliases", nextId),
    claims: createIdMap(content.continuity.claims, "claims", nextId),
    events: createIdMap(content.continuity.events, "events", nextId),
    relationships: createIdMap(content.continuity.relationships, "relationships", nextId),
    knowledge: createIdMap(content.continuity.knowledge, "knowledge", nextId),
    threads: createIdMap(content.continuity.threads, "threads", nextId),
    concerns: createIdMap(content.continuity.concerns, "concerns", nextId),
  };
}

function mapped(map: Map<string, string>, value: SlateSafetyRow[string], label: string): string {
  if (typeof value !== "string") throw new SlateArchiveImportError(`${label} is missing.`);
  const result = map.get(value);
  if (!result) throw new SlateArchiveImportError(`${label} is not in the archive.`);
  return result;
}

function mappedNullable(map: Map<string, string>, value: SlateSafetyRow[string]): string | null {
  return typeof value === "string" ? map.get(value) ?? null : null;
}

function mappedProjectSection(
  row: SlateSafetyRow,
  sourceProjectId: string,
  maps: ImportMaps,
): { projectId: string | null; sectionId: string | null } {
  const sourceProject = nullableStringField(row, "project_id");
  const sourceSection = nullableStringField(row, "section_id");
  return {
    projectId: sourceProject === sourceProjectId ? maps.projectId : null,
    sectionId: sourceProject === sourceProjectId && sourceSection
      ? maps.sections.get(sourceSection) ?? null
      : null,
  };
}

function remapIdArray(value: SlateSafetyRow[string], map: Map<string, string>): string {
  const parsed = JSON.parse(String(value)) as string[];
  return JSON.stringify(parsed.map((id) => mapped(map, id, "JSON id")));
}

function remapAnchors(value: SlateSafetyRow[string], maps: ImportMaps): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError("Continuity anchors are not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new SlateArchiveImportError("Continuity anchors must be an array.");
  }
  return JSON.stringify(parsed.map((item, index) => {
    const anchor = record(item, `Continuity anchor ${index}`);
    exactKeys(
      anchor,
      ["sourceId", "sectionId", "sectionRevision", "start", "end", "quoteHash"],
      `Continuity anchor ${index}`,
    );
    if (
      typeof anchor.sourceId !== "string" ||
      (anchor.sectionId !== null && typeof anchor.sectionId !== "string") ||
      (anchor.sectionRevision !== null && !Number.isSafeInteger(anchor.sectionRevision)) ||
      !Number.isSafeInteger(anchor.start) ||
      !Number.isSafeInteger(anchor.end) ||
      Number(anchor.start) < 0 ||
      Number(anchor.end) < Number(anchor.start) ||
      typeof anchor.quoteHash !== "string"
    ) {
      throw new SlateArchiveImportError(`Continuity anchor ${index} is invalid.`);
    }
    return {
      sourceId: mapped(maps.sources, anchor.sourceId, `Continuity anchor ${index}.sourceId`),
      sectionId: typeof anchor.sectionId === "string"
        ? maps.sections.get(anchor.sectionId) ?? null
        : null,
      sectionRevision: anchor.sectionRevision,
      start: anchor.start,
      end: anchor.end,
      quoteHash: anchor.quoteHash,
    };
  }));
}

function remapResolution(value: SlateSafetyRow[string], maps: ImportMaps): string | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError("Continuity resolution is not valid JSON.");
  }
  const resolution = record(parsed, "Continuity resolution");
  const allowed = ["version", "kind", "direction", "sourceId", "revisionId", "recordedAt"];
  if (Object.hasOwn(resolution, "revisionOutcome")) allowed.push("revisionOutcome");
  exactKeys(resolution, allowed, "Continuity resolution");
  return JSON.stringify({
    ...resolution,
    sourceId: typeof resolution.sourceId === "string"
      ? maps.sources.get(resolution.sourceId) ?? null
      : null,
    revisionId: typeof resolution.revisionId === "string"
      ? maps.revisions.get(resolution.revisionId) ?? null
      : null,
  });
}

function insert(
  db: DatabaseSync,
  table: string,
  columns: readonly string[],
  values: readonly (string | number | null)[],
): void {
  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);
}

function legacyManuscript(content: SlateSafetyContentV1): string {
  return [...content.sections]
    .sort((left, right) => Number(left.ordinal) - Number(right.ordinal))
    .filter((row) => String(row.prose).trim().length > 0)
    .map((row) => row.kind === "imported" ? String(row.prose) : `${row.title}\n\n${row.prose}`)
    .join("\n\n\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function restoreArchive(
  db: DatabaseSync,
  userId: string,
  parsed: ParsedArchive,
  maps: ImportMaps,
  importedAt: string,
): { title: string; seriesTitle: string } {
  const { content } = parsed;
  const sourceProjectId = String(content.project.id);
  const title = boundedCopyTitle(String(content.project.title), COPY_SUFFIX);
  const titleOrigin = new Set(["spark", "material"]).has(
    String(content.project.title_origin),
  )
    ? String(content.project.title_origin)
    : "writer";
  const seriesTitle = boundedCopyTitle(String(content.series.title), IMPORTED_SERIES_SUFFIX);
  const preserveGenerationPointers = parsed.generationMetadataIncluded;
  const hasInterruptedGeneration = content.continuity.generations.some(
    (row) => row.status === "building",
  );
  const activeGeneration = preserveGenerationPointers
    ? Number(content.project.continuity_active_generation)
    : 0;
  const previousGeneration = preserveGenerationPointers &&
    content.project.continuity_previous_generation !== null
    ? Number(content.project.continuity_previous_generation)
    : null;
  const sourceUpgradeStatus = String(content.project.continuity_upgrade_status);
  const upgradeStatus = preserveGenerationPointers
    ? sourceUpgradeStatus === "building" || hasInterruptedGeneration
      ? "failed"
      : sourceUpgradeStatus
    : "current";
  const lastSuccessfulAt = preserveGenerationPointers
    ? nullableStringField(content.project, "continuity_last_success_at")
    : null;
  insert(
    db,
    "slate_series",
    ["id", "user_id", "title", "description", "created_at", "updated_at"],
    [maps.seriesId, userId, seriesTitle, String(content.series.description), importedAt, importedAt],
  );
  insert(
    db,
    "slate_projects",
    [
      "id", "user_id", "series_id", "book_ordinal", "title", "title_origin", "spark",
      "spark_wildcards_json", "premise", "voice", "non_negotiables_json", "phase",
      "structure_json", "characters_json", "unresolved_threads_json", "manuscript",
      "direction", "locked_ranges_json", "last_provider", "last_model",
      "prose_mode", "prose_model", "prose_provider", "deliberation_config_json",
      "continuity_active_version", "continuity_target_version",
      "continuity_active_generation", "continuity_previous_generation",
      "continuity_upgrade_status", "continuity_last_success_at", "created_at", "updated_at",
    ],
    [
      maps.projectId, userId, maps.seriesId, Number(content.project.book_ordinal), title,
      titleOrigin,
      String(content.project.spark), String(content.project.spark_wildcards_json),
      String(content.project.premise), String(content.project.voice),
      String(content.project.non_negotiables_json), String(content.project.phase),
      String(content.project.structure_json), String(content.project.characters_json),
      String(content.project.unresolved_threads_json), legacyManuscript(content),
      String(content.project.direction), String(content.project.locked_ranges_json),
      nullableStringField(content.project, "last_provider"),
      nullableStringField(content.project, "last_model"),
      String(content.project.prose_mode),
      nullableStringField(content.project, "prose_model"),
      nullableStringField(content.project, "prose_provider"),
      String(content.project.deliberation_config_json),
      String(content.project.continuity_active_version),
      String(content.project.continuity_target_version),
      activeGeneration,
      previousGeneration,
      upgradeStatus,
      lastSuccessfulAt,
      importedAt, importedAt,
    ],
  );

  for (const row of content.continuity.generations) {
    const interrupted = row.status === "building";
    insert(db, "slate_continuity_generations", [
      "id", "user_id", "project_id", "generation", "status", "target_version",
      "source_fingerprint", "comparison_summary", "producer_versions_json",
      "created_at", "completed_at",
    ], [
      mapped(maps.generations, row.id, "generation id"), userId, maps.projectId,
      Number(row.generation), interrupted ? "failed" : String(row.status),
      String(row.target_version), String(row.source_fingerprint),
      interrupted
        ? nullableStringField(row, "comparison_summary") ??
          "Interrupted Continuity build was safely retired during Slate restore."
        : nullableStringField(row, "comparison_summary"),
      String(row.producer_versions_json), String(row.created_at),
      interrupted ? importedAt : nullableStringField(row, "completed_at"),
    ]);
  }

  for (const row of content.revisions) {
    insert(db, "slate_revisions", ["id", "project_id", "user_id", ...REVISION_SPEC.columns.filter((key) => key !== "id" && key !== "project_id")], [
      mapped(maps.revisions, row.id, "revision id"), maps.projectId, userId,
      ...REVISION_SPEC.columns.filter((key) => key !== "id" && key !== "project_id").map((key) => row[key]!),
    ]);
  }
  for (const row of content.versions) {
    insert(db, "slate_versions", ["id", "project_id", "user_id", "reason", "structure_json", "manuscript", "created_at"], [
      mapped(maps.versions, row.id, "version id"), maps.projectId, userId,
      String(row.reason), String(row.structure_json), String(row.manuscript), String(row.created_at),
    ]);
  }
  for (const row of content.sections) {
    insert(db, "slate_sections", [
      "id", "project_id", "series_id", "user_id", "parent_section_id",
      "structure_item_id", "kind", "ordinal", "title", "summary", "direction", "prose",
      "locked_ranges_json", "locked", "status", "revision", "content_hash",
      "last_mutation_id", "created_at", "updated_at",
    ], [
      mapped(maps.sections, row.id, "section id"), maps.projectId, maps.seriesId, userId,
      null, nullableStringField(row, "structure_item_id"), String(row.kind), Number(row.ordinal),
      String(row.title), String(row.summary), String(row.direction), String(row.prose),
      String(row.locked_ranges_json), Number(row.locked), String(row.status), Number(row.revision),
      String(row.content_hash), null, String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.sections) {
    const parentId = mappedNullable(maps.sections, row.parent_section_id);
    if (parentId) {
      db.prepare("UPDATE slate_sections SET parent_section_id = ? WHERE id = ? AND user_id = ?")
        .run(parentId, mapped(maps.sections, row.id, "section id"), userId);
    }
  }
  for (const row of content.sectionVersions) {
    insert(db, "slate_section_versions", [
      "id", "project_id", "section_id", "user_id", "revision", "reason", "title",
      "summary", "direction", "prose", "locked", "status", "content_hash", "created_at",
    ], [
      mapped(maps.sectionVersions, row.id, "section version id"), maps.projectId,
      mapped(maps.sections, row.section_id, "section version section"), userId,
      Number(row.revision), String(row.reason), String(row.title), String(row.summary),
      String(row.direction), String(row.prose), Number(row.locked), String(row.status),
      String(row.content_hash), String(row.created_at),
    ]);
  }

  for (const row of content.continuity.sources) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_sources", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "source_revision", "content", "content_hash", "authority", "provider", "model",
      "producer_versions_json", "supersedes_source_id", "created_at",
    ], [
      mapped(maps.sources, row.id, "source id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.kind), Number(row.source_revision),
      String(row.content), String(row.content_hash), String(row.authority),
      nullableStringField(row, "provider"), nullableStringField(row, "model"),
      String(row.producer_versions_json), null, String(row.created_at),
    ]);
  }
  for (const row of content.continuity.sources) {
    const supersedes = mappedNullable(maps.sources, row.supersedes_source_id);
    if (supersedes) {
      db.prepare("UPDATE slate_continuity_sources SET supersedes_source_id = ? WHERE id = ? AND user_id = ?")
        .run(supersedes, mapped(maps.sources, row.id, "source id"), userId);
    }
  }
  for (const row of content.continuity.entities) {
    insert(db, "slate_continuity_entities", [
      "id", "user_id", "series_id", "kind", "canonical_name", "description", "locked",
      "anchors_json", "source_id", "producer_versions_json", "created_at", "updated_at",
    ], [
      mapped(maps.entities, row.id, "entity id"), userId, maps.seriesId, String(row.kind),
      String(row.canonical_name), String(row.description), Number(row.locked),
      remapAnchors(row.anchors_json, maps), mappedNullable(maps.sources, row.source_id),
      String(row.producer_versions_json), String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.continuity.aliases) {
    insert(db, "slate_continuity_aliases", [
      "id", "user_id", "series_id", "entity_id", "alias", "normalized_alias", "source_id", "created_at",
    ], [
      mapped(maps.aliases, row.id, "alias id"), userId, maps.seriesId,
      mapped(maps.entities, row.entity_id, "alias entity"), String(row.alias),
      String(row.normalized_alias), mappedNullable(maps.sources, row.source_id), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.claims) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_claims", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind",
      "subject_entity_id", "predicate", "object_entity_id", "value", "epistemic_status",
      "perspective_entity_id", "confidence", "anchors_json", "source_id",
      "supersedes_claim_id", "producer_versions_json", "created_at",
    ], [
      mapped(maps.claims, row.id, "claim id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), mappedNullable(maps.entities, row.subject_entity_id),
      String(row.predicate), mappedNullable(maps.entities, row.object_entity_id), String(row.value),
      String(row.epistemic_status), mappedNullable(maps.entities, row.perspective_entity_id),
      Number(row.confidence), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "claim source"), null,
      String(row.producer_versions_json), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.claims) {
    const supersedes = mappedNullable(maps.claims, row.supersedes_claim_id);
    if (supersedes) {
      db.prepare("UPDATE slate_continuity_claims SET supersedes_claim_id = ? WHERE id = ? AND user_id = ?")
        .run(supersedes, mapped(maps.claims, row.id, "claim id"), userId);
    }
  }
  for (const row of content.continuity.events) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_events", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "title",
      "description", "chronology_key", "participant_entity_ids_json", "location_entity_id",
      "anchors_json", "source_id", "producer_versions_json", "created_at",
    ], [
      mapped(maps.events, row.id, "event id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.title), String(row.description),
      nullableStringField(row, "chronology_key"),
      remapIdArray(row.participant_entity_ids_json, maps.entities),
      mappedNullable(maps.entities, row.location_entity_id), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "event source"), String(row.producer_versions_json),
      String(row.created_at),
    ]);
  }
  for (const row of content.continuity.relationships) {
    insert(db, "slate_continuity_relationships", [
      "id", "user_id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json", "created_at",
    ], [
      mapped(maps.relationships, row.id, "relationship id"), userId, maps.seriesId,
      mapped(maps.entities, row.from_entity_id, "relationship from entity"),
      mapped(maps.entities, row.to_entity_id, "relationship to entity"), String(row.kind),
      String(row.state), String(row.epistemic_status), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "relationship source"),
      String(row.producer_versions_json), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.knowledge) {
    insert(db, "slate_continuity_knowledge", [
      "id", "user_id", "series_id", "character_entity_id", "claim_id", "learned_event_id",
      "status", "anchors_json", "source_id", "producer_versions_json", "created_at",
    ], [
      mapped(maps.knowledge, row.id, "knowledge id"), userId, maps.seriesId,
      mapped(maps.entities, row.character_entity_id, "knowledge character"),
      mapped(maps.claims, row.claim_id, "knowledge claim"),
      mappedNullable(maps.events, row.learned_event_id), String(row.status),
      remapAnchors(row.anchors_json, maps), mapped(maps.sources, row.source_id, "knowledge source"),
      String(row.producer_versions_json), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.threads) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_threads", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "label",
      "status", "due_section_id", "anchors_json", "source_id", "producer_versions_json",
      "created_at", "updated_at",
    ], [
      mapped(maps.threads, row.id, "thread id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.label), String(row.status),
      mappedNullable(maps.sections, row.due_section_id), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "thread source"), String(row.producer_versions_json),
      String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.continuity.concerns) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_concerns", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "severity", "status", "summary", "explanation", "claim_ids_json", "anchors_json",
      "recommended_resolution", "resolution_json", "producer_versions_json", "created_at",
      "resolved_at",
    ], [
      mapped(maps.concerns, row.id, "concern id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.kind), String(row.severity),
      String(row.status), String(row.summary), String(row.explanation),
      remapIdArray(row.claim_ids_json, maps.claims), remapAnchors(row.anchors_json, maps),
      nullableStringField(row, "recommended_resolution"), remapResolution(row.resolution_json, maps),
      String(row.producer_versions_json), String(row.created_at),
      nullableStringField(row, "resolved_at"),
    ]);
  }

  const manuscript = legacyManuscript(content);
  insert(db, "slate_manuscript_state", [
    "project_id", "user_id", "storage_version", "structure_revision",
    "original_manuscript_hash", "migrated_at", "updated_at",
  ], [maps.projectId, userId, 2, 0, sha256(manuscript), importedAt, importedAt]);
  return { title, seriesTitle };
}

function rollbackQuietly(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the import failure.
  }
}

export function importSlateProjectArchiveAsCopy(
  db: DatabaseSync,
  userId: string,
  payload: Uint8Array,
  options: SlateArchiveImportOptions = {},
): SlateArchiveImportResult {
  ensureUser(db, userId);
  const parsed = parseArchive(payload);
  const preview = previewFor(db, userId, parsed);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new SlateArchiveImportError("Slate import time is invalid.");
  }
  const importedAt = now.toISOString();
  const maps = createImportMaps(parsed.content, options.idFactory ?? (() => randomId()));
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const names = restoreArchive(db, userId, parsed, maps, importedAt);
    db.exec("COMMIT");
    return {
      ...preview,
      ...names,
      projectId: maps.projectId,
      seriesId: maps.seriesId,
      importedAt,
    };
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}
