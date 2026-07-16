import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  claimNextSlateContinuityJob,
  runSlateContinuityWorkerCycle,
} from "../slate-continuity-worker.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const BASE_TIME = "2026-07-16T12:00:00.000Z";

type Workspace = {
  userId: string;
  seriesId: string;
  projectId: string;
  sectionId: string;
};

type StoredJob = {
  status: string;
  attempts: number;
  source_revision: number | null;
  error: string | null;
  available_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function seedWorkspace(
  db: DatabaseSync,
  suffix: string,
  preferredProvider: "local" | "openai" | "anthropic" = "local",
): Workspace {
  const userId = `worker-user-${suffix}`;
  const seriesId = `worker-series-${suffix}`;
  const projectId = `worker-project-${suffix}`;
  const sectionId = `worker-section-${suffix}`;
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider,
       created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?, ?)`,
  ).run(
    userId,
    `${suffix}@worker.test`,
    suffix,
    preferredProvider,
    BASE_TIME,
    BASE_TIME,
  );
  db.prepare(
    `INSERT INTO slate_series
      (id, user_id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?)`,
  ).run(seriesId, userId, `Series ${suffix}`, BASE_TIME, BASE_TIME);
  db.prepare(
    `INSERT INTO slate_projects
      (id, user_id, series_id, title, spark, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'A spark.', ?, ?)`,
  ).run(projectId, userId, seriesId, `Book ${suffix}`, BASE_TIME, BASE_TIME);
  db.prepare(
    `INSERT INTO slate_sections
      (id, project_id, series_id, user_id, kind, ordinal, title, prose,
       content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scene', 0, 'Opening', '', 'empty', ?, ?)`,
  ).run(
    sectionId,
    projectId,
    seriesId,
    userId,
    BASE_TIME,
    BASE_TIME,
  );
  return { userId, seriesId, projectId, sectionId };
}

function queueJob(
  db: DatabaseSync,
  workspace: Workspace,
  input: {
    id: string;
    revision: number;
    createdAt?: string;
    availableAt?: string;
    status?: "queued" | "running";
    attempts?: number;
    startedAt?: string | null;
    kind?: string;
  },
): void {
  const createdAt = input.createdAt ?? BASE_TIME;
  const sourceId = `${input.id}-source`;
  db.prepare(
    `INSERT INTO slate_continuity_sources
      (id, user_id, series_id, project_id, section_id, scope_kind, kind,
       source_revision, content, content_hash, authority,
       producer_versions_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'section', 'human_edit', ?, ?, ?, 'human', '{}', ?)`,
  ).run(
    sourceId,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    workspace.sectionId,
    input.revision,
    `Revision ${input.revision}`,
    `hash-${input.revision}`,
    createdAt,
  );
  db.prepare(
    `INSERT INTO slate_continuity_jobs
      (id, user_id, series_id, project_id, section_id, source_id,
       source_revision, kind, status, attempts, input_fingerprint,
       available_at, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    workspace.userId,
    workspace.seriesId,
    workspace.projectId,
    workspace.sectionId,
    sourceId,
    input.revision,
    input.kind ?? "extract_source",
    input.status ?? "queued",
    input.attempts ?? 0,
    `fingerprint-${input.id}`,
    input.availableAt ?? createdAt,
    input.startedAt ?? null,
    createdAt,
    createdAt,
  );
}

function storedJob(db: DatabaseSync, id: string): StoredJob {
  return db
    .prepare(
      `SELECT status, attempts, source_revision, error, available_at,
              started_at, completed_at
         FROM slate_continuity_jobs
        WHERE id = ?`,
    )
    .get(id) as StoredJob;
}

describe("Slate Continuity background worker", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => closeTestDatabase(db));

  it("transactionally coalesces queued section revisions and claims only the newest", () => {
    const workspace = seedWorkspace(db, "coalesce");
    queueJob(db, workspace, {
      id: "older-job",
      revision: 1,
      createdAt: "2026-07-16T12:00:00.000Z",
    });
    queueJob(db, workspace, {
      id: "newer-job",
      revision: 2,
      createdAt: "2026-07-16T12:01:00.000Z",
    });

    const first = claimNextSlateContinuityJob(db, {
      now: new Date("2026-07-16T12:02:00.000Z"),
    });
    const second = claimNextSlateContinuityJob(db, {
      now: new Date("2026-07-16T12:02:00.000Z"),
    });

    assert.equal(first.superseded, 1);
    assert.equal(first.job?.id, "newer-job");
    assert.equal(first.job?.sourceRevision, 2);
    assert.equal(first.job?.attempt, 1);
    assert.equal(first.job?.modelLane, "local");
    assert.equal(second.job, null);
    assert.equal(storedJob(db, "older-job").status, "superseded");
    assert.equal(storedJob(db, "newer-job").status, "running");
  });

  it("dispatches model augmentation through the account's privacy lane", async () => {
    const local = seedWorkspace(db, "local-lane", "local");
    const online = seedWorkspace(db, "online-lane", "openai");
    const onlineRoutine = seedWorkspace(db, "online-routine", "openai");
    queueJob(db, local, { id: "local-job", revision: 1 });
    queueJob(db, online, {
      id: "online-job",
      revision: 1,
      kind: "resolve_high_impact",
      createdAt: "2026-07-16T12:00:01.000Z",
    });
    queueJob(db, onlineRoutine, {
      id: "online-routine-job",
      revision: 1,
      kind: "extract_source_auxiliary",
      createdAt: "2026-07-16T12:00:02.000Z",
    });
    const localCalls: string[] = [];
    const onlineCalls: string[] = [];

    const result = await runSlateContinuityWorkerCycle(
      db,
      {
        deterministic: ({ job }) => ({
          requiresModel: true,
          modelInput: { sourceId: job.sourceId },
        }),
        localModel: ({ job, modelInput }) => {
          assert.deepEqual(modelInput, { sourceId: job.sourceId });
          localCalls.push(job.id);
        },
        onlineModel: ({ job }) => {
          onlineCalls.push(job.id);
        },
      },
      {
        maxJobsPerCycle: 3,
        now: () => new Date("2026-07-16T12:03:00.000Z"),
      },
    );

    assert.equal(result.completed, 3);
    assert.deepEqual(localCalls, ["local-job", "online-routine-job"]);
    assert.deepEqual(onlineCalls, ["online-job"]);
    assert.equal(storedJob(db, "local-job").status, "completed");
    assert.equal(storedJob(db, "online-job").status, "completed");
  });

  it("never falls back to an online processor for LOCAL jobs and retries with backoff", async () => {
    const workspace = seedWorkspace(db, "local-no-fallback", "local");
    queueJob(db, workspace, { id: "private-job", revision: 1 });
    let onlineCalls = 0;
    let currentTime = new Date("2026-07-16T12:05:00.000Z");
    const processors = {
      deterministic: () => ({ requiresModel: true, modelInput: "bounded" }),
      onlineModel: () => {
        onlineCalls += 1;
      },
    };

    const first = await runSlateContinuityWorkerCycle(db, processors, {
      maxJobsPerCycle: 1,
      maxAttempts: 2,
      retryBaseMs: 1_000,
      retryMaxMs: 1_000,
      now: () => currentTime,
    });
    const afterFirst = storedJob(db, "private-job");

    assert.equal(onlineCalls, 0);
    assert.equal(first.failures[0]?.retryScheduled, true);
    assert.equal(afterFirst.status, "queued");
    assert.equal(afterFirst.attempts, 1);
    assert.equal(afterFirst.available_at, "2026-07-16T12:05:01.000Z");
    assert.match(afterFirst.error ?? "", /No LOCAL/i);

    currentTime = new Date("2026-07-16T12:05:01.000Z");
    const final = await runSlateContinuityWorkerCycle(db, processors, {
      maxJobsPerCycle: 1,
      maxAttempts: 2,
      retryBaseMs: 1_000,
      retryMaxMs: 1_000,
      now: () => currentTime,
    });
    const afterFinal = storedJob(db, "private-job");

    assert.equal(onlineCalls, 0);
    assert.equal(final.failures[0]?.retryScheduled, false);
    assert.equal(afterFinal.status, "failed");
    assert.equal(afterFinal.attempts, 2);
    assert.ok(afterFinal.completed_at);
  });

  it("recovers expired leases while preventing a stale worker from completing the reclaimed job", async () => {
    const workspace = seedWorkspace(db, "lease");
    queueJob(db, workspace, { id: "leased-job", revision: 1 });
    let processorStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      processorStarted = resolve;
    });
    let releaseProcessor!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });

    const firstCycle = runSlateContinuityWorkerCycle(
      db,
      {
        deterministic: async () => {
          processorStarted();
          await release;
        },
      },
      {
        maxJobsPerCycle: 1,
        staleAfterMs: 1_000,
        now: () => new Date("2026-07-16T12:10:00.000Z"),
      },
    );
    await started;

    const reclaimed = claimNextSlateContinuityJob(db, {
      now: new Date("2026-07-16T12:10:02.000Z"),
      staleAfterMs: 1_000,
      maxAttempts: 5,
    });
    assert.equal(reclaimed.job?.id, "leased-job");
    assert.equal(reclaimed.job?.attempt, 2);

    releaseProcessor();
    const staleResult = await firstCycle;
    const row = storedJob(db, "leased-job");

    assert.equal(staleResult.completed, 0);
    assert.equal(staleResult.lostLeases, 1);
    assert.equal(row.status, "running");
    assert.equal(row.attempts, 2);
    assert.equal(row.started_at, "2026-07-16T12:10:02.000Z");
  });
});
