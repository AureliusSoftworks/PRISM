import type { DatabaseSync } from "node:sqlite";

const DEFAULT_MAX_JOBS_PER_CYCLE = 8;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_AFTER_MS = 10 * 60_000;
const DEFAULT_RETRY_BASE_MS = 2_000;
const DEFAULT_RETRY_MAX_MS = 5 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_ERROR_LENGTH = 2_000;

type JobRow = {
  id: string;
  user_id: string;
  series_id: string;
  project_id: string;
  section_id: string | null;
  source_id: string | null;
  source_revision: number | null;
  kind: string;
  status: string;
  attempts: number;
  input_fingerprint: string;
  error: string | null;
  available_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  preferred_provider: string;
};

type CoalescingRow = Pick<
  JobRow,
  | "id"
  | "user_id"
  | "project_id"
  | "section_id"
  | "kind"
  | "source_revision"
  | "created_at"
>;

export type SlateContinuityModelLane = "local" | "online";

export interface SlateContinuityJob {
  id: string;
  userId: string;
  seriesId: string;
  projectId: string;
  sectionId: string | null;
  sourceId: string | null;
  sourceRevision: number | null;
  kind: string;
  attempt: number;
  inputFingerprint: string;
  availableAt: string;
  startedAt: string;
  createdAt: string;
  accountProvider: string;
  modelLane: SlateContinuityModelLane;
}

export interface SlateContinuityDeterministicResult {
  /** Deterministic indexing should leave this false whenever it can finish alone. */
  requiresModel?: boolean;
  /** Opaque, bounded input prepared for the selected model lane. */
  modelInput?: unknown;
}

export interface SlateContinuityDeterministicProcessorContext {
  db: DatabaseSync;
  job: SlateContinuityJob;
}

export interface SlateContinuityModelProcessorContext
  extends SlateContinuityDeterministicProcessorContext {
  deterministic: SlateContinuityDeterministicResult;
  modelInput: unknown;
}

export type SlateContinuityDeterministicProcessor = (
  context: SlateContinuityDeterministicProcessorContext,
) =>
  | SlateContinuityDeterministicResult
  | void
  | Promise<SlateContinuityDeterministicResult | void>;

export type SlateContinuityModelProcessor = (
  context: SlateContinuityModelProcessorContext,
) => void | Promise<void>;

export interface SlateContinuityJobProcessors {
  deterministic: SlateContinuityDeterministicProcessor;
  /** Used exclusively when the account's effective default is LOCAL. */
  localModel?: SlateContinuityModelProcessor;
  /** Used exclusively for explicit online account defaults. */
  onlineModel?: SlateContinuityModelProcessor;
}

export interface SlateContinuityWorkerOptions {
  maxJobsPerCycle?: number;
  maxAttempts?: number;
  staleAfterMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  now?: () => Date;
}

export interface SlateContinuityWorkerFailure {
  jobId: string;
  error: string;
  retryScheduled: boolean;
}

export interface SlateContinuityWorkerCycleResult {
  claimed: number;
  completed: number;
  superseded: number;
  lostLeases: number;
  failures: SlateContinuityWorkerFailure[];
}

export interface SlateContinuityWorkerHandle {
  runNow(): Promise<SlateContinuityWorkerCycleResult>;
  stop(): Promise<void>;
}

export interface StartSlateContinuityWorkerOptions
  extends SlateContinuityWorkerOptions {
  db: DatabaseSync;
  processors: SlateContinuityJobProcessors;
  pollIntervalMs?: number;
  onCycleError?: (error: unknown) => void;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function iso(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Slate Continuity worker clock returned an invalid date.");
  }
  return date.toISOString();
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Slate Continuity processing failed.").slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

function modelLaneFor(
  kind: string,
  accountProvider: string,
): SlateContinuityModelLane {
  // Routine extraction/recap work stays on PRISM's local auxiliary lane even
  // for online accounts. Only explicitly high-impact uncertainty jobs may use
  // the account's effective online provider. Unknown kinds fail closed LOCAL.
  const onlineEligible =
    kind === "resolve_high_impact" || kind === "reconcile_high_impact";
  return onlineEligible &&
    (accountProvider === "openai" || accountProvider === "anthropic")
    ? "online"
    : "local";
}

function jobFromRow(row: JobRow, startedAt: string): SlateContinuityJob {
  return {
    id: row.id,
    userId: row.user_id,
    seriesId: row.series_id,
    projectId: row.project_id,
    sectionId: row.section_id,
    sourceId: row.source_id,
    sourceRevision: row.source_revision,
    kind: row.kind,
    attempt: row.attempts + 1,
    inputFingerprint: row.input_fingerprint,
    availableAt: row.available_at,
    startedAt,
    createdAt: row.created_at,
    accountProvider: row.preferred_provider,
    modelLane: modelLaneFor(row.kind, row.preferred_provider),
  };
}

function rollbackQuietly(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}

function isNewerJob(candidate: CoalescingRow, current: CoalescingRow): boolean {
  const candidateRevision = candidate.source_revision ?? -1;
  const currentRevision = current.source_revision ?? -1;
  if (candidateRevision !== currentRevision) {
    return candidateRevision > currentRevision;
  }
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  return candidate.id > current.id;
}

/**
 * Coalesce only source-extraction work, where a newer section revision fully
 * supersedes an older queued revision. Project-wide job kinds may be additive
 * and are intentionally left alone.
 */
function coalesceQueuedExtractionJobs(
  db: DatabaseSync,
  now: string,
): number {
  const rows = db
    .prepare(
      `SELECT id, user_id, project_id, section_id, kind,
              source_revision, created_at
         FROM slate_continuity_jobs
        WHERE status = 'queued'
          AND kind = 'extract_source'
          AND section_id IS NOT NULL
          AND source_revision IS NOT NULL`,
    )
    .all() as CoalescingRow[];
  const newestByScope = new Map<string, CoalescingRow>();

  for (const row of rows) {
    const key = `${row.user_id}\u0000${row.project_id}\u0000${row.section_id}\u0000${row.kind}`;
    const current = newestByScope.get(key);
    if (!current || isNewerJob(row, current)) {
      newestByScope.set(key, row);
    }
  }

  const supersede = db.prepare(
    `UPDATE slate_continuity_jobs
        SET status = 'superseded',
            error = ?,
            completed_at = ?,
            updated_at = ?
      WHERE id = ? AND status = 'queued'`,
  );
  let count = 0;
  for (const row of rows) {
    const key = `${row.user_id}\u0000${row.project_id}\u0000${row.section_id}\u0000${row.kind}`;
    const newest = newestByScope.get(key);
    if (!newest || newest.id === row.id) continue;
    const result = supersede.run(
      `Superseded by newer source revision ${newest.source_revision}.`,
      now,
      now,
      row.id,
    );
    count += Number(result.changes);
  }
  return count;
}

function recoverExpiredLeases(
  db: DatabaseSync,
  now: string,
  cutoff: string,
  maxAttempts: number,
): void {
  db.prepare(
    `UPDATE slate_continuity_jobs
        SET status = 'failed',
            error = 'Worker lease expired after the final permitted attempt.',
            completed_at = ?,
            updated_at = ?
      WHERE status = 'running'
        AND (started_at IS NULL OR started_at <= ?)
        AND attempts >= ?`,
  ).run(now, now, cutoff, maxAttempts);
  db.prepare(
    `UPDATE slate_continuity_jobs
        SET status = 'queued',
            error = 'Recovered after an expired worker lease.',
            available_at = ?,
            started_at = NULL,
            updated_at = ?
      WHERE status = 'running'
        AND (started_at IS NULL OR started_at <= ?)
        AND attempts < ?`,
  ).run(now, now, cutoff, maxAttempts);
}

export interface ClaimSlateContinuityJobOptions {
  now?: Date;
  staleAfterMs?: number;
  maxAttempts?: number;
}

/** Claim one job under an IMMEDIATE transaction so two workers cannot win it. */
export function claimNextSlateContinuityJob(
  db: DatabaseSync,
  options: ClaimSlateContinuityJobOptions = {},
): { job: SlateContinuityJob | null; superseded: number } {
  const nowDate = options.now ?? new Date();
  const now = iso(nowDate);
  const staleAfterMs = nonNegativeNumber(
    options.staleAfterMs,
    DEFAULT_STALE_AFTER_MS,
  );
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const cutoff = iso(new Date(nowDate.getTime() - staleAfterMs));

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    recoverExpiredLeases(db, now, cutoff, maxAttempts);
    const superseded = coalesceQueuedExtractionJobs(db, now);
    const row = db
      .prepare(
        `SELECT jobs.*, users.preferred_provider
           FROM slate_continuity_jobs AS jobs
           JOIN users ON users.id = jobs.user_id
          WHERE jobs.status = 'queued'
            AND jobs.available_at <= ?
          ORDER BY jobs.available_at ASC, jobs.created_at ASC, jobs.id ASC
          LIMIT 1`,
      )
      .get(now) as JobRow | undefined;

    if (!row) {
      db.exec("COMMIT");
      return { job: null, superseded };
    }

    const claimed = db
      .prepare(
        `UPDATE slate_continuity_jobs
            SET status = 'running',
                attempts = attempts + 1,
                error = NULL,
                started_at = ?,
                completed_at = NULL,
                updated_at = ?
          WHERE id = ? AND status = 'queued'`,
      )
      .run(now, now, row.id);
    if (Number(claimed.changes) !== 1) {
      throw new Error("Slate Continuity job claim lost its transaction lock.");
    }

    db.exec("COMMIT");
    return { job: jobFromRow(row, now), superseded };
  } catch (error) {
    rollbackQuietly(db);
    throw error;
  }
}

function completeJob(
  db: DatabaseSync,
  job: SlateContinuityJob,
  now: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE slate_continuity_jobs
          SET status = 'completed',
              error = NULL,
              completed_at = ?,
              updated_at = ?
        WHERE id = ?
          AND status = 'running'
          AND started_at = ?`,
    )
    .run(now, now, job.id, job.startedAt);
  return Number(result.changes) === 1;
}

function retryDelayMs(
  attempt: number,
  retryBaseMs: number,
  retryMaxMs: number,
): number {
  const exponent = Math.max(0, Math.min(30, attempt - 1));
  return Math.min(retryMaxMs, retryBaseMs * 2 ** exponent);
}

function failJob(
  db: DatabaseSync,
  job: SlateContinuityJob,
  error: string,
  nowDate: Date,
  options: {
    maxAttempts: number;
    retryBaseMs: number;
    retryMaxMs: number;
  },
): { updated: boolean; retryScheduled: boolean } {
  const now = iso(nowDate);
  const retryScheduled = job.attempt < options.maxAttempts;
  const availableAt = retryScheduled
    ? iso(
        new Date(
          nowDate.getTime() +
            retryDelayMs(
              job.attempt,
              options.retryBaseMs,
              options.retryMaxMs,
            ),
        ),
      )
    : now;
  const result = db
    .prepare(
      `UPDATE slate_continuity_jobs
          SET status = ?,
              error = ?,
              available_at = ?,
              started_at = NULL,
              completed_at = ?,
              updated_at = ?
        WHERE id = ?
          AND status = 'running'
          AND started_at = ?`,
    )
    .run(
      retryScheduled ? "queued" : "failed",
      error,
      availableAt,
      retryScheduled ? null : now,
      now,
      job.id,
      job.startedAt,
    );
  return {
    updated: Number(result.changes) === 1,
    retryScheduled,
  };
}

function workerOptions(options: SlateContinuityWorkerOptions) {
  return {
    maxJobsPerCycle: positiveInteger(
      options.maxJobsPerCycle,
      DEFAULT_MAX_JOBS_PER_CYCLE,
    ),
    maxAttempts: positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    staleAfterMs: nonNegativeNumber(
      options.staleAfterMs,
      DEFAULT_STALE_AFTER_MS,
    ),
    retryBaseMs: nonNegativeNumber(
      options.retryBaseMs,
      DEFAULT_RETRY_BASE_MS,
    ),
    retryMaxMs: nonNegativeNumber(
      options.retryMaxMs,
      DEFAULT_RETRY_MAX_MS,
    ),
    now: options.now ?? (() => new Date()),
  };
}

export async function runSlateContinuityWorkerCycle(
  db: DatabaseSync,
  processors: SlateContinuityJobProcessors,
  options: SlateContinuityWorkerOptions = {},
): Promise<SlateContinuityWorkerCycleResult> {
  const resolved = workerOptions(options);
  const result: SlateContinuityWorkerCycleResult = {
    claimed: 0,
    completed: 0,
    superseded: 0,
    lostLeases: 0,
    failures: [],
  };

  for (let index = 0; index < resolved.maxJobsPerCycle; index += 1) {
    const claim = claimNextSlateContinuityJob(db, {
      now: resolved.now(),
      staleAfterMs: resolved.staleAfterMs,
      maxAttempts: resolved.maxAttempts,
    });
    result.superseded += claim.superseded;
    const job = claim.job;
    if (!job) break;
    result.claimed += 1;

    try {
      const deterministic =
        (await processors.deterministic({ db, job })) ?? {};
      if (deterministic.requiresModel === true) {
        const modelProcessor =
          job.modelLane === "local"
            ? processors.localModel
            : processors.onlineModel;
        if (!modelProcessor) {
          throw new Error(
            job.modelLane === "local"
              ? "No LOCAL Slate Continuity model processor is configured."
              : "No online Slate Continuity model processor is configured.",
          );
        }
        await modelProcessor({
          db,
          job,
          deterministic,
          modelInput: deterministic.modelInput,
        });
      }

      if (completeJob(db, job, iso(resolved.now()))) {
        result.completed += 1;
      } else {
        result.lostLeases += 1;
      }
    } catch (error) {
      const message = errorMessage(error);
      const failed = failJob(db, job, message, resolved.now(), resolved);
      if (!failed.updated) {
        result.lostLeases += 1;
        continue;
      }
      result.failures.push({
        jobId: job.id,
        error: message,
        retryScheduled: failed.retryScheduled,
      });
    }
  }

  return result;
}

/**
 * Start a non-overlapping background poller. The timer is unref'd so it cannot
 * keep the API process alive during shutdown or tests.
 */
export function startSlateContinuityWorker(
  options: StartSlateContinuityWorkerOptions,
): SlateContinuityWorkerHandle {
  const pollIntervalMs = positiveInteger(
    options.pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
  );
  let stopped = false;
  let active: Promise<SlateContinuityWorkerCycleResult> | null = null;

  const runNow = (): Promise<SlateContinuityWorkerCycleResult> => {
    if (active) return active;
    if (stopped) {
      return Promise.resolve({
        claimed: 0,
        completed: 0,
        superseded: 0,
        lostLeases: 0,
        failures: [],
      });
    }
    active = runSlateContinuityWorkerCycle(
      options.db,
      options.processors,
      options,
    ).finally(() => {
      active = null;
    });
    return active;
  };

  const timer = setInterval(() => {
    void runNow().catch((error) => options.onCycleError?.(error));
  }, pollIntervalMs);
  timer.unref();
  void runNow().catch((error) => options.onCycleError?.(error));

  return {
    runNow,
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      if (active) await active;
    },
  };
}
