import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type SlateContinuityConcernKind,
  type SlateContinuityConcernSeverity,
  type SlateContinuityResolutionKind,
  type SlateContinuitySourceAnchor,
} from "@localai/shared";
import { SlateContinuityCurrentCanonResolver } from "./slate-continuity-current-canon.ts";

const DETERMINISTIC_CONCERN_PREFIX = "continuity-deterministic-concern";

const STATE_PREDICATES = new Set([
  "alive",
  "condition",
  "current_holder",
  "current_location",
  "dead",
  "is",
  "located_at",
  "location",
  "open_state",
  "ruler",
  "state",
  "status",
]);
const STATIC_FACT_PREDICATES = new Set([
  "birth_date",
  "born_in",
  "date_of_birth",
  "origin",
  "parentage",
  "species",
  "true_name",
]);
const WORLD_RULE_PREDICATES = new Set([
  "cost",
  "duration",
  "effect",
  "exception_policy",
  "fails_when",
  "frequency",
  "is",
  "limit",
  "maximum",
  "minimum",
  "result",
  "state",
  "status",
  "works_when",
]);

interface ProjectRow {
  id: string;
  series_id: string;
}

interface SectionRow {
  id: string;
  ordinal: number;
  kind: string;
  title: string;
}

interface ClaimRow {
  id: string;
  project_id: string | null;
  section_id: string | null;
  scope_kind: string;
  subject_entity_id: string | null;
  predicate: string;
  object_entity_id: string | null;
  value: string;
  epistemic_status: string;
  confidence: number;
  anchors_json: string;
  source_id: string;
}

interface EntityRow {
  id: string;
  kind: string;
  canonical_name: string;
}

interface EventRow {
  id: string;
  project_id: string | null;
  section_id: string | null;
  title: string;
  chronology_key: string | null;
  participant_entity_ids_json: string;
  location_entity_id: string | null;
  anchors_json: string;
  source_id: string;
}

interface RelationshipRow {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  kind: string;
  state: string;
  epistemic_status: string;
  anchors_json: string;
  source_id: string;
  source_section_id: string;
}

interface KnowledgeRow {
  id: string;
  character_entity_id: string;
  claim_id: string;
  learned_event_id: string;
  status: string;
  anchors_json: string;
  source_id: string;
  knowledge_section_id: string;
  knowledge_ordinal: number;
  learned_section_id: string;
  learned_ordinal: number;
  event_anchors_json: string;
  event_title: string;
  claim_anchors_json: string;
  claim_predicate: string;
  claim_value: string;
  claim_subject_entity_id: string | null;
}

interface ThreadRow {
  id: string;
  label: string;
  status: string;
  due_section_id: string | null;
  due_ordinal: number | null;
  due_project_id: string | null;
  due_kind: string | null;
  due_title: string | null;
  anchors_json: string;
  source_id: string;
}

interface ExistingConcernRow {
  status: string;
  anchors_json: string;
  claim_ids_json: string;
}

interface ConcernCandidate {
  id: string;
  kind: SlateContinuityConcernKind;
  severity: SlateContinuityConcernSeverity;
  summary: string;
  explanation: string;
  claimIds: string[];
  anchors: SlateContinuitySourceAnchor[];
  recommendedResolution: SlateContinuityResolutionKind | null;
}

export interface SlateContinuityConcernScanOptions {
  /** Current drafting stage. Omit to use the latest section containing prose. */
  currentSectionId?: string | null;
  now?: Date;
}

export interface SlateContinuityConcernScanResult {
  projectId: string;
  seriesId: string;
  currentSectionId: string | null;
  detected: number;
  inserted: number;
  updated: number;
  preservedWriterState: number;
  concernIds: string[];
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableConcernId(parts: readonly unknown[]): string {
  return `${DETERMINISTIC_CONCERN_PREFIX}-${hash(
    JSON.stringify(["slate-continuity-deterministic-concern-v1", ...parts]),
  ).slice(0, 32)}`;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function validNow(value: Date | undefined): string {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Continuity concern scan received an invalid clock value.");
  }
  return date.toISOString();
}

function projectForUser(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectRow {
  const row = db
    .prepare(
      `SELECT id, series_id FROM slate_projects
        WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row?.series_id) throw new Error("Slate project not found.");
  return row;
}

function currentStage(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  requestedSectionId: string | null | undefined,
): SectionRow | null {
  if (requestedSectionId) {
    const row = db
      .prepare(
        `SELECT id, ordinal, kind, title FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(requestedSectionId, projectId, userId) as SectionRow | undefined;
    if (!row) throw new Error("Slate continuity stage section not found.");
    return row;
  }
  return (
    (db
      .prepare(
        `SELECT id, ordinal, kind, title FROM slate_sections
          WHERE project_id = ? AND user_id = ?
            AND (TRIM(prose) <> '' OR status IN ('drafted', 'revising', 'revised'))
          ORDER BY ordinal DESC, id ASC LIMIT 1`,
      )
      .get(projectId, userId) as SectionRow | undefined) ?? null
  );
}

function hasAmbiguityCue(value: string): boolean {
  return /\b(?:alleged(?:ly)?|apparently|believed|maybe|might|perhaps|possibly|rumou?red|seems?|unknown|unclear|uncertain)\b/iu.test(
    value,
  );
}

type ExactAnchorResolver = SlateContinuityCurrentCanonResolver;

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
  ...groups: ReadonlyArray<readonly SlateContinuitySourceAnchor[]>
): SlateContinuitySourceAnchor[] {
  const byKey = new Map<string, SlateContinuitySourceAnchor>();
  for (const group of groups) {
    for (const anchor of group) byKey.set(anchorKey(anchor), anchor);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) ||
      left.start - right.start ||
      left.end - right.end,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function entitiesForSeries(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
): Map<string, EntityRow> {
  const rows = db
    .prepare(
      `SELECT id, kind, canonical_name FROM slate_continuity_entities
        WHERE user_id = ? AND series_id = ?`,
    )
    .all(userId, seriesId) as unknown as EntityRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

function claimValueKey(claim: ClaimRow): string {
  return claim.object_entity_id
    ? `entity:${claim.object_entity_id}`
    : `value:${normalized(claim.value)}`;
}

function claimValueLabel(
  claim: ClaimRow,
  entities: ReadonlyMap<string, EntityRow>,
): string {
  return claim.object_entity_id
    ? entities.get(claim.object_entity_id)?.canonical_name ?? claim.value
    : claim.value;
}

function claimStageKey(claim: ClaimRow): string {
  if (claim.section_id) return `section:${claim.section_id}`;
  if (claim.scope_kind === "series") return "series";
  return `book:${claim.project_id ?? "unknown"}`;
}

function conflictKindForClaim(
  claim: ClaimRow,
  subject: EntityRow,
): SlateContinuityConcernKind | null {
  const predicate = normalized(claim.predicate);
  if (subject.kind === "world_rule" && WORLD_RULE_PREDICATES.has(predicate)) {
    return "world_rule_conflict";
  }
  if (STATE_PREDICATES.has(predicate)) return "state_conflict";
  if (STATIC_FACT_PREDICATES.has(predicate)) return "factual_contradiction";
  return null;
}

function factConflictCandidates(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  stage: SectionRow | null,
  entities: ReadonlyMap<string, EntityRow>,
  anchors: ExactAnchorResolver,
): ConcernCandidate[] {
  const claims = db
    .prepare(
      `SELECT claims.id, claims.project_id, claims.section_id, claims.scope_kind,
              claims.subject_entity_id, claims.predicate,
              claims.object_entity_id, claims.value, claims.epistemic_status,
              claims.confidence, claims.anchors_json, claims.source_id
         FROM slate_continuity_claims AS claims
        WHERE claims.user_id = ? AND claims.series_id = ?
          AND claims.epistemic_status = 'fact'
          AND claims.confidence >= 0.75
          AND NOT EXISTS (
            SELECT 1 FROM slate_continuity_claims AS replacement
             WHERE replacement.user_id = claims.user_id
               AND replacement.series_id = claims.series_id
               AND replacement.supersedes_claim_id = claims.id
          )
        ORDER BY claims.id ASC`,
    )
    .all(userId, project.series_id) as unknown as ClaimRow[];
  const groups = new Map<
    string,
    { kind: SlateContinuityConcernKind; subject: EntityRow; claims: ClaimRow[] }
  >();
  const exactAnchorsByClaimId = new Map<
    string,
    SlateContinuitySourceAnchor[]
  >();
  for (const claim of claims) {
    if (!claim.subject_entity_id) continue;
    const exactAnchors = anchors.fromJson(claim.anchors_json);
    if (exactAnchors.length === 0) continue;
    const subject = entities.get(claim.subject_entity_id);
    if (!subject) continue;
    const kind = conflictKindForClaim(claim, subject);
    if (!kind) continue;
    const predicate = normalized(claim.predicate);
    const stageKey =
      kind === "state_conflict" ? claimStageKey(claim) : "persistent";
    const key = [kind, subject.id, predicate, stageKey].join("\u0000");
    const group = groups.get(key) ?? { kind, subject, claims: [] };
    group.claims.push(claim);
    groups.set(key, group);
    exactAnchorsByClaimId.set(claim.id, exactAnchors);
  }

  const result: ConcernCandidate[] = [];
  for (const group of groups.values()) {
    const values = new Map<string, ClaimRow[]>();
    for (const claim of group.claims) {
      const key = claimValueKey(claim);
      const rows = values.get(key) ?? [];
      rows.push(claim);
      values.set(key, rows);
    }
    if (values.size < 2) continue;
    const involved = [...values.values()].flat();
    const mergedAnchors = mergeAnchors(
      ...involved.map((claim) => exactAnchorsByClaimId.get(claim.id) ?? []),
    );
    if (mergedAnchors.length === 0) continue;
    const predicate = involved[0]!.predicate;
    const labels = uniqueSorted(
      involved.map((claim) => claimValueLabel(claim, entities)),
    );
    const semanticKey = [
      project.id,
      group.kind,
      group.subject.id,
      normalized(predicate),
      group.kind === "state_conflict" ? claimStageKey(involved[0]!) : "persistent",
    ];
    const kindLabel =
      group.kind === "world_rule_conflict"
        ? "world rule"
        : group.kind === "state_conflict"
          ? "state"
          : "fact";
    result.push({
      id: stableConcernId(semanticKey),
      kind: group.kind,
      severity:
        group.kind === "world_rule_conflict" ? "critical" : "important",
      summary: `${group.subject.canonical_name} has conflicting ${kindLabel} records.`,
      explanation: `Settled facts disagree about “${predicate}”: ${labels.join(" / ")}. Continuity will not choose between them.`,
      claimIds: uniqueSorted(involved.map((claim) => claim.id)),
      anchors: mergedAnchors,
      recommendedResolution: "update_canon",
    });
  }
  return result;
}

function locationImpossibilityCandidates(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  entities: ReadonlyMap<string, EntityRow>,
  anchors: ExactAnchorResolver,
): ConcernCandidate[] {
  const events = db
    .prepare(
      `SELECT id, project_id, section_id, title, chronology_key,
              participant_entity_ids_json, location_entity_id, anchors_json,
              source_id
         FROM slate_continuity_events
        WHERE user_id = ? AND series_id = ?
          AND chronology_key IS NOT NULL AND TRIM(chronology_key) <> ''
          AND location_entity_id IS NOT NULL
        ORDER BY chronology_key ASC, id ASC`,
    )
    .all(userId, project.series_id) as unknown as EventRow[];
  const groups = new Map<string, EventRow[]>();
  const exactAnchorsByEventId = new Map<
    string,
    SlateContinuitySourceAnchor[]
  >();
  for (const event of events) {
    const chronologyKey = event.chronology_key?.trim();
    if (!chronologyKey) continue;
    const exactAnchors = anchors.fromJson(event.anchors_json);
    if (exactAnchors.length === 0) continue;
    const participants = parseJson<unknown>(event.participant_entity_ids_json, []);
    if (!Array.isArray(participants)) continue;
    for (const participantId of participants) {
      if (
        typeof participantId !== "string" ||
        entities.get(participantId)?.kind !== "character"
      ) {
        continue;
      }
      const key = `${chronologyKey}\u0000${participantId}`;
      const rows = groups.get(key) ?? [];
      rows.push(event);
      groups.set(key, rows);
      exactAnchorsByEventId.set(event.id, exactAnchors);
    }
  }

  const result: ConcernCandidate[] = [];
  for (const [key, groupedEvents] of groups) {
    const locations = uniqueSorted(
      groupedEvents
        .map((event) => event.location_entity_id)
        .filter((value): value is string => Boolean(value)),
    );
    if (locations.length < 2) continue;
    const [chronologyKey, participantId] = key.split("\u0000") as [string, string];
    const mergedAnchors = mergeAnchors(
      ...groupedEvents.map(
        (event) => exactAnchorsByEventId.get(event.id) ?? [],
      ),
    );
    if (mergedAnchors.length === 0) continue;
    const participant = entities.get(participantId)?.canonical_name ?? "A character";
    const locationNames = locations.map(
      (id) => entities.get(id)?.canonical_name ?? id,
    );
    result.push({
      id: stableConcernId([
        project.id,
        "timeline_impossibility",
        chronologyKey,
        participantId,
      ]),
      kind: "timeline_impossibility",
      severity: "critical",
      summary: `${participant} occupies multiple locations at the same exact story time.`,
      explanation: `Events keyed “${chronologyKey}” place ${participant} at ${locationNames.join(" and ")}. Only exact chronology keys are compared.`,
      claimIds: [],
      anchors: mergedAnchors,
      recommendedResolution: "revise_prose",
    });
  }
  return result;
}

function relationshipConflictCandidates(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  entities: ReadonlyMap<string, EntityRow>,
  anchors: ExactAnchorResolver,
): ConcernCandidate[] {
  const relationships = db
    .prepare(
      `SELECT relationships.id, relationships.from_entity_id,
              relationships.to_entity_id, relationships.kind,
              relationships.state, relationships.epistemic_status,
              relationships.anchors_json, relationships.source_id,
              sources.section_id AS source_section_id
         FROM slate_continuity_relationships AS relationships
         JOIN slate_continuity_sources AS sources
           ON sources.id = relationships.source_id
          AND sources.user_id = relationships.user_id
          AND sources.series_id = relationships.series_id
        WHERE relationships.user_id = ? AND relationships.series_id = ?
          AND relationships.epistemic_status = 'fact'
          AND sources.project_id = ?
          AND sources.section_id IS NOT NULL
        ORDER BY relationships.id ASC`,
    )
    .all(userId, project.series_id, project.id) as unknown as RelationshipRow[];
  const groups = new Map<
    string,
    { rows: RelationshipRow[]; anchorsById: Map<string, SlateContinuitySourceAnchor[]> }
  >();
  for (const relationship of relationships) {
    const state = relationship.state.trim();
    if (!state || hasAmbiguityCue(state)) continue;
    const exactAnchors = anchors.fromJson(relationship.anchors_json);
    if (exactAnchors.length === 0) continue;
    const key = [
      relationship.source_section_id,
      relationship.from_entity_id,
      relationship.to_entity_id,
      normalized(relationship.kind),
    ].join("\u0000");
    const group = groups.get(key) ?? {
      rows: [],
      anchorsById: new Map<string, SlateContinuitySourceAnchor[]>(),
    };
    group.rows.push(relationship);
    group.anchorsById.set(relationship.id, exactAnchors);
    groups.set(key, group);
  }

  const result: ConcernCandidate[] = [];
  for (const group of groups.values()) {
    const states = new Map<string, RelationshipRow[]>();
    for (const relationship of group.rows) {
      const key = normalized(relationship.state);
      const rows = states.get(key) ?? [];
      rows.push(relationship);
      states.set(key, rows);
    }
    if (states.size < 2) continue;
    const involved = [...states.values()].flat();
    const first = involved[0]!;
    const mergedAnchors = mergeAnchors(
      ...involved.map(
        (relationship) => group.anchorsById.get(relationship.id) ?? [],
      ),
    );
    if (mergedAnchors.length === 0) continue;
    const from =
      entities.get(first.from_entity_id)?.canonical_name ?? "One character";
    const to =
      entities.get(first.to_entity_id)?.canonical_name ?? "another character";
    const labels = uniqueSorted(involved.map((relationship) => relationship.state));
    result.push({
      id: stableConcernId([
        project.id,
        "relationship_conflict",
        first.source_section_id,
        first.from_entity_id,
        first.to_entity_id,
        normalized(first.kind),
      ]),
      kind: "relationship_conflict",
      severity: "important",
      summary: `${from} and ${to} have conflicting relationship states.`,
      explanation: `At the same planned section stage, “${first.kind}” is recorded as ${labels.join(" / ")}. Beliefs, rumors, mysteries, ambiguities, and uncertain wording are excluded.`,
      claimIds: [],
      anchors: mergedAnchors,
      recommendedResolution: "update_canon",
    });
  }
  return result;
}

function knowledgeLeakCandidates(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  entities: ReadonlyMap<string, EntityRow>,
  anchors: ExactAnchorResolver,
): ConcernCandidate[] {
  const rows = db
    .prepare(
      `SELECT knowledge.id, knowledge.character_entity_id, knowledge.claim_id,
              knowledge.learned_event_id, knowledge.status,
              knowledge.anchors_json, knowledge.source_id,
              knowledge_source.section_id AS knowledge_section_id,
              knowledge_section.ordinal AS knowledge_ordinal,
              learned.section_id AS learned_section_id,
              learned_section.ordinal AS learned_ordinal,
              learned.anchors_json AS event_anchors_json,
              learned.title AS event_title,
              claims.anchors_json AS claim_anchors_json,
              claims.predicate AS claim_predicate,
              claims.value AS claim_value,
              claims.subject_entity_id AS claim_subject_entity_id
         FROM slate_continuity_knowledge AS knowledge
         JOIN slate_continuity_sources AS knowledge_source
           ON knowledge_source.id = knowledge.source_id
          AND knowledge_source.user_id = knowledge.user_id
         JOIN slate_sections AS knowledge_section
           ON knowledge_section.id = knowledge_source.section_id
          AND knowledge_section.user_id = knowledge.user_id
         JOIN slate_continuity_events AS learned
           ON learned.id = knowledge.learned_event_id
          AND learned.user_id = knowledge.user_id
         JOIN slate_sections AS learned_section
           ON learned_section.id = learned.section_id
          AND learned_section.user_id = learned.user_id
         JOIN slate_continuity_claims AS claims
           ON claims.id = knowledge.claim_id
          AND claims.user_id = knowledge.user_id
        WHERE knowledge.user_id = ? AND knowledge.series_id = ?
          AND knowledge.status = 'knows'
          AND knowledge.learned_event_id IS NOT NULL
          AND claims.epistemic_status = 'fact'
          AND knowledge_source.project_id = ?
          AND learned.project_id = ?
          AND knowledge_section.project_id = ?
          AND learned_section.project_id = ?
          AND knowledge_section.ordinal < learned_section.ordinal
          AND NOT EXISTS (
            SELECT 1 FROM slate_continuity_claims AS replacement
             WHERE replacement.user_id = claims.user_id
               AND replacement.supersedes_claim_id = claims.id
          )
        ORDER BY knowledge.id ASC`,
    )
    .all(
      userId,
      project.series_id,
      project.id,
      project.id,
      project.id,
      project.id,
    ) as unknown as KnowledgeRow[];
  const result: ConcernCandidate[] = [];
  for (const row of rows) {
    const knowledgeAnchors = anchors.fromJson(row.anchors_json);
    const claimAnchors = anchors.fromJson(row.claim_anchors_json);
    const eventAnchors = anchors.fromJson(row.event_anchors_json);
    if (
      knowledgeAnchors.length === 0 ||
      claimAnchors.length === 0 ||
      eventAnchors.length === 0
    ) {
      continue;
    }
    const mergedAnchors = mergeAnchors(
      knowledgeAnchors,
      claimAnchors,
      eventAnchors,
    );
    if (mergedAnchors.length === 0) continue;
    const character =
      entities.get(row.character_entity_id)?.canonical_name ?? "A character";
    const subject = row.claim_subject_entity_id
      ? entities.get(row.claim_subject_entity_id)?.canonical_name ?? "the fact"
      : "the fact";
    result.push({
      id: stableConcernId([
        project.id,
        "knowledge_leak",
        row.character_entity_id,
        row.claim_id,
        row.learned_event_id,
      ]),
      kind: "knowledge_leak",
      severity: "important",
      summary: `${character} knows something before learning it.`,
      explanation: `${character} is recorded as knowing “${subject} ${row.claim_predicate} ${row.claim_value}” in section ${row.knowledge_ordinal + 1}, before “${row.event_title}” in section ${row.learned_ordinal + 1}.`,
      claimIds: [row.claim_id],
      anchors: mergedAnchors,
      recommendedResolution: "revise_prose",
    });
  }
  return result;
}

function dueThreadCandidates(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  stage: SectionRow | null,
  anchors: ExactAnchorResolver,
): ConcernCandidate[] {
  if (!stage) return [];
  const lastSection = db
    .prepare(
      `SELECT MAX(ordinal) AS ordinal FROM slate_sections
        WHERE user_id = ? AND project_id = ?`,
    )
    .get(userId, project.id) as { ordinal: number | null };
  const isActMilestone = stage.kind === "act";
  const isBookMilestone =
    lastSection.ordinal !== null && stage.ordinal >= Number(lastSection.ordinal);
  const rows = db
    .prepare(
      `SELECT threads.id, threads.label, threads.status, threads.due_section_id,
              due.ordinal AS due_ordinal, due.project_id AS due_project_id,
              due.kind AS due_kind, due.title AS due_title,
              threads.anchors_json, threads.source_id
         FROM slate_continuity_threads AS threads
         LEFT JOIN slate_sections AS due
           ON due.id = threads.due_section_id
          AND due.user_id = threads.user_id
        WHERE threads.user_id = ? AND threads.series_id = ?
          AND threads.status IN ('open', 'due')
        ORDER BY threads.id ASC`,
    )
    .all(userId, project.series_id) as unknown as ThreadRow[];
  const result: ConcernCandidate[] = [];
  for (const row of rows) {
    const reachedPlannedDueSection =
      row.due_project_id === project.id &&
      row.due_ordinal !== null &&
      Number(row.due_ordinal) <= stage.ordinal;
    const explicitlyDueAtMilestone =
      row.status === "due" &&
      row.due_section_id === null &&
      (isActMilestone || isBookMilestone);
    if (!reachedPlannedDueSection && !explicitlyDueAtMilestone) continue;
    const exactAnchors = anchors.fromJson(row.anchors_json);
    if (exactAnchors.length === 0) continue;
    const dueLabel = reachedPlannedDueSection
      ? row.due_kind === "act"
        ? `at the planned act milestone “${row.due_title ?? `Act ${Number(row.due_ordinal) + 1}`}”`
        : `by the planned section “${row.due_title ?? Number(row.due_ordinal) + 1}”`
      : isBookMilestone
        ? "at the book milestone"
        : `at the act milestone “${stage.title}”`;
    result.push({
      id: stableConcernId([project.id, "due_thread", row.id]),
      kind: "due_thread",
      severity: "note",
      summary: `A story thread is due: ${row.label}`,
      explanation: `“${row.label}” was marked for attention ${dueLabel}; unrelated open threads remain quiet.`,
      claimIds: [],
      anchors: exactAnchors,
      recommendedResolution: "defer_thread",
    });
  }
  return result;
}

function upsertCandidate(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  stage: SectionRow | null,
  candidate: ConcernCandidate,
  anchors: ExactAnchorResolver,
  now: string,
): { inserted: boolean; preserved: boolean } {
  const existing = db
    .prepare(
      `SELECT status, anchors_json, claim_ids_json
         FROM slate_continuity_concerns
        WHERE id = ? AND user_id = ? AND series_id = ?`,
    )
    .get(candidate.id, userId, project.series_id) as
    | ExistingConcernRow
    | undefined;
  const versions = JSON.stringify(currentContinuityProducerVersions());
  if (!existing) {
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         recommended_resolution, resolution_json, producer_versions_json,
         created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    ).run(
      candidate.id,
      userId,
      project.series_id,
      project.id,
      stage?.id ?? null,
      stage ? "section" : "book",
      candidate.kind,
      candidate.severity,
      candidate.summary,
      candidate.explanation,
      JSON.stringify(candidate.claimIds),
      JSON.stringify(candidate.anchors),
      candidate.recommendedResolution,
      versions,
      now,
    );
    return { inserted: true, preserved: false };
  }

  const existingAnchors = anchors.fromJson(existing.anchors_json);
  const existingClaimIds = parseJson<unknown>(existing.claim_ids_json, []);
  const mergedClaimIds = uniqueSorted([
    ...candidate.claimIds,
    ...(Array.isArray(existingClaimIds)
      ? existingClaimIds.filter((value): value is string => typeof value === "string")
      : []),
  ]);
  db.prepare(
    `UPDATE slate_continuity_concerns
        SET project_id = ?, section_id = ?, scope_kind = ?, kind = ?,
            severity = ?, summary = ?, explanation = ?, claim_ids_json = ?,
            anchors_json = ?, recommended_resolution = ?,
            producer_versions_json = ?
      WHERE id = ? AND user_id = ? AND series_id = ?`,
  ).run(
    project.id,
    stage?.id ?? null,
    stage ? "section" : "book",
    candidate.kind,
    candidate.severity,
    candidate.summary,
    candidate.explanation,
    JSON.stringify(mergedClaimIds),
    JSON.stringify(mergeAnchors(existingAnchors, candidate.anchors)),
    candidate.recommendedResolution,
    versions,
    candidate.id,
    userId,
    project.series_id,
  );
  return {
    inserted: false,
    preserved: existing.status !== "open",
  };
}

function resolveObsoleteOpenConcerns(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  detectedIds: ReadonlySet<string>,
  anchors: ExactAnchorResolver,
  now: string,
): void {
  const activeThreadConcernIds = new Set(
    (
      db
        .prepare(
          `SELECT id FROM slate_continuity_threads
            WHERE user_id = ? AND series_id = ?
              AND status IN ('open', 'due')`,
        )
        .all(userId, project.series_id) as Array<{ id: string }>
    ).map((thread) =>
      stableConcernId([project.id, "due_thread", thread.id]),
    ),
  );
  const open = db
    .prepare(
      `SELECT id, kind, anchors_json
         FROM slate_continuity_concerns
        WHERE user_id = ? AND series_id = ? AND project_id = ?
          AND status = 'open'`,
    )
    .all(userId, project.series_id, project.id) as unknown as Array<{
    id: string;
    kind: SlateContinuityConcernKind;
    anchors_json: string;
  }>;
  const resolve = db.prepare(
    `UPDATE slate_continuity_concerns
        SET status = 'resolved', resolved_at = ?, resolution_json = ?
      WHERE id = ? AND user_id = ? AND series_id = ? AND status = 'open'`,
  );
  for (const concern of open) {
    if (detectedIds.has(concern.id)) continue;
    const deterministicMissing =
      concern.id.startsWith(`${DETERMINISTIC_CONCERN_PREFIX}-`) &&
      (concern.kind !== "due_thread" ||
        !activeThreadConcernIds.has(concern.id));
    const sourceEvidenceChanged = anchors.hasStaleAnchor(
      concern.anchors_json,
    );
    if (!deterministicMissing && !sourceEvidenceChanged) continue;
    resolve.run(
      now,
      JSON.stringify({
        kind: "continuity_auto_resolved",
        reason: "source_changed_or_no_longer_detected",
        resolvedAt: now,
      }),
      concern.id,
      userId,
      project.series_id,
    );
  }
}

/**
 * Deterministic scan/persistence hook for callers that already own a database
 * transaction. It never starts, commits, or rolls back that transaction.
 */
export function detectAndPersistSlateContinuityConcernsInTransaction(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  options: SlateContinuityConcernScanOptions = {},
): SlateContinuityConcernScanResult {
  const now = validNow(options.now);
  const project = projectForUser(db, userId, projectId);
  const stage = currentStage(
    db,
    userId,
    projectId,
    options.currentSectionId,
  );
  const entities = entitiesForSeries(db, userId, project.series_id);
  const anchorResolver = new SlateContinuityCurrentCanonResolver(
    db,
    userId,
    project.series_id,
  );
  const candidates = [
    ...factConflictCandidates(
      db,
      userId,
      project,
      stage,
      entities,
      anchorResolver,
    ),
    ...locationImpossibilityCandidates(
      db,
      userId,
      project,
      entities,
      anchorResolver,
    ),
    ...relationshipConflictCandidates(
      db,
      userId,
      project,
      entities,
      anchorResolver,
    ),
    ...knowledgeLeakCandidates(
      db,
      userId,
      project,
      entities,
      anchorResolver,
    ),
    ...dueThreadCandidates(
      db,
      userId,
      project,
      stage,
      anchorResolver,
    ),
  ];
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  let inserted = 0;
  let updated = 0;
  let preservedWriterState = 0;
  for (const candidate of uniqueCandidates.values()) {
    const result = upsertCandidate(
      db,
      userId,
      project,
      stage,
      candidate,
      anchorResolver,
      now,
    );
    if (result.inserted) inserted += 1;
    else updated += 1;
    if (result.preserved) preservedWriterState += 1;
  }
  resolveObsoleteOpenConcerns(
    db,
    userId,
    project,
    new Set(uniqueCandidates.keys()),
    anchorResolver,
    now,
  );
  return {
    projectId,
    seriesId: project.series_id,
    currentSectionId: stage?.id ?? null,
    detected: uniqueCandidates.size,
    inserted,
    updated,
    preservedWriterState,
    concernIds: [...uniqueCandidates.keys()].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function rollbackQuietly(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the scan failure.
  }
}

/** Safely owns the IMMEDIATE transaction for standalone concern scans. */
export function detectAndPersistSlateContinuityConcerns(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  options: SlateContinuityConcernScanOptions = {},
): SlateContinuityConcernScanResult {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = detectAndPersistSlateContinuityConcernsInTransaction(
      db,
      userId,
      projectId,
      options,
    );
    db.exec("COMMIT");
    return result;
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}
