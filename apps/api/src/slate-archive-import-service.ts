import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createSlateArchiveBundle,
  createSlateRecoverySnapshot,
  type SlateArchiveBundleV1,
  type SlateArchiveManifest,
  type SlateSafetyContentV1,
  type SlateSafetyContentV2,
  type SlateSafetyRow,
} from "./slate-author-safety.ts";
import {
  decodeSlateArchiveZip,
  encodeSlateArchiveZip,
} from "./slate-archive-zip.ts";
import {
  normalizeSlateSectionDocument,
  slateSectionDocumentSnapshot,
} from "./slate-section-documents.ts";
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
  columns: [
    "id", "title", "description", "continuity_active_generation",
    "continuity_previous_generation", "created_at", "updated_at",
  ],
  numeric: ["continuity_active_generation", "continuity_previous_generation"],
  nullable: ["continuity_previous_generation"],
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
    "document_json", "document_hash", "prose_hash", "created_at",
  ],
  numeric: ["revision", "locked"],
  optionalDefaults: {
    document_json: "",
    document_hash: "",
    prose_hash: "",
  },
};

const DOCUMENT_SPEC: RowSpec = {
  columns: [
    "section_id", "project_id", "schema_version", "section_revision",
    "document_json", "document_hash", "prose_hash", "created_at", "updated_at",
  ],
  numeric: ["schema_version", "section_revision"],
};

const ANNOTATION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "block_id", "anchor_json", "kind",
    "body", "resolved", "created_at", "updated_at",
  ],
  numeric: ["resolved"],
};

const WRITING_OPERATION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "parent_operation_id", "kind", "status",
    "direction_intent_json", "validated_snapshot_json", "revision_fingerprint",
    "continuity_generation", "mirror_profile_version_id", "provider", "model",
    "proposal_text", "proposal_hash", "revision_id", "created_at", "updated_at",
    "started_at", "completed_at", "resolved_at",
  ],
  numeric: ["continuity_generation"],
  nullable: [
    "section_id", "parent_operation_id", "mirror_profile_version_id", "provider",
    "model", "proposal_text", "proposal_hash", "revision_id", "started_at",
    "completed_at", "resolved_at",
  ],
};

const CLARIFICATION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "operation_id", "kind", "status",
    "prompt", "choices_json", "allows_custom_vibe", "evidence_json",
    "revision_fingerprint", "continuity_generation", "mirror_profile_version_id",
    "answer_kind", "answer_choice_id", "custom_vibe",
    "structured_direction_json", "resume_operation_id", "created_at",
    "answered_at", "stale_at",
  ],
  numeric: ["allows_custom_vibe", "continuity_generation"],
  nullable: [
    "section_id", "mirror_profile_version_id", "answer_kind",
    "answer_choice_id", "custom_vibe", "structured_direction_json",
    "resume_operation_id", "answered_at", "stale_at",
  ],
};

const WRITING_MUTATION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "operation_id", "action", "result_operation_id",
    "created_at",
  ],
};

const DEVELOPER_EVENT_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "project_id", "section_id", "section_revision",
    "sequence", "stage", "kind", "summary", "detail_json", "source_ids_json",
    "operation_id", "clarification_id", "provider", "model",
    "continuity_generation", "created_at",
  ],
  numeric: ["section_revision", "sequence", "continuity_generation"],
  nullable: [
    "section_id", "section_revision", "operation_id", "clarification_id",
    "provider", "model",
  ],
};

const CHARACTER_PROFILE_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "project_id", "entity_id", "generation", "layer",
    "profile_json", "field_locks_json", "provenance_json", "created_at",
    "updated_at",
  ],
  numeric: ["generation"],
  nullable: ["project_id", "entity_id"],
};

const CHARACTER_ARC_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "project_id", "character_profile_id", "generation",
    "intended_json", "observed_json", "provenance_json", "created_at",
    "updated_at",
  ],
  numeric: ["generation"],
  nullable: ["project_id"],
};

const CHARACTER_ARC_BEAT_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "project_id", "character_arc_id", "section_id",
    "generation", "track", "ordinal", "beat_json", "provenance_json",
    "created_at", "updated_at",
  ],
  numeric: ["generation", "ordinal"],
  nullable: ["project_id", "section_id"],
};

const NARRATIVE_EDGE_SPEC: RowSpec = {
  columns: [
    "id", "series_id", "project_id", "generation", "from_ref_json",
    "to_ref_json", "kind", "branch_id", "story_time_json",
    "manuscript_order_json", "provenance_json", "created_at", "updated_at",
  ],
  numeric: ["generation"],
  nullable: [
    "project_id", "branch_id", "story_time_json", "manuscript_order_json",
  ],
};

const MIRROR_PROFILE_SPEC: RowSpec = {
  columns: [
    "id", "name", "pen_name", "frozen", "created_at", "updated_at",
  ],
  numeric: ["frozen"],
  nullable: ["pen_name"],
};

const MIRROR_VERSION_SPEC: RowSpec = {
  columns: [
    "id", "profile_id", "version", "voice_card_json",
    "eligibility_summary_json", "created_at",
  ],
  numeric: ["version"],
};

const MIRROR_BINDING_SPEC: RowSpec = {
  columns: [
    "project_id", "profile_version_id", "project_overlay_json",
    "pov_overlays_json", "created_at", "updated_at",
  ],
};

const SOURCE_SHELF_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "title", "kind", "content", "metadata_json",
    "promoted_source_id", "mirror_eligible", "created_at", "updated_at",
  ],
  numeric: ["mirror_eligible"],
  nullable: ["promoted_source_id"],
};

const VISUAL_REFERENCE_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "entity_id", "kind", "status",
    "image_id", "prompt", "reference_state_json", "visual_style_version",
    "provider", "model", "created_at", "pinned_at",
  ],
  nullable: [
    "section_id", "entity_id", "image_id", "visual_style_version", "pinned_at",
  ],
};

const REVIEW_SESSION_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "artifact_json",
    "section_revisions_json", "continuity_version", "continuity_generation",
    "provider", "model", "created_at",
  ],
  numeric: ["continuity_generation"],
  nullable: ["model"],
};

const REVIEW_RESULT_SPEC: RowSpec = {
  columns: [
    "id", "session_id", "ordinal", "reviewer_id", "reviewer_snapshot_json",
    "result_json", "created_at",
  ],
  numeric: ["ordinal"],
};

const REVIEW_ROOM_NOTE_SPEC: RowSpec = {
  columns: ["session_id", "room_note_json", "created_at"],
};

const MOMENTUM_SNAPSHOT_SPEC: RowSpec = {
  columns: [
    "id", "project_id", "section_id", "kind", "state_json",
    "source_fingerprint", "created_at",
  ],
  nullable: ["section_id"],
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
      "model", "producer_versions_json", "generation", "supersedes_source_id",
      "created_at",
    ],
    numeric: ["source_revision", "generation"],
    nullable: [
      "project_id", "section_id", "provider", "model", "supersedes_source_id",
    ],
  },
  entities: {
    columns: [
      "id", "series_id", "kind", "canonical_name", "description", "locked",
      "anchors_json", "source_id", "producer_versions_json", "generation",
      "created_at", "updated_at",
    ],
    numeric: ["locked", "generation"],
    nullable: ["source_id"],
  },
  aliases: {
    columns: [
      "id", "series_id", "entity_id", "alias", "normalized_alias",
      "source_id", "generation", "created_at",
    ],
    numeric: ["generation"],
    nullable: ["source_id"],
  },
  claims: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind",
      "subject_entity_id", "predicate", "object_entity_id", "value",
      "epistemic_status", "perspective_entity_id", "confidence", "anchors_json",
      "source_id", "supersedes_claim_id", "producer_versions_json",
      "generation", "created_at",
    ],
    numeric: ["confidence", "generation"],
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
      "generation", "created_at",
    ],
    numeric: ["generation"],
    nullable: [
      "project_id", "section_id", "chronology_key", "location_entity_id",
    ],
  },
  relationships: {
    columns: [
      "id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at",
    ],
    numeric: ["generation"],
  },
  knowledge: {
    columns: [
      "id", "series_id", "character_entity_id", "claim_id", "learned_event_id",
      "status", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at",
    ],
    numeric: ["generation"],
    nullable: ["learned_event_id"],
  },
  threads: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "label",
      "status", "due_section_id", "anchors_json", "source_id",
      "producer_versions_json", "generation", "created_at", "updated_at",
    ],
    numeric: ["generation"],
    nullable: ["project_id", "section_id", "due_section_id"],
  },
  concerns: {
    columns: [
      "id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "severity", "status", "summary", "explanation", "claim_ids_json",
      "anchors_json", "recommended_resolution", "resolution_json",
      "producer_versions_json", "generation", "created_at", "resolved_at",
    ],
    numeric: ["generation"],
    nullable: [
      "project_id", "section_id", "recommended_resolution", "resolution_json",
      "resolved_at",
    ],
  },
} as const satisfies Record<keyof SlateSafetyContentV1["continuity"], RowSpec>;

function seriesSpecForArchive(version: 1 | 2): RowSpec {
  if (version === 2) return SERIES_SPEC;
  return {
    ...SERIES_SPEC,
    optionalDefaults: {
      continuity_active_generation: 0,
      continuity_previous_generation: null,
    },
  };
}

function continuitySpecForArchive(
  collection: keyof SlateSafetyContentV1["continuity"],
  spec: RowSpec,
  version: 1 | 2,
): RowSpec {
  if (version === 2 || collection === "generations") return spec;
  return {
    ...spec,
    optionalDefaults: {
      ...(spec.optionalDefaults ?? {}),
      generation: 0,
    },
  };
}

export interface SlateProjectArchiveExport {
  filename: string;
  mediaType: typeof SLATE_ARCHIVE_MEDIA_TYPE;
  payload: Uint8Array;
  manifest: SlateArchiveManifest;
}

export interface SlateArchiveImportCounts {
  revisions: number;
  versions: number;
  sections: number;
  sectionVersions: number;
  documents: number;
  annotations: number;
  writingOperations: number;
  clarifications: number;
  writingMutations: number;
  developerEvents: number;
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
  characterProfiles: number;
  characterArcs: number;
  characterArcBeats: number;
  narrativeEdges: number;
  mirrorProfiles: number;
  mirrorVersions: number;
  mirrorBindings: number;
  sourceShelfItems: number;
  visualReferences: number;
  reviewCircleSessions: number;
  reviewCircleResults: number;
  reviewCircleRoomNotes: number;
  momentumSnapshots: number;
}

export interface SlateArchiveImportPreview {
  format: "prism-slate-project-v1";
  version: 1 | 2;
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
  content: SlateSafetyContentV2;
  archiveVersion: 1 | 2;
  generationMetadataIncluded: boolean;
}

interface ImportMaps {
  seriesId: string;
  projectId: string;
  revisions: Map<string, string>;
  versions: Map<string, string>;
  sections: Map<string, string>;
  sectionVersions: Map<string, string>;
  annotations: Map<string, string>;
  operations: Map<string, string>;
  clarifications: Map<string, string>;
  mutations: Map<string, string>;
  developerEvents: Map<string, string>;
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
  characterProfiles: Map<string, string>;
  characterArcs: Map<string, string>;
  characterArcBeats: Map<string, string>;
  narrativeEdges: Map<string, string>;
  mirrorProfiles: Map<string, string>;
  mirrorVersions: Map<string, string>;
  sourceShelfItems: Map<string, string>;
  visualReferences: Map<string, string>;
  reviewSessions: Map<string, string>;
  reviewResults: Map<string, string>;
  momentumSnapshots: Map<string, string>;
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
      "Slate archive must contain only the declared project, manuscript, Continuity, and Markdown files.",
    );
  }
}

function schemaVersion(
  value: Record<string, unknown>,
  expected: 1 | 2,
  label: string,
): void {
  if (value.schemaVersion !== expected) {
    throw new SlateArchiveImportError(`Unsupported ${label} schema version.`);
  }
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

function parseSlateStudios(value: unknown): SlateSafetyContentV2["studios"] {
  const studios = record(value, "data/project.json.studios");
  exactKeys(
    studios,
    [
      "characterProfiles", "characterArcs", "characterArcBeats",
      "narrativeEdges", "mirror", "sourceShelf", "visualReferences",
      "reviewCircle", "momentumSnapshots",
    ],
    "data/project.json.studios",
  );
  const mirror = record(studios.mirror, "data/project.json.studios.mirror");
  exactKeys(
    mirror,
    ["profiles", "versions", "binding"],
    "data/project.json.studios.mirror",
  );
  const reviewCircle = record(
    studios.reviewCircle,
    "data/project.json.studios.reviewCircle",
  );
  exactKeys(
    reviewCircle,
    ["sessions", "results", "roomNotes"],
    "data/project.json.studios.reviewCircle",
  );
  return {
    characterProfiles: safeRows(
      studios.characterProfiles,
      CHARACTER_PROFILE_SPEC,
      "data/project.json.studios.characterProfiles",
    ),
    characterArcs: safeRows(
      studios.characterArcs,
      CHARACTER_ARC_SPEC,
      "data/project.json.studios.characterArcs",
    ),
    characterArcBeats: safeRows(
      studios.characterArcBeats,
      CHARACTER_ARC_BEAT_SPEC,
      "data/project.json.studios.characterArcBeats",
    ),
    narrativeEdges: safeRows(
      studios.narrativeEdges,
      NARRATIVE_EDGE_SPEC,
      "data/project.json.studios.narrativeEdges",
    ),
    mirror: {
      profiles: safeRows(
        mirror.profiles,
        MIRROR_PROFILE_SPEC,
        "data/project.json.studios.mirror.profiles",
      ),
      versions: safeRows(
        mirror.versions,
        MIRROR_VERSION_SPEC,
        "data/project.json.studios.mirror.versions",
      ),
      binding:
        mirror.binding === null
          ? null
          : safeRow(
              mirror.binding,
              MIRROR_BINDING_SPEC,
              "data/project.json.studios.mirror.binding",
            ),
    },
    sourceShelf: safeRows(
      studios.sourceShelf,
      SOURCE_SHELF_SPEC,
      "data/project.json.studios.sourceShelf",
    ),
    visualReferences: safeRows(
      studios.visualReferences,
      VISUAL_REFERENCE_SPEC,
      "data/project.json.studios.visualReferences",
    ),
    reviewCircle: {
      sessions: safeRows(
        reviewCircle.sessions,
        REVIEW_SESSION_SPEC,
        "data/project.json.studios.reviewCircle.sessions",
      ),
      results: safeRows(
        reviewCircle.results,
        REVIEW_RESULT_SPEC,
        "data/project.json.studios.reviewCircle.results",
      ),
      roomNotes: safeRows(
        reviewCircle.roomNotes,
        REVIEW_ROOM_NOTE_SPEC,
        "data/project.json.studios.reviewCircle.roomNotes",
      ),
    },
    momentumSnapshots: safeRows(
      studios.momentumSnapshots,
      MOMENTUM_SNAPSHOT_SPEC,
      "data/project.json.studios.momentumSnapshots",
    ),
  };
}

function parseArchive(payload: Uint8Array): ParsedArchive {
  const bundle = decodeSlateArchiveZip(payload);
  validateManifest(bundle);
  const archiveVersion = bundle.manifest.version;
  const projectData = parseJsonFile(bundle, "data/project.json");
  const manuscriptData = parseJsonFile(bundle, "data/manuscript.json");
  const continuityData = parseJsonFile(bundle, "data/continuity.json");
  const studiosIncluded =
    archiveVersion === 2 && Object.hasOwn(projectData, "studios");
  exactKeys(
    projectData,
    [
      "schemaVersion", "series", "project",
      ...(studiosIncluded ? ["studios"] : []),
    ],
    "data/project.json",
  );
  if (archiveVersion === 1) {
    exactKeys(
      manuscriptData,
      ["schemaVersion", "revisions", "versions", "sections", "sectionVersions"],
      "data/manuscript.json",
    );
  } else {
    exactKeys(
      manuscriptData,
      [
        "schemaVersion", "revisions", "versions", "sections",
        "sectionVersions", "documents", "annotations", "writing",
      ],
      "data/manuscript.json",
    );
  }
  const generationMetadataIncluded = Object.hasOwn(continuityData, "generations");
  const continuityKeys = Object.keys(CONTINUITY_SPECS).filter(
    (key) => generationMetadataIncluded || key !== "generations",
  );
  exactKeys(continuityData, ["schemaVersion", ...continuityKeys], "data/continuity.json");
  schemaVersion(projectData, archiveVersion, "project data");
  schemaVersion(manuscriptData, archiveVersion, "manuscript data");
  schemaVersion(continuityData, archiveVersion, "Continuity data");

  const writingData = archiveVersion === 2
    ? record(manuscriptData.writing, "data/manuscript.json.writing")
    : {};
  if (archiveVersion === 2) {
    exactKeys(
      writingData,
      ["operations", "clarifications", "mutations", "developerEvents"],
      "data/manuscript.json.writing",
    );
  }

  const continuity = Object.fromEntries(
    Object.entries(CONTINUITY_SPECS).map(([key, spec]) => [
      key,
      safeRows(
        continuityData[key] ?? [],
        continuitySpecForArchive(
          key as keyof SlateSafetyContentV1["continuity"],
          spec,
          archiveVersion,
        ),
        `data/continuity.json.${key}`,
      ),
    ]),
  ) as unknown as SlateSafetyContentV1["continuity"];
  const content: SlateSafetyContentV2 = {
    schemaVersion: 2,
    series: safeRow(
      projectData.series,
      seriesSpecForArchive(archiveVersion),
      "data/project.json.series",
    ),
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
    documents: archiveVersion === 2
      ? safeRows(
          manuscriptData.documents,
          DOCUMENT_SPEC,
          "data/manuscript.json.documents",
        )
      : [],
    annotations: archiveVersion === 2
      ? safeRows(
          manuscriptData.annotations,
          ANNOTATION_SPEC,
          "data/manuscript.json.annotations",
        )
      : [],
    writing: {
      operations: archiveVersion === 2
        ? safeRows(
            writingData.operations,
            WRITING_OPERATION_SPEC,
            "data/manuscript.json.writing.operations",
          )
        : [],
      clarifications: archiveVersion === 2
        ? safeRows(
            writingData.clarifications,
            CLARIFICATION_SPEC,
            "data/manuscript.json.writing.clarifications",
          )
        : [],
      mutations: archiveVersion === 2
        ? safeRows(
            writingData.mutations,
            WRITING_MUTATION_SPEC,
            "data/manuscript.json.writing.mutations",
          )
        : [],
      developerEvents: archiveVersion === 2
        ? safeRows(
            writingData.developerEvents,
            DEVELOPER_EVENT_SPEC,
            "data/manuscript.json.writing.developerEvents",
          )
        : [],
    },
    studios: studiosIncluded
      ? parseSlateStudios(projectData.studios)
      : emptySlateStudioContent(),
    continuity,
  };
  validateContentReferences(content, generationMetadataIncluded, archiveVersion);
  return { bundle, content, archiveVersion, generationMetadataIncluded };
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
  startPosition?: ParsedAnchorPosition | null;
  endPosition?: ParsedAnchorPosition | null;
  quoteHash: string;
}

interface ParsedAnchorPosition {
  blockId: string;
  offset: number;
  affinity: "backward" | "forward";
}

function parsedAnchorPosition(
  value: unknown,
  label: string,
): ParsedAnchorPosition | null {
  if (value === null) return null;
  const position = record(value, label);
  exactKeys(position, ["blockId", "offset", "affinity"], label);
  if (
    typeof position.blockId !== "string" ||
    !position.blockId ||
    !Number.isSafeInteger(position.offset) ||
    Number(position.offset) < 0 ||
    (position.affinity !== "backward" && position.affinity !== "forward")
  ) {
    throw new SlateArchiveImportError(`${label} is invalid.`);
  }
  return position as unknown as ParsedAnchorPosition;
}

function parseAnchors(
  value: SlateSafetyRow[string],
  label: string,
  allowBlockPositions: boolean,
): ParsedAnchor[] {
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
    const expected = [
      "sourceId", "sectionId", "sectionRevision", "start", "end", "quoteHash",
    ];
    const hasBlockPositions =
      Object.hasOwn(anchor, "startPosition") ||
      Object.hasOwn(anchor, "endPosition");
    if (allowBlockPositions && hasBlockPositions) {
      expected.push("startPosition", "endPosition");
    }
    exactKeys(anchor, expected, `${label}[${index}]`);
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
    return {
      ...anchor,
      ...(allowBlockPositions && hasBlockPositions
        ? {
            startPosition: parsedAnchorPosition(
              anchor.startPosition,
              `${label}[${index}].startPosition`,
            ),
            endPosition: parsedAnchorPosition(
              anchor.endPosition,
              `${label}[${index}].endPosition`,
            ),
          }
        : {}),
    } as unknown as ParsedAnchor;
  });
}

function validateAnchors(
  value: SlateSafetyRow[string],
  sourceIds: Set<string>,
  sectionIds: Set<string>,
  label: string,
  allowBlockPositions: boolean,
): void {
  for (const [index, anchor] of parseAnchors(
    value,
    label,
    allowBlockPositions,
  ).entries()) {
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

function parsedJsonValue(value: SlateSafetyRow[string], label: string): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError(`${label} is not valid JSON.`);
  }
}

function validatePortableJsonReferences(
  value: unknown,
  label: string,
  references: {
    sources: Set<string>;
    sections: Set<string>;
    entities?: Set<string>;
    threads?: Set<string>;
    beats?: Set<string>;
  },
): void {
  const visit = (candidate: unknown, path: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    const object = candidate as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      if (key === "sourceId" && child !== null) {
        if (typeof child !== "string" || !references.sources.has(child)) {
          throw new SlateArchiveImportError(`${path}.${key} is not in the archive.`);
        }
        continue;
      }
      if (key === "sourceIds") {
        if (
          !Array.isArray(child) ||
          child.some(
            (item) =>
              typeof item !== "string" || !references.sources.has(item),
          )
        ) {
          throw new SlateArchiveImportError(`${path}.${key} contains an unknown id.`);
        }
        continue;
      }
      if (
        [
          "sectionId", "sourceSectionId", "expectedSectionId",
          "observedSectionId", "openedSectionId", "resolvedSectionId",
          "expectedPayoffStartSectionId", "expectedPayoffEndSectionId",
        ].includes(key) &&
        child !== null
      ) {
        if (typeof child !== "string" || !references.sections.has(child)) {
          throw new SlateArchiveImportError(`${path}.${key} is not in the archive.`);
        }
        continue;
      }
      if (
        references.entities &&
        ["entityId", "characterEntityId"].includes(key) &&
        child !== null
      ) {
        if (typeof child !== "string" || !references.entities.has(child)) {
          throw new SlateArchiveImportError(`${path}.${key} is not in the archive.`);
        }
        continue;
      }
      if (references.threads && key === "threadId" && child !== null) {
        if (typeof child !== "string" || !references.threads.has(child)) {
          throw new SlateArchiveImportError(`${path}.${key} is not in the archive.`);
        }
        continue;
      }
      if (
        references.beats &&
        (key === "fromBeatId" || key === "toBeatId") &&
        child !== null
      ) {
        if (typeof child !== "string" || !references.beats.has(child)) {
          throw new SlateArchiveImportError(`${path}.${key} is not in the archive.`);
        }
        continue;
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, label);
}

function validateNarrativeEndpoint(
  value: SlateSafetyRow[string],
  label: string,
  references: {
    sections: Set<string>;
    events: Set<string>;
    claims: Set<string>;
    threads: Set<string>;
    beats: Set<string>;
  },
): void {
  const endpoint = record(parsedJsonValue(value, label), label);
  exactKeys(endpoint, ["kind", "id"], label);
  if (typeof endpoint.kind !== "string" || typeof endpoint.id !== "string") {
    throw new SlateArchiveImportError(`${label} is invalid.`);
  }
  const ids =
    endpoint.kind === "section"
      ? references.sections
      : endpoint.kind === "event"
        ? references.events
        : endpoint.kind === "claim"
          ? references.claims
          : endpoint.kind === "thread"
            ? references.threads
            : endpoint.kind === "arc_beat"
              ? references.beats
              : null;
  if (!ids || !ids.has(endpoint.id)) {
    throw new SlateArchiveImportError(`${label} is not in the archive.`);
  }
}

function validateContentReferences(
  content: SlateSafetyContentV2,
  generationMetadataIncluded: boolean,
  archiveVersion: 1 | 2,
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
    const documentFields = [
      String(row.document_json),
      String(row.document_hash),
      String(row.prose_hash),
    ];
    if (documentFields.some(Boolean)) {
      if (!documentFields.every(Boolean)) {
        throw new SlateArchiveImportError(
          `sectionVersions[${index}] has incomplete rich-document metadata.`,
        );
      }
      try {
        const snapshot = slateSectionDocumentSnapshot(
          normalizeSlateSectionDocument(JSON.parse(documentFields[0]!) as unknown),
          Number(row.revision),
        );
        if (
          snapshot.prose !== String(row.prose) ||
          snapshot.documentHash !== documentFields[1] ||
          snapshot.proseHash !== documentFields[2]
        ) {
          throw new Error("hash mismatch");
        }
      } catch {
        throw new SlateArchiveImportError(
          `sectionVersions[${index}] rich document does not match its prose.`,
        );
      }
    }
  }

  const documentsBySection = new Map<string, {
    blockIds: Set<string>;
    row: SlateSafetyRow;
  }>();
  for (const [index, row] of content.documents.entries()) {
    const sectionId = stringField(row, "section_id", `documents[${index}]`);
    if (documentsBySection.has(sectionId)) {
      throw new SlateArchiveImportError(`documents repeats section ${sectionId}.`);
    }
    requireReference(sectionId, sections, `documents[${index}].section_id`);
    if (
      row.project_id !== projectId ||
      row.schema_version !== 1
    ) {
      throw new SlateArchiveImportError(`documents[${index}] has invalid ownership or schema.`);
    }
    const section = content.sections.find((candidate) => candidate.id === sectionId)!;
    if (Number(row.section_revision) !== Number(section.revision)) {
      throw new SlateArchiveImportError(`documents[${index}] revision is stale.`);
    }
    try {
      const document = normalizeSlateSectionDocument(
        JSON.parse(String(row.document_json)) as unknown,
      );
      const snapshot = slateSectionDocumentSnapshot(
        document,
        Number(row.section_revision),
      );
      if (
        snapshot.prose !== String(section.prose) ||
        snapshot.documentHash !== row.document_hash ||
        snapshot.proseHash !== row.prose_hash
      ) {
        throw new Error("hash mismatch");
      }
      documentsBySection.set(sectionId, {
        row,
        blockIds: new Set(
          document.content.map((block) => String(block.attrs.blockId)),
        ),
      });
    } catch {
      throw new SlateArchiveImportError(
        `documents[${index}] does not match its authoritative prose.`,
      );
    }
  }
  if (archiveVersion === 2 && documentsBySection.size !== sections.size) {
    throw new SlateArchiveImportError(
      "Slate V2 archive must include one authoritative document per section.",
    );
  }

  const annotationIds = uniqueIds(content.annotations, "annotations");
  void annotationIds;
  for (const [index, row] of content.annotations.entries()) {
    const sectionId = stringField(row, "section_id", `annotations[${index}]`);
    requireReference(sectionId, sections, `annotations[${index}].section_id`);
    if (
      row.project_id !== projectId ||
      (row.kind !== "comment" && row.kind !== "note") ||
      (row.resolved !== 0 && row.resolved !== 1)
    ) {
      throw new SlateArchiveImportError(`annotations[${index}] is invalid.`);
    }
    const document = documentsBySection.get(sectionId);
    const blockId = stringField(row, "block_id", `annotations[${index}]`);
    if (!document?.blockIds.has(blockId)) {
      throw new SlateArchiveImportError(
        `annotations[${index}] refers to an unknown document block.`,
      );
    }
    let anchorValue: unknown;
    try {
      anchorValue = JSON.parse(String(row.anchor_json));
    } catch {
      throw new SlateArchiveImportError(`annotations[${index}].anchor_json is invalid.`);
    }
    const [anchor] = parseAnchors(
      JSON.stringify([anchorValue]),
      `annotations[${index}].anchor_json`,
      true,
    );
    if (
      anchor?.sectionId !== sectionId ||
      anchor.sectionRevision !== Number(document.row.section_revision) ||
      (
        anchor.startPosition !== null &&
        anchor.startPosition !== undefined &&
        anchor.startPosition.blockId !== blockId
      )
    ) {
      throw new SlateArchiveImportError(
        `annotations[${index}] anchor does not match its document.`,
      );
    }
  }

  const operationIds = uniqueIds(content.writing.operations, "writing.operations");
  const clarificationIds = uniqueIds(
    content.writing.clarifications,
    "writing.clarifications",
  );
  const mutationIds = uniqueIds(content.writing.mutations, "writing.mutations");
  const developerEventIds = uniqueIds(
    content.writing.developerEvents,
    "writing.developerEvents",
  );
  void mutationIds;
  void developerEventIds;
  const operationStatuses = new Set([
    "compiling", "awaiting_clarification", "generating", "interrupted",
    "proposed", "applied", "rejected", "stale", "cancelled", "failed",
  ]);
  for (const [index, row] of content.writing.operations.entries()) {
    if (
      row.project_id !== projectId ||
      !operationStatuses.has(String(row.status))
    ) {
      throw new SlateArchiveImportError(`writing.operations[${index}] is invalid.`);
    }
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `writing.operations[${index}].section_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "parent_operation_id"),
      operationIds,
      `writing.operations[${index}].parent_operation_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "revision_id"),
      revisions,
      `writing.operations[${index}].revision_id`,
      true,
    );
    if (row.proposal_text !== null) {
      if (
        typeof row.proposal_hash !== "string" ||
        row.proposal_hash !== sha256(String(row.proposal_text))
      ) {
        throw new SlateArchiveImportError(
          `writing.operations[${index}] proposal checksum does not match.`,
        );
      }
    } else if (row.proposal_hash !== null) {
      throw new SlateArchiveImportError(
        `writing.operations[${index}] has a proposal hash without prose.`,
      );
    }
  }
  for (const [index, row] of content.writing.clarifications.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(
        `writing.clarifications[${index}] belongs to another project.`,
      );
    }
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `writing.clarifications[${index}].section_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "operation_id"),
      operationIds,
      `writing.clarifications[${index}].operation_id`,
    );
    requireReference(
      nullableStringField(row, "resume_operation_id"),
      operationIds,
      `writing.clarifications[${index}].resume_operation_id`,
      true,
    );
  }
  for (const [index, row] of content.writing.mutations.entries()) {
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(
        `writing.mutations[${index}] belongs to another project.`,
      );
    }
    requireReference(
      nullableStringField(row, "operation_id"),
      operationIds,
      `writing.mutations[${index}].operation_id`,
    );
    requireReference(
      nullableStringField(row, "result_operation_id"),
      operationIds,
      `writing.mutations[${index}].result_operation_id`,
    );
  }
  const sequences = new Set<number>();
  for (const [index, row] of content.writing.developerEvents.entries()) {
    const sequence = Number(row.sequence);
    if (
      row.project_id !== projectId ||
      row.series_id !== seriesId ||
      !Number.isSafeInteger(sequence) ||
      sequence < 1 ||
      sequences.has(sequence)
    ) {
      throw new SlateArchiveImportError(
        `writing.developerEvents[${index}] is invalid.`,
      );
    }
    sequences.add(sequence);
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `writing.developerEvents[${index}].section_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "operation_id"),
      operationIds,
      `writing.developerEvents[${index}].operation_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "clarification_id"),
      clarificationIds,
      `writing.developerEvents[${index}].clarification_id`,
      true,
    );
  }

  const sources = continuityIds.sources;
  const entities = continuityIds.entities;
  const claims = continuityIds.claims;
  const events = continuityIds.events;
  const projectScopedContinuity = new Set([
    "claims", "events", "threads", "concerns",
  ]);
  for (const [collection, rows] of Object.entries(content.continuity)) {
    if (collection === "generations") continue;
    for (const [index, row] of rows.entries()) {
      if (row.series_id !== seriesId) {
        throw new SlateArchiveImportError(`${collection}[${index}] belongs to another series.`);
      }
      const rowProject = nullableStringField(row, "project_id");
      if (
        collection === "sources" &&
        rowProject !== projectId &&
        !(
          rowProject === null &&
          row.scope_kind === "series" &&
          row.authority === "human" &&
          row.kind === "review_direction" &&
          row.section_id === null
        )
      ) {
        throw new SlateArchiveImportError(
          `sources[${index}] belongs to another project.`,
        );
      }
      if (projectScopedContinuity.has(collection) && rowProject !== projectId) {
        throw new SlateArchiveImportError(`${collection}[${index}] belongs to another project.`);
      }
      const rowSection = nullableStringField(row, "section_id");
      if (rowSection !== null && !sections.has(rowSection)) {
        throw new SlateArchiveImportError(`${collection}[${index}] has an unknown project section.`);
      }
      const generation = Number(row.generation);
      if (!Number.isSafeInteger(generation) || generation < 0) {
        throw new SlateArchiveImportError(
          `${collection}[${index}] has an invalid Continuity generation.`,
        );
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
    const seriesActiveGeneration = Number(
      content.series.continuity_active_generation,
    );
    const projectActiveGeneration = Number(
      content.project.continuity_active_generation,
    );
    const activeGeneration = seriesActiveGeneration > 0
      ? seriesActiveGeneration
      : projectActiveGeneration;
    const seriesPreviousGeneration =
      content.series.continuity_previous_generation === null
        ? null
        : Number(content.series.continuity_previous_generation);
    const projectPreviousGeneration =
      content.project.continuity_previous_generation === null
        ? null
        : Number(content.project.continuity_previous_generation);
    const previousGeneration = seriesActiveGeneration > 0
      ? seriesPreviousGeneration
      : projectPreviousGeneration;
    if (
      !Number.isSafeInteger(seriesActiveGeneration) ||
      seriesActiveGeneration < 0
    ) {
      throw new SlateArchiveImportError(
        "Slate archive has an invalid series Continuity generation.",
      );
    }
    if (
      seriesPreviousGeneration !== null &&
      (
        !Number.isSafeInteger(seriesPreviousGeneration) ||
        seriesPreviousGeneration <= 0
      )
    ) {
      throw new SlateArchiveImportError(
        "Slate archive has an invalid previous series Continuity generation.",
      );
    }
    if (
      seriesActiveGeneration === 0 &&
      seriesPreviousGeneration !== null
    ) {
      throw new SlateArchiveImportError(
        "Slate archive series Continuity generation pointers are inconsistent.",
      );
    }
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
    for (const [collection, rows] of Object.entries(content.continuity)) {
      if (collection === "generations") continue;
      for (const [index, row] of rows.entries()) {
        const generation = Number(row.generation);
        if (generation > 0 && !generationsByNumber.has(generation)) {
          throw new SlateArchiveImportError(
            `${collection}[${index}] references an unknown Continuity generation.`,
          );
        }
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
    validateAnchors(row.anchors_json, sources, sections, `entities[${index}].anchors_json`, archiveVersion === 2);
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
    validateAnchors(row.anchors_json, sources, sections, `claims[${index}].anchors_json`, archiveVersion === 2);
  }
  for (const [index, row] of content.continuity.events.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `events[${index}].source_id`);
    requireReference(nullableStringField(row, "location_entity_id"), entities, `events[${index}].location_entity_id`, true);
    validateJsonIdArray(String(row.participant_entity_ids_json), entities, `events[${index}].participant_entity_ids_json`);
    validateAnchors(row.anchors_json, sources, sections, `events[${index}].anchors_json`, archiveVersion === 2);
  }
  for (const [index, row] of content.continuity.relationships.entries()) {
    requireReference(nullableStringField(row, "from_entity_id"), entities, `relationships[${index}].from_entity_id`);
    requireReference(nullableStringField(row, "to_entity_id"), entities, `relationships[${index}].to_entity_id`);
    requireReference(nullableStringField(row, "source_id"), sources, `relationships[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `relationships[${index}].anchors_json`, archiveVersion === 2);
  }
  for (const [index, row] of content.continuity.knowledge.entries()) {
    requireReference(nullableStringField(row, "character_entity_id"), entities, `knowledge[${index}].character_entity_id`);
    requireReference(nullableStringField(row, "claim_id"), claims, `knowledge[${index}].claim_id`);
    requireReference(nullableStringField(row, "learned_event_id"), events, `knowledge[${index}].learned_event_id`, true);
    requireReference(nullableStringField(row, "source_id"), sources, `knowledge[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `knowledge[${index}].anchors_json`, archiveVersion === 2);
  }
  for (const [index, row] of content.continuity.threads.entries()) {
    requireReference(nullableStringField(row, "source_id"), sources, `threads[${index}].source_id`);
    validateAnchors(row.anchors_json, sources, sections, `threads[${index}].anchors_json`, archiveVersion === 2);
  }
  for (const [index, row] of content.continuity.concerns.entries()) {
    validateJsonIdArray(String(row.claim_ids_json), claims, `concerns[${index}].claim_ids_json`);
    validateAnchors(row.anchors_json, sources, sections, `concerns[${index}].anchors_json`, archiveVersion === 2);
    validateResolution(
      row.resolution_json,
      sources,
      revisions,
      `concerns[${index}].resolution_json`,
    );
  }

  const profiles = uniqueIds(
    content.studios.characterProfiles,
    "studios.characterProfiles",
  );
  const arcs = uniqueIds(
    content.studios.characterArcs,
    "studios.characterArcs",
  );
  const beats = uniqueIds(
    content.studios.characterArcBeats,
    "studios.characterArcBeats",
  );
  const edges = uniqueIds(
    content.studios.narrativeEdges,
    "studios.narrativeEdges",
  );
  void edges;
  const studioReferences = {
    sources,
    sections,
    entities,
    threads: continuityIds.threads,
    beats,
  };
  const validateStudioGeneration = (
    row: SlateSafetyRow,
    label: string,
  ): void => {
    const generation = Number(row.generation);
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      (
        generationMetadataIncluded &&
        generation > 0 &&
        !generationsByNumber.has(generation)
      )
    ) {
      throw new SlateArchiveImportError(
        `${label} has an invalid Continuity generation.`,
      );
    }
  };
  for (const [index, row] of content.studios.characterProfiles.entries()) {
    const label = `studios.characterProfiles[${index}]`;
    if (
      row.series_id !== seriesId ||
      (row.project_id !== null && row.project_id !== projectId) ||
      !["evidence", "canon", "plans", "interpretations"].includes(
        String(row.layer),
      )
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    requireReference(nullableStringField(row, "entity_id"), entities, `${label}.entity_id`);
    validateStudioGeneration(row, label);
    validatePortableJsonReferences(
      parsedJsonValue(row.profile_json, `${label}.profile_json`),
      `${label}.profile_json`,
      studioReferences,
    );
    validatePortableJsonReferences(
      parsedJsonValue(row.provenance_json, `${label}.provenance_json`),
      `${label}.provenance_json`,
      studioReferences,
    );
    const locks = parsedJsonValue(row.field_locks_json, `${label}.field_locks_json`);
    if (!locks || typeof locks !== "object" || Array.isArray(locks)) {
      throw new SlateArchiveImportError(`${label}.field_locks_json is invalid.`);
    }
  }
  for (const [index, row] of content.studios.characterArcs.entries()) {
    const label = `studios.characterArcs[${index}]`;
    if (
      row.series_id !== seriesId ||
      (row.project_id !== null && row.project_id !== projectId)
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    requireReference(
      nullableStringField(row, "character_profile_id"),
      profiles,
      `${label}.character_profile_id`,
    );
    validateStudioGeneration(row, label);
    for (const column of [
      "intended_json", "observed_json", "provenance_json",
    ] as const) {
      validatePortableJsonReferences(
        parsedJsonValue(row[column], `${label}.${column}`),
        `${label}.${column}`,
        studioReferences,
      );
    }
  }
  for (const [index, row] of content.studios.characterArcBeats.entries()) {
    const label = `studios.characterArcBeats[${index}]`;
    if (
      row.series_id !== seriesId ||
      (row.project_id !== null && row.project_id !== projectId) ||
      (row.track !== "intended" && row.track !== "observed") ||
      Number(row.ordinal) < 0
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    requireReference(
      nullableStringField(row, "character_arc_id"),
      arcs,
      `${label}.character_arc_id`,
    );
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `${label}.section_id`,
      true,
    );
    validateStudioGeneration(row, label);
    for (const column of ["beat_json", "provenance_json"] as const) {
      validatePortableJsonReferences(
        parsedJsonValue(row[column], `${label}.${column}`),
        `${label}.${column}`,
        studioReferences,
      );
    }
  }
  for (const [index, row] of content.studios.narrativeEdges.entries()) {
    const label = `studios.narrativeEdges[${index}]`;
    if (
      row.series_id !== seriesId ||
      (row.project_id !== null && row.project_id !== projectId) ||
      !["before", "after", "causes", "requires", "prevents", "reveals", "resolves"]
        .includes(String(row.kind))
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    validateStudioGeneration(row, label);
    validateNarrativeEndpoint(
      row.from_ref_json,
      `${label}.from_ref_json`,
      {
        sections,
        events,
        claims,
        threads: continuityIds.threads,
        beats,
      },
    );
    validateNarrativeEndpoint(
      row.to_ref_json,
      `${label}.to_ref_json`,
      {
        sections,
        events,
        claims,
        threads: continuityIds.threads,
        beats,
      },
    );
    validatePortableJsonReferences(
      parsedJsonValue(row.provenance_json, `${label}.provenance_json`),
      `${label}.provenance_json`,
      studioReferences,
    );
  }

  const mirrorProfiles = uniqueIds(
    content.studios.mirror.profiles,
    "studios.mirror.profiles",
  );
  const mirrorVersions = uniqueIds(
    content.studios.mirror.versions,
    "studios.mirror.versions",
  );
  for (const [index, row] of content.studios.mirror.profiles.entries()) {
    if (
      (row.frozen !== 0 && row.frozen !== 1) ||
      !String(row.name).trim()
    ) {
      throw new SlateArchiveImportError(
        `studios.mirror.profiles[${index}] is invalid.`,
      );
    }
  }
  const profileVersionNumbers = new Set<string>();
  for (const [index, row] of content.studios.mirror.versions.entries()) {
    const label = `studios.mirror.versions[${index}]`;
    const profileId = nullableStringField(row, "profile_id");
    requireReference(profileId, mirrorProfiles, `${label}.profile_id`);
    const version = Number(row.version);
    const versionKey = `${profileId}:${version}`;
    if (version <= 0 || profileVersionNumbers.has(versionKey)) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    profileVersionNumbers.add(versionKey);
    const metadata = record(
      parsedJsonValue(row.eligibility_summary_json, `${label}.eligibility_summary_json`),
      `${label}.eligibility_summary_json`,
    );
    requireReference(
      typeof metadata.parentVersionId === "string"
        ? metadata.parentVersionId
        : null,
      mirrorVersions,
      `${label}.eligibility_summary_json.parentVersionId`,
      true,
    );
    if (
      !Array.isArray(metadata.sampleIds) ||
      metadata.sampleIds.length !== 0
    ) {
      throw new SlateArchiveImportError(
        `${label} must not carry writer samples.`,
      );
    }
  }
  const binding = content.studios.mirror.binding;
  if (binding) {
    if (binding.project_id !== projectId) {
      throw new SlateArchiveImportError(
        "studios.mirror.binding belongs to another project.",
      );
    }
    requireReference(
      nullableStringField(binding, "profile_version_id"),
      mirrorVersions,
      "studios.mirror.binding.profile_version_id",
    );
    const projectOverlay = parsedJsonValue(
      binding.project_overlay_json,
      "studios.mirror.binding.project_overlay_json",
    );
    const povOverlays = parsedJsonValue(
      binding.pov_overlays_json,
      "studios.mirror.binding.pov_overlays_json",
    );
    if (
      !projectOverlay ||
      typeof projectOverlay !== "object" ||
      Array.isArray(projectOverlay) ||
      !Array.isArray(povOverlays)
    ) {
      throw new SlateArchiveImportError("studios.mirror.binding is invalid.");
    }
  }
  if (mirrorVersions.size > 0) {
    for (const [index, row] of content.writing.operations.entries()) {
      requireReference(
        nullableStringField(row, "mirror_profile_version_id"),
        mirrorVersions,
        `writing.operations[${index}].mirror_profile_version_id`,
        true,
      );
    }
    for (const [index, row] of content.writing.clarifications.entries()) {
      requireReference(
        nullableStringField(row, "mirror_profile_version_id"),
        mirrorVersions,
        `writing.clarifications[${index}].mirror_profile_version_id`,
        true,
      );
    }
  }

  const sourceShelfIds = uniqueIds(
    content.studios.sourceShelf,
    "studios.sourceShelf",
  );
  void sourceShelfIds;
  for (const [index, row] of content.studios.sourceShelf.entries()) {
    const label = `studios.sourceShelf[${index}]`;
    if (
      row.project_id !== projectId ||
      (row.kind !== "note" && row.kind !== "research") ||
      row.mirror_eligible !== 0
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    requireReference(
      nullableStringField(row, "promoted_source_id"),
      sources,
      `${label}.promoted_source_id`,
      true,
    );
  }
  const visualIds = uniqueIds(
    content.studios.visualReferences,
    "studios.visualReferences",
  );
  void visualIds;
  for (const [index, row] of content.studios.visualReferences.entries()) {
    const label = `studios.visualReferences[${index}]`;
    if (
      row.project_id !== projectId ||
      !["study", "pinned", "rejected"].includes(String(row.status))
    ) {
      throw new SlateArchiveImportError(`${label} is invalid.`);
    }
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `${label}.section_id`,
      true,
    );
    requireReference(
      nullableStringField(row, "entity_id"),
      entities,
      `${label}.entity_id`,
      true,
    );
    validatePortableJsonReferences(
      parsedJsonValue(row.reference_state_json, `${label}.reference_state_json`),
      `${label}.reference_state_json`,
      studioReferences,
    );
  }

  const reviewSessions = uniqueIds(
    content.studios.reviewCircle.sessions,
    "studios.reviewCircle.sessions",
  );
  const reviewResults = uniqueIds(
    content.studios.reviewCircle.results,
    "studios.reviewCircle.results",
  );
  void reviewResults;
  for (const [index, row] of content.studios.reviewCircle.sessions.entries()) {
    const label = `studios.reviewCircle.sessions[${index}]`;
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`${label} belongs to another project.`);
    }
    const sectionId = nullableStringField(row, "section_id");
    requireReference(sectionId, sections, `${label}.section_id`);
    const artifact = record(
      parsedJsonValue(row.artifact_json, `${label}.artifact_json`),
      `${label}.artifact_json`,
    );
    const context = record(artifact.context, `${label}.artifact_json.context`);
    if (
      artifact.appletId !== "slate" ||
      artifact.subjectId !== sectionId ||
      context.projectId !== projectId
    ) {
      throw new SlateArchiveImportError(`${label}.artifact_json is invalid.`);
    }
    const revisions = record(
      parsedJsonValue(
        row.section_revisions_json,
        `${label}.section_revisions_json`,
      ),
      `${label}.section_revisions_json`,
    );
    if (
      Object.keys(revisions).some((id) => !sections.has(id)) ||
      Object.values(revisions).some((revision) => !Number.isSafeInteger(revision))
    ) {
      throw new SlateArchiveImportError(
        `${label}.section_revisions_json is invalid.`,
      );
    }
  }
  for (const [index, row] of content.studios.reviewCircle.results.entries()) {
    const label = `studios.reviewCircle.results[${index}]`;
    requireReference(
      nullableStringField(row, "session_id"),
      reviewSessions,
      `${label}.session_id`,
    );
  }
  const roomNoteSessions = new Set<string>();
  for (const [index, row] of content.studios.reviewCircle.roomNotes.entries()) {
    const label = `studios.reviewCircle.roomNotes[${index}]`;
    const sessionId = nullableStringField(row, "session_id");
    requireReference(sessionId, reviewSessions, `${label}.session_id`);
    if (sessionId && roomNoteSessions.has(sessionId)) {
      throw new SlateArchiveImportError(`${label} repeats a session.`);
    }
    if (sessionId) roomNoteSessions.add(sessionId);
  }
  for (const sessionId of reviewSessions) {
    if (!roomNoteSessions.has(sessionId)) {
      throw new SlateArchiveImportError(
        "Every Review Circle session needs its immutable Room Note.",
      );
    }
  }

  const momentumIds = uniqueIds(
    content.studios.momentumSnapshots,
    "studios.momentumSnapshots",
  );
  void momentumIds;
  for (const [index, row] of content.studios.momentumSnapshots.entries()) {
    const label = `studios.momentumSnapshots[${index}]`;
    if (row.project_id !== projectId) {
      throw new SlateArchiveImportError(`${label} belongs to another project.`);
    }
    requireReference(
      nullableStringField(row, "section_id"),
      sections,
      `${label}.section_id`,
      true,
    );
    validatePortableJsonReferences(
      parsedJsonValue(row.state_json, `${label}.state_json`),
      `${label}.state_json`,
      studioReferences,
    );
  }
}

function archiveCounts(content: SlateSafetyContentV2): SlateArchiveImportCounts {
  return {
    revisions: content.revisions.length,
    versions: content.versions.length,
    sections: content.sections.length,
    sectionVersions: content.sectionVersions.length,
    documents: content.documents.length,
    annotations: content.annotations.length,
    writingOperations: content.writing.operations.length,
    clarifications: content.writing.clarifications.length,
    writingMutations: content.writing.mutations.length,
    developerEvents: content.writing.developerEvents.length,
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
    characterProfiles: content.studios.characterProfiles.length,
    characterArcs: content.studios.characterArcs.length,
    characterArcBeats: content.studios.characterArcBeats.length,
    narrativeEdges: content.studios.narrativeEdges.length,
    mirrorProfiles: content.studios.mirror.profiles.length,
    mirrorVersions: content.studios.mirror.versions.length,
    mirrorBindings: content.studios.mirror.binding ? 1 : 0,
    sourceShelfItems: content.studios.sourceShelf.length,
    visualReferences: content.studios.visualReferences.length,
    reviewCircleSessions: content.studios.reviewCircle.sessions.length,
    reviewCircleResults: content.studios.reviewCircle.results.length,
    reviewCircleRoomNotes: content.studios.reviewCircle.roomNotes.length,
    momentumSnapshots: content.studios.momentumSnapshots.length,
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

function createImportMaps(content: SlateSafetyContentV2, idFactory: () => string): ImportMaps {
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
    annotations: createIdMap(content.annotations, "annotations", nextId),
    operations: createIdMap(content.writing.operations, "writing operations", nextId),
    clarifications: createIdMap(
      content.writing.clarifications,
      "clarifications",
      nextId,
    ),
    mutations: createIdMap(content.writing.mutations, "writing mutations", nextId),
    developerEvents: createIdMap(
      content.writing.developerEvents,
      "developer events",
      nextId,
    ),
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
    characterProfiles: createIdMap(
      content.studios.characterProfiles,
      "character profiles",
      nextId,
    ),
    characterArcs: createIdMap(
      content.studios.characterArcs,
      "character arcs",
      nextId,
    ),
    characterArcBeats: createIdMap(
      content.studios.characterArcBeats,
      "character arc beats",
      nextId,
    ),
    narrativeEdges: createIdMap(
      content.studios.narrativeEdges,
      "narrative edges",
      nextId,
    ),
    mirrorProfiles: createIdMap(
      content.studios.mirror.profiles,
      "Mirror profiles",
      nextId,
    ),
    mirrorVersions: createIdMap(
      content.studios.mirror.versions,
      "Mirror versions",
      nextId,
    ),
    sourceShelfItems: createIdMap(
      content.studios.sourceShelf,
      "Source Shelf items",
      nextId,
    ),
    visualReferences: createIdMap(
      content.studios.visualReferences,
      "visual references",
      nextId,
    ),
    reviewSessions: createIdMap(
      content.studios.reviewCircle.sessions,
      "Review Circle sessions",
      nextId,
    ),
    reviewResults: createIdMap(
      content.studios.reviewCircle.results,
      "Review Circle results",
      nextId,
    ),
    momentumSnapshots: createIdMap(
      content.studios.momentumSnapshots,
      "momentum snapshots",
      nextId,
    ),
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
  return JSON.stringify(
    parseAnchors(value, "Continuity anchors", true).map((anchor, index) => {
    return {
      sourceId: mapped(maps.sources, anchor.sourceId, `Continuity anchor ${index}.sourceId`),
      sectionId: typeof anchor.sectionId === "string"
        ? maps.sections.get(anchor.sectionId) ?? null
        : null,
      sectionRevision: anchor.sectionRevision,
      start: anchor.start,
      end: anchor.end,
      ...(anchor.startPosition !== undefined
        ? {
            startPosition: anchor.startPosition,
            endPosition: anchor.endPosition ?? null,
          }
        : {}),
      quoteHash: anchor.quoteHash,
    };
    }),
  );
}

function remapAnnotationAnchor(
  value: SlateSafetyRow[string],
  maps: ImportMaps,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new SlateArchiveImportError("Annotation anchor is not valid JSON.");
  }
  const [anchor] = parseAnchors(
    JSON.stringify([parsed]),
    "Annotation anchor",
    true,
  );
  if (!anchor) throw new SlateArchiveImportError("Annotation anchor is missing.");
  return JSON.stringify({
    ...anchor,
    sourceId: maps.sources.get(anchor.sourceId) ??
      (
        anchor.sourceId.startsWith("document:")
          ? anchor.sourceId.replace(
              /^(document:)[^:]+(:revision:)/u,
              `$1${maps.sections.get(anchor.sectionId ?? "") ?? anchor.sectionId}$2`,
            )
          : anchor.sourceId
      ),
    sectionId:
      typeof anchor.sectionId === "string"
        ? maps.sections.get(anchor.sectionId) ?? null
        : null,
  });
}

function remapKnownIdArray(
  value: SlateSafetyRow[string],
  map: Map<string, string>,
): string {
  const parsed = JSON.parse(String(value)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new SlateArchiveImportError("Portable id list must be an array.");
  }
  return JSON.stringify(
    parsed
      .filter((id): id is string => typeof id === "string")
      .map((id) => map.get(id) ?? id),
  );
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

function remapPortableJsonValue(
  value: unknown,
  maps: ImportMaps,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => remapPortableJsonValue(item, maps));
  }
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object)) {
    const mapSingle = (map: Map<string, string>): unknown =>
      typeof child === "string" ? map.get(child) ?? child : child;
    if (key === "sourceId") {
      result[key] =
        typeof child === "string" ? maps.sources.get(child) ?? null : null;
    } else if (key === "sourceIds" && Array.isArray(child)) {
      result[key] = child.map((id) =>
        typeof id === "string" ? maps.sources.get(id) ?? id : id
      );
    } else if (
      [
        "sectionId", "sourceSectionId", "expectedSectionId",
        "observedSectionId", "openedSectionId", "resolvedSectionId",
        "expectedPayoffStartSectionId", "expectedPayoffEndSectionId",
        "subjectId",
      ].includes(key)
    ) {
      result[key] = mapSingle(maps.sections);
    } else if (key === "projectId") {
      result[key] = maps.projectId;
    } else if (
      ["entityId", "characterEntityId", "povCharacterId"].includes(key)
    ) {
      result[key] =
        typeof child === "string"
          ? maps.entities.get(child) ??
            maps.characterProfiles.get(child) ??
            child
          : child;
    } else if (key === "threadId") {
      result[key] = mapSingle(maps.threads);
    } else if (key === "profileId") {
      result[key] =
        typeof child === "string"
          ? maps.characterProfiles.get(child) ??
            maps.mirrorProfiles.get(child) ??
            child
          : child;
    } else if (key === "profileVersionId" || key === "parentVersionId") {
      result[key] = mapSingle(maps.mirrorVersions);
    } else if (key === "arcId") {
      result[key] = mapSingle(maps.characterArcs);
    } else if (key === "fromBeatId" || key === "toBeatId") {
      result[key] = mapSingle(maps.characterArcBeats);
    } else if (key === "operationId" || key === "originatingOperationId") {
      result[key] = mapSingle(maps.operations);
    } else {
      result[key] = remapPortableJsonValue(child, maps);
    }
  }
  return result;
}

function remapPortableJson(
  value: SlateSafetyRow[string],
  maps: ImportMaps,
  label: string,
): string {
  return JSON.stringify(
    remapPortableJsonValue(parsedJsonValue(value, label), maps),
  );
}

function remapNarrativeEndpoint(
  value: SlateSafetyRow[string],
  maps: ImportMaps,
): string {
  const endpoint = record(
    parsedJsonValue(value, "Narrative edge endpoint"),
    "Narrative edge endpoint",
  );
  const id = String(endpoint.id);
  const map =
    endpoint.kind === "section"
      ? maps.sections
      : endpoint.kind === "event"
        ? maps.events
        : endpoint.kind === "claim"
          ? maps.claims
          : endpoint.kind === "thread"
            ? maps.threads
            : maps.characterArcBeats;
  return JSON.stringify({
    kind: endpoint.kind,
    id: mapped(map, id, "Narrative edge endpoint"),
  });
}

function remapSectionRevisions(
  value: SlateSafetyRow[string],
  maps: ImportMaps,
): string {
  const revisions = record(
    parsedJsonValue(value, "Review Circle section revisions"),
    "Review Circle section revisions",
  );
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(revisions).map(([sectionId, revision]) => [
        mapped(maps.sections, sectionId, "Review Circle section"),
        revision,
      ]),
    ),
  );
}

function remapMirrorVersionMetadata(
  value: SlateSafetyRow[string],
  maps: ImportMaps,
): string {
  const metadata = record(
    parsedJsonValue(value, "Mirror version metadata"),
    "Mirror version metadata",
  );
  return JSON.stringify({
    ...metadata,
    parentVersionId:
      typeof metadata.parentVersionId === "string"
        ? maps.mirrorVersions.get(metadata.parentVersionId) ?? null
        : null,
    sampleIds: [],
    eligibleSampleCount: 0,
    excludedSampleCount: 0,
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

function legacyManuscript(content: SlateSafetyContentV2): string {
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
  const seriesActiveGeneration = Number(
    content.series.continuity_active_generation,
  );
  const activeGeneration = preserveGenerationPointers
    ? seriesActiveGeneration > 0
      ? seriesActiveGeneration
      : Number(content.project.continuity_active_generation)
    : 0;
  const previousGeneration = preserveGenerationPointers
    ? seriesActiveGeneration > 0
      ? content.series.continuity_previous_generation === null
        ? null
        : Number(content.series.continuity_previous_generation)
      : content.project.continuity_previous_generation === null
        ? null
        : Number(content.project.continuity_previous_generation)
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
    [
      "id", "user_id", "title", "description",
      "continuity_active_generation", "continuity_previous_generation",
      "created_at", "updated_at",
    ],
    [
      maps.seriesId, userId, seriesTitle, String(content.series.description),
      activeGeneration, previousGeneration, importedAt, importedAt,
    ],
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
      "summary", "direction", "prose", "locked", "status", "content_hash",
      "document_json", "document_hash", "prose_hash", "created_at",
    ], [
      mapped(maps.sectionVersions, row.id, "section version id"), maps.projectId,
      mapped(maps.sections, row.section_id, "section version section"), userId,
      Number(row.revision), String(row.reason), String(row.title), String(row.summary),
      String(row.direction), String(row.prose), Number(row.locked), String(row.status),
      String(row.content_hash), String(row.document_json), String(row.document_hash),
      String(row.prose_hash), String(row.created_at),
    ]);
  }
  for (const row of content.documents) {
    insert(db, "slate_section_documents", [
      "section_id", "user_id", "project_id", "schema_version",
      "section_revision", "document_json", "document_hash", "prose_hash",
      "created_at", "updated_at",
    ], [
      mapped(maps.sections, row.section_id, "document section"), userId,
      maps.projectId, Number(row.schema_version), Number(row.section_revision),
      String(row.document_json), String(row.document_hash), String(row.prose_hash),
      String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.annotations) {
    const annotationId = mapped(maps.annotations, row.id, "annotation id");
    insert(db, "slate_section_annotations", [
      "id", "user_id", "project_id", "section_id", "block_id", "anchor_json",
      "kind", "body", "resolved", "idempotency_key", "created_at", "updated_at",
    ], [
      annotationId, userId, maps.projectId,
      mapped(maps.sections, row.section_id, "annotation section"),
      String(row.block_id), remapAnnotationAnchor(row.anchor_json, maps),
      String(row.kind), String(row.body), Number(row.resolved),
      `archive-import:${annotationId}`, String(row.created_at), String(row.updated_at),
    ]);
  }

  const liveOperationStatuses = new Set([
    "compiling", "awaiting_clarification", "generating",
  ]);
  for (const row of content.writing.operations) {
    const operationId = mapped(maps.operations, row.id, "writing operation id");
    const sourceStatus = String(row.status);
    const importedStatus = liveOperationStatuses.has(sourceStatus)
      ? "interrupted"
      : sourceStatus === "proposed"
        ? "stale"
        : sourceStatus;
    const retired = importedStatus !== sourceStatus;
    insert(db, "slate_writing_operations", [
      "id", "user_id", "project_id", "section_id", "parent_operation_id",
      "kind", "status", "direction_intent_json", "validated_snapshot_json",
      "revision_fingerprint", "continuity_generation",
      "mirror_profile_version_id", "provider", "model", "proposal_text",
      "proposal_hash", "revision_id", "idempotency_key", "error", "created_at",
      "updated_at", "started_at", "completed_at", "resolved_at",
    ], [
      operationId, userId, maps.projectId,
      mappedNullable(maps.sections, row.section_id), null, String(row.kind),
      importedStatus, String(row.direction_intent_json),
      String(row.validated_snapshot_json), String(row.revision_fingerprint),
      Number(row.continuity_generation),
      mappedNullable(maps.mirrorVersions, row.mirror_profile_version_id),
      nullableStringField(row, "provider"), nullableStringField(row, "model"),
      nullableStringField(row, "proposal_text"),
      nullableStringField(row, "proposal_hash"),
      mappedNullable(maps.revisions, row.revision_id),
      `archive-import:${operationId}`,
      retired
        ? "Imported operation was retired because its validated snapshot belongs to the source project."
        : null,
      String(row.created_at), retired ? importedAt : String(row.updated_at),
      nullableStringField(row, "started_at"),
      nullableStringField(row, "completed_at"),
      retired ? importedAt : nullableStringField(row, "resolved_at"),
    ]);
  }
  for (const row of content.writing.operations) {
    const parentId = mappedNullable(maps.operations, row.parent_operation_id);
    if (parentId) {
      db.prepare(
        `UPDATE slate_writing_operations
            SET parent_operation_id = ?
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      ).run(
        parentId,
        mapped(maps.operations, row.id, "writing operation id"),
        maps.projectId,
        userId,
      );
    }
  }
  for (const row of content.writing.clarifications) {
    const clarificationId = mapped(
      maps.clarifications,
      row.id,
      "clarification id",
    );
    const awaiting = row.status === "pending" || row.status === "awaiting_answer";
    insert(db, "slate_clarification_requests", [
      "id", "user_id", "project_id", "section_id", "operation_id", "kind",
      "status", "prompt", "choices_json", "allows_custom_vibe",
      "evidence_json", "revision_fingerprint", "continuity_generation",
      "mirror_profile_version_id", "answer_kind", "answer_choice_id",
      "custom_vibe", "structured_direction_json", "answer_idempotency_key",
      "resume_operation_id", "created_at", "answered_at", "stale_at",
    ], [
      clarificationId, userId, maps.projectId,
      mappedNullable(maps.sections, row.section_id),
      mapped(maps.operations, row.operation_id, "clarification operation"),
      String(row.kind), awaiting ? "stale" : String(row.status),
      String(row.prompt), String(row.choices_json),
      Number(row.allows_custom_vibe), String(row.evidence_json),
      String(row.revision_fingerprint), Number(row.continuity_generation),
      mappedNullable(maps.mirrorVersions, row.mirror_profile_version_id),
      nullableStringField(row, "answer_kind"),
      nullableStringField(row, "answer_choice_id"),
      nullableStringField(row, "custom_vibe"),
      nullableStringField(row, "structured_direction_json"), null,
      mappedNullable(maps.operations, row.resume_operation_id),
      String(row.created_at), nullableStringField(row, "answered_at"),
      awaiting ? importedAt : nullableStringField(row, "stale_at"),
    ]);
  }
  for (const row of content.writing.mutations) {
    const mutationId = mapped(maps.mutations, row.id, "writing mutation id");
    insert(db, "slate_writing_operation_mutations", [
      "id", "user_id", "project_id", "operation_id", "action",
      "idempotency_key", "result_operation_id", "created_at",
    ], [
      mutationId, userId, maps.projectId,
      mapped(maps.operations, row.operation_id, "writing mutation operation"),
      String(row.action), `archive-import:${mutationId}`,
      mapped(
        maps.operations,
        row.result_operation_id,
        "writing mutation result operation",
      ),
      String(row.created_at),
    ]);
  }

  for (const row of content.continuity.sources) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    const portableWriterSource =
      row.project_id === null &&
      row.section_id === null &&
      row.scope_kind === "series" &&
      row.authority === "human" &&
      row.kind === "review_direction";
    let sourceContent = String(row.content);
    if (portableWriterSource) {
      try {
        sourceContent = JSON.stringify(
          remapPortableJsonValue(JSON.parse(sourceContent), maps),
        );
      } catch {
        // Writer-authority source content may be plain text.
      }
    }
    insert(db, "slate_continuity_sources", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "source_revision", "content", "content_hash", "authority", "provider", "model",
      "producer_versions_json", "generation", "supersedes_source_id", "created_at",
    ], [
      mapped(maps.sources, row.id, "source id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.kind), Number(row.source_revision),
      sourceContent, sha256(sourceContent), String(row.authority),
      nullableStringField(row, "provider"), nullableStringField(row, "model"),
      String(row.producer_versions_json), Number(row.generation), null,
      String(row.created_at),
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
      "anchors_json", "source_id", "producer_versions_json", "generation",
      "created_at", "updated_at",
    ], [
      mapped(maps.entities, row.id, "entity id"), userId, maps.seriesId, String(row.kind),
      String(row.canonical_name), String(row.description), Number(row.locked),
      remapAnchors(row.anchors_json, maps), mappedNullable(maps.sources, row.source_id),
      String(row.producer_versions_json), Number(row.generation),
      String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.continuity.aliases) {
    insert(db, "slate_continuity_aliases", [
      "id", "user_id", "series_id", "entity_id", "alias", "normalized_alias",
      "source_id", "generation", "created_at",
    ], [
      mapped(maps.aliases, row.id, "alias id"), userId, maps.seriesId,
      mapped(maps.entities, row.entity_id, "alias entity"), String(row.alias),
      String(row.normalized_alias), mappedNullable(maps.sources, row.source_id),
      Number(row.generation), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.claims) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_claims", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind",
      "subject_entity_id", "predicate", "object_entity_id", "value", "epistemic_status",
      "perspective_entity_id", "confidence", "anchors_json", "source_id",
      "supersedes_claim_id", "producer_versions_json", "generation", "created_at",
    ], [
      mapped(maps.claims, row.id, "claim id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), mappedNullable(maps.entities, row.subject_entity_id),
      String(row.predicate), mappedNullable(maps.entities, row.object_entity_id), String(row.value),
      String(row.epistemic_status), mappedNullable(maps.entities, row.perspective_entity_id),
      Number(row.confidence), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "claim source"), null,
      String(row.producer_versions_json), Number(row.generation),
      String(row.created_at),
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
      "anchors_json", "source_id", "producer_versions_json", "generation",
      "created_at",
    ], [
      mapped(maps.events, row.id, "event id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.title), String(row.description),
      nullableStringField(row, "chronology_key"),
      remapIdArray(row.participant_entity_ids_json, maps.entities),
      mappedNullable(maps.entities, row.location_entity_id), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "event source"), String(row.producer_versions_json),
      Number(row.generation), String(row.created_at),
    ]);
  }
  for (const row of content.continuity.relationships) {
    insert(db, "slate_continuity_relationships", [
      "id", "user_id", "series_id", "from_entity_id", "to_entity_id", "kind", "state",
      "epistemic_status", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at",
    ], [
      mapped(maps.relationships, row.id, "relationship id"), userId, maps.seriesId,
      mapped(maps.entities, row.from_entity_id, "relationship from entity"),
      mapped(maps.entities, row.to_entity_id, "relationship to entity"), String(row.kind),
      String(row.state), String(row.epistemic_status), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "relationship source"),
      String(row.producer_versions_json), Number(row.generation),
      String(row.created_at),
    ]);
  }
  for (const row of content.continuity.knowledge) {
    insert(db, "slate_continuity_knowledge", [
      "id", "user_id", "series_id", "character_entity_id", "claim_id", "learned_event_id",
      "status", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at",
    ], [
      mapped(maps.knowledge, row.id, "knowledge id"), userId, maps.seriesId,
      mapped(maps.entities, row.character_entity_id, "knowledge character"),
      mapped(maps.claims, row.claim_id, "knowledge claim"),
      mappedNullable(maps.events, row.learned_event_id), String(row.status),
      remapAnchors(row.anchors_json, maps), mapped(maps.sources, row.source_id, "knowledge source"),
      String(row.producer_versions_json), Number(row.generation),
      String(row.created_at),
    ]);
  }
  for (const row of content.continuity.threads) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_threads", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "label",
      "status", "due_section_id", "anchors_json", "source_id", "producer_versions_json",
      "generation", "created_at", "updated_at",
    ], [
      mapped(maps.threads, row.id, "thread id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.label), String(row.status),
      mappedNullable(maps.sections, row.due_section_id), remapAnchors(row.anchors_json, maps),
      mapped(maps.sources, row.source_id, "thread source"), String(row.producer_versions_json),
      Number(row.generation), String(row.created_at), String(row.updated_at),
    ]);
  }
  for (const row of content.continuity.concerns) {
    const scope = mappedProjectSection(row, sourceProjectId, maps);
    insert(db, "slate_continuity_concerns", [
      "id", "user_id", "series_id", "project_id", "section_id", "scope_kind", "kind",
      "severity", "status", "summary", "explanation", "claim_ids_json", "anchors_json",
      "recommended_resolution", "resolution_json", "producer_versions_json",
      "generation", "created_at", "resolved_at",
    ], [
      mapped(maps.concerns, row.id, "concern id"), userId, maps.seriesId, scope.projectId,
      scope.sectionId, String(row.scope_kind), String(row.kind), String(row.severity),
      String(row.status), String(row.summary), String(row.explanation),
      remapIdArray(row.claim_ids_json, maps.claims), remapAnchors(row.anchors_json, maps),
      nullableStringField(row, "recommended_resolution"), remapResolution(row.resolution_json, maps),
      String(row.producer_versions_json), Number(row.generation),
      String(row.created_at), nullableStringField(row, "resolved_at"),
    ]);
  }
  for (const row of content.writing.developerEvents) {
    insert(db, "slate_continuity_developer_events", [
      "id", "user_id", "series_id", "project_id", "section_id",
      "section_revision", "sequence", "stage", "kind", "summary",
      "detail_json", "source_ids_json", "operation_id", "clarification_id",
      "provider", "model", "continuity_generation", "created_at",
    ], [
      mapped(maps.developerEvents, row.id, "developer event id"), userId,
      maps.seriesId, maps.projectId,
      mappedNullable(maps.sections, row.section_id),
      row.section_revision === null ? null : Number(row.section_revision),
      Number(row.sequence), String(row.stage), String(row.kind),
      String(row.summary), String(row.detail_json),
      remapKnownIdArray(row.source_ids_json, maps.sources),
      mappedNullable(maps.operations, row.operation_id),
      mappedNullable(maps.clarifications, row.clarification_id),
      nullableStringField(row, "provider"), nullableStringField(row, "model"),
      Number(row.continuity_generation), String(row.created_at),
    ]);
  }

  for (const row of content.studios.characterProfiles) {
    insert(db, "slate_character_profiles", [
      "id", "user_id", "series_id", "project_id", "entity_id", "generation",
      "layer", "profile_json", "field_locks_json", "provenance_json",
      "created_at", "updated_at",
    ], [
      mapped(maps.characterProfiles, row.id, "character profile id"),
      userId,
      maps.seriesId,
      row.project_id === sourceProjectId ? maps.projectId : null,
      mappedNullable(maps.entities, row.entity_id),
      Number(row.generation),
      String(row.layer),
      remapPortableJson(row.profile_json, maps, "Character profile"),
      String(row.field_locks_json),
      remapPortableJson(
        row.provenance_json,
        maps,
        "Character profile provenance",
      ),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }
  for (const row of content.studios.characterArcs) {
    insert(db, "slate_character_arcs", [
      "id", "user_id", "series_id", "project_id", "character_profile_id",
      "generation", "intended_json", "observed_json", "provenance_json",
      "created_at", "updated_at",
    ], [
      mapped(maps.characterArcs, row.id, "character arc id"),
      userId,
      maps.seriesId,
      row.project_id === sourceProjectId ? maps.projectId : null,
      mapped(
        maps.characterProfiles,
        row.character_profile_id,
        "character arc profile",
      ),
      Number(row.generation),
      remapPortableJson(row.intended_json, maps, "Intended character arc"),
      remapPortableJson(row.observed_json, maps, "Observed character arc"),
      remapPortableJson(
        row.provenance_json,
        maps,
        "Character arc provenance",
      ),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }
  for (const row of content.studios.characterArcBeats) {
    insert(db, "slate_character_arc_beats", [
      "id", "user_id", "series_id", "project_id", "character_arc_id",
      "section_id", "generation", "track", "ordinal", "beat_json",
      "provenance_json", "created_at", "updated_at",
    ], [
      mapped(maps.characterArcBeats, row.id, "character arc beat id"),
      userId,
      maps.seriesId,
      row.project_id === sourceProjectId ? maps.projectId : null,
      mapped(
        maps.characterArcs,
        row.character_arc_id,
        "character arc beat arc",
      ),
      mappedNullable(maps.sections, row.section_id),
      Number(row.generation),
      String(row.track),
      Number(row.ordinal),
      remapPortableJson(row.beat_json, maps, "Character arc beat"),
      remapPortableJson(
        row.provenance_json,
        maps,
        "Character arc beat provenance",
      ),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }
  for (const row of content.studios.narrativeEdges) {
    insert(db, "slate_narrative_edges", [
      "id", "user_id", "series_id", "project_id", "generation",
      "from_ref_json", "to_ref_json", "kind", "branch_id",
      "story_time_json", "manuscript_order_json", "provenance_json",
      "created_at", "updated_at",
    ], [
      mapped(maps.narrativeEdges, row.id, "narrative edge id"),
      userId,
      maps.seriesId,
      row.project_id === sourceProjectId ? maps.projectId : null,
      Number(row.generation),
      remapNarrativeEndpoint(row.from_ref_json, maps),
      remapNarrativeEndpoint(row.to_ref_json, maps),
      String(row.kind),
      nullableStringField(row, "branch_id"),
      nullableStringField(row, "story_time_json"),
      nullableStringField(row, "manuscript_order_json"),
      remapPortableJson(
        row.provenance_json,
        maps,
        "Narrative edge provenance",
      ),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }

  for (const row of content.studios.mirror.profiles) {
    insert(db, "slate_mirror_profiles", [
      "id", "user_id", "name", "pen_name", "frozen", "created_at",
      "updated_at",
    ], [
      mapped(maps.mirrorProfiles, row.id, "Mirror profile id"),
      userId,
      String(row.name),
      nullableStringField(row, "pen_name"),
      Number(row.frozen),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }
  for (const row of content.studios.mirror.versions) {
    insert(db, "slate_mirror_profile_versions", [
      "id", "user_id", "profile_id", "version", "voice_card_json",
      "eligibility_summary_json", "created_at",
    ], [
      mapped(maps.mirrorVersions, row.id, "Mirror version id"),
      userId,
      mapped(maps.mirrorProfiles, row.profile_id, "Mirror version profile"),
      Number(row.version),
      String(row.voice_card_json),
      remapMirrorVersionMetadata(row.eligibility_summary_json, maps),
      String(row.created_at),
    ]);
  }
  if (content.studios.mirror.binding) {
    const row = content.studios.mirror.binding;
    insert(db, "slate_project_mirror_bindings", [
      "project_id", "user_id", "profile_version_id", "project_overlay_json",
      "pov_overlays_json", "created_at", "updated_at",
    ], [
      maps.projectId,
      userId,
      mapped(
        maps.mirrorVersions,
        row.profile_version_id,
        "Mirror binding version",
      ),
      remapPortableJson(row.project_overlay_json, maps, "Mirror project overlay"),
      remapPortableJson(row.pov_overlays_json, maps, "Mirror POV overlays"),
      String(row.created_at),
      String(row.updated_at),
    ]);
  }

  for (const row of content.studios.sourceShelf) {
    insert(db, "slate_source_shelf_items", [
      "id", "user_id", "project_id", "title", "kind", "content",
      "metadata_json", "promoted_source_id", "mirror_eligible", "created_at",
      "updated_at",
    ], [
      mapped(maps.sourceShelfItems, row.id, "Source Shelf item id"),
      userId,
      maps.projectId,
      String(row.title),
      String(row.kind),
      String(row.content),
      String(row.metadata_json),
      mappedNullable(maps.sources, row.promoted_source_id),
      0,
      String(row.created_at),
      String(row.updated_at),
    ]);
  }
  for (const row of content.studios.visualReferences) {
    insert(db, "slate_visual_references", [
      "id", "user_id", "project_id", "section_id", "entity_id", "kind",
      "status", "image_id", "prompt", "reference_state_json",
      "visual_style_version", "provider", "model", "created_at", "pinned_at",
    ], [
      mapped(maps.visualReferences, row.id, "visual reference id"),
      userId,
      maps.projectId,
      mappedNullable(maps.sections, row.section_id),
      mappedNullable(maps.entities, row.entity_id),
      String(row.kind),
      String(row.status),
      null,
      String(row.prompt),
      remapPortableJson(
        row.reference_state_json,
        maps,
        "Visual reference state",
      ),
      nullableStringField(row, "visual_style_version"),
      String(row.provider),
      String(row.model),
      String(row.created_at),
      nullableStringField(row, "pinned_at"),
    ]);
  }
  for (const row of content.studios.reviewCircle.sessions) {
    insert(db, "slate_review_circle_sessions", [
      "id", "user_id", "project_id", "section_id", "artifact_json",
      "section_revisions_json", "continuity_version",
      "continuity_generation", "provider", "model", "created_at",
    ], [
      mapped(maps.reviewSessions, row.id, "Review Circle session id"),
      userId,
      maps.projectId,
      mapped(maps.sections, row.section_id, "Review Circle section"),
      String(row.artifact_json),
      String(row.section_revisions_json),
      String(row.continuity_version),
      Number(row.continuity_generation),
      String(row.provider),
      nullableStringField(row, "model"),
      String(row.created_at),
    ]);
  }
  for (const row of content.studios.reviewCircle.results) {
    insert(db, "slate_review_circle_results", [
      "id", "session_id", "user_id", "ordinal", "reviewer_id",
      "reviewer_snapshot_json", "result_json", "created_at",
    ], [
      mapped(maps.reviewResults, row.id, "Review Circle result id"),
      mapped(
        maps.reviewSessions,
        row.session_id,
        "Review Circle result session",
      ),
      userId,
      Number(row.ordinal),
      String(row.reviewer_id),
      String(row.reviewer_snapshot_json),
      String(row.result_json),
      String(row.created_at),
    ]);
  }
  for (const row of content.studios.reviewCircle.roomNotes) {
    insert(db, "slate_review_circle_room_notes", [
      "session_id", "user_id", "room_note_json", "created_at",
    ], [
      mapped(
        maps.reviewSessions,
        row.session_id,
        "Review Circle Room Note session",
      ),
      userId,
      String(row.room_note_json),
      String(row.created_at),
    ]);
  }
  for (const row of content.studios.momentumSnapshots) {
    insert(db, "slate_momentum_snapshots", [
      "id", "user_id", "project_id", "section_id", "kind", "state_json",
      "source_fingerprint", "created_at",
    ], [
      mapped(maps.momentumSnapshots, row.id, "momentum snapshot id"),
      userId,
      maps.projectId,
      mappedNullable(maps.sections, row.section_id),
      String(row.kind),
      remapPortableJson(row.state_json, maps, "Momentum snapshot state"),
      String(row.source_fingerprint),
      String(row.created_at),
    ]);
  }

  const manuscript = legacyManuscript(content);
  insert(db, "slate_manuscript_state", [
    "project_id", "user_id", "storage_version", "structure_revision",
    "original_manuscript_hash", "migrated_at", "updated_at",
  ], [
    maps.projectId,
    userId,
    parsed.archiveVersion === 2 ? 2 : 1,
    0,
    sha256(manuscript),
    parsed.archiveVersion === 2 ? importedAt : null,
    importedAt,
  ]);
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
