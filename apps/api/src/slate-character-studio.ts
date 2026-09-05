import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type SlateContinuitySourceAnchor,
  type SlateDocumentAnchor,
  type SlateStoryBibleLayer,
  type SlateStoryBibleProvenance,
} from "@localai/shared";
import {
  hashContinuityText,
  normalizeContinuityName,
} from "./slate-continuity-index.ts";

const ACCEPTED_MANUSCRIPT_SOURCE_KINDS = new Set([
  "accepted_revision",
  "ai_draft",
  "human_edit",
  "import",
]);

const PROFILE_ARRAY_FIELDS = new Set<SlateCharacterProfileFieldName>([
  "aliases",
  "roles",
  "wants",
  "needs",
  "fears",
  "wounds",
  "beliefs",
  "values",
  "secrets",
  "contradictions",
  "dialogueMarkers",
  "competencies",
  "limitations",
]);

const PROFILE_STRING_FIELDS = new Set<SlateCharacterProfileFieldName>([
  "identity",
  "publicPersona",
  "privatePressure",
  "appearance",
  "currentState",
]);

export type SlateCharacterProfileFieldName =
  | "identity"
  | "aliases"
  | "roles"
  | "publicPersona"
  | "privatePressure"
  | "wants"
  | "needs"
  | "fears"
  | "wounds"
  | "beliefs"
  | "values"
  | "secrets"
  | "contradictions"
  | "dialogueMarkers"
  | "competencies"
  | "limitations"
  | "appearance"
  | "currentState";

type JsonRecord = Record<string, unknown>;

interface AcceptedSourceRow {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string;
  section_id: string;
  kind: string;
  source_revision: number;
  content: string;
  content_hash: string;
  authority: string;
  provider: string | null;
  model: string | null;
  generation: number;
  created_at: string;
  section_title: string;
  section_ordinal: number;
  current_section_revision: number;
  current_section_hash: string;
  project_active_generation: number;
  series_active_generation: number;
}

interface CharacterEntityRow {
  id: string;
  canonical_name: string;
  description: string;
  anchors_json: string;
  source_id: string | null;
}

interface CharacterProfileRow {
  id: string;
  profile_json: string;
  field_locks_json: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}

interface CharacterClaimRow {
  id: string;
  predicate: string;
  value: string;
  object_name: string | null;
  epistemic_status: string;
  confidence: number;
  anchors_json: string;
}

interface CharacterEventRow {
  id: string;
  title: string;
  description: string;
  chronology_key: string | null;
  participant_entity_ids_json: string;
  anchors_json: string;
}

interface CharacterArcRow {
  id: string;
  intended_json: string;
  observed_json: string;
  provenance_json: string;
  created_at: string;
}

interface StoredProfileField {
  value: unknown;
  layer: SlateStoryBibleLayer;
  writerLocked: boolean;
  provenance: SlateStoryBibleProvenance;
}

export interface ProjectAcceptedSourceToCharacterStudioResult {
  sourceId: string;
  activeGeneration: number;
  profileIds: string[];
  arcIds: string[];
  observedBeatIds: string[];
  edgeIds: string[];
}

export interface UpdateSlateCharacterProfileFieldInput {
  userId: string;
  projectId: string;
  profileId: string;
  field: SlateCharacterProfileFieldName;
  value: string | string[];
  writerLocked: boolean;
  mutationId: string;
  now?: string;
}

export interface UpdateSlateCharacterProfileFieldResult {
  profileId: string;
  sourceId: string;
  generation: number;
  field: SlateCharacterProfileFieldName;
  writerLocked: boolean;
}

export interface SlateWriterIntendedArcBeatInput {
  id?: string;
  label: string;
  description?: string;
  expectedSectionId?: string | null;
  manuscriptOrder?: number | null;
  storyTimeKey?: string | null;
  status?:
    | "planned"
    | "seeded"
    | "landed"
    | "missed"
    | "revised"
    | "abandoned"
    | "intentional";
}

export interface UpdateSlateCharacterIntendedArcInput {
  userId: string;
  projectId: string;
  profileId: string;
  mutationId: string;
  startState?: string;
  destinationState?: string;
  writerLocked?: boolean;
  beats?: SlateWriterIntendedArcBeatInput[];
  now?: string;
}

export interface UpdateSlateCharacterIntendedArcResult {
  arcId: string;
  profileId: string;
  sourceId: string;
  generation: number;
  intendedBeatIds: string[];
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${hashContinuityText(JSON.stringify(parts)).slice(0, 32)}`;
}

function activeGeneration(source: AcceptedSourceRow): number {
  const seriesGeneration = Number(source.series_active_generation);
  if (Number.isInteger(seriesGeneration) && seriesGeneration > 0) {
    return seriesGeneration;
  }
  const projectGeneration = Number(source.project_active_generation);
  return Number.isInteger(projectGeneration) && projectGeneration > 0
    ? projectGeneration
    : 0;
}

function acceptedSource(
  db: DatabaseSync,
  sourceId: string,
): AcceptedSourceRow | null {
  const source = db
    .prepare(
      `SELECT sources.id, sources.user_id, sources.series_id,
              sources.project_id, sources.section_id, sources.kind,
              sources.source_revision, sources.content, sources.content_hash,
              sources.authority, sources.provider, sources.model,
              sources.generation, sources.created_at,
              sections.title AS section_title,
              sections.ordinal AS section_ordinal,
              sections.revision AS current_section_revision,
              sections.content_hash AS current_section_hash,
              projects.continuity_active_generation AS project_active_generation,
              series.continuity_active_generation AS series_active_generation
         FROM slate_continuity_sources AS sources
         JOIN slate_projects AS projects
           ON projects.id = sources.project_id
          AND projects.user_id = sources.user_id
         JOIN slate_series AS series
           ON series.id = sources.series_id
          AND series.user_id = sources.user_id
         JOIN slate_sections AS sections
           ON sections.id = sources.section_id
          AND sections.project_id = sources.project_id
          AND sections.user_id = sources.user_id
        WHERE sources.id = ?`,
    )
    .get(sourceId) as AcceptedSourceRow | undefined;
  if (
    !source ||
    !ACCEPTED_MANUSCRIPT_SOURCE_KINDS.has(source.kind) ||
    source.generation !== activeGeneration(source) ||
    Number(source.source_revision) !== Number(source.current_section_revision) ||
    source.content_hash !== source.current_section_hash ||
    hashContinuityText(source.content) !== source.content_hash
  ) {
    return null;
  }
  return source;
}

function normalizeAnchors(
  raw: string,
  source: AcceptedSourceRow,
): SlateContinuitySourceAnchor[] {
  return parseJson<SlateContinuitySourceAnchor[]>(raw, [])
    .filter(
      (anchor) =>
        anchor.sourceId === source.id &&
        anchor.sectionId === source.section_id &&
        anchor.sectionRevision === source.source_revision &&
        Number.isInteger(anchor.start) &&
        Number.isInteger(anchor.end) &&
        anchor.start >= 0 &&
        anchor.end > anchor.start &&
        anchor.end <= source.content.length &&
        hashContinuityText(source.content.slice(anchor.start, anchor.end)) ===
          anchor.quoteHash,
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function anchorKey(anchor: SlateContinuitySourceAnchor): string {
  return [
    anchor.sourceId,
    anchor.sectionId ?? "",
    anchor.sectionRevision ?? "",
    anchor.start,
    anchor.end,
    anchor.quoteHash,
  ].join(":");
}

function mergeAnchors(
  left: readonly SlateContinuitySourceAnchor[],
  right: readonly SlateContinuitySourceAnchor[],
): SlateContinuitySourceAnchor[] {
  const byKey = new Map<string, SlateContinuitySourceAnchor>();
  for (const anchor of [...left, ...right]) {
    byKey.set(anchorKey(anchor), anchor);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.sectionId ?? "").localeCompare(b.sectionId ?? "") ||
      a.start - b.start ||
      a.end - b.end,
  );
}

function asDocumentAnchors(
  anchors: readonly SlateContinuitySourceAnchor[],
): SlateDocumentAnchor[] {
  return anchors.map((anchor) => ({
    ...anchor,
    startPosition: null,
    endPosition: null,
  }));
}

function mergeDocumentAnchors(
  left: readonly SlateDocumentAnchor[],
  right: readonly SlateDocumentAnchor[],
): SlateDocumentAnchor[] {
  const byKey = new Map<string, SlateDocumentAnchor>();
  for (const anchor of [...left, ...right]) {
    byKey.set(anchorKey(anchor), anchor);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.sectionId ?? "").localeCompare(b.sectionId ?? "") ||
      a.start - b.start ||
      a.end - b.end,
  );
}

function exactNameAnchors(
  source: AcceptedSourceRow,
  canonicalName: string,
): SlateContinuitySourceAnchor[] {
  const anchors: SlateContinuitySourceAnchor[] = [];
  let offset = 0;
  while (offset < source.content.length && anchors.length < 8) {
    const start = source.content.indexOf(canonicalName, offset);
    if (start < 0) break;
    const end = start + canonicalName.length;
    anchors.push({
      sourceId: source.id,
      sectionId: source.section_id,
      sectionRevision: source.source_revision,
      start,
      end,
      quoteHash: hashContinuityText(source.content.slice(start, end)),
    });
    offset = end;
  }
  return anchors;
}

function evidenceProvenance(
  source: AcceptedSourceRow,
  anchors: readonly SlateContinuitySourceAnchor[],
  layer: SlateStoryBibleLayer = "evidence",
): SlateStoryBibleProvenance {
  return {
    generationId: `${source.series_id}:generation:${source.generation}`,
    sourceIds: [source.id],
    anchors: asDocumentAnchors(anchors),
    authority: layer === "interpretations" ? "ai" : "manuscript",
    provider:
      source.provider === "local" ||
      source.provider === "openai" ||
      source.provider === "anthropic"
        ? source.provider
        : null,
    model: source.model,
    createdAt: source.created_at,
  };
}

function writerProvenance(input: {
  seriesId: string;
  generation: number;
  sourceId: string;
  createdAt: string;
}): SlateStoryBibleProvenance {
  return {
    generationId: `${input.seriesId}:generation:${input.generation}`,
    sourceIds: [input.sourceId],
    anchors: [],
    authority: "writer",
    provider: null,
    model: null,
    createdAt: input.createdAt,
  };
}

function normalizeSourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && !!item),
    ),
  ].sort();
}

function normalizeStoredProvenance(
  value: unknown,
  fallback: SlateStoryBibleProvenance,
): SlateStoryBibleProvenance {
  if (!isRecord(value)) return fallback;
  const sourceIds = normalizeSourceIds(value.sourceIds);
  const anchors = Array.isArray(value.anchors)
    ? (value.anchors as SlateDocumentAnchor[])
    : [];
  return {
    generationId:
      typeof value.generationId === "string"
        ? value.generationId
        : fallback.generationId,
    sourceIds: sourceIds.length > 0 ? sourceIds : fallback.sourceIds,
    anchors,
    authority:
      value.authority === "writer" ||
      value.authority === "manuscript" ||
      value.authority === "ai"
        ? value.authority
        : fallback.authority,
    provider:
      value.provider === "local" ||
      value.provider === "openai" ||
      value.provider === "anthropic"
        ? value.provider
        : null,
    model: typeof value.model === "string" ? value.model : fallback.model,
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : fallback.createdAt,
  };
}

function storedProfileField(
  raw: unknown,
  fallbackValue: unknown,
  fallback: SlateStoryBibleProvenance,
  locked: boolean,
): StoredProfileField {
  if (isRecord(raw) && Object.hasOwn(raw, "value")) {
    return {
      value: raw.value,
      layer:
        raw.layer === "canon" ||
        raw.layer === "plans" ||
        raw.layer === "interpretations"
          ? raw.layer
          : "evidence",
      writerLocked:
        typeof raw.writerLocked === "boolean" ? raw.writerLocked : locked,
      provenance: normalizeStoredProvenance(raw.provenance, fallback),
    };
  }
  return {
    value: raw ?? fallbackValue,
    layer: "evidence",
    writerLocked: locked,
    provenance: fallback,
  };
}

function mergeProvenance(
  existing: SlateStoryBibleProvenance,
  incoming: SlateStoryBibleProvenance,
): SlateStoryBibleProvenance {
  return {
    ...incoming,
    sourceIds: [...new Set([...existing.sourceIds, ...incoming.sourceIds])].sort(),
    anchors: mergeDocumentAnchors(existing.anchors, incoming.anchors),
    createdAt:
      existing.createdAt.localeCompare(incoming.createdAt) <= 0
        ? existing.createdAt
        : incoming.createdAt,
  };
}

function normalizedStringList(value: unknown): string[] {
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

function mergeProfileField(
  existing: StoredProfileField,
  incomingValue: string | string[],
  incomingLayer: SlateStoryBibleLayer,
  incomingProvenance: SlateStoryBibleProvenance,
  options: { replaceScalar?: boolean } = {},
): StoredProfileField {
  const existingHasValue =
    (typeof existing.value === "string" && existing.value.trim().length > 0) ||
    (Array.isArray(existing.value) && existing.value.length > 0);
  if (
    existing.writerLocked ||
    existing.layer === "canon" ||
    existing.layer === "plans" ||
    existing.provenance.authority === "writer"
  ) {
    return existing;
  }
  if (
    existing.layer === "evidence" &&
    incomingLayer === "interpretations" &&
    existingHasValue
  ) {
    return existing;
  }
  const value = Array.isArray(incomingValue)
    ? [
        ...new Set([
          ...normalizedStringList(existing.value),
          ...normalizedStringList(incomingValue),
        ]),
      ]
    : options.replaceScalar ||
        typeof existing.value !== "string" ||
        !existing.value.trim() ||
        (existing.layer === "interpretations" && incomingLayer === "evidence")
      ? incomingValue.trim()
      : existing.value;
  return {
    value,
    layer:
      (existingHasValue && existing.layer === "evidence") ||
      incomingLayer === "evidence"
        ? "evidence"
        : incomingLayer,
    writerLocked: false,
    provenance: mergeProvenance(existing.provenance, incomingProvenance),
  };
}

function profileFieldForPredicate(
  predicate: string,
): SlateCharacterProfileFieldName | null {
  const normalized = normalizeContinuityName(predicate);
  if (/\b(?:role|occupation|profession|title)\b/u.test(normalized)) return "roles";
  if (/\b(?:public persona|reputation|appears|appearance to others)\b/u.test(normalized)) {
    return "publicPersona";
  }
  if (/\b(?:pressure|burden|inner conflict|stakes)\b/u.test(normalized)) {
    return "privatePressure";
  }
  if (/\b(?:want|wants|desire|desires|goal|goals|intends)\b/u.test(normalized)) {
    return "wants";
  }
  if (/\b(?:need|needs)\b/u.test(normalized)) return "needs";
  if (/\b(?:fear|fears|afraid)\b/u.test(normalized)) return "fears";
  if (/\b(?:wound|wounds|trauma|loss)\b/u.test(normalized)) return "wounds";
  if (/\b(?:belief|believes|believed)\b/u.test(normalized)) return "beliefs";
  if (/\b(?:value|values|principle)\b/u.test(normalized)) return "values";
  if (/\b(?:secret|secrets|hides|conceals)\b/u.test(normalized)) return "secrets";
  if (/\b(?:contradiction|contradicts)\b/u.test(normalized)) {
    return "contradictions";
  }
  if (/\b(?:voice|speech|dialogue|speaks)\b/u.test(normalized)) {
    return "dialogueMarkers";
  }
  if (/\b(?:skill|skills|competency|competencies|ability|abilities|can)\b/u.test(normalized)) {
    return "competencies";
  }
  if (/\b(?:limitation|limitations|weakness|weaknesses|cannot|can't)\b/u.test(normalized)) {
    return "limitations";
  }
  if (/\b(?:appearance|looks|wears|physical description)\b/u.test(normalized)) {
    return "appearance";
  }
  if (/\b(?:state|status|condition|current location|becomes)\b/u.test(normalized)) {
    return "currentState";
  }
  return null;
}

function isArcPredicate(predicate: string): boolean {
  const normalized = normalizeContinuityName(predicate);
  return /\b(?:want|wants|need|needs|fear|fears|choose|chooses|decide|decides|refuse|refuses|accept|accepts|state|status|condition|become|becomes)\b/u.test(
    normalized,
  );
}

function claimValue(claim: CharacterClaimRow): string {
  return (claim.value || claim.object_name || "").trim();
}

function sourceCharacters(
  db: DatabaseSync,
  source: AcceptedSourceRow,
): CharacterEntityRow[] {
  const eventParticipantIds = new Set<string>();
  const eventRows = db
    .prepare(
      `SELECT participant_entity_ids_json
         FROM slate_continuity_events
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ?`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{ participant_entity_ids_json: string }>;
  for (const event of eventRows) {
    for (const id of parseJson<string[]>(
      event.participant_entity_ids_json,
      [],
    )) {
      if (typeof id === "string" && id) eventParticipantIds.add(id);
    }
  }
  const explicitCharacterIds = new Set(eventParticipantIds);
  const perspectiveRows = db
    .prepare(
      `SELECT perspective_entity_id
         FROM slate_continuity_claims
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ? AND perspective_entity_id IS NOT NULL`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{ perspective_entity_id: string }>;
  for (const row of perspectiveRows) {
    explicitCharacterIds.add(row.perspective_entity_id);
  }
  const relationshipRows = db
    .prepare(
      `SELECT from_entity_id
         FROM slate_continuity_relationships
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ?`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{ from_entity_id: string }>;
  for (const row of relationshipRows) {
    explicitCharacterIds.add(row.from_entity_id);
  }
  for (const entityId of explicitCharacterIds) {
    db.prepare(
      `UPDATE slate_continuity_entities
          SET kind = 'character', updated_at = ?
        WHERE id = ? AND user_id = ? AND series_id = ? AND generation = ?
          AND kind <> 'character'`,
    ).run(
      source.created_at,
      entityId,
      source.user_id,
      source.series_id,
      source.generation,
    );
  }
  const rows = db
    .prepare(
      `SELECT id, canonical_name, description, anchors_json, source_id
         FROM slate_continuity_entities
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND kind = 'character'
        ORDER BY canonical_name ASC, id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
    ) as unknown as CharacterEntityRow[];
  return rows.filter((row) => {
    if (explicitCharacterIds.has(row.id) || row.source_id === source.id) return true;
    return parseJson<SlateContinuitySourceAnchor[]>(
      row.anchors_json,
      [],
    ).some((anchor) => anchor.sourceId === source.id);
  });
}

function claimsForCharacter(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  entityId: string,
): CharacterClaimRow[] {
  return db
    .prepare(
      `SELECT claims.id, claims.predicate, claims.value,
              objects.canonical_name AS object_name,
              claims.epistemic_status, claims.confidence,
              claims.anchors_json
         FROM slate_continuity_claims AS claims
         LEFT JOIN slate_continuity_entities AS objects
           ON objects.id = claims.object_entity_id
          AND objects.user_id = claims.user_id
          AND objects.generation = claims.generation
        WHERE claims.user_id = ? AND claims.series_id = ?
          AND claims.generation = ? AND claims.source_id = ?
          AND claims.subject_entity_id = ?
          AND claims.epistemic_status <> 'superseded'
        ORDER BY claims.created_at ASC, claims.id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
      entityId,
    ) as unknown as CharacterClaimRow[];
}

function eventsForCharacter(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  entityId: string,
): CharacterEventRow[] {
  const rows = db
    .prepare(
      `SELECT id, title, description, chronology_key,
              participant_entity_ids_json, anchors_json
         FROM slate_continuity_events
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as unknown as CharacterEventRow[];
  return rows.filter((row) =>
    parseJson<string[]>(row.participant_entity_ids_json, []).includes(entityId),
  );
}

function profileProvenance(
  raw: string,
  fallback: SlateStoryBibleProvenance,
): SlateStoryBibleProvenance {
  return normalizeStoredProvenance(parseJson<unknown>(raw, {}), fallback);
}

function upsertCharacterProfile(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  entity: CharacterEntityRow,
  now: string,
): { profileId: string; claims: CharacterClaimRow[]; profile: JsonRecord } {
  let anchors = normalizeAnchors(entity.anchors_json, source);
  if (anchors.length === 0) {
    anchors = exactNameAnchors(source, entity.canonical_name);
  }
  if (anchors.length === 0) {
    throw new Error(
      `Character Studio cannot project ${entity.canonical_name} without exact accepted-prose evidence.`,
    );
  }
  const profileId = stableId("slate-character-profile", [
    source.series_id,
    String(source.generation),
    entity.id,
  ]);
  const existing = db
    .prepare(
      `SELECT id, profile_json, field_locks_json, provenance_json,
              created_at, updated_at
         FROM slate_character_profiles
        WHERE id = ? AND user_id = ? AND series_id = ? AND generation = ?`,
    )
    .get(
      profileId,
      source.user_id,
      source.series_id,
      source.generation,
    ) as CharacterProfileRow | undefined;
  const baseProvenance = evidenceProvenance(source, anchors);
  const existingBase = existing
    ? profileProvenance(existing.provenance_json, baseProvenance)
    : baseProvenance;
  const locks = parseJson<Record<string, boolean>>(
    existing?.field_locks_json,
    {},
  );
  const profile = parseJson<JsonRecord>(existing?.profile_json, {});
  const defaultValue = (
    field: SlateCharacterProfileFieldName,
  ): string | string[] => (PROFILE_ARRAY_FIELDS.has(field) ? [] : "");
  const field = (
    name: SlateCharacterProfileFieldName,
  ): StoredProfileField =>
    storedProfileField(
      profile[name],
      defaultValue(name),
      existingBase,
      locks[name] === true,
    );
  profile.identity = mergeProfileField(
    field("identity"),
    entity.canonical_name,
    "evidence",
    baseProvenance,
  );
  const aliases = db
    .prepare(
      `SELECT alias
         FROM slate_continuity_aliases
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND entity_id = ?
        ORDER BY alias ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      entity.id,
    ) as Array<{ alias: string }>;
  if (aliases.length > 0) {
    profile.aliases = mergeProfileField(
      field("aliases"),
      aliases.map((row) => row.alias),
      "evidence",
      baseProvenance,
    );
  } else if (!Object.hasOwn(profile, "aliases")) {
    profile.aliases = field("aliases");
  }
  if (entity.description.trim()) {
    profile.publicPersona = mergeProfileField(
      field("publicPersona"),
      entity.description,
      "interpretations",
      evidenceProvenance(source, anchors, "interpretations"),
    );
  }
  const claims = claimsForCharacter(db, source, entity.id);
  for (const claim of claims) {
    if (Number(claim.confidence) < 0.7) continue;
    const target = profileFieldForPredicate(claim.predicate);
    const value = claimValue(claim);
    if (!target || !value) continue;
    const claimAnchors = normalizeAnchors(claim.anchors_json, source);
    if (claimAnchors.length === 0) continue;
    const layer: SlateStoryBibleLayer =
      claim.epistemic_status === "fact" ? "evidence" : "interpretations";
    profile[target] = mergeProfileField(
      field(target),
      PROFILE_ARRAY_FIELDS.has(target) ? [value] : value,
      layer,
      evidenceProvenance(source, claimAnchors, layer),
      { replaceScalar: target === "currentState" && layer === "evidence" },
    );
  }
  for (const name of [...PROFILE_ARRAY_FIELDS, ...PROFILE_STRING_FIELDS]) {
    if (!Object.hasOwn(profile, name)) profile[name] = field(name);
  }
  const provenance =
    existingBase.authority === "writer"
      ? existingBase
      : mergeProvenance(existingBase, baseProvenance);
  db.prepare(
    `INSERT INTO slate_character_profiles
      (id, user_id, series_id, project_id, entity_id, generation, layer,
       profile_json, field_locks_json, provenance_json, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'evidence', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       profile_json = excluded.profile_json,
       field_locks_json = excluded.field_locks_json,
       provenance_json = excluded.provenance_json,
       updated_at = excluded.updated_at`,
  ).run(
    profileId,
    source.user_id,
    source.series_id,
    entity.id,
    source.generation,
    JSON.stringify(profile),
    JSON.stringify(locks),
    JSON.stringify(provenance),
    existing?.created_at ?? now,
    now,
  );
  return { profileId, claims, profile };
}

function observedTrack(raw: string): JsonRecord {
  const parsed = parseJson<JsonRecord>(raw, {});
  return {
    ...parsed,
    startState:
      typeof parsed.startState === "string" ? parsed.startState : "",
    destinationState:
      typeof parsed.destinationState === "string"
        ? parsed.destinationState
        : "",
    writerLocked: false,
  };
}

function intendedTrack(raw: string): JsonRecord {
  const parsed = parseJson<JsonRecord>(raw, {});
  return {
    ...parsed,
    startState:
      typeof parsed.startState === "string" ? parsed.startState : "",
    destinationState:
      typeof parsed.destinationState === "string"
        ? parsed.destinationState
        : "",
    writerLocked: parsed.writerLocked === true,
    ...(Array.isArray(parsed.bridgeSuggestions)
      ? { bridgeSuggestions: parsed.bridgeSuggestions }
      : {}),
  };
}

function markSupersededObservedBeatsRevised(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  arcId: string,
  now: string,
): void {
  const rows = db
    .prepare(
      `SELECT id, beat_json, provenance_json
         FROM slate_character_arc_beats
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND character_arc_id = ? AND section_id = ? AND track = 'observed'`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      arcId,
      source.section_id,
    ) as Array<{
    id: string;
    beat_json: string;
    provenance_json: string;
  }>;
  for (const row of rows) {
    const provenance = parseJson<{
      sourceIds?: string[];
    }>(row.provenance_json, {});
    if (provenance.sourceIds?.includes(source.id)) continue;
    const beat = parseJson<JsonRecord>(row.beat_json, {});
    if (beat.status === "revised") continue;
    db.prepare(
      `UPDATE slate_character_arc_beats
          SET beat_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      JSON.stringify({ ...beat, status: "revised" }),
      now,
      row.id,
      source.user_id,
    );
  }
}

function upsertObservedBeat(
  db: DatabaseSync,
  input: {
    source: AcceptedSourceRow;
    arcId: string;
    id: string;
    ordinal: number;
    label: string;
    description: string;
    storyTimeKey: string | null;
    anchors: SlateContinuitySourceAnchor[];
    now: string;
  },
): string {
  const provenance = evidenceProvenance(input.source, input.anchors);
  const beat = {
    id: input.id,
    label: input.label.slice(0, 180),
    description: input.description.slice(0, 600),
    expectedSectionId: null,
    observedSectionId: input.source.section_id,
    manuscriptOrder: Number(input.source.section_ordinal),
    storyTimeKey: input.storyTimeKey,
    status: "landed",
    layer: "evidence",
    provenance,
  };
  db.prepare(
    `INSERT INTO slate_character_arc_beats
      (id, user_id, series_id, project_id, character_arc_id, section_id,
       generation, track, ordinal, beat_json, provenance_json,
       created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 'observed', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       beat_json = excluded.beat_json,
       provenance_json = excluded.provenance_json,
       updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.source.user_id,
    input.source.series_id,
    input.arcId,
    input.source.section_id,
    input.source.generation,
    input.ordinal,
    JSON.stringify(beat),
    JSON.stringify(provenance),
    input.now,
    input.now,
  );
  return input.id;
}

function exactQuote(
  source: AcceptedSourceRow,
  anchor: SlateContinuitySourceAnchor,
): string {
  return source.content.slice(anchor.start, anchor.end).trim();
}

function upsertCharacterArc(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  entity: CharacterEntityRow,
  profileId: string,
  claims: CharacterClaimRow[],
  profile: JsonRecord,
  now: string,
): { arcId: string; beatIds: string[]; eventBeatIds: Map<string, string> } {
  const arcId = stableId("slate-character-arc", [
    source.series_id,
    String(source.generation),
    entity.id,
  ]);
  const existing = db
    .prepare(
      `SELECT id, intended_json, observed_json, provenance_json, created_at
         FROM slate_character_arcs
        WHERE id = ? AND user_id = ? AND series_id = ? AND generation = ?`,
    )
    .get(
      arcId,
      source.user_id,
      source.series_id,
      source.generation,
    ) as CharacterArcRow | undefined;
  const intended = intendedTrack(existing?.intended_json ?? "{}");
  const observed = observedTrack(existing?.observed_json ?? "{}");
  let baseAnchors = normalizeAnchors(entity.anchors_json, source);
  if (baseAnchors.length === 0) {
    baseAnchors = exactNameAnchors(source, entity.canonical_name);
  }
  const provenance = evidenceProvenance(source, baseAnchors);
  const existingProvenance = existing
    ? normalizeStoredProvenance(
        parseJson<unknown>(existing.provenance_json, {}),
        provenance,
      )
    : provenance;
  if (!existing) {
    db.prepare(
      `INSERT INTO slate_character_arcs
        (id, user_id, series_id, project_id, character_profile_id, generation,
         intended_json, observed_json, provenance_json, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      arcId,
      source.user_id,
      source.series_id,
      profileId,
      source.generation,
      JSON.stringify(intended),
      JSON.stringify(observed),
      JSON.stringify(provenance),
      now,
      now,
    );
  }
  markSupersededObservedBeatsRevised(db, source, arcId, now);
  const beatIds: string[] = [];
  const eventBeatIds = new Map<string, string>();
  let ordinal = 0;
  const events = eventsForCharacter(db, source, entity.id);
  for (const event of events) {
    const anchors = normalizeAnchors(event.anchors_json, source);
    if (anchors.length === 0) continue;
    const beatId = stableId("slate-character-observed-beat", [
      arcId,
      source.id,
      "event",
      event.id,
    ]);
    beatIds.push(
      upsertObservedBeat(db, {
        source,
        arcId,
        id: beatId,
        ordinal: ordinal++,
        label: event.title,
        description: event.description,
        storyTimeKey: event.chronology_key,
        anchors,
        now,
      }),
    );
    eventBeatIds.set(event.id, beatId);
  }
  for (const claim of claims.filter((candidate) =>
    isArcPredicate(candidate.predicate),
  )) {
    const anchors = normalizeAnchors(claim.anchors_json, source);
    const value = claimValue(claim);
    if (anchors.length === 0 || !value) continue;
    const beatId = stableId("slate-character-observed-beat", [
      arcId,
      source.id,
      "claim",
      claim.id,
    ]);
    beatIds.push(
      upsertObservedBeat(db, {
        source,
        arcId,
        id: beatId,
        ordinal: ordinal++,
        label: `${entity.canonical_name}: ${claim.predicate}`,
        description: value,
        storyTimeKey: null,
        anchors,
        now,
      }),
    );
  }
  if (beatIds.length === 0 && baseAnchors[0]) {
    const quote = exactQuote(source, baseAnchors[0]);
    const beatId = stableId("slate-character-observed-beat", [
      arcId,
      source.id,
      "presence",
    ]);
    beatIds.push(
      upsertObservedBeat(db, {
        source,
        arcId,
        id: beatId,
        ordinal: 0,
        label: `Established in ${source.section_title}`,
        description: quote,
        storyTimeKey: null,
        anchors: [baseAnchors[0]],
        now,
      }),
    );
  }
  const currentState = storedProfileField(
    profile.currentState,
    "",
    provenance,
    false,
  );
  const latestBeat = db
    .prepare(
      `SELECT beat_json
         FROM slate_character_arc_beats
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND character_arc_id = ? AND track = 'observed'
          AND json_extract(beat_json, '$.status') <> 'revised'
        ORDER BY COALESCE(json_extract(beat_json, '$.manuscriptOrder'), -1) DESC,
                 ordinal DESC, created_at DESC
        LIMIT 1`,
    )
    .get(
      source.user_id,
      source.series_id,
      source.generation,
      arcId,
    ) as { beat_json: string } | undefined;
  const latestBeatDescription = String(
    parseJson<JsonRecord>(latestBeat?.beat_json, {}).description ?? "",
  ).trim();
  const destination =
    typeof currentState.value === "string" && currentState.value.trim()
      ? currentState.value.trim()
      : latestBeatDescription;
  if (!String(observed.startState ?? "").trim() && beatIds[0]) {
    const first = db
      .prepare(
        `SELECT beat_json FROM slate_character_arc_beats
          WHERE id = ? AND user_id = ?`,
      )
      .get(beatIds[0], source.user_id) as { beat_json: string } | undefined;
    observed.startState = String(
      parseJson<JsonRecord>(first?.beat_json, {}).description ?? "",
    ).trim();
  }
  if (destination) observed.destinationState = destination;
  observed.writerLocked = false;
  db.prepare(
    `INSERT INTO slate_character_arcs
      (id, user_id, series_id, project_id, character_profile_id, generation,
       intended_json, observed_json, provenance_json, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       intended_json = excluded.intended_json,
       observed_json = excluded.observed_json,
       provenance_json = excluded.provenance_json,
       updated_at = excluded.updated_at`,
  ).run(
    arcId,
    source.user_id,
    source.series_id,
    profileId,
    source.generation,
    JSON.stringify(intended),
    JSON.stringify(observed),
    JSON.stringify(
      existingProvenance.authority === "writer"
        ? existingProvenance
        : mergeProvenance(existingProvenance, provenance),
    ),
    existing?.created_at ?? now,
    now,
  );
  return { arcId, beatIds, eventBeatIds };
}

function upsertNarrativeEdge(
  db: DatabaseSync,
  input: {
    source: AcceptedSourceRow;
    kind:
      | "before"
      | "after"
      | "causes"
      | "requires"
      | "prevents"
      | "reveals"
      | "resolves";
    from: { kind: string; id: string };
    to: { kind: string; id: string };
    discriminator: string;
    storyTimeKey?: string | null;
    manuscriptOrder?: number | null;
    anchors: SlateContinuitySourceAnchor[];
    now: string;
  },
): string {
  const id = stableId("slate-narrative-edge", [
    input.source.series_id,
    String(input.source.generation),
    input.source.id,
    input.kind,
    input.from.kind,
    input.from.id,
    input.to.kind,
    input.to.id,
    input.discriminator,
  ]);
  const provenance = evidenceProvenance(input.source, input.anchors);
  db.prepare(
    `INSERT INTO slate_narrative_edges
      (id, user_id, series_id, project_id, generation, from_ref_json,
       to_ref_json, kind, branch_id, story_time_json,
       manuscript_order_json, provenance_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'main', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       story_time_json = excluded.story_time_json,
       manuscript_order_json = excluded.manuscript_order_json,
       provenance_json = excluded.provenance_json,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    input.source.user_id,
    input.source.series_id,
    input.source.project_id,
    input.source.generation,
    JSON.stringify(input.from),
    JSON.stringify(input.to),
    input.kind,
    input.storyTimeKey ? JSON.stringify({ key: input.storyTimeKey }) : null,
    input.manuscriptOrder === null ||
      typeof input.manuscriptOrder === "undefined"
      ? null
      : JSON.stringify({ order: input.manuscriptOrder }),
    JSON.stringify({ layer: "evidence", ...provenance }),
    input.now,
    input.now,
  );
  return id;
}

function sourceNarrativeEdges(
  db: DatabaseSync,
  source: AcceptedSourceRow,
  characterArcs: Array<{
    eventBeatIds: Map<string, string>;
  }>,
  now: string,
): string[] {
  const edgeIds: string[] = [];
  const fallbackEnd = Math.min(source.content.length, 280);
  const fallbackAnchor: SlateContinuitySourceAnchor[] = [
    {
      sourceId: source.id,
      sectionId: source.section_id,
      sectionRevision: source.source_revision,
      start: 0,
      end: fallbackEnd,
      quoteHash: hashContinuityText(
        source.content.slice(0, fallbackEnd),
      ),
    },
  ].filter((anchor) => anchor.end > anchor.start);
  const previous = db
    .prepare(
      `SELECT id
         FROM slate_sections
        WHERE user_id = ? AND project_id = ? AND ordinal < ?
          AND prose <> ''
        ORDER BY ordinal DESC
        LIMIT 1`,
    )
    .get(
      source.user_id,
      source.project_id,
      source.section_ordinal,
    ) as { id: string } | undefined;
  if (previous && fallbackAnchor.length > 0) {
    edgeIds.push(
      upsertNarrativeEdge(db, {
        source,
        kind: "before",
        from: { kind: "section", id: previous.id },
        to: { kind: "section", id: source.section_id },
        discriminator: "manuscript-order",
        manuscriptOrder: source.section_ordinal,
        anchors: fallbackAnchor,
        now,
      }),
    );
  }
  const claims = db
    .prepare(
      `SELECT id, anchors_json
         FROM slate_continuity_claims
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ? AND epistemic_status <> 'superseded'
        ORDER BY id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{ id: string; anchors_json: string }>;
  for (const claim of claims) {
    const anchors = normalizeAnchors(claim.anchors_json, source);
    if (anchors.length === 0) continue;
    edgeIds.push(
      upsertNarrativeEdge(db, {
        source,
        kind: "reveals",
        from: { kind: "section", id: source.section_id },
        to: { kind: "claim", id: claim.id },
        discriminator: claim.id,
        manuscriptOrder: source.section_ordinal,
        anchors,
        now,
      }),
    );
  }
  const threads = db
    .prepare(
      `SELECT id, status, anchors_json
         FROM slate_continuity_threads
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ?
        ORDER BY id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{ id: string; status: string; anchors_json: string }>;
  for (const thread of threads) {
    const anchors = normalizeAnchors(thread.anchors_json, source);
    if (anchors.length === 0) continue;
    edgeIds.push(
      upsertNarrativeEdge(db, {
        source,
        kind:
          thread.status === "resolved" || thread.status === "landed"
            ? "resolves"
            : "reveals",
        from: { kind: "section", id: source.section_id },
        to: { kind: "thread", id: thread.id },
        discriminator: thread.id,
        manuscriptOrder: source.section_ordinal,
        anchors,
        now,
      }),
    );
  }
  const eventBeatIds = new Map<string, string>();
  for (const arc of characterArcs) {
    for (const [eventId, beatId] of arc.eventBeatIds) {
      eventBeatIds.set(eventId, beatId);
    }
  }
  const events = db
    .prepare(
      `SELECT id, chronology_key, anchors_json
         FROM slate_continuity_events
        WHERE user_id = ? AND series_id = ? AND generation = ?
          AND source_id = ?
        ORDER BY id ASC`,
    )
    .all(
      source.user_id,
      source.series_id,
      source.generation,
      source.id,
    ) as Array<{
    id: string;
    chronology_key: string | null;
    anchors_json: string;
  }>;
  for (const event of events) {
    const beatId = eventBeatIds.get(event.id);
    const anchors = normalizeAnchors(event.anchors_json, source);
    if (!beatId || anchors.length === 0) continue;
    edgeIds.push(
      upsertNarrativeEdge(db, {
        source,
        kind: "reveals",
        from: { kind: "event", id: event.id },
        to: { kind: "arc_beat", id: beatId },
        discriminator: beatId,
        storyTimeKey: event.chronology_key,
        manuscriptOrder: source.section_ordinal,
        anchors,
        now,
      }),
    );
  }
  return edgeIds;
}

/**
 * Materializes the curated Character Studio projection for one current,
 * accepted manuscript source. The caller must own the surrounding SQLite
 * transaction. Replays are idempotent and inactive/shadow generations are
 * intentionally ignored.
 */
export function projectAcceptedSourceToCharacterStudioInTransaction(
  db: DatabaseSync,
  sourceId: string,
  now = new Date().toISOString(),
): ProjectAcceptedSourceToCharacterStudioResult | null {
  const source = acceptedSource(db, sourceId);
  if (!source) return null;
  const profileIds: string[] = [];
  const arcIds: string[] = [];
  const observedBeatIds: string[] = [];
  const arcs: Array<{ eventBeatIds: Map<string, string> }> = [];
  for (const entity of sourceCharacters(db, source)) {
    const profile = upsertCharacterProfile(db, source, entity, now);
    profileIds.push(profile.profileId);
    const arc = upsertCharacterArc(
      db,
      source,
      entity,
      profile.profileId,
      profile.claims,
      profile.profile,
      now,
    );
    arcIds.push(arc.arcId);
    observedBeatIds.push(...arc.beatIds);
    arcs.push({ eventBeatIds: arc.eventBeatIds });
  }
  const edgeIds = sourceNarrativeEdges(db, source, arcs, now);
  return {
    sourceId: source.id,
    activeGeneration: source.generation,
    profileIds,
    arcIds,
    observedBeatIds,
    edgeIds,
  };
}

function validateWriterFieldValue(
  field: SlateCharacterProfileFieldName,
  value: string | string[],
): string | string[] {
  if (PROFILE_ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      throw new Error(`Character profile field ${field} requires a list.`);
    }
    const normalized = normalizedStringList(value);
    if (normalized.some((item) => item.length > 600) || normalized.length > 64) {
      throw new Error(`Character profile field ${field} is too large.`);
    }
    return normalized;
  }
  if (!PROFILE_STRING_FIELDS.has(field) || typeof value !== "string") {
    throw new Error(`Character profile field ${field} requires text.`);
  }
  const normalized = value.trim();
  if (normalized.length > 2_000) {
    throw new Error(`Character profile field ${field} is too large.`);
  }
  return normalized;
}

function activeProfileRow(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    profileId: string;
  },
): {
  id: string;
  series_id: string;
  generation: number;
  profile_json: string;
  field_locks_json: string;
  provenance_json: string;
  project_active_generation: number;
  series_active_generation: number;
} {
  const row = db
    .prepare(
      `SELECT profiles.id, profiles.series_id, profiles.generation,
              profiles.profile_json, profiles.field_locks_json,
              profiles.provenance_json,
              projects.continuity_active_generation AS project_active_generation,
              series.continuity_active_generation AS series_active_generation
         FROM slate_character_profiles AS profiles
         JOIN slate_projects AS projects
           ON projects.id = ?
          AND projects.user_id = profiles.user_id
          AND projects.series_id = profiles.series_id
         JOIN slate_series AS series
           ON series.id = profiles.series_id
          AND series.user_id = profiles.user_id
        WHERE profiles.id = ? AND profiles.user_id = ?
          AND (profiles.project_id = ? OR profiles.project_id IS NULL)`,
    )
    .get(
      input.projectId,
      input.profileId,
      input.userId,
      input.projectId,
    ) as
    | {
        id: string;
        series_id: string;
        generation: number;
        profile_json: string;
        field_locks_json: string;
        provenance_json: string;
        project_active_generation: number;
        series_active_generation: number;
      }
    | undefined;
  if (!row) throw new Error("Slate character profile not found.");
  const generation =
    Number(row.series_active_generation) > 0
      ? Number(row.series_active_generation)
      : Number(row.project_active_generation);
  if (row.generation !== generation) {
    throw new Error(
      "Slate character profile belongs to an inactive Continuity generation.",
    );
  }
  return row;
}

function insertWriterAuthoritySource(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    seriesId: string;
    generation: number;
    mutationId: string;
    content: string;
    now: string;
  },
): string {
  const sourceId = stableId("slate-writer-authority-source", [
    input.userId,
    input.projectId,
    String(input.generation),
    input.mutationId,
  ]);
  const contentHash = hashContinuityText(input.content);
  const existing = db
    .prepare(
      `SELECT id, content_hash FROM slate_continuity_sources
        WHERE id = ? AND user_id = ?`,
    )
    .get(sourceId, input.userId) as
    | { id: string; content_hash: string }
    | undefined;
  if (existing) {
    if (existing.content_hash !== contentHash) {
      throw new Error(
        "Character Studio mutation id was already used for different writer input.",
      );
    }
    return existing.id;
  }
  const revision = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(MAX(source_revision), 0) + 1 AS revision
             FROM slate_continuity_sources
            WHERE user_id = ? AND series_id = ? AND project_id IS NULL
              AND section_id IS NULL
              AND generation = ?`,
        )
        .get(input.userId, input.seriesId, input.generation) as {
        revision: number;
      }
    ).revision,
  );
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority, provider, model,
       producer_versions_json, generation, supersedes_source_id, created_at)
     VALUES (?, ?, ?, NULL, NULL, 'series', 'review_direction', ?, ?, ?, 'human',
             NULL, NULL, ?, ?, NULL, ?)`,
  ).run(
    sourceId,
    input.userId,
    input.seriesId,
    revision,
    input.content,
    contentHash,
    JSON.stringify(currentContinuityProducerVersions()),
    input.generation,
    input.now,
  );
  return sourceId;
}

/**
 * Applies an explicit writer-owned Character Studio field edit. The new value
 * is canon-sourced even when it is left unlocked; later extraction may add
 * evidence elsewhere but cannot silently replace writer authority.
 */
export function updateSlateCharacterProfileField(
  db: DatabaseSync,
  input: UpdateSlateCharacterProfileFieldInput,
): UpdateSlateCharacterProfileFieldResult {
  const now = input.now ?? new Date().toISOString();
  const value = validateWriterFieldValue(input.field, input.value);
  if (!input.mutationId.trim() || input.mutationId.length > 160) {
    throw new Error("Character profile mutation id is invalid.");
  }
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const row = activeProfileRow(db, input);
    const content = JSON.stringify({
      kind: "character_profile_field",
      profileId: row.id,
      field: input.field,
      value,
      writerLocked: input.writerLocked,
    });
    const sourceId = insertWriterAuthoritySource(db, {
      userId: input.userId,
      projectId: input.projectId,
      seriesId: row.series_id,
      generation: row.generation,
      mutationId: input.mutationId,
      content,
      now,
    });
    const provenance = writerProvenance({
      seriesId: row.series_id,
      generation: row.generation,
      sourceId,
      createdAt: now,
    });
    const profile = parseJson<JsonRecord>(row.profile_json, {});
    profile[input.field] = {
      value,
      layer: "canon",
      writerLocked: input.writerLocked,
      provenance,
    };
    const locks = parseJson<Record<string, boolean>>(
      row.field_locks_json,
      {},
    );
    locks[input.field] = input.writerLocked;
    db.prepare(
      `UPDATE slate_character_profiles
          SET layer = 'canon', profile_json = ?, field_locks_json = ?,
              provenance_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND generation = ?
          AND (project_id = ? OR project_id IS NULL)`,
    ).run(
      JSON.stringify(profile),
      JSON.stringify(locks),
      JSON.stringify(provenance),
      now,
      row.id,
      input.userId,
      row.generation,
      input.projectId,
    );
    db.exec("COMMIT");
    return {
      profileId: row.id,
      sourceId,
      generation: row.generation,
      field: input.field,
      writerLocked: input.writerLocked,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setSlateCharacterProfileFieldLock(
  db: DatabaseSync,
  input: Omit<
    UpdateSlateCharacterProfileFieldInput,
    "value" | "writerLocked"
  > & { writerLocked: boolean },
): UpdateSlateCharacterProfileFieldResult {
  const row = activeProfileRow(db, input);
  const profile = parseJson<JsonRecord>(row.profile_json, {});
  const raw = profile[input.field];
  const value =
    isRecord(raw) && Object.hasOwn(raw, "value") ? raw.value : raw;
  const normalized =
    PROFILE_ARRAY_FIELDS.has(input.field)
      ? normalizedStringList(value)
      : typeof value === "string"
        ? value
        : "";
  return updateSlateCharacterProfileField(db, {
    ...input,
    value: normalized,
  });
}

function boundedArcText(value: string | undefined, label: string): string | undefined {
  if (typeof value === "undefined") return undefined;
  const normalized = value.trim();
  if (normalized.length > 2_000) {
    throw new Error(`${label} is too large.`);
  }
  return normalized;
}

/**
 * Updates only the writer-owned intended arc. Observed JSON and observed beat
 * rows are read but never rewritten by this operation.
 */
export function updateSlateCharacterIntendedArc(
  db: DatabaseSync,
  input: UpdateSlateCharacterIntendedArcInput,
): UpdateSlateCharacterIntendedArcResult {
  if (!input.mutationId.trim() || input.mutationId.length > 160) {
    throw new Error("Character arc mutation id is invalid.");
  }
  const now = input.now ?? new Date().toISOString();
  const startState = boundedArcText(input.startState, "Arc start state");
  const destinationState = boundedArcText(
    input.destinationState,
    "Arc destination state",
  );
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const profile = activeProfileRow(db, input);
    const existing = db
      .prepare(
        `SELECT id, intended_json, observed_json, provenance_json, created_at
           FROM slate_character_arcs
          WHERE user_id = ? AND series_id = ? AND generation = ?
            AND character_profile_id = ?
          ORDER BY updated_at DESC, id ASC
          LIMIT 1`,
      )
      .get(
        input.userId,
        profile.series_id,
        profile.generation,
        profile.id,
      ) as CharacterArcRow | undefined;
    const arcId =
      existing?.id ??
      stableId("slate-character-arc", [
        profile.series_id,
        String(profile.generation),
        profile.id,
      ]);
    const content = JSON.stringify({
      kind: "character_intended_arc",
      profileId: profile.id,
      arcId,
      startState,
      destinationState,
      writerLocked: input.writerLocked,
      beats: input.beats ?? [],
    });
    const sourceId = insertWriterAuthoritySource(db, {
      userId: input.userId,
      projectId: input.projectId,
      seriesId: profile.series_id,
      generation: profile.generation,
      mutationId: input.mutationId,
      content,
      now,
    });
    const provenance = writerProvenance({
      seriesId: profile.series_id,
      generation: profile.generation,
      sourceId,
      createdAt: now,
    });
    const intended = intendedTrack(existing?.intended_json ?? "{}");
    if (typeof startState === "string") intended.startState = startState;
    if (typeof destinationState === "string") {
      intended.destinationState = destinationState;
    }
    if (typeof input.writerLocked === "boolean") {
      intended.writerLocked = input.writerLocked;
    }
    db.prepare(
      `INSERT INTO slate_character_arcs
        (id, user_id, series_id, project_id, character_profile_id, generation,
         intended_json, observed_json, provenance_json, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         intended_json = excluded.intended_json,
         provenance_json = excluded.provenance_json,
         updated_at = excluded.updated_at`,
    ).run(
      arcId,
      input.userId,
      profile.series_id,
      profile.id,
      profile.generation,
      JSON.stringify(intended),
      existing?.observed_json ?? JSON.stringify(observedTrack("{}")),
      JSON.stringify(provenance),
      existing?.created_at ?? now,
      now,
    );
    const intendedBeatIds: string[] = [];
    for (const [ordinal, beat] of (input.beats ?? []).entries()) {
      const label = beat.label.trim();
      const description = (beat.description ?? "").trim();
      if (!label || label.length > 180 || description.length > 1_000) {
        throw new Error("Character intended arc beat is invalid.");
      }
      const beatId =
        beat.id?.trim() ||
        stableId("slate-character-intended-beat", [
          arcId,
          input.mutationId,
          String(ordinal),
          label,
        ]);
      const status = new Set([
        "planned",
        "seeded",
        "landed",
        "missed",
        "revised",
        "abandoned",
        "intentional",
      ]).has(beat.status ?? "")
        ? beat.status
        : "planned";
      const beatJson = {
        id: beatId,
        label,
        description,
        expectedSectionId: beat.expectedSectionId ?? null,
        observedSectionId: null,
        manuscriptOrder:
          typeof beat.manuscriptOrder === "number"
            ? beat.manuscriptOrder
            : ordinal,
        storyTimeKey: beat.storyTimeKey ?? null,
        status,
        layer: "plans",
        provenance,
      };
      db.prepare(
        `INSERT INTO slate_character_arc_beats
          (id, user_id, series_id, project_id, character_arc_id, section_id,
           generation, track, ordinal, beat_json, provenance_json,
           created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'intended', ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           beat_json = excluded.beat_json,
           provenance_json = excluded.provenance_json,
           updated_at = excluded.updated_at`,
      ).run(
        beatId,
        input.userId,
        profile.series_id,
        arcId,
        beat.expectedSectionId ?? null,
        profile.generation,
        ordinal,
        JSON.stringify(beatJson),
        JSON.stringify(provenance),
        now,
        now,
      );
      intendedBeatIds.push(beatId);
    }
    db.exec("COMMIT");
    return {
      arcId,
      profileId: profile.id,
      sourceId,
      generation: profile.generation,
      intendedBeatIds,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Utility for callers that need a collision-resistant UI mutation id without
 * importing crypto themselves.
 */
export function createSlateCharacterStudioMutationId(): string {
  return randomUUID();
}
