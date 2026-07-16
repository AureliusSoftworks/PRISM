import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type SlateContinuitySourceAnchor,
  type SlateLockedRange,
  type SlateStructureItem,
} from "@localai/shared";
import {
  extractSlateContinuityCandidatesLocally,
  reconcileSlateContinuityCandidatesLocally,
  type SlateContinuityAuxiliaryExtractionResult,
  type SlateContinuityAuxiliarySource,
  type SlateContinuityExistingClaim,
} from "./slate-continuity-auxiliary.ts";
import {
  detectAndPersistSlateContinuityConcernsInTransaction,
} from "./slate-continuity-concerns.ts";
import { SlateContinuityCurrentCanonResolver } from "./slate-continuity-current-canon.ts";
import {
  compileContinuityContextBrief,
  extractDeterministicContinuityCandidates,
  hashContinuityText,
  normalizeContinuityName,
  planContinuitySourceIndex,
  type ContinuityContextCandidate,
  type ContinuityIndexCheckpoint,
} from "./slate-continuity-index.ts";
import type { LlmProvider } from "./providers.ts";
import type {
  SlateContinuityDeterministicResult,
  SlateContinuityJob,
} from "./slate-continuity-worker.ts";

interface SourceRow {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string;
  section_id: string | null;
  source_revision: number;
  content: string;
  content_hash: string;
}

interface EntityRow {
  id: string;
  canonical_name: string;
  anchors_json: string;
}

interface AuxiliaryModelInput {
  source: SlateContinuityAuxiliarySource;
  sourceFingerprint: string;
}

interface DraftProjectRow {
  id: string;
  series_id: string;
  title: string;
  premise: string;
  voice: string;
  non_negotiables_json: string;
  structure_json: string;
  direction: string;
}

interface DraftSectionRow {
  id: string;
  structure_item_id: string | null;
  ordinal: number;
  title: string;
  summary: string;
  direction: string;
  prose: string;
  locked_ranges_json: string;
  locked: number;
  revision: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${hashContinuityText(JSON.stringify(parts)).slice(0, 32)}`;
}

function validateAnchors(
  anchors: readonly SlateContinuitySourceAnchor[],
  source: SourceRow,
): void {
  for (const anchor of anchors) {
    if (
      anchor.sourceId !== source.id ||
      anchor.sectionId !== source.section_id ||
      anchor.sectionRevision !== source.source_revision ||
      anchor.start < 0 ||
      anchor.end <= anchor.start ||
      anchor.end > source.content.length ||
      hashContinuityText(source.content.slice(anchor.start, anchor.end)) !==
        anchor.quoteHash
    ) {
      throw new Error("Continuity candidate evidence does not match its source.");
    }
  }
}

function mergeAnchors(
  existingRaw: string,
  additions: readonly SlateContinuitySourceAnchor[],
): SlateContinuitySourceAnchor[] {
  const existing = parseJson<SlateContinuitySourceAnchor[]>(existingRaw, []);
  const byKey = new Map(
    existing.map((anchor) => [
      `${anchor.sourceId}:${anchor.start}:${anchor.end}:${anchor.quoteHash}`,
      anchor,
    ]),
  );
  for (const anchor of additions) {
    byKey.set(
      `${anchor.sourceId}:${anchor.start}:${anchor.end}:${anchor.quoteHash}`,
      anchor,
    );
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) || left.start - right.start,
  );
}

function previousCheckpoint(
  db: DatabaseSync,
  source: SourceRow,
): ContinuityIndexCheckpoint | null {
  if (!source.section_id) return null;
  const row = db
    .prepare(
      `SELECT checkpoint_json FROM slate_continuity_source_indexes
        WHERE user_id = ? AND project_id = ? AND section_id = ?
          AND source_revision < ?
        ORDER BY source_revision DESC, updated_at DESC
        LIMIT 1`,
    )
    .get(
      source.user_id,
      source.project_id,
      source.section_id,
      source.source_revision,
    ) as { checkpoint_json: string } | undefined;
  if (!row) return null;
  const parsed = parseJson<ContinuityIndexCheckpoint | null>(
    row.checkpoint_json,
    null,
  );
  return parsed &&
    Number.isInteger(parsed.extractionVersion) &&
    Array.isArray(parsed.paragraphHashes) &&
    Array.isArray(parsed.sentenceHashes)
    ? parsed
    : null;
}

function isLatestSectionSource(db: DatabaseSync, source: SourceRow): boolean {
  if (!source.section_id) return true;
  const row = db
    .prepare(
      `SELECT id FROM slate_continuity_sources
        WHERE user_id = ? AND project_id = ? AND section_id = ?
          AND supersedes_source_id = ?
        LIMIT 1`,
    )
    .get(
      source.user_id,
      source.project_id,
      source.section_id,
      source.id,
    ) as {
    id: string;
  } | undefined;
  return !row;
}

function rescanDeterministicConcernsInTransaction(
  db: DatabaseSync,
  source: SourceRow,
  now: string,
): void {
  detectAndPersistSlateContinuityConcernsInTransaction(
    db,
    source.user_id,
    source.project_id,
    {
      currentSectionId: source.section_id,
      now: new Date(now),
    },
  );
}

function anchorFallsInChangedParagraph(
  anchor: SlateContinuitySourceAnchor,
  changed: readonly { start: number; end: number }[],
): boolean {
  return changed.some(
    (paragraph) =>
      anchor.start >= paragraph.start && anchor.end <= paragraph.end,
  );
}

function boundedAuxiliaryRanges(
  changed: readonly { start: number; end: number }[],
): Array<{ start: number; end: number }> {
  const selected: Array<{ start: number; end: number }> = [];
  let remainingCharacters = 16_000;
  for (const range of changed) {
    if (selected.length >= 12 || remainingCharacters <= 0) break;
    const length = Math.min(range.end - range.start, remainingCharacters);
    if (length <= 0) continue;
    selected.push({ start: range.start, end: range.start + length });
    remainingCharacters -= length;
  }
  return selected;
}

function auxiliarySourceFingerprint(
  source: SourceRow,
  ranges: readonly { start: number; end: number }[],
): string {
  return hashContinuityText(
    JSON.stringify([
      "slate-continuity-auxiliary-source-v1",
      source.id,
      source.section_id,
      source.source_revision,
      hashContinuityText(source.content),
      ranges,
    ]),
  );
}

function queueAuxiliaryExtraction(
  db: DatabaseSync,
  source: SourceRow,
  processingKey: string,
  now: string,
  needed: boolean,
): void {
  if (!needed) return;
  db.prepare(
    `INSERT OR IGNORE INTO slate_continuity_jobs
      (id, user_id, series_id, project_id, section_id, source_id,
       source_revision, kind, status, attempts, input_fingerprint,
       available_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'extract_source_auxiliary', 'queued', 0,
             ?, ?, ?, ?)`,
  ).run(
    stableId("continuity-aux-job", [source.id, processingKey]),
    source.user_id,
    source.series_id,
    source.project_id,
    source.section_id,
    source.id,
    source.source_revision,
    auxiliarySourceFingerprint(source, [{ start: 0, end: source.content.length }]),
    now,
    now,
    now,
  );
}

function sourceNeedsAuxiliaryExtraction(
  source: SourceRow,
  changed: readonly { start: number; end: number }[],
  deterministicEntityCount: number,
  deterministicClaimCount: number,
): boolean {
  const changedText = changed
    .map((range) => source.content.slice(range.start, range.end))
    .join("\n");
  if (!changedText.trim()) return false;
  if (
    changedText.length >= 240 ||
    deterministicEntityCount === 0 ||
    deterministicClaimCount === 0
  ) {
    return true;
  }
  return /[?!“”"]|\b(?:after|before|believ(?:e|es|ed)|knew|knows|later|promise(?:d|s)?|remember(?:ed|s)?|said|secret|suspect(?:ed|s)?|wonder(?:ed|s)?)\b/iu.test(
    changedText,
  );
}

function prepareAuxiliaryModelInput(
  db: DatabaseSync,
  job: SlateContinuityJob,
): SlateContinuityDeterministicResult {
  if (!job.sourceId) return {};
  const source = db
    .prepare(
      `SELECT id, user_id, series_id, project_id, section_id, source_revision,
              content, content_hash
         FROM slate_continuity_sources
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(job.sourceId, job.userId, job.projectId) as SourceRow | undefined;
  if (
    !source ||
    source.content.length === 0 ||
    source.content.length > 1_000_000 ||
    hashContinuityText(source.content) !== source.content_hash ||
    !isLatestSectionSource(db, source)
  ) {
    return {};
  }
  const plan = planContinuitySourceIndex(
    {
      sourceId: source.id,
      sectionId: source.section_id,
      sectionRevision: source.source_revision,
      content: source.content,
    },
    previousCheckpoint(db, source),
  );
  const ranges = boundedAuxiliaryRanges(plan.changedParagraphs);
  if (ranges.length === 0) return {};
  const sourceFingerprint = auxiliarySourceFingerprint(source, ranges);
  const indexed = db
    .prepare(
      `SELECT candidate_counts_json FROM slate_continuity_source_indexes
        WHERE source_id = ? AND user_id = ?`,
    )
    .get(source.id, source.user_id) as
    | { candidate_counts_json: string }
    | undefined;
  const counts = parseJson<Record<string, unknown>>(
    indexed?.candidate_counts_json ?? "{}",
    {},
  );
  if (counts.auxiliaryFingerprint === sourceFingerprint) return {};
  const modelInput: AuxiliaryModelInput = {
    source: {
      sourceId: source.id,
      sectionId: source.section_id,
      sectionRevision: source.source_revision,
      content: source.content,
      changedRanges: ranges,
    },
    sourceFingerprint,
  };
  return { requiresModel: true, modelInput };
}

/**
 * Deterministic baseline for queued source work. It never calls a model and
 * never lets an older source revision mutate the current ledger.
 */
export function processSlateContinuityJobDeterministically({
  db,
  job,
}: {
  db: DatabaseSync;
  job: SlateContinuityJob;
}): SlateContinuityDeterministicResult {
  if (job.kind === "extract_source_auxiliary") {
    return prepareAuxiliaryModelInput(db, job);
  }
  if (job.kind !== "extract_source" || !job.sourceId) return {};
  const source = db
    .prepare(
      `SELECT id, user_id, series_id, project_id, section_id, source_revision,
              content, content_hash
         FROM slate_continuity_sources
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(job.sourceId, job.userId, job.projectId) as SourceRow | undefined;
  if (!source) throw new Error("Continuity source not found.");
  if (hashContinuityText(source.content) !== source.content_hash) {
    throw new Error("Continuity source checksum does not match its content.");
  }
  if (!isLatestSectionSource(db, source)) return {};

  const plan = planContinuitySourceIndex(
    {
      sourceId: source.id,
      sectionId: source.section_id,
      sectionRevision: source.source_revision,
      content: source.content,
    },
    previousCheckpoint(db, source),
  );
  const allCandidates =
    plan.action === "extract"
      ? extractDeterministicContinuityCandidates({
          sourceId: source.id,
          sectionId: source.section_id,
          sectionRevision: source.source_revision,
          content: source.content,
        })
      : { entities: [], claims: [] };
  const changedRanges = plan.changedParagraphs.map((paragraph) => ({
    start: paragraph.start,
    end: paragraph.end,
  }));
  const entities = allCandidates.entities.filter((candidate) =>
    candidate.anchors.some((anchor) =>
      anchorFallsInChangedParagraph(anchor, changedRanges),
    ),
  );
  const claims = allCandidates.claims.filter((candidate) =>
    candidate.anchors.some((anchor) =>
      anchorFallsInChangedParagraph(anchor, changedRanges),
    ),
  );
  entities.forEach((candidate) => validateAnchors(candidate.anchors, source));
  claims.forEach((candidate) => validateAnchors(candidate.anchors, source));
  const needsAuxiliary = sourceNeedsAuxiliaryExtraction(
    source,
    changedRanges,
    entities.length,
    claims.length,
  );

  const now = new Date().toISOString();
  const versions = currentContinuityProducerVersions();
  const versionsJson = JSON.stringify(versions);
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (!isLatestSectionSource(db, source)) {
      db.exec("COMMIT");
      return {};
    }
    const indexed = db
      .prepare(
        "SELECT processing_key FROM slate_continuity_source_indexes WHERE source_id = ? AND user_id = ?",
      )
      .get(source.id, source.user_id) as { processing_key: string } | undefined;
    if (indexed?.processing_key === plan.checkpoint.processingKey) {
      queueAuxiliaryExtraction(
        db,
        source,
        plan.checkpoint.processingKey,
        now,
        needsAuxiliary,
      );
      rescanDeterministicConcernsInTransaction(db, source, now);
      db.prepare(
        `UPDATE slate_projects SET continuity_last_success_at = ?
          WHERE id = ? AND user_id = ?`,
      ).run(now, source.project_id, source.user_id);
      db.exec("COMMIT");
      return {};
    }

    const storedEntities = db
      .prepare(
        `SELECT id, canonical_name, anchors_json
           FROM slate_continuity_entities
          WHERE user_id = ? AND series_id = ?`,
      )
      .all(source.user_id, source.series_id) as unknown as EntityRow[];
    const entityByName = new Map(
      storedEntities.map((row) => [normalizeContinuityName(row.canonical_name), row]),
    );
    const aliases = db
      .prepare(
        `SELECT normalized_alias, entity_id FROM slate_continuity_aliases
          WHERE user_id = ? AND series_id = ?`,
      )
      .all(source.user_id, source.series_id) as Array<{
      normalized_alias: string;
      entity_id: string;
    }>;
    const entityById = new Map(storedEntities.map((row) => [row.id, row]));
    for (const alias of aliases) {
      const target = entityById.get(alias.entity_id);
      if (target) entityByName.set(alias.normalized_alias, target);
    }

    for (const candidate of entities) {
      let entity = entityByName.get(candidate.normalizedName);
      if (!entity) {
        const id = stableId("continuity-entity", [
          source.series_id,
          candidate.normalizedName,
        ]);
        db.prepare(
          `INSERT OR IGNORE INTO slate_continuity_entities
            (id, user_id, series_id, kind, canonical_name, description,
             locked, anchors_json, source_id, producer_versions_json,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          source.user_id,
          source.series_id,
          candidate.kind,
          candidate.canonicalName,
          JSON.stringify(candidate.anchors),
          source.id,
          versionsJson,
          now,
          now,
        );
        entity = {
          id,
          canonical_name: candidate.canonicalName,
          anchors_json: JSON.stringify(candidate.anchors),
        };
        entityById.set(id, entity);
        entityByName.set(candidate.normalizedName, entity);
      } else {
        const merged = mergeAnchors(entity.anchors_json, candidate.anchors);
        entity.anchors_json = JSON.stringify(merged);
        db.prepare(
          `UPDATE slate_continuity_entities
              SET anchors_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`,
        ).run(entity.anchors_json, now, entity.id, source.user_id);
      }
      for (const alias of candidate.aliases) {
        const normalizedAlias = normalizeContinuityName(alias);
        const alreadyMapped = entityByName.get(normalizedAlias);
        if (alreadyMapped && alreadyMapped.id !== entity.id) continue;
        db.prepare(
          `INSERT INTO slate_continuity_aliases
            (id, user_id, series_id, entity_id, alias, normalized_alias,
             source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, series_id, entity_id, normalized_alias)
           DO UPDATE SET alias = excluded.alias,
                         source_id = excluded.source_id,
                         created_at = excluded.created_at`,
        ).run(
          stableId("continuity-alias", [
            source.series_id,
            entity.id,
            normalizedAlias,
          ]),
          source.user_id,
          source.series_id,
          entity.id,
          alias,
          normalizedAlias,
          source.id,
          now,
        );
        entityByName.set(normalizedAlias, entity);
      }
    }

    for (const candidate of claims) {
      const subject = entityByName.get(candidate.subjectNormalizedName);
      if (!subject) continue;
      const object = candidate.objectNormalizedName
        ? entityByName.get(candidate.objectNormalizedName)
        : null;
      const perspective = candidate.perspectiveNormalizedName
        ? entityByName.get(candidate.perspectiveNormalizedName)
        : null;
      db.prepare(
        `INSERT OR IGNORE INTO slate_continuity_claims
          (id, user_id, series_id, project_id, section_id, scope_kind,
           subject_entity_id, predicate, object_entity_id, value,
           epistemic_status, perspective_entity_id, confidence, anchors_json,
           source_id, supersedes_claim_id, producer_versions_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'section', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(
        stableId("continuity-claim", [source.id, candidate.candidateId]),
        source.user_id,
        source.series_id,
        source.project_id,
        source.section_id,
        subject.id,
        candidate.predicate,
        object?.id ?? null,
        candidate.value,
        candidate.epistemicStatus,
        perspective?.id ?? null,
        candidate.confidence,
        JSON.stringify(candidate.anchors),
        source.id,
        versionsJson,
        now,
      );
    }

    db.prepare(
      `INSERT INTO slate_continuity_source_indexes
        (source_id, user_id, series_id, project_id, section_id,
         source_revision, action, processing_key, content_hash,
         checkpoint_json, candidate_counts_json, producer_versions_json,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET
         action = excluded.action,
         processing_key = excluded.processing_key,
         content_hash = excluded.content_hash,
         checkpoint_json = excluded.checkpoint_json,
         candidate_counts_json = excluded.candidate_counts_json,
         producer_versions_json = excluded.producer_versions_json,
         updated_at = excluded.updated_at`,
    ).run(
      source.id,
      source.user_id,
      source.series_id,
      source.project_id,
      source.section_id,
      source.source_revision,
      plan.action,
      plan.checkpoint.processingKey,
      plan.checkpoint.contentHash,
      JSON.stringify(plan.checkpoint),
      JSON.stringify({ entities: entities.length, claims: claims.length }),
      versionsJson,
      now,
      now,
    );
    queueAuxiliaryExtraction(
      db,
      source,
      plan.checkpoint.processingKey,
      now,
      needsAuxiliary,
    );
    rescanDeterministicConcernsInTransaction(db, source, now);
    db.prepare(
      `UPDATE slate_projects SET continuity_last_success_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, source.project_id, source.user_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {};
}

function auxiliaryModelInput(value: unknown): AuxiliaryModelInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Continuity auxiliary job input is invalid.");
  }
  const candidate = value as Partial<AuxiliaryModelInput>;
  if (
    !candidate.source ||
    typeof candidate.sourceFingerprint !== "string" ||
    !candidate.sourceFingerprint
  ) {
    throw new Error("Continuity auxiliary job input is incomplete.");
  }
  return candidate as AuxiliaryModelInput;
}

function claimsForAuxiliaryReconciliation(
  db: DatabaseSync,
  source: SourceRow,
  extraction: SlateContinuityAuxiliaryExtractionResult,
): SlateContinuityExistingClaim[] {
  if (extraction.claims.length === 0) return [];
  const currentCanon = new SlateContinuityCurrentCanonResolver(
    db,
    source.user_id,
    source.series_id,
  );
  const pairs = new Set(
    extraction.claims.map(
      (claim) =>
        `${normalizeContinuityName(claim.subjectName)}\u0000${normalizeContinuityName(claim.predicate)}`,
    ),
  );
  const rows = db
    .prepare(
      `SELECT claims.id, claims.predicate, claims.value,
              claims.epistemic_status, subject.canonical_name AS subject_name,
              object.canonical_name AS object_name, claims.anchors_json,
              claims.source_id
         FROM slate_continuity_claims claims
         LEFT JOIN slate_continuity_entities subject
           ON subject.id = claims.subject_entity_id
          AND subject.user_id = claims.user_id
         LEFT JOIN slate_continuity_entities object
           ON object.id = claims.object_entity_id
          AND object.user_id = claims.user_id
        WHERE claims.user_id = ? AND claims.series_id = ?
          AND claims.source_id <> ?
          AND claims.epistemic_status <> 'superseded'
          AND NOT EXISTS (
            SELECT 1 FROM slate_continuity_claims replacement
             WHERE replacement.user_id = claims.user_id
               AND replacement.supersedes_claim_id = claims.id
          )
        ORDER BY claims.created_at DESC, claims.id ASC
        LIMIT 2048`,
    )
    .all(source.user_id, source.series_id, source.id) as Array<{
    id: string;
    predicate: string;
    value: string;
    epistemic_status: SlateContinuityExistingClaim["epistemicStatus"];
    subject_name: string | null;
    object_name: string | null;
    anchors_json: string;
    source_id: string;
  }>;
  return rows
    .filter(
      (row) =>
        currentCanon.recordIsCurrent(row.anchors_json, row.source_id) &&
        row.subject_name &&
        pairs.has(
          `${normalizeContinuityName(row.subject_name)}\u0000${normalizeContinuityName(row.predicate)}`,
        ),
    )
    .slice(0, 48)
    .map((row) => ({
      claimId: row.id,
      subjectName: row.subject_name!,
      predicate: row.predicate,
      objectName: row.object_name,
      value: row.value,
      epistemicStatus: row.epistemic_status,
    }));
}

interface StoredAuxiliaryEntity {
  id: string;
  canonical_name: string;
  description: string;
  locked: number;
  anchors_json: string;
}

/**
 * LOCAL model augmentation for one coalesced source. Model inference happens
 * before the transaction; only schema-validated, exactly anchored candidates
 * enter the ledger. Replays are idempotent by source fingerprint.
 */
export async function processSlateContinuityAuxiliaryModelJob({
  db,
  job,
  modelInput,
  provider,
}: {
  db: DatabaseSync;
  job: SlateContinuityJob;
  modelInput: unknown;
  provider: LlmProvider;
}): Promise<void> {
  const input = auxiliaryModelInput(modelInput);
  if (
    input.source.sourceId !== job.sourceId ||
    input.source.sectionId !== job.sectionId ||
    input.source.sectionRevision !== job.sourceRevision
  ) {
    throw new Error("Continuity auxiliary job source does not match its lease.");
  }
  const extraction = await extractSlateContinuityCandidatesLocally(provider, {
    source: input.source,
  });
  if (extraction.sourceFingerprint !== input.sourceFingerprint) {
    throw new Error("Continuity auxiliary extraction fingerprint changed.");
  }
  const source = db
    .prepare(
      `SELECT id, user_id, series_id, project_id, section_id, source_revision,
              content, content_hash
         FROM slate_continuity_sources
        WHERE id = ? AND user_id = ? AND project_id = ?`,
    )
    .get(job.sourceId, job.userId, job.projectId) as SourceRow | undefined;
  if (!source || !isLatestSectionSource(db, source)) return;
  const existingClaims = claimsForAuxiliaryReconciliation(db, source, extraction);
  const projectConstraints = parseJson<string[]>(
    (
      db
        .prepare(
          `SELECT non_negotiables_json FROM slate_projects
            WHERE id = ? AND user_id = ?`,
        )
        .get(source.project_id, source.user_id) as
        | { non_negotiables_json: string }
        | undefined
    )?.non_negotiables_json ?? "[]",
    [],
  ).filter((constraint) => typeof constraint === "string" && constraint.trim());
  const reconciliation =
    extraction.claims.length > 0 &&
    (existingClaims.length > 0 || projectConstraints.length > 0)
      ? await reconcileSlateContinuityCandidatesLocally(provider, {
          source: input.source,
          newClaims: extraction.claims,
          existingClaims,
          constraints: projectConstraints,
        })
      : {
          sourceFingerprint: input.sourceFingerprint,
          provider: "local" as const,
          model: extraction.model,
          concerns: [],
        };
  if (reconciliation.sourceFingerprint !== input.sourceFingerprint) {
    throw new Error("Continuity auxiliary reconciliation fingerprint changed.");
  }

  const now = new Date().toISOString();
  const versionsJson = JSON.stringify(currentContinuityProducerVersions());
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (!isLatestSectionSource(db, source)) {
      db.exec("COMMIT");
      return;
    }
    const indexRow = db
      .prepare(
        `SELECT candidate_counts_json FROM slate_continuity_source_indexes
          WHERE source_id = ? AND user_id = ?`,
      )
      .get(source.id, source.user_id) as
      | { candidate_counts_json: string }
      | undefined;
    if (!indexRow) throw new Error("Continuity deterministic index is missing.");
    const counts = parseJson<Record<string, unknown>>(
      indexRow.candidate_counts_json,
      {},
    );
    if (counts.auxiliaryFingerprint === input.sourceFingerprint) {
      rescanDeterministicConcernsInTransaction(db, source, now);
      db.exec("COMMIT");
      return;
    }

    const storedEntities = db
      .prepare(
        `SELECT id, canonical_name, description, locked, anchors_json
           FROM slate_continuity_entities
          WHERE user_id = ? AND series_id = ?`,
      )
      .all(source.user_id, source.series_id) as unknown as StoredAuxiliaryEntity[];
    const entityById = new Map(storedEntities.map((entity) => [entity.id, entity]));
    const entityByName = new Map(
      storedEntities.map((entity) => [
        normalizeContinuityName(entity.canonical_name),
        entity,
      ]),
    );
    const storedAliases = db
      .prepare(
        `SELECT normalized_alias, entity_id FROM slate_continuity_aliases
          WHERE user_id = ? AND series_id = ?`,
      )
      .all(source.user_id, source.series_id) as Array<{
      normalized_alias: string;
      entity_id: string;
    }>;
    for (const alias of storedAliases) {
      const target = entityById.get(alias.entity_id);
      if (target) entityByName.set(alias.normalized_alias, target);
    }

    const ensureEntity = (candidate: {
      name: string;
      kind: string;
      aliases?: readonly string[];
      description?: string;
      anchors: readonly SlateContinuitySourceAnchor[];
    }): StoredAuxiliaryEntity => {
      const normalizedName = normalizeContinuityName(candidate.name);
      let entity = entityByName.get(normalizedName);
      if (!entity) {
        const id = stableId("continuity-entity", [
          source.series_id,
          normalizedName,
        ]);
        entity = {
          id,
          canonical_name: candidate.name,
          description: candidate.description ?? "",
          locked: 0,
          anchors_json: JSON.stringify(candidate.anchors),
        };
        db.prepare(
          `INSERT OR IGNORE INTO slate_continuity_entities
            (id, user_id, series_id, kind, canonical_name, description,
             locked, anchors_json, source_id, producer_versions_json,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          source.user_id,
          source.series_id,
          candidate.kind,
          candidate.name,
          candidate.description ?? "",
          entity.anchors_json,
          source.id,
          versionsJson,
          now,
          now,
        );
        entityById.set(id, entity);
        entityByName.set(normalizedName, entity);
      } else {
        entity.anchors_json = JSON.stringify(
          mergeAnchors(entity.anchors_json, candidate.anchors),
        );
        const description =
          entity.locked === 0 && !entity.description && candidate.description
            ? candidate.description
            : entity.description;
        entity.description = description;
        db.prepare(
          `UPDATE slate_continuity_entities
              SET description = ?, anchors_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`,
        ).run(
          description,
          entity.anchors_json,
          now,
          entity.id,
          source.user_id,
        );
      }
      for (const rawAlias of candidate.aliases ?? []) {
        const normalizedAlias = normalizeContinuityName(rawAlias);
        if (!normalizedAlias || normalizedAlias === normalizedName) continue;
        const mapped = entityByName.get(normalizedAlias);
        if (mapped && mapped.id !== entity.id) continue;
        db.prepare(
          `INSERT INTO slate_continuity_aliases
            (id, user_id, series_id, entity_id, alias, normalized_alias,
             source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, series_id, entity_id, normalized_alias)
           DO UPDATE SET alias = excluded.alias,
                         source_id = excluded.source_id,
                         created_at = excluded.created_at`,
        ).run(
          stableId("continuity-alias", [
            source.series_id,
            entity.id,
            normalizedAlias,
          ]),
          source.user_id,
          source.series_id,
          entity.id,
          rawAlias,
          normalizedAlias,
          source.id,
          now,
        );
        entityByName.set(normalizedAlias, entity);
      }
      return entity;
    };

    for (const candidate of extraction.entities) {
      ensureEntity({
        name: candidate.canonicalName,
        kind: candidate.kind,
        aliases: candidate.aliases,
        description: candidate.description,
        anchors: candidate.anchors,
      });
    }

    const persistedClaimIds = new Map<string, string>();
    for (const candidate of extraction.claims) {
      const downgradedToAmbiguity =
        candidate.epistemicStatus === "fact" && candidate.confidence < 0.7;
      const epistemicStatus = downgradedToAmbiguity
        ? "ambiguity"
        : candidate.epistemicStatus;
      const subject = ensureEntity({
        name: candidate.subjectName,
        kind: "concept",
        anchors: candidate.anchors,
      });
      const object = candidate.objectName
        ? ensureEntity({
            name: candidate.objectName,
            kind: "concept",
            anchors: candidate.anchors,
          })
        : null;
      const perspective = candidate.perspectiveName
        ? ensureEntity({
            name: candidate.perspectiveName,
            kind: "character",
            anchors: candidate.anchors,
          })
        : null;
      const duplicate = db
        .prepare(
          `SELECT id FROM slate_continuity_claims
            WHERE user_id = ? AND source_id = ? AND subject_entity_id = ?
              AND predicate = ?
              AND COALESCE(object_entity_id, '') = COALESCE(?, '')
              AND value = ? AND epistemic_status = ?
            LIMIT 1`,
        )
        .get(
          source.user_id,
          source.id,
          subject.id,
          candidate.predicate,
          object?.id ?? null,
          candidate.value,
          epistemicStatus,
        ) as { id: string } | undefined;
      const claimId =
        duplicate?.id ??
        stableId("continuity-claim", [source.id, candidate.candidateId]);
      if (!duplicate) {
        db.prepare(
          `INSERT OR IGNORE INTO slate_continuity_claims
            (id, user_id, series_id, project_id, section_id, scope_kind,
             subject_entity_id, predicate, object_entity_id, value,
             epistemic_status, perspective_entity_id, confidence, anchors_json,
             source_id, supersedes_claim_id, producer_versions_json, created_at)
           VALUES (?, ?, ?, ?, ?, 'section', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        ).run(
          claimId,
          source.user_id,
          source.series_id,
          source.project_id,
          source.section_id,
          subject.id,
          candidate.predicate,
          object?.id ?? null,
          candidate.value,
          epistemicStatus,
          perspective?.id ?? null,
          candidate.confidence,
          JSON.stringify(candidate.anchors),
          source.id,
          versionsJson,
          now,
        );
      }
      persistedClaimIds.set(candidate.candidateId, claimId);
      if (downgradedToAmbiguity) {
        db.prepare(
          `INSERT OR IGNORE INTO slate_continuity_concerns
            (id, user_id, series_id, project_id, section_id, scope_kind, kind,
             severity, status, summary, explanation, claim_ids_json,
             anchors_json, recommended_resolution, resolution_json,
             producer_versions_json, created_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, 'section', 'ambiguous_extraction', 'note',
                   'open', ?, ?, ?, ?, 'dismiss_extraction', NULL, ?, ?, NULL)`,
        ).run(
          stableId("continuity-concern", [
            source.id,
            candidate.candidateId,
            "low-confidence-fact",
          ]),
          source.user_id,
          source.series_id,
          source.project_id,
          source.section_id,
          `Slate is unsure whether “${candidate.value.slice(0, 120)}” is established fact.`,
          "Continuity kept this as deliberate ambiguity because the local extraction confidence was below the fact threshold.",
          JSON.stringify([claimId]),
          JSON.stringify(candidate.anchors),
          versionsJson,
          now,
        );
      }
    }

    for (const candidate of extraction.events) {
      if (candidate.epistemicStatus !== "fact") continue;
      const participants = candidate.participantNames.map((name) =>
        ensureEntity({
          name,
          kind: "character",
          anchors: candidate.anchors,
        }),
      );
      const location = candidate.locationName
        ? ensureEntity({
            name: candidate.locationName,
            kind: "location",
            anchors: candidate.anchors,
          })
        : null;
      db.prepare(
        `INSERT OR IGNORE INTO slate_continuity_events
          (id, user_id, series_id, project_id, section_id, scope_kind, title,
           description, chronology_key, participant_entity_ids_json,
           location_entity_id, anchors_json, source_id,
           producer_versions_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'section', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        stableId("continuity-event", [source.id, candidate.candidateId]),
        source.user_id,
        source.series_id,
        source.project_id,
        source.section_id,
        candidate.title,
        candidate.description,
        candidate.chronologyKey,
        JSON.stringify(participants.map((participant) => participant.id)),
        location?.id ?? null,
        JSON.stringify(candidate.anchors),
        source.id,
        versionsJson,
        now,
      );
    }

    for (const candidate of extraction.relationships) {
      const from = ensureEntity({
        name: candidate.fromName,
        kind: "character",
        anchors: candidate.anchors,
      });
      const to = ensureEntity({
        name: candidate.toName,
        kind: "concept",
        anchors: candidate.anchors,
      });
      db.prepare(
        `INSERT OR IGNORE INTO slate_continuity_relationships
          (id, user_id, series_id, from_entity_id, to_entity_id, kind, state,
           epistemic_status, anchors_json, source_id,
           producer_versions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        stableId("continuity-relationship", [
          source.id,
          candidate.candidateId,
        ]),
        source.user_id,
        source.series_id,
        from.id,
        to.id,
        candidate.kind,
        candidate.state,
        candidate.epistemicStatus,
        JSON.stringify(candidate.anchors),
        source.id,
        versionsJson,
        now,
      );
    }

    for (const candidate of extraction.threads) {
      const threadId = stableId("continuity-thread", [
        source.series_id,
        normalizeContinuityName(candidate.label),
      ]);
      const existing = db
        .prepare(
          `SELECT anchors_json FROM slate_continuity_threads
            WHERE id = ? AND user_id = ?`,
        )
        .get(threadId, source.user_id) as { anchors_json: string } | undefined;
      if (existing) {
        db.prepare(
          `UPDATE slate_continuity_threads
              SET anchors_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`,
        ).run(
          JSON.stringify(mergeAnchors(existing.anchors_json, candidate.anchors)),
          now,
          threadId,
          source.user_id,
        );
      } else {
        db.prepare(
          `INSERT INTO slate_continuity_threads
            (id, user_id, series_id, project_id, section_id, scope_kind, label,
             status, due_section_id, anchors_json, source_id,
             producer_versions_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'book', ?, 'open', NULL, ?, ?, ?, ?, ?)`,
        ).run(
          threadId,
          source.user_id,
          source.series_id,
          source.project_id,
          source.section_id,
          candidate.label,
          JSON.stringify(candidate.anchors),
          source.id,
          versionsJson,
          now,
          now,
        );
      }
    }

    for (const candidate of reconciliation.concerns) {
      const newClaimIds = candidate.newClaimIds
        .map((candidateId) => persistedClaimIds.get(candidateId))
        .filter((id): id is string => Boolean(id));
      const claimIds = [...new Set([...newClaimIds, ...candidate.existingClaimIds])];
      const existingAnchors = claimIds.flatMap((claimId) => {
        const row = db
          .prepare(
            `SELECT anchors_json FROM slate_continuity_claims
              WHERE id = ? AND user_id = ?`,
          )
          .get(claimId, source.user_id) as { anchors_json: string } | undefined;
        return row
          ? parseJson<SlateContinuitySourceAnchor[]>(row.anchors_json, [])
          : [];
      });
      const anchors = mergeAnchors(
        JSON.stringify(existingAnchors),
        candidate.anchors,
      );
      db.prepare(
        `INSERT OR IGNORE INTO slate_continuity_concerns
          (id, user_id, series_id, project_id, section_id, scope_kind, kind,
           severity, status, summary, explanation, claim_ids_json,
           anchors_json, recommended_resolution, resolution_json,
           producer_versions_json, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, 'section', ?, ?, 'open', ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      ).run(
        stableId("continuity-concern", [source.id, candidate.candidateId]),
        source.user_id,
        source.series_id,
        source.project_id,
        source.section_id,
        candidate.kind,
        candidate.severity,
        candidate.summary,
        candidate.explanation,
        JSON.stringify(claimIds),
        JSON.stringify(anchors),
        candidate.recommendedResolution,
        versionsJson,
        now,
      );
    }

    rescanDeterministicConcernsInTransaction(db, source, now);

    db.prepare(
      `UPDATE slate_continuity_source_indexes
          SET candidate_counts_json = ?, updated_at = ?
        WHERE source_id = ? AND user_id = ?`,
    ).run(
      JSON.stringify({
        ...counts,
        auxiliaryFingerprint: input.sourceFingerprint,
        auxiliary: {
          entities: extraction.entities.length,
          claims: extraction.claims.length,
          events: extraction.events.length,
          relationships: extraction.relationships.length,
          threads: extraction.threads.length,
          concerns: reconciliation.concerns.length,
          provider: extraction.provider,
          model: extraction.model,
        },
      }),
      now,
      source.id,
      source.user_id,
    );
    db.prepare(
      `UPDATE slate_projects SET continuity_last_success_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, source.project_id, source.user_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function lockedRanges(raw: string, proseLength: number): SlateLockedRange[] {
  return parseJson<SlateLockedRange[]>(raw, []).filter(
    (range) =>
      Number.isInteger(range.start) &&
      Number.isInteger(range.end) &&
      range.start >= 0 &&
      range.end > range.start &&
      range.end <= proseLength,
  );
}

function relevanceFor(text: string, focus: string): number {
  const normalized = normalizeContinuityName(text);
  if (!normalized) return 0;
  return normalizeContinuityName(focus).includes(normalized) ? 1 : 0.2;
}

export function compileSlateDraftContinuityContext(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  structureItemId: string,
  immediateDirection: string,
  tokenBudget = 8_192,
) {
  const project = db
    .prepare(
      `SELECT id, series_id, title, premise, voice, non_negotiables_json,
              structure_json, direction
         FROM slate_projects WHERE id = ? AND user_id = ?`,
    )
    .get(projectId, userId) as DraftProjectRow | undefined;
  if (!project) throw new Error("Slate project not found.");
  const sections = db
    .prepare(
      `SELECT id, structure_item_id, ordinal, title, summary, direction, prose,
              locked_ranges_json, locked, revision
         FROM slate_sections
        WHERE project_id = ? AND user_id = ? ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as DraftSectionRow[];
  const focused = sections.find(
    (section) => section.structure_item_id === structureItemId,
  );
  if (!focused) throw new Error("Slate section not found.");
  const structure = parseJson<SlateStructureItem[]>(project.structure_json, []);
  const structureIndex = structure.findIndex((item) => item.id === structureItemId);
  const focusText = [
    project.title,
    project.premise,
    focused.title,
    focused.summary,
    focused.direction,
    immediateDirection,
  ].join(" ");
  const candidates: ContinuityContextCandidate[] = [
    {
      id: `focus-${focused.id}`,
      kind: "focused_section",
      text: `${focused.title}: ${focused.summary || "Follow the approved section plan."}`,
      required: true,
    },
  ];
  const writerDirection =
    immediateDirection.trim() || focused.direction.trim() || project.direction.trim();
  if (writerDirection) {
    candidates.push({
      id: "writer-direction",
      kind: "writer_direction",
      text: writerDirection,
      required: true,
    });
  }
  parseJson<string[]>(project.non_negotiables_json, []).forEach(
    (nonNegotiable, index) => {
      if (!nonNegotiable.trim()) return;
      candidates.push({
        id: `non-negotiable-${index}`,
        kind: "non_negotiable",
        text: nonNegotiable,
        required: true,
      });
    },
  );
  for (const range of lockedRanges(
    focused.locked_ranges_json,
    focused.prose.length,
  )) {
    candidates.push({
      id: `lock-${focused.id}-${range.id}`,
      kind: "locked_instruction",
      text: `${focused.title}: ${focused.prose.slice(range.start, range.end)}`,
      required: true,
    });
  }
  for (const offset of [-1, 1]) {
    const item = structure[structureIndex + offset];
    if (!item) continue;
    candidates.push({
      id: `adjacent-${item.id}`,
      kind: "adjacent_section",
      sectionId:
        sections.find((section) => section.structure_item_id === item.id)?.id ??
        item.id,
      text: `${item.title}: ${item.summary}`,
      distance: Math.abs(offset),
      ordinal: structureIndex + offset,
    });
  }
  const previous = sections
    .filter(
      (section) =>
        section.ordinal < focused.ordinal && section.prose.trim().length > 0,
    )
    .at(-1);
  if (previous) {
    candidates.push({
      id: `previous-tail-${previous.id}`,
      kind: "adjacent_section",
      sectionId: previous.id,
      text: `${previous.title} ending: ${previous.prose.slice(-4_000)}`,
      distance: 1,
      ordinal: previous.ordinal,
      relevance: 1,
    });
  }

  const currentCanon = new SlateContinuityCurrentCanonResolver(
    db,
    userId,
    project.series_id,
  );
  const entityRows = db
    .prepare(
      `SELECT entities.id, entities.canonical_name, entities.description,
              entities.locked, entities.anchors_json, entities.source_id
         FROM slate_continuity_entities entities
        WHERE entities.user_id = ? AND entities.series_id = ?
        ORDER BY entities.canonical_name ASC
        LIMIT 10000`,
    )
    .all(userId, project.series_id) as Array<{
    id: string;
    canonical_name: string;
    description: string;
    locked: number;
    anchors_json: string;
    source_id: string | null;
  }>;
  const aliasRows = db
    .prepare(
      `SELECT entity_id, alias, source_id
         FROM slate_continuity_aliases
        WHERE user_id = ? AND series_id = ?
        ORDER BY alias ASC`,
    )
    .all(userId, project.series_id) as Array<{
    entity_id: string;
    alias: string;
    source_id: string | null;
  }>;
  const aliasesByEntityId = new Map<string, string[]>();
  for (const alias of aliasRows) {
    if (
      alias.source_id &&
      !currentCanon.sourceEvidenceStillCurrent(alias.source_id, alias.alias)
    ) {
      continue;
    }
    const aliases = aliasesByEntityId.get(alias.entity_id) ?? [];
    aliases.push(alias.alias);
    aliasesByEntityId.set(alias.entity_id, aliases);
  }
  const entityNameById = new Map(
    entityRows.map((entity) => [entity.id, entity.canonical_name]),
  );
  const focusedEntityIds = new Set<string>();
  for (const entity of entityRows) {
    if (
      entity.locked !== 1 &&
      !currentCanon.recordIsCurrent(entity.anchors_json, entity.source_id)
    ) {
      continue;
    }
    const aliases = aliasesByEntityId.get(entity.id)?.join(" | ") ?? "";
    const relevance = Math.max(
      relevanceFor(entity.canonical_name, focusText),
      relevanceFor(aliases, focusText),
    );
    if (relevance === 1) focusedEntityIds.add(entity.id);
    const originatingAnchors = parseJson<SlateContinuitySourceAnchor[]>(
      entity.anchors_json,
      [],
    ).filter((anchor) => anchor.sourceId === entity.source_id);
    const description =
      entity.description &&
      (entity.locked === 1 ||
        entity.source_id === null ||
        currentCanon.recordIsCurrent(
          JSON.stringify(originatingAnchors),
          entity.source_id,
        ))
        ? entity.description
        : "";
    candidates.push({
      id: entity.id,
      kind: "entity",
      text: `${entity.canonical_name}${aliases ? ` (${aliases})` : ""}${description ? ` — ${description}` : ""}`,
      relevance,
    });
  }
  const claimRows = db
    .prepare(
      `SELECT id, project_id, subject_entity_id, predicate, object_entity_id, value,
              epistemic_status, confidence, created_at, anchors_json, source_id
         FROM slate_continuity_claims
        WHERE user_id = ? AND series_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM slate_continuity_claims replacement
             WHERE replacement.user_id = slate_continuity_claims.user_id
               AND replacement.supersedes_claim_id = slate_continuity_claims.id
          )
        ORDER BY created_at DESC, id ASC
        LIMIT 4096`,
    )
    .all(userId, project.series_id) as Array<{
    id: string;
    project_id: string | null;
    subject_entity_id: string | null;
    predicate: string;
    object_entity_id: string | null;
    value: string;
    epistemic_status: string;
    confidence: number;
    created_at: string;
    anchors_json: string;
    source_id: string;
  }>;
  const seenClaims = new Set<string>();
  const claimTextById = new Map<string, string>();
  const currentClaimIds = new Set<string>();
  for (const claim of claimRows) {
    if (!currentCanon.recordIsCurrent(claim.anchors_json, claim.source_id)) {
      continue;
    }
    const subject = claim.subject_entity_id
      ? entityNameById.get(claim.subject_entity_id) ?? "Unknown"
      : "Narrative";
    const object = claim.object_entity_id
      ? entityNameById.get(claim.object_entity_id) ?? claim.value
      : claim.value;
    const semanticKey = `${subject}:${claim.predicate}:${object}:${claim.epistemic_status}`;
    if (seenClaims.has(semanticKey)) continue;
    seenClaims.add(semanticKey);
    const claimText = `${subject} ${claim.predicate} ${object} [${claim.epistemic_status}]`;
    claimTextById.set(claim.id, claimText);
    currentClaimIds.add(claim.id);
    const touchesFocus =
      (claim.subject_entity_id !== null &&
        focusedEntityIds.has(claim.subject_entity_id)) ||
      (claim.object_entity_id !== null &&
        focusedEntityIds.has(claim.object_entity_id));
    candidates.push({
      id: claim.id,
      kind: "claim",
      text: claimText,
      relevance: touchesFocus
        ? 1
        : claim.project_id === projectId
          ? 0.8
          : claim.project_id === null
            ? 0.7
            : Math.min(0.6, (Number(claim.confidence) || 0) * 0.6),
    });
  }

  const relationshipRows = db
    .prepare(
      `SELECT id, from_entity_id, to_entity_id, kind, state, epistemic_status,
              anchors_json, source_id
         FROM slate_continuity_relationships
        WHERE user_id = ? AND series_id = ?
        ORDER BY created_at DESC, id ASC
        LIMIT 2048`,
    )
    .all(userId, project.series_id) as Array<{
    id: string;
    from_entity_id: string;
    to_entity_id: string;
    kind: string;
    state: string;
    epistemic_status: string;
    anchors_json: string;
    source_id: string;
  }>;
  for (const relationship of relationshipRows) {
    if (
      !currentCanon.recordIsCurrent(
        relationship.anchors_json,
        relationship.source_id,
      )
    ) {
      continue;
    }
    const from = entityNameById.get(relationship.from_entity_id) ?? "Unknown";
    const to = entityNameById.get(relationship.to_entity_id) ?? "Unknown";
    candidates.push({
      id: relationship.id,
      kind: "relationship",
      text: `${from} — ${relationship.kind}${relationship.state ? ` (${relationship.state})` : ""} — ${to} [${relationship.epistemic_status}]`,
      relevance:
        focusedEntityIds.has(relationship.from_entity_id) ||
        focusedEntityIds.has(relationship.to_entity_id)
          ? 1
          : 0.55,
    });
  }

  const eventRows = db
    .prepare(
      `SELECT id, title, description, chronology_key,
              participant_entity_ids_json, location_entity_id, anchors_json,
              source_id
         FROM slate_continuity_events
        WHERE user_id = ? AND series_id = ?
        ORDER BY created_at DESC, id ASC
        LIMIT 2048`,
    )
    .all(userId, project.series_id) as Array<{
    id: string;
    title: string;
    description: string;
    chronology_key: string | null;
    participant_entity_ids_json: string;
    location_entity_id: string | null;
    anchors_json: string;
    source_id: string;
  }>;
  const currentEventIds = new Set<string>();
  for (const event of eventRows) {
    if (!currentCanon.recordIsCurrent(event.anchors_json, event.source_id)) {
      continue;
    }
    currentEventIds.add(event.id);
    const participants = parseJson<string[]>(
      event.participant_entity_ids_json,
      [],
    );
    const location = event.location_entity_id
      ? entityNameById.get(event.location_entity_id)
      : null;
    candidates.push({
      id: event.id,
      kind: "event",
      text: `${event.title}${event.chronology_key ? ` (${event.chronology_key})` : ""}: ${event.description}${location ? ` @ ${location}` : ""}`,
      relevance:
        participants.some((entityId) => focusedEntityIds.has(entityId)) ||
        (event.location_entity_id !== null &&
          focusedEntityIds.has(event.location_entity_id))
          ? 1
          : relevanceFor(`${event.title} ${event.description}`, focusText),
    });
  }

  const knowledgeRows = db
    .prepare(
      `SELECT id, character_entity_id, claim_id, learned_event_id, status,
              anchors_json, source_id
         FROM slate_continuity_knowledge
        WHERE user_id = ? AND series_id = ?
        ORDER BY created_at DESC, id ASC
        LIMIT 2048`,
    )
    .all(userId, project.series_id) as Array<{
    id: string;
    character_entity_id: string;
    claim_id: string;
    learned_event_id: string | null;
    status: string;
    anchors_json: string;
    source_id: string;
  }>;
  for (const knowledge of knowledgeRows) {
    if (
      !currentCanon.recordIsCurrent(knowledge.anchors_json, knowledge.source_id) ||
      !currentClaimIds.has(knowledge.claim_id) ||
      (knowledge.learned_event_id !== null &&
        !currentEventIds.has(knowledge.learned_event_id))
    ) {
      continue;
    }
    const character =
      entityNameById.get(knowledge.character_entity_id) ?? "Unknown character";
    const knownClaim = claimTextById.get(knowledge.claim_id) ?? knowledge.claim_id;
    candidates.push({
      id: knowledge.id,
      kind: "knowledge",
      text: `${character} ${knowledge.status.replaceAll("_", " ")}: ${knownClaim}`,
      relevance: focusedEntityIds.has(knowledge.character_entity_id) ? 1 : 0.6,
    });
  }
  const threads = db
    .prepare(
      `SELECT id, label, due_section_id, anchors_json, source_id
         FROM slate_continuity_threads
        WHERE user_id = ? AND series_id = ?
          AND (project_id = ? OR project_id IS NULL)
          AND status IN ('open', 'due')
        ORDER BY updated_at ASC, id ASC`,
    )
    .all(userId, project.series_id, projectId) as Array<{
    id: string;
    label: string;
    due_section_id: string | null;
    anchors_json: string;
    source_id: string;
  }>;
  for (const thread of threads) {
    if (!currentCanon.recordIsCurrent(thread.anchors_json, thread.source_id)) {
      continue;
    }
    candidates.push({
      id: thread.id,
      kind: "due_thread",
      text: thread.label,
      relevance: thread.due_section_id === focused.id ? 1 : 0.55,
    });
  }

  const compiled = compileContinuityContextBrief({
    projectId,
    sectionId: focused.id,
    sectionRevision: focused.revision,
    candidates,
    tokenBudget,
  });
  db.prepare(
    `INSERT OR IGNORE INTO slate_continuity_context_briefs
      (id, user_id, project_id, section_id, section_revision,
       source_fingerprint, rendered_brief, token_estimate, token_budget,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    stableId("continuity-context", [projectId, compiled.sourceFingerprint]),
    userId,
    projectId,
    focused.id,
    focused.revision,
    compiled.sourceFingerprint,
    compiled.renderedBrief,
    compiled.tokenEstimate,
    compiled.tokenBudget,
    JSON.stringify(compiled.producerVersions),
    new Date().toISOString(),
  );
  return compiled;
}
