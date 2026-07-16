import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_RETURN_SESSION_SCHEMA_VERSION,
  currentContinuityProducerVersions,
  type SlateReturnNextCard,
  type SlateReturnSectionReference,
  type SlateReturnSession,
  type SlateReturnSessionSynopsis,
  type SlateReturnThreadReference,
} from "@localai/shared";

export {
  SLATE_RETURN_SESSION_SCHEMA_VERSION,
  type SlateReturnNextCard,
  type SlateReturnNextCardKind,
  type SlateReturnSectionReference,
  type SlateReturnSession,
  type SlateReturnSessionListResponse,
  type SlateReturnSessionResponse,
  type SlateReturnSessionSynopsis,
  type SlateReturnThreadReference,
} from "@localai/shared";

type SlateScalar = string | number | null;
type SlateStateRow = Record<string, SlateScalar>;

interface ProjectRow {
  id: string;
  user_id: string;
  series_id: string;
  title: string;
  spark: string;
  premise: string;
  phase: string;
  structure_json: string;
  characters_json: string;
  unresolved_threads_json: string;
  manuscript: string;
  direction: string;
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

interface ThreadRow {
  id: string;
  project_id: string | null;
  section_id: string | null;
  label: string;
  status: string;
  due_section_id: string | null;
  updated_at: string;
}

interface ConcernRow {
  id: string;
  project_id: string | null;
  section_id: string | null;
  kind: string;
  severity: string;
  status: string;
  summary: string;
  explanation: string;
  recommended_resolution: string | null;
  created_at: string;
}

interface RevisionRow {
  id: string;
  structure_item_id: string | null;
  action: string;
  direction: string;
  status: string;
  created_at: string;
}

interface GenerationRow {
  id: string;
  generation: number;
  status: string;
  target_version: string;
  source_fingerprint: string;
  comparison_summary: string | null;
  producer_versions_json: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  project_id: string;
  source_fingerprint: string;
  synopsis_json: string;
  created_at: string;
}

interface LegacyThread {
  id: string;
  label: string;
  resolved: boolean;
}

interface CompiledReturnState {
  synopsis: SlateReturnSessionSynopsis;
  sourceFingerprint: string;
}

const LORE_COLLECTIONS = [
  {
    name: "sources",
    table: "slate_continuity_sources",
    columns: [
      "id", "project_id", "section_id", "scope_kind", "kind", "source_revision",
      "content_hash", "authority", "provider", "model", "producer_versions_json",
      "supersedes_source_id", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    name: "entities",
    table: "slate_continuity_entities",
    columns: [
      "id", "kind", "canonical_name", "description", "locked", "anchors_json",
      "source_id", "producer_versions_json", "updated_at",
    ],
    orderBy: "kind, canonical_name, id",
  },
  {
    name: "aliases",
    table: "slate_continuity_aliases",
    columns: ["id", "entity_id", "alias", "normalized_alias", "source_id", "created_at"],
    orderBy: "normalized_alias, id",
  },
  {
    name: "claims",
    table: "slate_continuity_claims",
    columns: [
      "id", "project_id", "section_id", "scope_kind", "subject_entity_id", "predicate",
      "object_entity_id", "value", "epistemic_status", "perspective_entity_id", "confidence",
      "anchors_json", "source_id", "supersedes_claim_id", "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    name: "events",
    table: "slate_continuity_events",
    columns: [
      "id", "project_id", "section_id", "scope_kind", "title", "description",
      "chronology_key", "participant_entity_ids_json", "location_entity_id", "anchors_json",
      "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "chronology_key, created_at, id",
  },
  {
    name: "relationships",
    table: "slate_continuity_relationships",
    columns: [
      "id", "from_entity_id", "to_entity_id", "kind", "state", "epistemic_status",
      "anchors_json", "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    name: "knowledge",
    table: "slate_continuity_knowledge",
    columns: [
      "id", "character_entity_id", "claim_id", "learned_event_id", "status", "anchors_json",
      "source_id", "producer_versions_json", "created_at",
    ],
    orderBy: "created_at, id",
  },
  {
    name: "threads",
    table: "slate_continuity_threads",
    columns: [
      "id", "project_id", "section_id", "scope_kind", "label", "status", "due_section_id",
      "anchors_json", "source_id", "producer_versions_json", "updated_at",
    ],
    orderBy: "updated_at, id",
  },
  {
    name: "concerns",
    table: "slate_continuity_concerns",
    columns: [
      "id", "project_id", "section_id", "scope_kind", "kind", "severity", "status",
      "summary", "explanation", "claim_ids_json", "anchors_json", "recommended_resolution",
      "resolution_json", "producer_versions_json", "created_at", "resolved_at",
    ],
    orderBy: "created_at, id",
  },
] as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
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

function wordCount(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function concise(value: string, maximum = 480): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maximum) return normalized;
  const cut = normalized.slice(0, maximum - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > maximum * 0.65 ? boundary : cut.length).trimEnd()}…`;
}

function projectRow(db: DatabaseSync, userId: string, projectId: string): ProjectRow {
  const row = db
    .prepare(
      `SELECT id, user_id, series_id, title, spark, premise, phase, structure_json,
              characters_json, unresolved_threads_json, manuscript, direction,
              continuity_active_version, continuity_target_version,
              continuity_active_generation, continuity_previous_generation,
              continuity_upgrade_status, continuity_last_success_at
         FROM slate_projects WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row) throw new Error("Slate project not found.");
  if (!row.series_id) throw new Error("Slate project does not have a series.");
  return row;
}

function scalarRows(
  db: DatabaseSync,
  sql: string,
  ...parameters: Array<string | number | null>
): SlateStateRow[] {
  const rows = db.prepare(sql).all(...parameters) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const result: SlateStateRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Slate return session cannot fingerprint ${key}.`);
      }
      result[key] = value;
    }
    return result;
  });
}

function sectionKind(value: string): SlateReturnSectionReference["kind"] {
  return value === "act" || value === "chapter" || value === "scene" ? value : "imported";
}

function sectionStatus(value: string): SlateReturnSectionReference["status"] {
  return value === "drafting" || value === "drafted" || value === "revising" || value === "complete"
    ? value
    : "planned";
}

function sectionReference(row: SectionRow): SlateReturnSectionReference {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    direction: row.direction,
    kind: sectionKind(row.kind),
    status: sectionStatus(row.status),
    ordinal: Number(row.ordinal),
    wordCount: wordCount(row.prose),
  };
}

function legacyThreads(project: ProjectRow): LegacyThread[] {
  const parsed = parseJson<unknown>(project.unresolved_threads_json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.label !== "string" || !item.label.trim()) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `legacy-${index}`,
      label: item.label.trim(),
      resolved: item.resolved === true,
    }];
  });
}

function upgradeStatus(value: string): SlateReturnSessionSynopsis["continuity"]["upgradeStatus"] {
  return value === "building" || value === "review" || value === "deferred" || value === "failed"
    ? value
    : "current";
}

function severityRank(value: string): number {
  if (value === "critical") return 0;
  if (value === "important") return 1;
  return 2;
}

function relevantProject(projectId: string, value: string | null): boolean {
  return value === null || value === projectId;
}

function mergedThreads(
  project: ProjectRow,
  continuityThreads: readonly ThreadRow[],
): SlateReturnThreadReference[] {
  const byLabel = new Map<string, SlateReturnThreadReference>();
  for (const thread of continuityThreads) {
    if (!relevantProject(project.id, thread.project_id)) continue;
    if (thread.status !== "open" && thread.status !== "due") continue;
    const normalized = thread.label.normalize("NFKC").trim().toLocaleLowerCase();
    if (!normalized) continue;
    const candidate: SlateReturnThreadReference = {
      id: thread.id,
      label: thread.label.trim(),
      status: thread.status,
      dueSectionId: thread.due_section_id,
    };
    const current = byLabel.get(normalized);
    if (!current || candidate.status === "due") byLabel.set(normalized, candidate);
  }
  for (const thread of legacyThreads(project)) {
    if (thread.resolved) continue;
    const normalized = thread.label.normalize("NFKC").trim().toLocaleLowerCase();
    if (!normalized || byLabel.has(normalized)) continue;
    byLabel.set(normalized, {
      id: `legacy:${thread.id}`,
      label: thread.label,
      status: "open",
      dueSectionId: null,
    });
  }
  return [...byLabel.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === "due" ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
}

function nextCard(input: {
  project: ProjectRow;
  openCanonRisks: ConcernRow[];
  dueThreadConcern: ConcernRow | null;
  threads: SlateReturnThreadReference[];
  reviewGeneration: GenerationRow | null;
  pendingRevision: RevisionRow | null;
  nextPlannedSection: SlateReturnSectionReference | null;
  mostRecentSection: SlateReturnSectionReference | null;
}): SlateReturnNextCard {
  const concern = input.openCanonRisks[0];
  if (concern) {
    return {
      kind: "canon_risk",
      priority: 1,
      title: concise(concern.summary, 120) || "Reconcile a continuity concern",
      body: concise(concern.explanation || concern.summary),
      actionLabel: "Reconcile",
      target: { kind: "concern", id: concern.id },
    };
  }
  const dueThread = input.threads.find((thread) => thread.status === "due");
  if (dueThread) {
    return {
      kind: "due_thread",
      priority: 2,
      title: `Bring back ${concise(dueThread.label, 100)}`,
      body: "This thread is narratively due. Decide how it should return before Slate writes past it.",
      actionLabel: "Direct the return",
      target: { kind: "thread", id: dueThread.id },
    };
  }
  if (input.dueThreadConcern) {
    return {
      kind: "due_thread",
      priority: 2,
      title: concise(input.dueThreadConcern.summary, 120),
      body: concise(input.dueThreadConcern.explanation || "This unresolved thread is now due."),
      actionLabel: "Direct the return",
      target: { kind: "concern", id: input.dueThreadConcern.id },
    };
  }
  if (input.project.continuity_upgrade_status === "review") {
    return {
      kind: "continuity_upgrade",
      priority: 3,
      title: "Review Continuity’s update",
      body: concise(
        input.reviewGeneration?.comparison_summary ||
          "Continuity found a material change and is waiting for your direction.",
      ),
      actionLabel: "Review update",
      target: input.reviewGeneration
        ? { kind: "generation", id: input.reviewGeneration.id }
        : { kind: "project", id: input.project.id },
    };
  }
  if (input.pendingRevision) {
    return {
      kind: "review_revision",
      priority: 4,
      title: "Review Slate’s proposed revision",
      body: concise(
        input.pendingRevision.direction ||
          `Slate has a ${input.pendingRevision.action || "revision"} ready for your decision.`,
      ),
      actionLabel: "Review revision",
      target: { kind: "revision", id: input.pendingRevision.id },
    };
  }
  if (input.nextPlannedSection) {
    return {
      kind: "draft_section",
      priority: 4,
      title: `Draft ${input.nextPlannedSection.title}`,
      body: concise(
        input.nextPlannedSection.direction ||
          input.nextPlannedSection.summary ||
          "Set the direction, then let Slate write the next section.",
      ),
      actionLabel: "Draft next",
      target: { kind: "section", id: input.nextPlannedSection.id },
    };
  }
  if (input.mostRecentSection) {
    return {
      kind: "refine_section",
      priority: 4,
      title: `Refine ${input.mostRecentSection.title}`,
      body: "The planned draft is complete. Choose one meaningful pass for the latest section.",
      actionLabel: "Refine prose",
      target: { kind: "section", id: input.mostRecentSection.id },
    };
  }
  return {
    kind: "shape_story",
    priority: 4,
    title: "Shape the opening",
    body: concise(input.project.direction || "Give Slate the first scene you want to make inevitable."),
    actionLabel: "Shape the story",
    target: { kind: "project", id: input.project.id },
  };
}

function validateSynopsis(
  value: unknown,
  projectId: string,
  sourceFingerprint: string,
): SlateReturnSessionSynopsis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Slate return session synopsis is invalid.");
  }
  const synopsis = value as Partial<SlateReturnSessionSynopsis>;
  if (
    synopsis.schemaVersion !== SLATE_RETURN_SESSION_SCHEMA_VERSION ||
    synopsis.projectId !== projectId ||
    synopsis.sourceFingerprint !== sourceFingerprint ||
    !synopsis.nextCard ||
    Array.isArray(synopsis.nextCard) ||
    typeof synopsis.nextCard.kind !== "string"
  ) {
    throw new Error("Slate return session synopsis is invalid.");
  }
  return synopsis as SlateReturnSessionSynopsis;
}

export function compileSlateReturnSynopsis(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  now = new Date(),
): CompiledReturnState {
  const project = projectRow(db, userId, projectId);
  const sections = db
    .prepare(
      `SELECT id, project_id, series_id, parent_section_id, structure_item_id,
              kind, ordinal, title, summary, direction, prose, locked_ranges_json,
              locked, status, revision, content_hash, updated_at
         FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal, id`,
    )
    .all(projectId, userId) as unknown as SectionRow[];
  const revisions = db
    .prepare(
      `SELECT id, structure_item_id, action, direction, status, created_at
         FROM slate_revisions
        WHERE project_id = ? AND user_id = ?
        ORDER BY created_at, id`,
    )
    .all(projectId, userId) as unknown as RevisionRow[];
  const threads = db
    .prepare(
      `SELECT id, project_id, section_id, label, status, due_section_id, updated_at
         FROM slate_continuity_threads
        WHERE series_id = ? AND user_id = ?
        ORDER BY updated_at, id`,
    )
    .all(project.series_id, userId) as unknown as ThreadRow[];
  const concerns = db
    .prepare(
      `SELECT id, project_id, section_id, kind, severity, status, summary,
              explanation, recommended_resolution, created_at
         FROM slate_continuity_concerns
        WHERE series_id = ? AND user_id = ?
        ORDER BY created_at, id`,
    )
    .all(project.series_id, userId) as unknown as ConcernRow[];
  const generations = db
    .prepare(
      `SELECT id, generation, status, target_version, source_fingerprint,
              comparison_summary, producer_versions_json, created_at
         FROM slate_continuity_generations
        WHERE project_id = ? AND user_id = ?
        ORDER BY generation, id`,
    )
    .all(projectId, userId) as unknown as GenerationRow[];
  const lore: Record<string, SlateStateRow[]> = {};
  for (const collection of LORE_COLLECTIONS) {
    lore[collection.name] = scalarRows(
      db,
      `SELECT ${collection.columns.join(", ")} FROM ${collection.table}
        WHERE series_id = ? AND user_id = ? ORDER BY ${collection.orderBy}`,
      project.series_id,
      userId,
    );
  }
  const producerVersions = currentContinuityProducerVersions();
  const sourceState = {
    schemaVersion: SLATE_RETURN_SESSION_SCHEMA_VERSION,
    producerVersions,
    project: {
      id: project.id,
      seriesId: project.series_id,
      title: project.title,
      spark: project.spark,
      premise: project.premise,
      phase: project.phase,
      structureJson: project.structure_json,
      charactersJson: project.characters_json,
      unresolvedThreadsJson: project.unresolved_threads_json,
      legacyManuscriptHash: sections.length === 0 ? sha256(project.manuscript) : null,
      direction: project.direction,
      continuityActiveVersion: project.continuity_active_version,
      continuityTargetVersion: project.continuity_target_version,
      continuityActiveGeneration: project.continuity_active_generation,
      continuityPreviousGeneration: project.continuity_previous_generation,
      continuityUpgradeStatus: project.continuity_upgrade_status,
      continuityLastSuccessAt: project.continuity_last_success_at,
    },
    sections: sections.map((section) => ({
      id: section.id,
      parentSectionId: section.parent_section_id,
      structureItemId: section.structure_item_id,
      kind: section.kind,
      ordinal: section.ordinal,
      title: section.title,
      summary: section.summary,
      direction: section.direction,
      lockedRangesJson: section.locked_ranges_json,
      locked: section.locked,
      status: section.status,
      revision: section.revision,
      contentHash: section.content_hash,
    })),
    revisions: scalarRows(
      db,
      `SELECT id, action, scope, structure_item_id, selection_start, selection_end,
              direction, original_text, proposed_text, status, provider, model,
              created_at, resolved_at
         FROM slate_revisions
        WHERE project_id = ? AND user_id = ? ORDER BY created_at, id`,
      projectId,
      userId,
    ),
    lore,
    generations: scalarRows(
      db,
      `SELECT id, generation, status, target_version, source_fingerprint,
              comparison_summary, producer_versions_json, created_at, completed_at
         FROM slate_continuity_generations
        WHERE project_id = ? AND user_id = ? ORDER BY generation, id`,
      projectId,
      userId,
    ),
  };
  const sourceFingerprint = sha256(canonicalJson(sourceState));

  const draftedSections = sections.filter((section) => section.prose.trim().length > 0);
  const structuralDraftables = sections.filter(
    (section) => section.kind === "scene" || section.kind === "imported",
  );
  const draftableSections = structuralDraftables.length > 0 ? structuralDraftables : sections;
  const plannedSections = draftableSections.filter((section) => section.prose.trim().length === 0);
  const nextPlanned = plannedSections[0] ? sectionReference(plannedSections[0]) : null;
  const mostRecentRow = [...draftedSections].sort((left, right) => {
    const byUpdated = Date.parse(right.updated_at) - Date.parse(left.updated_at);
    return byUpdated || right.ordinal - left.ordinal || right.id.localeCompare(left.id);
  })[0] ?? null;
  const mostRecent = mostRecentRow ? sectionReference(mostRecentRow) : null;
  const manuscriptWordCount = sections.length > 0
    ? draftedSections.reduce((total, section) => total + wordCount(section.prose), 0)
    : wordCount(project.manuscript);
  const draftedCount = sections.length > 0
    ? draftableSections.filter((section) => section.prose.trim().length > 0).length
    : project.manuscript.trim() ? 1 : 0;
  const relevantConcerns = concerns.filter(
    (concern) => relevantProject(projectId, concern.project_id) && concern.status === "open",
  );
  const openCanonRisks = relevantConcerns
    .filter((concern) => concern.kind !== "due_thread")
    .sort((left, right) =>
      severityRank(left.severity) - severityRank(right.severity) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
    );
  const dueThreadConcern = relevantConcerns.find((concern) => concern.kind === "due_thread") ?? null;
  const allThreads = mergedThreads(project, threads);
  const dueThreads = allThreads.filter((thread) => thread.status === "due");
  const pendingRevision = [...revisions]
    .filter((revision) => revision.status === "pending")
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0] ?? null;
  const reviewGeneration = [...generations]
    .filter((generation) => generation.status === "ready")
    .sort((left, right) => right.generation - left.generation)[0] ?? null;
  const sectionSummaries = draftedSections
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((section) => concise(section.summary, 360))
    .filter(Boolean)
    .slice(-3);
  const premise = concise(project.premise || project.spark, 900);
  const storySoFar = sectionSummaries.length > 0
    ? concise(`${premise}${premise ? " " : ""}Drafted so far: ${sectionSummaries.join(" ")}`, 1_800)
    : mostRecent
      ? concise(`${premise}${premise ? " " : ""}The manuscript has reached ${mostRecent.title}.`, 1_800)
      : premise || "The story is still taking shape.";
  const draftedProgress = manuscriptWordCount === 0
    ? "The manuscript has not begun yet."
    : draftedCount === 0
      ? `${manuscriptWordCount.toLocaleString("en-US")} words drafted across the current manuscript.`
      : `${draftedCount} of ${Math.max(draftableSections.length, draftedCount)} planned sections drafted · ${manuscriptWordCount.toLocaleString("en-US")} words.`;
  const trajectory = nextPlanned
    ? concise(`Next: ${nextPlanned.title}. ${nextPlanned.summary || nextPlanned.direction}`, 900)
    : project.direction.trim()
      ? concise(project.direction, 900)
      : "The current plan is drafted; the next move is refinement or a new structural direction.";
  const entityRows = lore.entities ?? [];
  const projectCharacters = parseJson<unknown>(project.characters_json, []);
  const characterCount = Math.max(
    Array.isArray(projectCharacters) ? projectCharacters.length : 0,
    entityRows.filter((entity) => entity.kind === "character").length,
  );
  const synopsis: SlateReturnSessionSynopsis = {
    schemaVersion: SLATE_RETURN_SESSION_SCHEMA_VERSION,
    producerVersions,
    sourceFingerprint,
    generatedAt: now.toISOString(),
    projectId: project.id,
    seriesId: project.series_id,
    title: project.title,
    premise,
    storySoFar,
    draftedProgress,
    trajectory,
    mostRecentSection: mostRecent,
    nextPlannedSection: nextPlanned,
    threads: {
      open: allThreads.filter((thread) => thread.status === "open").slice(0, 3),
      due: dueThreads.slice(0, 3),
    },
    counts: {
      sectionCount: sections.length || (project.manuscript.trim() ? 1 : 0),
      draftedSectionCount: draftedCount,
      plannedSectionCount: plannedSections.length,
      wordCount: manuscriptWordCount,
      openThreadCount: allThreads.length,
      dueThreadCount: dueThreads.length + (dueThreadConcern ? 1 : 0),
      openConcernCount: relevantConcerns.length,
      canonRiskCount: openCanonRisks.length,
      pendingRevisionCount: revisions.filter((revision) => revision.status === "pending").length,
      entityCount: entityRows.length,
      characterCount,
      claimCount: lore.claims?.length ?? 0,
      eventCount: lore.events?.length ?? 0,
    },
    continuity: {
      activeVersion: project.continuity_active_version,
      targetVersion: project.continuity_target_version,
      activeGeneration: Number(project.continuity_active_generation),
      upgradeStatus: upgradeStatus(project.continuity_upgrade_status),
      lastSuccessfulAt: project.continuity_last_success_at,
    },
    nextCard: nextCard({
      project,
      openCanonRisks,
      dueThreadConcern,
      threads: allThreads,
      reviewGeneration,
      pendingRevision,
      nextPlannedSection: nextPlanned,
      mostRecentSection: mostRecent,
    }),
  };
  return { synopsis, sourceFingerprint };
}

function sessionFromRow(
  row: SessionRow,
  currentFingerprint: string,
  reused: boolean,
): SlateReturnSession {
  const synopsis = validateSynopsis(
    parseJson<unknown>(row.synopsis_json, null),
    row.project_id,
    row.source_fingerprint,
  );
  return {
    id: row.id,
    projectId: row.project_id,
    sourceFingerprint: row.source_fingerprint,
    synopsis,
    createdAt: row.created_at,
    reused,
    isCurrent: row.source_fingerprint === currentFingerprint,
  };
}

export function openSlateReturnSession(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  now = new Date(),
  options: { maxReuseAgeMs?: number } = {},
): SlateReturnSession {
  const compiled = compileSlateReturnSynopsis(db, userId, projectId, now);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const existingRows = db
      .prepare(
        `SELECT * FROM slate_return_sessions
          WHERE user_id = ? AND project_id = ? AND source_fingerprint = ?
          ORDER BY created_at DESC, id DESC`,
      )
      .all(userId, projectId, compiled.sourceFingerprint) as unknown as SessionRow[];
    for (const row of existingRows) {
      try {
        const maxReuseAgeMs = options.maxReuseAgeMs;
        if (
          typeof maxReuseAgeMs === "number" &&
          Number.isFinite(maxReuseAgeMs) &&
          maxReuseAgeMs >= 0 &&
          now.getTime() - new Date(row.created_at).getTime() > maxReuseAgeMs
        ) {
          continue;
        }
        const existing = sessionFromRow(row, compiled.sourceFingerprint, true);
        db.exec("COMMIT");
        return existing;
      } catch {
        // A corrupt cached recap is ignored; authoritative state is recompiled.
      }
    }
    const id = randomUUID();
    const createdAt = now.toISOString();
    db.prepare(
      `INSERT INTO slate_return_sessions
        (id, user_id, project_id, source_fingerprint, synopsis_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      projectId,
      compiled.sourceFingerprint,
      canonicalJson(compiled.synopsis),
      createdAt,
    );
    const row = db
      .prepare("SELECT * FROM slate_return_sessions WHERE id = ? AND user_id = ?")
      .get(id, userId) as unknown as SessionRow | undefined;
    if (!row) throw new Error("Slate return session could not be reopened.");
    db.exec("COMMIT");
    return sessionFromRow(row, compiled.sourceFingerprint, false);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSlateReturnSession(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sessionId: string,
): SlateReturnSession {
  const row = db
    .prepare(
      `SELECT * FROM slate_return_sessions
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(sessionId, projectId, userId) as SessionRow | undefined;
  if (!row) throw new Error("Slate return session not found.");
  const current = compileSlateReturnSynopsis(db, userId, projectId);
  return sessionFromRow(row, current.sourceFingerprint, false);
}

export function listSlateReturnSessions(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  limit = 20,
): SlateReturnSession[] {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 20;
  const current = compileSlateReturnSynopsis(db, userId, projectId);
  const rows = db
    .prepare(
      `SELECT * FROM slate_return_sessions
        WHERE project_id = ? AND user_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(projectId, userId, safeLimit) as unknown as SessionRow[];
  return rows.flatMap((row) => {
    try {
      return [sessionFromRow(row, current.sourceFingerprint, false)];
    } catch {
      return [];
    }
  });
}
