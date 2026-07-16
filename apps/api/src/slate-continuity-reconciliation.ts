import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type SlateContinuityConcern,
  type SlateContinuityConcernCard,
  type SlateContinuityConcernKind,
  type SlateContinuityConcernPassage,
  type SlateContinuityConcernSeverity,
  type SlateContinuityConcernStatus,
  type SlateContinuityResolutionKind,
  type SlateContinuitySourceAnchor,
  type SlateRevisionRequest,
} from "@localai/shared";
import { slateSectionProjectionSpans } from "./slate-continuity.ts";

const DIRECTION_MAX = 8_000;

interface ProjectRow {
  id: string;
  series_id: string;
}

interface ConcernRow {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string | null;
  section_id: string | null;
  scope_kind: string;
  kind: string;
  severity: string;
  status: string;
  summary: string;
  explanation: string;
  claim_ids_json: string;
  anchors_json: string;
  recommended_resolution: string | null;
  resolution_json: string | null;
  producer_versions_json: string;
  created_at: string;
  resolved_at: string | null;
}

interface SourceRow {
  id: string;
  section_id: string | null;
  source_revision: number;
  content: string;
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
  perspective_entity_id: string | null;
  confidence: number;
}

interface ResolutionRecord {
  version: 1;
  kind: SlateContinuityResolutionKind;
  direction: string;
  sourceId: string | null;
  revisionId: string | null;
  recordedAt: string;
  revisionOutcome?: "accepted" | "rejected";
}

export class SlateContinuityReconciliationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "slate_continuity_reconciliation") {
    super(message);
    this.name = "SlateContinuityReconciliationError";
    this.status = status;
    this.code = code;
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function boundedDirection(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new SlateContinuityReconciliationError("Continuity direction must be text.");
  }
  const direction = value.normalize("NFKC").trim();
  if (direction.length > DIRECTION_MAX) {
    throw new SlateContinuityReconciliationError(
      `Continuity direction must be ${DIRECTION_MAX.toLocaleString()} characters or fewer.`,
    );
  }
  return direction;
}

function projectForUser(db: DatabaseSync, userId: string, projectId: string): ProjectRow {
  const row = db
    .prepare("SELECT id, series_id FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row) {
    throw new SlateContinuityReconciliationError("Slate project not found.", 404, "slate_project_not_found");
  }
  return row;
}

function concernKind(value: string): SlateContinuityConcernKind {
  if (
    value === "factual_contradiction" ||
    value === "timeline_impossibility" ||
    value === "knowledge_leak" ||
    value === "state_conflict" ||
    value === "relationship_conflict" ||
    value === "world_rule_conflict" ||
    value === "non_negotiable_conflict" ||
    value === "due_thread" ||
    value === "ambiguous_extraction"
  ) {
    return value;
  }
  return "ambiguous_extraction";
}

function concernSeverity(value: string): SlateContinuityConcernSeverity {
  return value === "critical" || value === "important" ? value : "note";
}

function concernStatus(value: string): SlateContinuityConcernStatus {
  if (
    value === "intentional" ||
    value === "deferred" ||
    value === "resolved" ||
    value === "dismissed"
  ) {
    return value;
  }
  return "open";
}

function resolutionKind(value: unknown): SlateContinuityResolutionKind | null {
  if (
    value === "update_canon" ||
    value === "revise_prose" ||
    value === "mark_belief" ||
    value === "mark_rumor" ||
    value === "mark_mystery" ||
    value === "preserve_ambiguity" ||
    value === "defer_thread" ||
    value === "dismiss_extraction"
  ) {
    return value;
  }
  return null;
}

function defaultResolution(row: Pick<ConcernRow, "kind" | "recommended_resolution">): SlateContinuityResolutionKind {
  const recommended = resolutionKind(row.recommended_resolution);
  if (recommended) return recommended;
  if (row.kind === "timeline_impossibility" || row.kind === "knowledge_leak") return "revise_prose";
  if (row.kind === "due_thread") return "defer_thread";
  if (row.kind === "ambiguous_extraction") return "dismiss_extraction";
  return "update_canon";
}

export function inferSlateConcernResolutionKind(
  direction: string,
  recommended: SlateContinuityResolutionKind,
): SlateContinuityResolutionKind {
  const normalized = direction.normalize("NFKC").toLocaleLowerCase();
  if (/\b(false positive|bad extraction|wrong extraction|dismiss|ignore this)\b/u.test(normalized)) {
    return "dismiss_extraction";
  }
  if (/\b(rumou?r|hearsay|gossip)\b/u.test(normalized)) return "mark_rumor";
  if (/\b(belief|believes|thinks|opinion|subjective)\b/u.test(normalized)) return "mark_belief";
  if (/\b(mystery|unknown|unrevealed|not known yet|reveal later)\b/u.test(normalized)) {
    return "mark_mystery";
  }
  if (/\b(ambiguous|ambiguity|unclear on purpose|intentionally unclear)\b/u.test(normalized)) {
    return "preserve_ambiguity";
  }
  if (/\b(defer|later|not yet|hold this thread|leave open)\b/u.test(normalized)) {
    return "defer_thread";
  }
  if (/\b(rewrite|revise|change the prose|fix the passage|edit the scene)\b/u.test(normalized)) {
    return "revise_prose";
  }
  if (/\b(canon|canonical|actually|the truth is|what is true|settled fact)\b/u.test(normalized)) {
    return "update_canon";
  }
  return recommended;
}

export function chooseSlateConcernResolutionKind(
  directionValue: unknown,
  explicitValue: unknown,
  recommended: SlateContinuityResolutionKind,
): SlateContinuityResolutionKind {
  const direction = boundedDirection(directionValue);
  return resolutionKind(explicitValue) ?? inferSlateConcernResolutionKind(direction, recommended);
}

function actionLabel(kind: SlateContinuityResolutionKind): string {
  switch (kind) {
    case "revise_prose":
      return "Preview a fix";
    case "defer_thread":
      return "Keep it open";
    case "dismiss_extraction":
      return "Dismiss this reading";
    case "mark_belief":
    case "mark_rumor":
    case "mark_mystery":
    case "preserve_ambiguity":
      return "Preserve the intent";
    default:
      return "Confirm what’s true";
  }
}

function directionPrompt(kind: SlateContinuityConcernKind): string {
  if (kind === "due_thread") return "Tell Continuity whether this should return now or stay open.";
  if (kind === "ambiguous_extraction") return "Tell Continuity what this passage is meant to establish.";
  return "Tell Continuity what is true, intentional, or worth changing.";
}

function exactPassages(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
  rawAnchors: string,
): SlateContinuityConcernPassage[] {
  const anchors = parseJson<unknown>(rawAnchors, []);
  if (!Array.isArray(anchors)) return [];
  const passages: SlateContinuityConcernPassage[] = [];
  const seen = new Set<string>();
  for (const candidate of anchors) {
    if (!candidate || typeof candidate !== "object") continue;
    const anchor = candidate as Partial<SlateContinuitySourceAnchor>;
    if (
      typeof anchor.sourceId !== "string" ||
      typeof anchor.start !== "number" ||
      typeof anchor.end !== "number" ||
      typeof anchor.quoteHash !== "string" ||
      !Number.isInteger(anchor.start) ||
      !Number.isInteger(anchor.end)
    ) {
      continue;
    }
    const source = db
      .prepare(
        `SELECT id, section_id, source_revision, content
           FROM slate_continuity_sources
          WHERE id = ? AND user_id = ? AND series_id = ?`,
      )
      .get(anchor.sourceId, userId, seriesId) as SourceRow | undefined;
    if (
      !source ||
      source.section_id !== (anchor.sectionId ?? null) ||
      source.source_revision !== (anchor.sectionRevision ?? source.source_revision) ||
      anchor.start < 0 ||
      anchor.end <= anchor.start ||
      anchor.end > source.content.length
    ) {
      continue;
    }
    const quote = source.content.slice(anchor.start, anchor.end);
    if (hash(quote) !== anchor.quoteHash) continue;
    const key = `${source.id}:${anchor.start}:${anchor.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const section = source.section_id
      ? (db
          .prepare("SELECT title FROM slate_sections WHERE id = ? AND user_id = ?")
          .get(source.section_id, userId) as { title: string } | undefined)
      : undefined;
    passages.push({
      sourceId: source.id,
      sectionId: source.section_id,
      sectionTitle: section?.title ?? null,
      quote,
      start: anchor.start,
      end: anchor.end,
    });
  }
  return passages.slice(0, 4);
}

function concernFromRow(
  db: DatabaseSync,
  userId: string,
  row: ConcernRow,
): SlateContinuityConcernCard {
  const anchors = parseJson<SlateContinuitySourceAnchor[]>(row.anchors_json, []);
  const suggested = defaultResolution(row);
  const base: SlateContinuityConcern = {
    id: row.id,
    scope: {
      kind: row.scope_kind === "series" || row.scope_kind === "section" ? row.scope_kind : "book",
      seriesId: row.series_id,
      projectId: row.project_id,
      sectionId: row.section_id,
    },
    kind: concernKind(row.kind),
    severity: concernSeverity(row.severity),
    status: concernStatus(row.status),
    summary: row.summary,
    explanation: row.explanation,
    claimIds: parseJson<string[]>(row.claim_ids_json, []).filter((id) => typeof id === "string"),
    anchors,
    recommendedResolution: resolutionKind(row.recommended_resolution),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    producerVersions: parseJson(row.producer_versions_json, currentContinuityProducerVersions()),
  };
  return {
    ...base,
    passages: exactPassages(db, userId, row.series_id, row.anchors_json),
    suggestedAction: { kind: suggested, label: actionLabel(suggested) },
    directionPrompt: directionPrompt(base.kind),
  };
}

function synchronizeCompletedRevisionResolutions(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): void {
  const rows = db
    .prepare(
      `SELECT id, resolution_json FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? AND status = 'deferred'
          AND resolution_json IS NOT NULL`,
    )
    .all(userId, projectId) as Array<{ id: string; resolution_json: string }>;
  const now = new Date().toISOString();
  for (const row of rows) {
    const resolution = parseJson<ResolutionRecord | null>(row.resolution_json, null);
    if (!resolution?.revisionId) continue;
    const revision = db
      .prepare(
        "SELECT status FROM slate_revisions WHERE id = ? AND project_id = ? AND user_id = ?",
      )
      .get(resolution.revisionId, projectId, userId) as { status: string } | undefined;
    if (revision?.status !== "accepted" && revision?.status !== "rejected") continue;
    const accepted = revision.status === "accepted";
    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = ?, resolved_at = ?, resolution_json = ?
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    ).run(
      accepted ? "resolved" : "open",
      accepted ? now : null,
      JSON.stringify({ ...resolution, revisionOutcome: revision.status }),
      row.id,
      userId,
      projectId,
    );
  }
}

export function getNextSlateContinuityConcern(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateContinuityConcernCard | null {
  projectForUser(db, userId, projectId);
  synchronizeCompletedRevisionResolutions(db, userId, projectId);
  const row = db
    .prepare(
      `SELECT * FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? AND status = 'open'
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
                 created_at ASC, id ASC
        LIMIT 1`,
    )
    .get(userId, projectId) as ConcernRow | undefined;
  return row ? concernFromRow(db, userId, row) : null;
}

function openConcern(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  concernId: string,
): ConcernRow {
  projectForUser(db, userId, projectId);
  const row = db
    .prepare(
      `SELECT * FROM slate_continuity_concerns
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(concernId, userId, projectId) as ConcernRow | undefined;
  if (!row) {
    throw new SlateContinuityReconciliationError("Continuity concern not found.", 404, "slate_concern_not_found");
  }
  if (row.status !== "open") {
    throw new SlateContinuityReconciliationError(
      "This Continuity concern has already been directed.",
      409,
      "slate_concern_already_resolved",
    );
  }
  return row;
}

function claimsForConcern(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
  rawIds: string,
): ClaimRow[] {
  const ids = parseJson<unknown>(rawIds, []);
  if (!Array.isArray(ids)) return [];
  return ids.flatMap((id) => {
    if (typeof id !== "string") return [];
    const row = db
      .prepare(
        `SELECT id, project_id, section_id, scope_kind, subject_entity_id,
                predicate, object_entity_id, value, perspective_entity_id, confidence
           FROM slate_continuity_claims
          WHERE id = ? AND user_id = ? AND series_id = ?`,
      )
      .get(id, userId, seriesId) as ClaimRow | undefined;
    return row ? [row] : [];
  });
}

function decisionSourceContent(
  concern: ConcernRow,
  kind: SlateContinuityResolutionKind,
  direction: string,
  claims: readonly ClaimRow[],
): string {
  return [
    "Writer Continuity decision",
    `Concern: ${concern.summary}`,
    `Decision: ${kind}`,
    `Writer direction: ${direction || "No additional wording provided."}`,
    ...(claims.length > 0
      ? [
          "Records considered:",
          ...claims.map((claim) => `${claim.predicate}: ${claim.value}`),
        ]
      : []),
  ].join("\n");
}

function insertReviewDirectionSource(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  content: string,
  now: string,
): { id: string; anchor: SlateContinuitySourceAnchor } {
  const revisionRow = db
    .prepare(
      `SELECT COALESCE(MAX(source_revision), -1) + 1 AS revision
         FROM slate_continuity_sources
        WHERE user_id = ? AND project_id = ? AND kind = 'review_direction'`,
    )
    .get(userId, project.id) as { revision: number };
  const sourceRevision = Number(revisionRow.revision ?? 0);
  const sourceId = randomUUID();
  const contentHash = hash(content);
  const versions = JSON.stringify(currentContinuityProducerVersions());
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority, provider, model,
       producer_versions_json, supersedes_source_id, created_at)
     VALUES (?, ?, ?, ?, NULL, 'book', 'review_direction', ?, ?, ?, 'human',
             NULL, NULL, ?, NULL, ?)`,
  ).run(
    sourceId,
    userId,
    project.series_id,
    project.id,
    sourceRevision,
    content,
    contentHash,
    versions,
    now,
  );
  const fingerprint = hash(
    `${project.id}\u0000review_direction\u0000${sourceRevision}\u0000${contentHash}`,
  );
  db.prepare(
    `INSERT OR IGNORE INTO slate_continuity_jobs
      (id, user_id, series_id, project_id, section_id, source_id,
       source_revision, kind, status, attempts, input_fingerprint,
       available_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 'extract_source', 'queued', 0, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    project.series_id,
    project.id,
    sourceId,
    sourceRevision,
    fingerprint,
    now,
    now,
    now,
  );
  return {
    id: sourceId,
    anchor: {
      sourceId,
      sectionId: null,
      sectionRevision: sourceRevision,
      start: 0,
      end: content.length,
      quoteHash: contentHash,
    },
  };
}

function insertReplacementClaim(
  db: DatabaseSync,
  userId: string,
  seriesId: string,
  sourceId: string,
  anchor: SlateContinuitySourceAnchor,
  claim: ClaimRow,
  epistemicStatus: "belief" | "rumor" | "mystery" | "ambiguity" | "superseded",
  now: string,
): void {
  const existing = db
    .prepare(
      `SELECT id FROM slate_continuity_claims
        WHERE user_id = ? AND series_id = ? AND supersedes_claim_id = ? LIMIT 1`,
    )
    .get(userId, seriesId, claim.id) as { id: string } | undefined;
  if (existing) return;
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       supersedes_claim_id, producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    seriesId,
    claim.project_id,
    claim.section_id,
    claim.scope_kind,
    claim.subject_entity_id,
    claim.predicate,
    claim.object_entity_id,
    claim.value,
    epistemicStatus,
    claim.perspective_entity_id,
    JSON.stringify([anchor]),
    sourceId,
    claim.id,
    JSON.stringify(currentContinuityProducerVersions()),
    now,
  );
}

function insertWriterDirectionClaim(
  db: DatabaseSync,
  userId: string,
  project: ProjectRow,
  sourceId: string,
  anchor: SlateContinuitySourceAnchor,
  direction: string,
  now: string,
): void {
  db.prepare(
    `INSERT INTO slate_continuity_claims
      (id, user_id, series_id, project_id, section_id, scope_kind,
       subject_entity_id, predicate, object_entity_id, value, epistemic_status,
       perspective_entity_id, confidence, anchors_json, source_id,
       supersedes_claim_id, producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, NULL, 'book', NULL, 'writer_direction', NULL, ?, 'fact',
             NULL, 1, ?, ?, NULL, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    project.series_id,
    project.id,
    direction,
    JSON.stringify([anchor]),
    sourceId,
    JSON.stringify(currentContinuityProducerVersions()),
    now,
  );
}

function deferAnchoredThreads(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  concernAnchors: readonly SlateContinuitySourceAnchor[],
  now: string,
): void {
  const sourceIds = new Set(concernAnchors.map((anchor) => anchor.sourceId));
  const rows = db
    .prepare(
      `SELECT id, anchors_json FROM slate_continuity_threads
        WHERE user_id = ? AND project_id = ? AND status IN ('open', 'due')`,
    )
    .all(userId, projectId) as Array<{ id: string; anchors_json: string }>;
  for (const row of rows) {
    const anchors = parseJson<SlateContinuitySourceAnchor[]>(row.anchors_json, []);
    if (!anchors.some((anchor) => sourceIds.has(anchor.sourceId))) continue;
    db.prepare(
      `UPDATE slate_continuity_threads
          SET status = 'open', due_section_id = NULL, updated_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    ).run(now, row.id, userId, projectId);
  }
}

export function resolveSlateContinuityConcern(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  concernId: string,
  input: { direction?: unknown; resolutionKind?: unknown },
): SlateContinuityResolutionKind {
  const project = projectForUser(db, userId, projectId);
  const concern = openConcern(db, userId, projectId, concernId);
  const direction = boundedDirection(input.direction);
  const recommended = defaultResolution(concern);
  const kind = resolutionKind(input.resolutionKind) ?? inferSlateConcernResolutionKind(direction, recommended);
  if (kind === "revise_prose") {
    throw new SlateContinuityReconciliationError(
      "Prepare a revision preview for this concern before resolving it.",
      409,
      "slate_concern_requires_revision",
    );
  }
  if (
    !direction &&
    kind !== "dismiss_extraction" &&
    kind !== "defer_thread"
  ) {
    throw new SlateContinuityReconciliationError("Tell Continuity what you intend before applying this decision.");
  }
  const claims = claimsForConcern(db, userId, concern.series_id, concern.claim_ids_json);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    let sourceId: string | null = null;
    if (direction || kind !== "dismiss_extraction") {
      const content = decisionSourceContent(concern, kind, direction, claims);
      const source = insertReviewDirectionSource(db, userId, project, content, now);
      sourceId = source.id;
      const replacementStatus =
        kind === "mark_belief"
          ? "belief"
          : kind === "mark_rumor"
            ? "rumor"
            : kind === "mark_mystery"
              ? "mystery"
              : kind === "preserve_ambiguity"
                ? "ambiguity"
                : kind === "update_canon"
                  ? "superseded"
                  : null;
      if (replacementStatus) {
        for (const claim of claims) {
          insertReplacementClaim(
            db,
            userId,
            concern.series_id,
            source.id,
            source.anchor,
            claim,
            replacementStatus,
            now,
          );
        }
      }
      if (kind === "update_canon") {
        insertWriterDirectionClaim(db, userId, project, source.id, source.anchor, direction, now);
      }
    }
    if (kind === "defer_thread") {
      deferAnchoredThreads(
        db,
        userId,
        projectId,
        parseJson<SlateContinuitySourceAnchor[]>(concern.anchors_json, []),
        now,
      );
    }
    const status: SlateContinuityConcernStatus =
      kind === "dismiss_extraction"
        ? "dismissed"
        : kind === "defer_thread"
          ? "deferred"
          : kind === "preserve_ambiguity"
            ? "intentional"
            : "resolved";
    const resolution: ResolutionRecord = {
      version: 1,
      kind,
      direction,
      sourceId,
      revisionId: null,
      recordedAt: now,
    };
    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = ?, resolution_json = ?, resolved_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    ).run(
      status,
      JSON.stringify(resolution),
      status === "resolved" || status === "dismissed" ? now : null,
      concernId,
      userId,
      projectId,
    );
    db.exec("COMMIT");
    return kind;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function slateRevisionRequestForContinuityConcern(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  concernId: string,
  directionValue: unknown,
): { request: SlateRevisionRequest; appliedResolution: "revise_prose"; direction: string } {
  const concern = openConcern(db, userId, projectId, concernId);
  const direction = boundedDirection(directionValue);
  const passages = exactPassages(db, userId, concern.series_id, concern.anchors_json);
  const spans = slateSectionProjectionSpans(db, userId, projectId);
  const candidates = passages.flatMap((passage) => {
    if (!passage.sectionId) return [];
    const span = spans.find((candidate) => candidate.sectionId === passage.sectionId);
    if (!span) return [];
    const section = db
      .prepare(
        `SELECT prose, revision, ordinal FROM slate_sections
          WHERE id = ? AND project_id = ? AND user_id = ?`,
      )
      .get(passage.sectionId, projectId, userId) as
      | { prose: string; revision: number; ordinal: number }
      | undefined;
    if (!section) return [];
    let localStart = passage.start;
    let localEnd = passage.end;
    if (section.prose.slice(localStart, localEnd) !== passage.quote) {
      const first = section.prose.indexOf(passage.quote);
      if (first < 0 || section.prose.indexOf(passage.quote, first + 1) >= 0) return [];
      localStart = first;
      localEnd = first + passage.quote.length;
    }
    return [{ span, section, localStart, localEnd }];
  });
  candidates.sort((left, right) => right.section.ordinal - left.section.ordinal);
  const target = candidates[0];
  if (!target) {
    throw new SlateContinuityReconciliationError(
      "The source passage has changed. Tell Continuity the new canon, or select the current prose and request a revision.",
      409,
      "slate_concern_source_changed",
    );
  }
  const writerDirection = direction || "Resolve the inconsistency while preserving the writer’s established intent.";
  return {
    appliedResolution: "revise_prose",
    direction,
    request: {
      action: "rewrite",
      scope: "selection",
      selectionStart: target.span.bodyStart + target.localStart,
      selectionEnd: target.span.bodyStart + target.localEnd,
      direction: [
        "Resolve this Continuity concern without changing unrelated facts or voice.",
        `Concern: ${concern.summary}`,
        `Why Continuity noticed: ${concern.explanation}`,
        `Writer direction: ${writerDirection}`,
      ].join("\n"),
    },
  };
}

export function linkSlateConcernRevisionProposal(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  concernId: string,
  revisionId: string,
  directionValue: unknown,
): void {
  openConcern(db, userId, projectId, concernId);
  const revision = db
    .prepare(
      `SELECT id FROM slate_revisions
        WHERE id = ? AND project_id = ? AND user_id = ? AND status = 'pending'`,
    )
    .get(revisionId, projectId, userId) as { id: string } | undefined;
  if (!revision) {
    throw new SlateContinuityReconciliationError("Slate revision proposal not found.", 404);
  }
  const now = new Date().toISOString();
  const resolution: ResolutionRecord = {
    version: 1,
    kind: "revise_prose",
    direction: boundedDirection(directionValue),
    sourceId: null,
    revisionId,
    recordedAt: now,
  };
  db.prepare(
    `UPDATE slate_continuity_concerns
        SET status = 'deferred', resolution_json = ?, resolved_at = NULL
      WHERE id = ? AND user_id = ? AND project_id = ?`,
  ).run(JSON.stringify(resolution), concernId, userId, projectId);
}

export function settleSlateConcernRevision(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  revisionId: string,
  outcome: "accepted" | "rejected",
): void {
  const rows = db
    .prepare(
      `SELECT id, resolution_json FROM slate_continuity_concerns
        WHERE user_id = ? AND project_id = ? AND status = 'deferred'
          AND resolution_json IS NOT NULL`,
    )
    .all(userId, projectId) as Array<{ id: string; resolution_json: string }>;
  const now = new Date().toISOString();
  for (const row of rows) {
    const resolution = parseJson<ResolutionRecord | null>(row.resolution_json, null);
    if (resolution?.revisionId !== revisionId) continue;
    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = ?, resolution_json = ?, resolved_at = ?
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    ).run(
      outcome === "accepted" ? "resolved" : "open",
      JSON.stringify({ ...resolution, revisionOutcome: outcome }),
      outcome === "accepted" ? now : null,
      row.id,
      userId,
      projectId,
    );
  }
}
