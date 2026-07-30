import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
  SLATE_STORY_BIBLE_SCHEMA_VERSION,
  slateSha256,
  type SlateAiProvider,
  type SlateCharacterArc,
  type SlateCharacterArcBeat,
  type SlateCharacterArcBridgeSuggestion,
  type SlateCharacterArcTrack,
  type SlateCharacterKnowledgeProjection,
  type SlateCharacterProfile,
  type SlateCharacterProfileField,
  type SlateCharacterRelationshipState,
  type SlateDocumentAnchor,
  type SlateDeveloperExtractionDetail,
  type SlateDeveloperMomentumDetail,
  type SlateDeveloperReconciliationDetail,
  type SlateMomentumSnapshot,
  type SlateMomentumTarget,
  type SlateNarrativeEdge,
  type SlateNarrativeEdgeEndpoint,
  type SlateNarrativeThread,
  type SlateReviewConcernProjectionV1,
  type SlateReviewStoryBibleV1,
  type SlateReviewWorldProjectionV1,
  type SlateStoryBibleAuthority,
  type SlateStoryBibleLayer,
  type SlateStoryBibleProvenance,
  type SlateTimelineBranch,
} from "@localai/shared";

const STORY_BIBLE_QUERY_LIMIT = 4_096;

type JsonRecord = Record<string, unknown>;

interface ProjectProjectionRow {
  id: string;
  series_id: string;
  project_active_generation: number;
  series_active_generation: number;
  characters_json: string;
  unresolved_threads_json: string;
  updated_at: string;
}

interface SectionProjectionRow {
  id: string;
  revision: number;
  summary: string;
  direction: string;
  content_hash: string;
  updated_at: string;
}

interface SourceProjectionRow {
  source_id: string | null;
  source_kind: string | null;
  source_authority: string | null;
  source_provider: string | null;
  source_model: string | null;
  source_section_id: string | null;
  source_created_at: string | null;
}

interface CharacterProfileRow {
  id: string;
  entity_id: string | null;
  canonical_name: string | null;
  layer: string;
  profile_json: string;
  field_locks_json: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}

interface CharacterArcRow {
  id: string;
  character_profile_id: string;
  character_entity_id: string | null;
  intended_json: string;
  observed_json: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}

interface CharacterArcBeatRow {
  id: string;
  character_arc_id: string;
  section_id: string | null;
  track: string;
  ordinal: number;
  beat_json: string;
  provenance_json: string;
  created_at: string;
}

interface RelationshipRow extends SourceProjectionRow {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  from_kind: string;
  to_kind: string;
  kind: string;
  state: string;
  epistemic_status: string;
  anchors_json: string;
  created_at: string;
}

interface KnowledgeRow extends SourceProjectionRow {
  id: string;
  character_entity_id: string;
  claim_id: string;
  learned_section_id: string | null;
  status: string;
  anchors_json: string;
  created_at: string;
}

interface ThreadRow extends SourceProjectionRow {
  id: string;
  section_id: string | null;
  scope_kind: string;
  label: string;
  status: string;
  due_section_id: string | null;
  anchors_json: string;
  created_at: string;
  updated_at: string;
}

interface NarrativeEdgeRow {
  id: string;
  kind: string;
  from_ref_json: string;
  to_ref_json: string;
  branch_id: string | null;
  story_time_json: string | null;
  manuscript_order_json: string | null;
  provenance_json: string;
  created_at: string;
}

interface WorldEntityRow extends SourceProjectionRow {
  id: string;
  kind: string;
  canonical_name: string;
  description: string;
  locked: number;
  anchors_json: string;
  created_at: string;
}

interface ConcernRow {
  id: string;
  kind: string;
  severity: string;
  status: string;
  summary: string;
  anchors_json: string;
  claim_ids_json: string;
  resolution_json: string | null;
  resolved_at: string | null;
}

export interface SlateStoryBibleProjectionInput {
  userId: string;
  projectId: string;
  sectionId: string;
  now?: string;
}

export interface ActiveSlateStoryBibleProjection {
  projectId: string;
  seriesId: string;
  activeGeneration: number;
  storyBible: SlateReviewStoryBibleV1;
  momentum: SlateMomentumSnapshot;
  /**
   * Safe, bounded operational receipts for `recordSlateDeveloperEvent`.
   * These are explicit comparisons and selection rules, never hidden model
   * reasoning.
   */
  diagnostics: SlateStoryBibleProjectionDiagnostic[];
}

export type SlateStoryBibleProjectionDiagnostic =
  | {
      stage: "extraction";
      kind: "curated_story_bible_projection";
      summary: string;
      sourceIds: string[];
      continuityGeneration: number;
      detail: SlateDeveloperExtractionDetail;
    }
  | {
      stage: "reconciliation";
      kind: "intended_observed_arc_comparison";
      summary: string;
      sourceIds: string[];
      continuityGeneration: number;
      detail: SlateDeveloperReconciliationDetail;
    }
  | {
      stage: "momentum";
      kind: "live_wire_selection";
      summary: string;
      sourceIds: string[];
      continuityGeneration: number;
      detail: SlateDeveloperMomentumDetail;
    };

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : null;
}

function storyBibleLayer(
  value: unknown,
  fallback: SlateStoryBibleLayer,
): SlateStoryBibleLayer {
  return value === "evidence" ||
    value === "canon" ||
    value === "plans" ||
    value === "interpretations"
    ? value
    : fallback;
}

function providerOrNull(value: unknown): SlateAiProvider | null {
  return value === "local" || value === "openai" || value === "anthropic"
    ? value
    : null;
}

function generationId(seriesId: string, generation: number): string {
  return `${seriesId}:generation:${generation}`;
}

function normalizePosition(
  value: unknown,
): SlateDocumentAnchor["startPosition"] {
  if (!isRecord(value)) return null;
  const blockId = stringValue(value.blockId);
  const offset = integerOrNull(value.offset);
  if (
    !blockId ||
    offset === null ||
    offset < 0 ||
    (value.affinity !== "backward" && value.affinity !== "forward")
  ) {
    return null;
  }
  return { blockId, offset, affinity: value.affinity };
}

function normalizeAnchors(value: unknown): SlateDocumentAnchor[] {
  if (!Array.isArray(value)) return [];
  const anchors: SlateDocumentAnchor[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const sourceId = stringValue(candidate.sourceId ?? candidate.source_id);
    const start = integerOrNull(candidate.start);
    const end = integerOrNull(candidate.end);
    if (!sourceId || start === null || end === null || start < 0 || end < start) {
      continue;
    }
    const revision = integerOrNull(
      candidate.sectionRevision ?? candidate.section_revision,
    );
    anchors.push({
      sourceId,
      sectionId:
        typeof (candidate.sectionId ?? candidate.section_id) === "string"
          ? String(candidate.sectionId ?? candidate.section_id)
          : null,
      sectionRevision: revision !== null && revision >= 0 ? revision : null,
      start,
      end,
      startPosition: normalizePosition(
        candidate.startPosition ?? candidate.start_position,
      ),
      endPosition: normalizePosition(
        candidate.endPosition ?? candidate.end_position,
      ),
      quoteHash: stringValue(candidate.quoteHash ?? candidate.quote_hash),
    });
  }
  anchors.sort(
    (left, right) =>
      (left.sectionId ?? "").localeCompare(right.sectionId ?? "") ||
      left.start - right.start ||
      left.end - right.end ||
      left.sourceId.localeCompare(right.sourceId),
  );
  return anchors;
}

function authorityFromSource(
  source: SourceProjectionRow,
  layer: SlateStoryBibleLayer,
): SlateStoryBibleAuthority {
  if (layer === "canon" || layer === "plans") return "writer";
  if (layer === "evidence") return "manuscript";
  return source.source_authority === "human" ? "writer" : "ai";
}

function layerFromSource(
  source: SourceProjectionRow,
  epistemicStatus?: string,
): SlateStoryBibleLayer {
  if (epistemicStatus === "intention") return "plans";
  if (
    source.source_kind === "review_direction" ||
    source.source_kind === "source_shelf"
  ) {
    return "canon";
  }
  if (
    source.source_kind === "story_snapshot" ||
    source.source_kind === "rehearsal_discovery"
  ) {
    return "plans";
  }
  if (
    epistemicStatus === "belief" ||
    epistemicStatus === "rumor" ||
    epistemicStatus === "mystery" ||
    epistemicStatus === "ambiguity"
  ) {
    return "interpretations";
  }
  if (
    source.source_kind === "human_edit" ||
    source.source_kind === "ai_draft" ||
    source.source_kind === "accepted_revision" ||
    source.source_kind === "import"
  ) {
    return "evidence";
  }
  return source.source_authority === "human" ? "canon" : "interpretations";
}

function normalizeProvenance(
  raw: unknown,
  input: {
    seriesId: string;
    generation: number;
    source?: SourceProjectionRow;
    sourceIds?: string[];
    anchors?: SlateDocumentAnchor[];
    layer: SlateStoryBibleLayer;
    createdAt: string;
  },
): SlateStoryBibleProvenance {
  const record = isRecord(raw)
    ? isRecord(raw.provenance)
      ? raw.provenance
      : raw
    : {};
  const source = input.source;
  const rawAuthority = record.authority;
  const authority: SlateStoryBibleAuthority =
    rawAuthority === "writer" ||
    rawAuthority === "manuscript" ||
    rawAuthority === "ai"
      ? rawAuthority
      : source
        ? authorityFromSource(source, input.layer)
        : input.layer === "evidence"
          ? "manuscript"
          : input.layer === "interpretations"
            ? "ai"
            : "writer";
  const sourceIds = stringList(record.sourceIds);
  const fallbackSourceIds = source?.source_id
    ? [source.source_id]
    : (input.sourceIds ?? []);
  const rawAnchors = normalizeAnchors(record.anchors);
  return {
    generationId: generationId(input.seriesId, input.generation),
    sourceIds: sourceIds.length > 0 ? sourceIds : fallbackSourceIds,
    anchors: rawAnchors.length > 0 ? rawAnchors : (input.anchors ?? []),
    authority,
    provider:
      providerOrNull(record.provider) ??
      providerOrNull(source?.source_provider),
    model:
      typeof record.model === "string"
        ? record.model
        : (source?.source_model ?? null),
    createdAt:
      stringValue(record.createdAt) ||
      source?.source_created_at ||
      input.createdAt,
  };
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectProjectionRow {
  const row = db
    .prepare(
      `SELECT projects.id, projects.series_id,
              projects.continuity_active_generation AS project_active_generation,
              series.continuity_active_generation AS series_active_generation,
              projects.characters_json, projects.unresolved_threads_json,
              projects.updated_at
         FROM slate_projects AS projects
         JOIN slate_series AS series
           ON series.id = projects.series_id
          AND series.user_id = projects.user_id
        WHERE projects.id = ? AND projects.user_id = ?`,
    )
    .get(projectId, userId) as unknown as ProjectProjectionRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  return row;
}

function activeGeneration(project: ProjectProjectionRow): number {
  const seriesGeneration = Number(project.series_active_generation);
  if (Number.isInteger(seriesGeneration) && seriesGeneration > 0) {
    return seriesGeneration;
  }
  const projectGeneration = Number(project.project_active_generation);
  return Number.isInteger(projectGeneration) && projectGeneration >= 0
    ? projectGeneration
    : 0;
}

function sectionRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SectionProjectionRow {
  const row = db
    .prepare(
      `SELECT id, revision, summary, direction, content_hash, updated_at
         FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(sectionId, projectId, userId) as
    | SectionProjectionRow
    | undefined;
  if (!row) throw new Error("Slate section not found.");
  return row;
}

function profileField<T>(
  raw: unknown,
  normalizeValue: (value: unknown) => T,
  input: {
    fallbackValue: T;
    fallbackLayer: SlateStoryBibleLayer;
    fallbackLocked: boolean;
    fallbackProvenance: SlateStoryBibleProvenance;
    seriesId: string;
    generation: number;
  },
): SlateCharacterProfileField<T> {
  const record = isRecord(raw) && Object.hasOwn(raw, "value") ? raw : null;
  const normalized = normalizeValue(record ? record.value : raw);
  const value =
    typeof normalized === "string"
      ? normalized || input.fallbackValue
      : Array.isArray(normalized) && normalized.length === 0
        ? input.fallbackValue
        : normalized;
  const layer = storyBibleLayer(record?.layer, input.fallbackLayer);
  return {
    value,
    layer,
    writerLocked:
      typeof record?.writerLocked === "boolean"
        ? record.writerLocked
        : input.fallbackLocked,
    provenance: record
      ? normalizeProvenance(record.provenance, {
          seriesId: input.seriesId,
          generation: input.generation,
          layer,
          sourceIds: input.fallbackProvenance.sourceIds,
          anchors: input.fallbackProvenance.anchors,
          createdAt: input.fallbackProvenance.createdAt,
        })
      : input.fallbackProvenance,
  };
}

function characterProfiles(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): SlateCharacterProfile[] {
  const rows = db
    .prepare(
      `SELECT profiles.id, profiles.entity_id, entities.canonical_name,
              profiles.layer, profiles.profile_json,
              profiles.field_locks_json, profiles.provenance_json,
              profiles.created_at, profiles.updated_at
         FROM slate_character_profiles AS profiles
         LEFT JOIN slate_continuity_entities AS entities
           ON entities.id = profiles.entity_id
          AND entities.user_id = profiles.user_id
          AND entities.series_id = profiles.series_id
          AND entities.generation = profiles.generation
        WHERE profiles.user_id = ? AND profiles.series_id = ?
          AND profiles.generation = ?
          AND (profiles.project_id = ? OR profiles.project_id IS NULL)
        ORDER BY CASE WHEN profiles.project_id = ? THEN 0 ELSE 1 END,
                 profiles.updated_at DESC, profiles.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as CharacterProfileRow[];
  const seenEntities = new Set<string>();
  const result: SlateCharacterProfile[] = [];
  for (const row of rows) {
    const entityId = row.entity_id ?? row.id;
    if (seenEntities.has(entityId)) continue;
    seenEntities.add(entityId);
    const raw = parseJson<JsonRecord>(row.profile_json, {});
    const locks = parseJson<JsonRecord>(row.field_locks_json, {});
    const layer = storyBibleLayer(row.layer, "interpretations");
    const baseProvenance = normalizeProvenance(
      parseJson<unknown>(row.provenance_json, {}),
      {
        seriesId: project.series_id,
        generation,
        layer,
        createdAt: row.created_at,
      },
    );
    const field = <T>(
      key: string,
      normalize: (value: unknown) => T,
      fallbackValue: T,
    ): SlateCharacterProfileField<T> =>
      profileField(raw[key], normalize, {
        fallbackValue,
        fallbackLayer: layer,
        fallbackLocked: locks[key] === true,
        fallbackProvenance: baseProvenance,
        seriesId: project.series_id,
        generation,
      });
    result.push({
      schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
      id: row.id,
      seriesId: project.series_id,
      entityId,
      generationId: generationId(project.series_id, generation),
      identity: field("identity", stringValue, row.canonical_name ?? "Unknown"),
      aliases: field("aliases", stringList, []),
      roles: field("roles", stringList, []),
      publicPersona: field("publicPersona", stringValue, ""),
      privatePressure: field("privatePressure", stringValue, ""),
      wants: field("wants", stringList, []),
      needs: field("needs", stringList, []),
      fears: field("fears", stringList, []),
      wounds: field("wounds", stringList, []),
      beliefs: field("beliefs", stringList, []),
      values: field("values", stringList, []),
      secrets: field("secrets", stringList, []),
      contradictions: field("contradictions", stringList, []),
      dialogueMarkers: field("dialogueMarkers", stringList, []),
      competencies: field("competencies", stringList, []),
      limitations: field("limitations", stringList, []),
      appearance: field("appearance", stringValue, ""),
      currentState: field("currentState", stringValue, ""),
      relationships: [],
      knowledge: [],
      updatedAt: row.updated_at,
    });
  }
  return result.sort(
    (left, right) =>
      left.identity.value.localeCompare(right.identity.value) ||
      left.id.localeCompare(right.id),
  );
}

function shapeCharacterProfiles(
  project: ProjectProjectionRow,
  generation: number,
): SlateCharacterProfile[] {
  const parsed = parseJson<unknown>(project.characters_json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const name = stringValue(candidate.name);
    if (!name) return [];
    const id = stringValue(candidate.id) || `shape-character-${index + 1}`;
    const locked = candidate.locked === true;
    const provenance = normalizeProvenance(null, {
      seriesId: project.series_id,
      generation,
      layer: "plans",
      sourceIds: [`shape:${project.id}`],
      createdAt: project.updated_at,
    });
    const field = <T>(value: T): SlateCharacterProfileField<T> => ({
      value,
      layer: "plans",
      writerLocked: locked,
      provenance,
    });
    const role = stringValue(candidate.role);
    const voice = stringValue(candidate.voice);
    return [
      {
        schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
        id: `shape-profile:${id}`,
        seriesId: project.series_id,
        entityId: `shape-entity:${id}`,
        generationId: generationId(project.series_id, generation),
        identity: field(name),
        aliases: field([]),
        roles: field(role ? [role] : []),
        publicPersona: field(""),
        privatePressure: field(""),
        wants: field([]),
        needs: field([]),
        fears: field([]),
        wounds: field([]),
        beliefs: field([]),
        values: field([]),
        secrets: field([]),
        contradictions: field([]),
        dialogueMarkers: field(voice ? [voice] : []),
        competencies: field([]),
        limitations: field([]),
        appearance: field(""),
        currentState: field(""),
        relationships: [],
        knowledge: [],
        updatedAt: project.updated_at,
      },
    ];
  });
}

function relationships(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): Array<{ ownerId: string; value: SlateCharacterRelationshipState }> {
  const rows = db
    .prepare(
      `SELECT relationships.id, relationships.from_entity_id,
              relationships.to_entity_id, from_entity.kind AS from_kind,
              to_entity.kind AS to_kind, relationships.kind,
              relationships.state, relationships.epistemic_status,
              relationships.anchors_json, relationships.created_at,
              sources.id AS source_id, sources.kind AS source_kind,
              sources.authority AS source_authority,
              sources.provider AS source_provider,
              sources.model AS source_model,
              sources.section_id AS source_section_id,
              sources.created_at AS source_created_at
         FROM slate_continuity_relationships AS relationships
         JOIN slate_continuity_entities AS from_entity
           ON from_entity.id = relationships.from_entity_id
          AND from_entity.user_id = relationships.user_id
          AND from_entity.generation = relationships.generation
         JOIN slate_continuity_entities AS to_entity
           ON to_entity.id = relationships.to_entity_id
          AND to_entity.user_id = relationships.user_id
          AND to_entity.generation = relationships.generation
         JOIN slate_continuity_sources AS sources
           ON sources.id = relationships.source_id
          AND sources.user_id = relationships.user_id
          AND sources.generation = relationships.generation
        WHERE relationships.user_id = ? AND relationships.series_id = ?
          AND relationships.generation = ?
          AND (sources.project_id = ? OR sources.project_id IS NULL)
        ORDER BY relationships.created_at ASC, relationships.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as RelationshipRow[];
  return rows.flatMap((row) => {
    if (row.from_kind !== "character" || row.to_kind !== "character") return [];
    const anchors = normalizeAnchors(parseJson<unknown>(row.anchors_json, []));
    const layer = layerFromSource(row, row.epistemic_status);
    return [
      {
        ownerId: row.from_entity_id,
        value: {
          relationshipId: row.id,
          otherCharacterId: row.to_entity_id,
          kind: row.kind,
          state: row.state,
          storyPointId: row.source_section_id,
          layer,
          provenance: normalizeProvenance(null, {
            seriesId: project.series_id,
            generation,
            source: row,
            anchors,
            layer,
            createdAt: row.created_at,
          }),
        },
      },
    ];
  });
}

function knowledge(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): Array<{ ownerId: string; value: SlateCharacterKnowledgeProjection }> {
  const rows = db
    .prepare(
      `SELECT knowledge.id, knowledge.character_entity_id,
              knowledge.claim_id, knowledge.status, knowledge.anchors_json,
              knowledge.created_at, learned.section_id AS learned_section_id,
              sources.id AS source_id, sources.kind AS source_kind,
              sources.authority AS source_authority,
              sources.provider AS source_provider,
              sources.model AS source_model,
              sources.section_id AS source_section_id,
              sources.created_at AS source_created_at
         FROM slate_continuity_knowledge AS knowledge
         JOIN slate_continuity_claims AS claims
           ON claims.id = knowledge.claim_id
          AND claims.user_id = knowledge.user_id
          AND claims.generation = knowledge.generation
         JOIN slate_continuity_sources AS sources
           ON sources.id = knowledge.source_id
          AND sources.user_id = knowledge.user_id
          AND sources.generation = knowledge.generation
         LEFT JOIN slate_continuity_events AS learned
           ON learned.id = knowledge.learned_event_id
          AND learned.user_id = knowledge.user_id
          AND learned.generation = knowledge.generation
        WHERE knowledge.user_id = ? AND knowledge.series_id = ?
          AND knowledge.generation = ?
          AND (sources.project_id = ? OR sources.project_id IS NULL)
        ORDER BY knowledge.created_at ASC, knowledge.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as KnowledgeRow[];
  return rows.map((row) => {
    const status: SlateCharacterKnowledgeProjection["status"] =
      row.status === "knows" ||
      row.status === "believes" ||
      row.status === "suspects" ||
      row.status === "does_not_know"
        ? row.status
        : "suspects";
    const anchors = normalizeAnchors(parseJson<unknown>(row.anchors_json, []));
    const layer =
      status === "knows"
        ? layerFromSource(row, "fact")
        : layerFromSource(row, "belief");
    return {
      ownerId: row.character_entity_id,
      value: {
        claimId: row.claim_id,
        status,
        storyPointId: row.learned_section_id ?? row.source_section_id,
        layer,
        provenance: normalizeProvenance(null, {
          seriesId: project.series_id,
          generation,
          source: row,
          anchors,
          layer,
          createdAt: row.created_at,
        }),
      },
    };
  });
}

function arcBeat(
  raw: unknown,
  input: {
    id: string;
    sectionId: string | null;
    track: "intended" | "observed";
    ordinal: number | null;
    seriesId: string;
    generation: number;
    provenance: unknown;
    createdAt: string;
  },
): SlateCharacterArcBeat {
  const record = isRecord(raw) ? raw : {};
  const layer = storyBibleLayer(
    record.layer,
    input.track === "intended" ? "plans" : "evidence",
  );
  const allowedStatuses = new Set<SlateCharacterArcBeat["status"]>([
    "planned",
    "seeded",
    "landed",
    "missed",
    "revised",
    "abandoned",
    "intentional",
  ]);
  const status = allowedStatuses.has(
    record.status as SlateCharacterArcBeat["status"],
  )
    ? (record.status as SlateCharacterArcBeat["status"])
    : input.track === "intended"
      ? "planned"
      : "seeded";
  return {
    id: stringValue(record.id) || input.id,
    label: stringValue(record.label) || `Arc beat ${Number(input.ordinal ?? 0) + 1}`,
    description: stringValue(record.description),
    expectedSectionId:
      typeof record.expectedSectionId === "string"
        ? record.expectedSectionId
        : input.track === "intended"
          ? input.sectionId
          : null,
    observedSectionId:
      typeof record.observedSectionId === "string"
        ? record.observedSectionId
        : input.track === "observed"
          ? input.sectionId
          : null,
    manuscriptOrder: integerOrNull(record.manuscriptOrder) ?? input.ordinal,
    storyTimeKey:
      typeof record.storyTimeKey === "string" ? record.storyTimeKey : null,
    status,
    layer,
    provenance: normalizeProvenance(record.provenance ?? input.provenance, {
      seriesId: input.seriesId,
      generation: input.generation,
      layer,
      createdAt: input.createdAt,
    }),
  };
}

function arcTrack(
  raw: unknown,
  kind: "intended" | "observed",
  input: {
    arcId: string;
    seriesId: string;
    generation: number;
    provenance: unknown;
    createdAt: string;
    normalizedBeats: CharacterArcBeatRow[];
  },
): SlateCharacterArcTrack {
  const record = isRecord(raw) ? raw : {};
  const inlineBeats = Array.isArray(record.beats)
    ? record.beats.map((beat, index) =>
        arcBeat(beat, {
          id: `${input.arcId}:${kind}:inline:${index + 1}`,
          sectionId: null,
          track: kind,
          ordinal: index,
          seriesId: input.seriesId,
          generation: input.generation,
          provenance: input.provenance,
          createdAt: input.createdAt,
        }),
      )
    : [];
  const rowBeats = input.normalizedBeats
    .filter((row) => row.track === kind)
    .map((row) =>
      arcBeat(parseJson<unknown>(row.beat_json, {}), {
        id: row.id,
        sectionId: row.section_id,
        track: kind,
        ordinal: Number(row.ordinal),
        seriesId: input.seriesId,
        generation: input.generation,
        provenance: parseJson<unknown>(row.provenance_json, {}),
        createdAt: row.created_at,
      }),
    );
  const merged = new Map<string, SlateCharacterArcBeat>();
  for (const beat of inlineBeats) merged.set(beat.id, beat);
  for (const beat of rowBeats) merged.set(beat.id, beat);
  return {
    kind,
    startState: stringValue(record.startState),
    destinationState: stringValue(record.destinationState),
    beats: [...merged.values()].sort(
      (left, right) =>
        (left.manuscriptOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.manuscriptOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    ),
    writerLocked: record.writerLocked === true,
  };
}

function bridgeSuggestions(
  raw: JsonRecord,
  input: {
    seriesId: string;
    generation: number;
    provenance: unknown;
    createdAt: string;
    layer: SlateStoryBibleLayer;
  },
): SlateCharacterArcBridgeSuggestion[] {
  if (!Array.isArray(raw.bridgeSuggestions)) return [];
  return raw.bridgeSuggestions.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const allowedKinds = new Set<SlateCharacterArcBridgeSuggestion["kind"]>([
      "missing_bridge",
      "setup",
      "payoff",
      "intentional_divergence",
    ]);
    const kind = allowedKinds.has(
      candidate.kind as SlateCharacterArcBridgeSuggestion["kind"],
    )
      ? (candidate.kind as SlateCharacterArcBridgeSuggestion["kind"])
      : "missing_bridge";
    const summary = stringValue(candidate.summary);
    if (!summary) return [];
    return [
      {
        id: stringValue(candidate.id) || `bridge:${index + 1}`,
        fromBeatId:
          typeof candidate.fromBeatId === "string"
            ? candidate.fromBeatId
            : null,
        toBeatId:
          typeof candidate.toBeatId === "string" ? candidate.toBeatId : null,
        kind,
        summary,
        adopted: candidate.adopted === true,
        provenance: normalizeProvenance(
          candidate.provenance ?? input.provenance,
          {
            seriesId: input.seriesId,
            generation: input.generation,
            layer: input.layer,
            createdAt: input.createdAt,
          },
        ),
      },
    ];
  });
}

function characterArcs(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): SlateCharacterArc[] {
  const rows = db
    .prepare(
      `SELECT arcs.id, arcs.character_profile_id,
              profiles.entity_id AS character_entity_id,
              arcs.intended_json, arcs.observed_json,
              arcs.provenance_json, arcs.created_at, arcs.updated_at
         FROM slate_character_arcs AS arcs
         JOIN slate_character_profiles AS profiles
           ON profiles.id = arcs.character_profile_id
          AND profiles.user_id = arcs.user_id
          AND profiles.series_id = arcs.series_id
          AND profiles.generation = arcs.generation
        WHERE arcs.user_id = ? AND arcs.series_id = ?
          AND arcs.generation = ?
          AND (arcs.project_id = ? OR arcs.project_id IS NULL)
        ORDER BY arcs.updated_at DESC, arcs.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as CharacterArcRow[];
  if (rows.length === 0) return [];
  const beatRows = db
    .prepare(
      `SELECT id, character_arc_id, section_id, track, ordinal, beat_json,
              provenance_json, created_at
         FROM slate_character_arc_beats
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)
        ORDER BY character_arc_id ASC, track ASC, ordinal ASC, id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as CharacterArcBeatRow[];
  const beatsByArc = new Map<string, CharacterArcBeatRow[]>();
  for (const beat of beatRows) {
    const current = beatsByArc.get(beat.character_arc_id) ?? [];
    current.push(beat);
    beatsByArc.set(beat.character_arc_id, current);
  }
  return rows.map((row) => {
    const intendedRaw = parseJson<JsonRecord>(row.intended_json, {});
    const observedRaw = parseJson<JsonRecord>(row.observed_json, {});
    const provenance = parseJson<unknown>(row.provenance_json, {});
    const normalizedBeats = beatsByArc.get(row.id) ?? [];
    return {
      schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
      id: row.id,
      seriesId: project.series_id,
      characterEntityId: row.character_entity_id ?? row.character_profile_id,
      generationId: generationId(project.series_id, generation),
      intended: arcTrack(intendedRaw, "intended", {
        arcId: row.id,
        seriesId: project.series_id,
        generation,
        provenance,
        createdAt: row.created_at,
        normalizedBeats,
      }),
      observed: arcTrack(observedRaw, "observed", {
        arcId: row.id,
        seriesId: project.series_id,
        generation,
        provenance,
        createdAt: row.created_at,
        normalizedBeats,
      }),
      bridgeSuggestions: [
        ...bridgeSuggestions(intendedRaw, {
          seriesId: project.series_id,
          generation,
          provenance,
          createdAt: row.created_at,
          layer: "plans",
        }),
        ...bridgeSuggestions(observedRaw, {
          seriesId: project.series_id,
          generation,
          provenance,
          createdAt: row.created_at,
          layer: "interpretations",
        }),
      ],
      updatedAt: row.updated_at,
    };
  });
}

function threadKind(value: string, label: string): SlateNarrativeThread["kind"] {
  if (
    value === "setup" ||
    value === "promise" ||
    value === "mystery" ||
    value === "goal" ||
    value === "foreshadowing" ||
    value === "obligation"
  ) {
    return value;
  }
  const normalized = label.toLowerCase();
  if (normalized.includes("?") || normalized.includes("myster")) return "mystery";
  if (normalized.includes("promise")) return "promise";
  if (normalized.includes("owe") || normalized.includes("must repay")) {
    return "obligation";
  }
  if (normalized.includes("goal") || normalized.includes("wants to")) return "goal";
  if (normalized.includes("foreshadow")) return "foreshadowing";
  return "setup";
}

function threadStatus(value: string): SlateNarrativeThread["status"] {
  if (
    value === "open" ||
    value === "due" ||
    value === "landed" ||
    value === "missed" ||
    value === "deferred" ||
    value === "abandoned" ||
    value === "intentional"
  ) {
    return value;
  }
  return value === "resolved" ? "landed" : "open";
}

function narrativeThreads(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): SlateNarrativeThread[] {
  const rows = db
    .prepare(
      `SELECT threads.id, threads.section_id, threads.scope_kind,
              threads.label, threads.status, threads.due_section_id,
              threads.anchors_json, threads.created_at, threads.updated_at,
              sources.id AS source_id, sources.kind AS source_kind,
              sources.authority AS source_authority,
              sources.provider AS source_provider,
              sources.model AS source_model,
              sources.section_id AS source_section_id,
              sources.created_at AS source_created_at
         FROM slate_continuity_threads AS threads
         JOIN slate_continuity_sources AS sources
           ON sources.id = threads.source_id
          AND sources.user_id = threads.user_id
          AND sources.generation = threads.generation
        WHERE threads.user_id = ? AND threads.series_id = ?
          AND threads.generation = ?
          AND (threads.project_id = ? OR threads.project_id IS NULL)
          AND (sources.project_id = ? OR sources.project_id IS NULL)
        ORDER BY threads.updated_at DESC, threads.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as ThreadRow[];
  return rows.map((row) => {
    const anchors = normalizeAnchors(parseJson<unknown>(row.anchors_json, []));
    const layer = layerFromSource(row);
    const status = threadStatus(row.status);
    return {
      schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
      id: row.id,
      seriesId: project.series_id,
      generationId: generationId(project.series_id, generation),
      kind: threadKind(row.scope_kind, row.label),
      label: row.label,
      description: row.label,
      status,
      openedSectionId: row.section_id ?? row.source_section_id,
      expectedPayoffStartSectionId: row.due_section_id,
      expectedPayoffEndSectionId: row.due_section_id,
      resolvedSectionId:
        status === "landed"
          ? (row.due_section_id ?? row.section_id ?? row.source_section_id)
          : null,
      layer,
      provenance: normalizeProvenance(null, {
        seriesId: project.series_id,
        generation,
        source: row,
        anchors,
        layer,
        createdAt: row.created_at,
      }),
    };
  });
}

function shapeThreads(
  project: ProjectProjectionRow,
  generation: number,
): SlateNarrativeThread[] {
  const parsed = parseJson<unknown>(project.unresolved_threads_json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const label = stringValue(candidate.label);
    if (!label) return [];
    const id = stringValue(candidate.id) || `shape-thread-${index + 1}`;
    return [
      {
        schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
        id: `shape-thread:${id}`,
        seriesId: project.series_id,
        generationId: generationId(project.series_id, generation),
        kind: threadKind("", label),
        label,
        description: label,
        status: candidate.resolved === true ? "landed" : "open",
        openedSectionId: null,
        expectedPayoffStartSectionId: null,
        expectedPayoffEndSectionId: null,
        resolvedSectionId: null,
        layer: "plans",
        provenance: normalizeProvenance(null, {
          seriesId: project.series_id,
          generation,
          layer: "plans",
          sourceIds: [`shape:${project.id}`],
          createdAt: project.updated_at,
        }),
      },
    ];
  });
}

function edgeEndpoint(value: unknown): SlateNarrativeEdgeEndpoint | null {
  if (!isRecord(value)) return null;
  const allowedKinds = new Set<SlateNarrativeEdgeEndpoint["kind"]>([
    "event",
    "claim",
    "thread",
    "arc_beat",
    "section",
  ]);
  const kind = value.kind as SlateNarrativeEdgeEndpoint["kind"];
  const id = stringValue(value.id);
  return allowedKinds.has(kind) && id ? { kind, id } : null;
}

function jsonScalar(value: string | null, key: string): unknown {
  const parsed = parseJson<unknown>(value, null);
  if (isRecord(parsed)) return parsed[key];
  return parsed;
}

function narrativeEdges(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): SlateNarrativeEdge[] {
  const rows = db
    .prepare(
      `SELECT id, kind, from_ref_json, to_ref_json, branch_id,
              story_time_json, manuscript_order_json, provenance_json,
              created_at
         FROM slate_narrative_edges
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as NarrativeEdgeRow[];
  const allowedKinds = new Set<SlateNarrativeEdge["kind"]>([
    "before",
    "after",
    "causes",
    "requires",
    "prevents",
    "reveals",
    "resolves",
  ]);
  return rows.flatMap((row) => {
    const from = edgeEndpoint(parseJson<unknown>(row.from_ref_json, null));
    const to = edgeEndpoint(parseJson<unknown>(row.to_ref_json, null));
    if (!from || !to || !allowedKinds.has(row.kind as SlateNarrativeEdge["kind"])) {
      return [];
    }
    const rawProvenance = parseJson<unknown>(row.provenance_json, {});
    const rawRecord = isRecord(rawProvenance) ? rawProvenance : {};
    const layer = storyBibleLayer(rawRecord.layer, "interpretations");
    const storyTime = jsonScalar(row.story_time_json, "key");
    const manuscriptOrder = jsonScalar(row.manuscript_order_json, "order");
    return [
      {
        schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
        id: row.id,
        seriesId: project.series_id,
        generationId: generationId(project.series_id, generation),
        kind: row.kind as SlateNarrativeEdge["kind"],
        from,
        to,
        branchId: row.branch_id || "main",
        storyTimeKey: typeof storyTime === "string" ? storyTime : null,
        manuscriptOrder: integerOrNull(manuscriptOrder),
        layer,
        provenance: normalizeProvenance(rawProvenance, {
          seriesId: project.series_id,
          generation,
          layer,
          createdAt: row.created_at,
        }),
      },
    ];
  });
}

function timelineKind(branchId: string): SlateTimelineBranch["kind"] {
  const value = branchId.toLowerCase();
  if (value === "main") return "main";
  if (value.includes("flashback")) return "flashback";
  if (value.includes("dream")) return "dream";
  if (value.includes("unreliable")) return "unreliable_narration";
  if (value.includes("alternate")) return "alternate_timeline";
  if (value.includes("resurrection")) return "resurrection";
  return "other";
}

function timelineFromEdges(
  seriesId: string,
  generation: number,
  edges: SlateNarrativeEdge[],
): SlateTimelineBranch[] {
  const branches = new Map<string, SlateNarrativeEdge>();
  for (const edge of edges) {
    if (!branches.has(edge.branchId)) branches.set(edge.branchId, edge);
  }
  if (branches.size > 0 && !branches.has("main")) {
    branches.set("main", edges[0]!);
  }
  return [...branches.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, edge]) => ({
      schemaVersion: SLATE_STORY_BIBLE_SCHEMA_VERSION,
      id,
      seriesId,
      generationId: generationId(seriesId, generation),
      kind: timelineKind(id),
      label:
        id === "main"
          ? "Main chronology"
          : id.replaceAll(/[-_]+/gu, " ").replace(/^\p{Ll}/u, (value) =>
              value.toUpperCase(),
            ),
      parentBranchId: id === "main" ? null : "main",
      description:
        id === "main"
          ? "Primary story-time branch."
          : `Explicit ${timelineKind(id).replaceAll("_", " ")} branch.`,
      provenance: edge.provenance,
    }));
}

function worldProjection(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): SlateReviewWorldProjectionV1[] {
  const rows = db
    .prepare(
      `SELECT entities.id, entities.kind, entities.canonical_name,
              entities.description, entities.locked, entities.anchors_json,
              entities.created_at, sources.id AS source_id,
              sources.kind AS source_kind,
              sources.authority AS source_authority,
              sources.provider AS source_provider,
              sources.model AS source_model,
              sources.section_id AS source_section_id,
              sources.created_at AS source_created_at
         FROM slate_continuity_entities AS entities
         LEFT JOIN slate_continuity_sources AS sources
           ON sources.id = entities.source_id
          AND sources.user_id = entities.user_id
          AND sources.generation = entities.generation
        WHERE entities.user_id = ? AND entities.series_id = ?
          AND entities.generation = ? AND entities.kind <> 'character'
          AND (sources.id IS NULL OR sources.project_id = ?
               OR sources.project_id IS NULL)
        ORDER BY entities.canonical_name ASC, entities.id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as WorldEntityRow[];
  return rows.map((row) => {
    const anchors = normalizeAnchors(parseJson<unknown>(row.anchors_json, []));
    const baseLayer = layerFromSource(row);
    const layer = row.locked === 1 ? "canon" : baseLayer;
    return {
      id: row.id,
      label: row.canonical_name,
      description: row.description || row.kind.replaceAll("_", " "),
      layer,
      writerLocked: row.locked === 1,
      provenance: normalizeProvenance(null, {
        seriesId: project.series_id,
        generation,
        source: row,
        anchors,
        layer,
        createdAt: row.created_at,
      }),
    };
  });
}

function concerns(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  sectionId: string,
  generation: number,
): SlateReviewConcernProjectionV1[] {
  const rows = db
    .prepare(
      `SELECT id, kind, severity, status, summary, anchors_json,
              claim_ids_json, resolution_json, resolved_at
         FROM slate_continuity_concerns
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)
          AND (section_id = ? OR section_id IS NULL)
        ORDER BY created_at ASC, id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      sectionId,
      STORY_BIBLE_QUERY_LIMIT,
    ) as unknown as ConcernRow[];
  const claimSources = new Map<string, string>();
  const claimRows = db
    .prepare(
      `SELECT id, source_id
         FROM slate_continuity_claims
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as Array<{ id: string; source_id: string }>;
  for (const claim of claimRows) claimSources.set(claim.id, claim.source_id);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    severity:
      row.severity === "critical" || row.severity === "important"
        ? row.severity
        : "note",
    status: row.status,
    summary: row.summary,
    anchors: normalizeAnchors(parseJson<unknown>(row.anchors_json, [])),
    sourceIds: [
      ...new Set(
        stringList(parseJson<unknown>(row.claim_ids_json, [])).flatMap(
          (claimId) => claimSources.get(claimId) ?? [],
        ),
      ),
    ],
    resolution: parseJson<Record<string, unknown> | null>(
      row.resolution_json,
      null,
    ),
    resolvedAt: row.resolved_at,
  }));
}

function attachCharacterState(
  characters: SlateCharacterProfile[],
  relationshipsByOwner: Array<{
    ownerId: string;
    value: SlateCharacterRelationshipState;
  }>,
  knowledgeByOwner: Array<{
    ownerId: string;
    value: SlateCharacterKnowledgeProjection;
  }>,
): SlateCharacterProfile[] {
  const relationships = new Map<string, SlateCharacterRelationshipState[]>();
  for (const item of relationshipsByOwner) {
    const values = relationships.get(item.ownerId) ?? [];
    values.push(item.value);
    relationships.set(item.ownerId, values);
  }
  const knowledge = new Map<string, SlateCharacterKnowledgeProjection[]>();
  for (const item of knowledgeByOwner) {
    const values = knowledge.get(item.ownerId) ?? [];
    values.push(item.value);
    knowledge.set(item.ownerId, values);
  }
  return characters.map((character) => ({
    ...character,
    relationships: relationships.get(character.entityId) ?? [],
    knowledge: knowledge.get(character.entityId) ?? [],
  }));
}

function activeSourceIds(
  db: DatabaseSync,
  project: ProjectProjectionRow,
  userId: string,
  generation: number,
): Set<string> {
  const rows = db
    .prepare(
      `SELECT id
         FROM slate_continuity_sources
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)
        ORDER BY id ASC
        LIMIT ?`,
    )
    .all(
      userId,
      project.series_id,
      generation,
      project.id,
      STORY_BIBLE_QUERY_LIMIT,
    ) as Array<{ id: string }>;
  return new Set([
    ...rows.map((row) => row.id),
    `shape:${project.id}`,
  ]);
}

function characterProfileFields(
  character: SlateCharacterProfile,
): Array<{ provenance: SlateStoryBibleProvenance }> {
  return [
    character.identity,
    character.aliases,
    character.roles,
    character.publicPersona,
    character.privatePressure,
    character.wants,
    character.needs,
    character.fears,
    character.wounds,
    character.beliefs,
    character.values,
    character.secrets,
    character.contradictions,
    character.dialogueMarkers,
    character.competencies,
    character.limitations,
    character.appearance,
    character.currentState,
  ];
}

function keepActiveProvenance(
  provenance: SlateStoryBibleProvenance,
  allowedSourceIds: ReadonlySet<string>,
): void {
  provenance.sourceIds = provenance.sourceIds.filter((sourceId) =>
    allowedSourceIds.has(sourceId),
  );
  provenance.anchors = provenance.anchors.filter(
    (anchor) =>
      allowedSourceIds.has(anchor.sourceId) &&
      provenance.sourceIds.includes(anchor.sourceId),
  );
}

function restrictStoryBibleToActiveSources(
  storyBible: SlateReviewStoryBibleV1,
  allowedSourceIds: ReadonlySet<string>,
): void {
  for (const character of storyBible.characters) {
    for (const field of characterProfileFields(character)) {
      keepActiveProvenance(field.provenance, allowedSourceIds);
    }
    for (const relation of character.relationships) {
      keepActiveProvenance(relation.provenance, allowedSourceIds);
    }
    for (const state of character.knowledge) {
      keepActiveProvenance(state.provenance, allowedSourceIds);
    }
  }
  for (const arc of storyBible.arcs) {
    for (const beat of [...arc.intended.beats, ...arc.observed.beats]) {
      keepActiveProvenance(beat.provenance, allowedSourceIds);
    }
    for (const bridge of arc.bridgeSuggestions) {
      keepActiveProvenance(bridge.provenance, allowedSourceIds);
    }
  }
  for (const thread of storyBible.threads) {
    keepActiveProvenance(thread.provenance, allowedSourceIds);
  }
  for (const edge of storyBible.causalEdges) {
    keepActiveProvenance(edge.provenance, allowedSourceIds);
  }
  for (const branch of storyBible.timeline) {
    keepActiveProvenance(branch.provenance, allowedSourceIds);
  }
  for (const relation of storyBible.relationships) {
    keepActiveProvenance(relation.provenance, allowedSourceIds);
  }
  for (const state of storyBible.knowledge) {
    keepActiveProvenance(state.provenance, allowedSourceIds);
  }
  for (const world of storyBible.world) {
    keepActiveProvenance(world.provenance, allowedSourceIds);
  }
  for (const concern of storyBible.concerns) {
    concern.sourceIds = concern.sourceIds.filter((sourceId) =>
      allowedSourceIds.has(sourceId),
    );
    concern.anchors = concern.anchors.filter((anchor) =>
      allowedSourceIds.has(anchor.sourceId),
    );
  }
}

function buildStoryBible(
  db: DatabaseSync,
  input: {
    userId: string;
    project: ProjectProjectionRow;
    sectionId: string;
    generation: number;
  },
): SlateReviewStoryBibleV1 {
  const normalizedCharacters = characterProfiles(
    db,
    input.project,
    input.userId,
    input.generation,
  );
  const normalizedThreads = narrativeThreads(
    db,
    input.project,
    input.userId,
    input.generation,
  );
  const relationshipState = relationships(
    db,
    input.project,
    input.userId,
    input.generation,
  );
  const knowledgeState = knowledge(
    db,
    input.project,
    input.userId,
    input.generation,
  );
  const characters = attachCharacterState(
    normalizedCharacters.length > 0
      ? normalizedCharacters
      : shapeCharacterProfiles(input.project, input.generation),
    relationshipState,
    knowledgeState,
  );
  const causalEdges = narrativeEdges(
    db,
    input.project,
    input.userId,
    input.generation,
  );
  const storyBible: SlateReviewStoryBibleV1 = {
    characters,
    arcs: characterArcs(
      db,
      input.project,
      input.userId,
      input.generation,
    ),
    threads:
      normalizedThreads.length > 0
        ? normalizedThreads
        : shapeThreads(input.project, input.generation),
    timeline: timelineFromEdges(
      input.project.series_id,
      input.generation,
      causalEdges,
    ),
    causalEdges,
    relationships: relationshipState.map((item) => item.value),
    knowledge: knowledgeState.map((item) => item.value),
    world: worldProjection(
      db,
      input.project,
      input.userId,
      input.generation,
    ),
    concerns: concerns(
      db,
      input.project,
      input.userId,
      input.sectionId,
      input.generation,
    ),
  };
  restrictStoryBibleToActiveSources(
    storyBible,
    activeSourceIds(db, input.project, input.userId, input.generation),
  );
  return storyBible;
}

function liveWireFor(
  storyBible: SlateReviewStoryBibleV1,
  sectionId: string,
): SlateMomentumTarget | null {
  const threadCandidates = storyBible.threads
    .filter(
      (thread) =>
        thread.status === "open" ||
        thread.status === "due" ||
        thread.status === "missed" ||
        thread.status === "deferred",
    )
    .map((thread) => {
      const atPayoff =
        thread.expectedPayoffStartSectionId === sectionId ||
        thread.expectedPayoffEndSectionId === sectionId;
      const rank = atPayoff
        ? 0
        : thread.status === "missed"
          ? 1
          : thread.status === "due"
            ? 2
            : thread.status === "open"
              ? 3
              : 4;
      const kind: SlateMomentumTarget["kind"] = atPayoff
        ? "approaching_payoff"
        : thread.status === "due" || thread.status === "missed"
          ? "urgent_thread"
          : "urgent_thread";
      return { thread, atPayoff, rank, kind };
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.thread.label.localeCompare(right.thread.label) ||
        left.thread.id.localeCompare(right.thread.id),
    );
  const selectedThread = threadCandidates[0];
  if (selectedThread) {
    return {
      kind: selectedThread.kind,
      label: selectedThread.thread.label,
      summary: selectedThread.atPayoff
        ? `This section is the expected payoff window for ${selectedThread.thread.label}.`
        : selectedThread.thread.status === "missed"
          ? `The expected payoff for ${selectedThread.thread.label} has been missed.`
          : selectedThread.thread.status === "due"
            ? `${selectedThread.thread.label} is due for attention.`
            : `${selectedThread.thread.label} remains unresolved.`,
      entityId: null,
      threadId: selectedThread.thread.id,
      sourceIds: selectedThread.thread.provenance.sourceIds,
      anchors: selectedThread.thread.provenance.anchors,
    };
  }
  const obstacle = storyBible.characters
    .filter((character) => character.privatePressure.value)
    .sort(
      (left, right) =>
        left.identity.value.localeCompare(right.identity.value) ||
        left.id.localeCompare(right.id),
    )[0];
  if (obstacle) {
    return {
      kind: "obstacle",
      label: obstacle.identity.value,
      summary: obstacle.privatePressure.value,
      entityId: obstacle.entityId,
      threadId: null,
      sourceIds: obstacle.privatePressure.provenance.sourceIds,
      anchors: obstacle.privatePressure.provenance.anchors,
    };
  }
  const desire = storyBible.characters
    .filter((character) => character.wants.value.length > 0)
    .sort(
      (left, right) =>
        left.identity.value.localeCompare(right.identity.value) ||
        left.id.localeCompare(right.id),
    )[0];
  return desire
    ? {
        kind: "desire",
        label: desire.identity.value,
        summary: desire.wants.value[0]!,
        entityId: desire.entityId,
        threadId: null,
        sourceIds: desire.wants.provenance.sourceIds,
        anchors: desire.wants.provenance.anchors,
      }
    : null;
}

function snapshotFingerprint(
  project: ProjectProjectionRow,
  section: SectionProjectionRow,
  generation: number,
  storyBible: SlateReviewStoryBibleV1,
): string {
  return slateSha256(
    JSON.stringify({
      projectId: project.id,
      sectionId: section.id,
      sectionRevision: Number(section.revision),
      generation,
      characters: storyBible.characters.map((item) => [
        item.id,
        item.updatedAt,
      ]),
      arcs: storyBible.arcs.map((item) => [item.id, item.updatedAt]),
      threads: storyBible.threads.map((item) => [
        item.id,
        item.label,
        item.status,
        item.expectedPayoffStartSectionId,
        item.expectedPayoffEndSectionId,
        item.provenance.sourceIds,
      ]),
      causalEdges: storyBible.causalEdges.map((item) => item.id),
      concerns: storyBible.concerns.map((item) => [item.id, item.status]),
      sectionDirection: section.direction,
      sectionSummary: section.summary,
    }),
  );
}

function persistMomentum(
  db: DatabaseSync,
  input: {
    userId: string;
    project: ProjectProjectionRow;
    section: SectionProjectionRow;
    generation: number;
    storyBible: SlateReviewStoryBibleV1;
    now: string;
  },
): SlateMomentumSnapshot {
  const sourceFingerprint = snapshotFingerprint(
    input.project,
    input.section,
    input.generation,
    input.storyBible,
  );
  const id = `slate-momentum-${sourceFingerprint.slice(0, 32)}`;
  const liveWire = liveWireFor(input.storyBible, input.section.id);
  const intention =
    input.section.direction ||
    input.section.summary ||
    liveWire?.label ||
    "Continue from the last accepted beat.";
  const unfinishedPressure =
    liveWire?.summary || "The next meaningful story turn remains unwritten.";
  const state = {
    liveWire,
    litMatch: {
      intention,
      unfinishedPressure,
      sourceSectionId: input.section.id,
      capturedAt: input.now,
    },
  };
  const kind = liveWire?.kind ?? "lit_match";
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO slate_momentum_snapshots
        (id, user_id, project_id, section_id, kind, state_json,
         source_fingerprint, created_at)
       SELECT ?, ?, projects.id, sections.id, ?, ?, ?, ?
         FROM slate_projects AS projects
         JOIN slate_series AS series
           ON series.id = projects.series_id
          AND series.user_id = projects.user_id
         JOIN slate_sections AS sections
           ON sections.project_id = projects.id
          AND sections.user_id = projects.user_id
        WHERE projects.id = ? AND projects.user_id = ?
          AND sections.id = ? AND sections.revision = ?
          AND CASE
                WHEN series.continuity_active_generation > 0
                  THEN series.continuity_active_generation
                ELSE projects.continuity_active_generation
              END = ?`,
    )
    .run(
      id,
      input.userId,
      kind,
      JSON.stringify(state),
      sourceFingerprint,
      input.now,
      input.project.id,
      input.userId,
      input.section.id,
      input.section.revision,
      input.generation,
    );
  const stored = db
    .prepare(
      `SELECT state_json, created_at
         FROM slate_momentum_snapshots
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(id, input.userId, input.project.id) as
    | { state_json: string; created_at: string }
    | undefined;
  if (!stored) {
    const reason =
      inserted.changes === 0
        ? "Slate Story Bible changed while momentum was being captured."
        : "Slate could not persist the momentum snapshot.";
    throw new Error(reason);
  }
  const storedState = parseJson<{
    liveWire: SlateMomentumTarget | null;
    litMatch: SlateMomentumSnapshot["litMatch"];
  }>(stored.state_json, state);
  return {
    schemaVersion: SLATE_CREATIVE_STUDIOS_SCHEMA_VERSION,
    id,
    projectId: input.project.id,
    sectionId: input.section.id,
    sectionRevision: Number(input.section.revision),
    continuityGeneration: input.generation,
    sourceFingerprint,
    liveWire: storedState.liveWire,
    litMatch: storedState.litMatch,
    createdAt: stored.created_at,
    supersededAt: null,
  };
}

function storyBibleSourceIds(
  storyBible: SlateReviewStoryBibleV1,
): string[] {
  const result = new Set<string>();
  const add = (values: readonly string[]): void => {
    for (const value of values) {
      if (value.trim()) result.add(value);
    }
  };
  for (const character of storyBible.characters) {
    for (const field of characterProfileFields(character)) {
      add(field.provenance.sourceIds);
    }
  }
  for (const arc of storyBible.arcs) {
    for (const beat of [...arc.intended.beats, ...arc.observed.beats]) {
      add(beat.provenance.sourceIds);
    }
    for (const bridge of arc.bridgeSuggestions) {
      add(bridge.provenance.sourceIds);
    }
  }
  for (const thread of storyBible.threads) add(thread.provenance.sourceIds);
  for (const edge of storyBible.causalEdges) add(edge.provenance.sourceIds);
  for (const relation of storyBible.relationships) {
    add(relation.provenance.sourceIds);
  }
  for (const state of storyBible.knowledge) add(state.provenance.sourceIds);
  for (const world of storyBible.world) add(world.provenance.sourceIds);
  for (const concern of storyBible.concerns) add(concern.sourceIds);
  return [...result].sort();
}

function projectionDiagnostics(
  project: ProjectProjectionRow,
  section: SectionProjectionRow,
  generation: number,
  storyBible: SlateReviewStoryBibleV1,
  momentum: SlateMomentumSnapshot,
): SlateStoryBibleProjectionDiagnostic[] {
  const sourceIds = storyBibleSourceIds(storyBible);
  const shapeCastFallback = storyBible.characters.some((character) =>
    character.identity.provenance.sourceIds.includes(`shape:${project.id}`),
  );
  const shapeThreadFallback = storyBible.threads.some((thread) =>
    thread.provenance.sourceIds.includes(`shape:${project.id}`),
  );
  const fallbackSummary =
    shapeCastFallback || shapeThreadFallback
      ? ` Shape supplied ${[
          shapeCastFallback ? "cast" : "",
          shapeThreadFallback ? "threads" : "",
        ]
          .filter(Boolean)
          .join(" and ")} as plans because normalized projections were absent.`
      : "";
  const extractionSummary =
    `Curated active generation ${generation} into ${storyBible.characters.length} characters, ` +
    `${storyBible.threads.length} threads, ${storyBible.relationships.length} relationships, ` +
    `${storyBible.knowledge.length} knowledge states, and ${storyBible.causalEdges.length} causal edges.` +
    fallbackSummary;
  const divergentArcs = storyBible.arcs.filter(
    (arc) =>
      arc.intended.destinationState.trim() !==
      arc.observed.destinationState.trim(),
  );
  const reconciliationSummary =
    divergentArcs.length === 0
      ? `Preserved ${storyBible.arcs.length} intended and observed arc track pairs without merging writer plans into manuscript evidence.`
      : `Preserved intended and observed arc tracks separately; ${divergentArcs.length} of ${storyBible.arcs.length} arcs currently diverge at their destination state.`;
  const selectedThread = momentum.liveWire?.threadId
    ? storyBible.threads.find(
        (thread) => thread.id === momentum.liveWire?.threadId,
      )
    : null;
  const selectionRule =
    momentum.liveWire?.kind === "approaching_payoff"
      ? "its expected payoff window matches the focused section"
      : momentum.liveWire?.kind === "urgent_thread"
        ? selectedThread?.status === "due" ||
          selectedThread?.status === "missed"
          ? `the thread is ${selectedThread.status}`
          : "it is the highest-priority unresolved thread"
        : momentum.liveWire?.kind === "obstacle"
          ? "it is the first contextual private pressure"
          : momentum.liveWire?.kind === "desire"
            ? "it is the first contextual character desire"
            : "the section direction supplies the lit match";
  const momentumSummary = momentum.liveWire
    ? `Selected “${momentum.liveWire.label}” as the ${momentum.liveWire.kind.replaceAll("_", " ")} because ${selectionRule}.`
    : `No active story pressure was available; preserved the focused section direction as the lit match.`;
  return [
    {
      stage: "extraction",
      kind: "curated_story_bible_projection",
      summary: extractionSummary,
      sourceIds,
      continuityGeneration: generation,
      detail: {
        sourceId: sourceIds[0] ?? `shape:${project.id}`,
        sourceRevision: Number(section.revision),
        acceptedProseHash: section.content_hash,
        extractedCounts: {
          entities: storyBible.characters.length + storyBible.world.length,
          claims: 0,
          events: 0,
          relationships: storyBible.relationships.length,
          knowledgeStates: storyBible.knowledge.length,
          threads: storyBible.threads.length,
        },
        summary: extractionSummary,
      },
    },
    {
      stage: "reconciliation",
      kind: "intended_observed_arc_comparison",
      summary: reconciliationSummary,
      sourceIds,
      continuityGeneration: generation,
      detail: {
        candidateGeneration: generation,
        sourceIds,
        addedRecordCount: 0,
        supersededRecordCount: 0,
        discardedRecordCount: 0,
        summary: reconciliationSummary,
      },
    },
    {
      stage: "momentum",
      kind: "live_wire_selection",
      summary: momentumSummary,
      sourceIds: momentum.liveWire?.sourceIds ?? [],
      continuityGeneration: generation,
      detail: {
        momentumSnapshotId: momentum.id,
        liveWireKind: momentum.liveWire?.kind ?? null,
        summary: momentumSummary,
      },
    },
  ];
}

/**
 * Narrow backend seam for the Inspector and Slate Review export.
 *
 * The series-scoped active generation is authoritative once non-zero; the
 * project field remains a migration compatibility projection. Every normalized
 * read is pinned to that one generation. Shape data appears only as a
 * writer-owned plans fallback when the corresponding normalized family is
 * empty.
 */
export function projectActiveSlateStoryBible(
  db: DatabaseSync,
  input: SlateStoryBibleProjectionInput,
): ActiveSlateStoryBibleProjection {
  const project = projectRow(db, input.userId, input.projectId);
  const section = sectionRow(
    db,
    input.userId,
    input.projectId,
    input.sectionId,
  );
  const generation = activeGeneration(project);
  const storyBible = buildStoryBible(db, {
    userId: input.userId,
    project,
    sectionId: section.id,
    generation,
  });
  const momentum = persistMomentum(db, {
    userId: input.userId,
    project,
    section,
    generation,
    storyBible,
    now: input.now ?? new Date().toISOString(),
  });
  const diagnostics = projectionDiagnostics(
    project,
    section,
    generation,
    storyBible,
    momentum,
  );
  return {
    projectId: project.id,
    seriesId: project.series_id,
    activeGeneration: generation,
    storyBible,
    momentum,
    diagnostics,
  };
}
