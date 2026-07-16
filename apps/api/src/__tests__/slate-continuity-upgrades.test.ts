import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  currentContinuityProducerVersions,
  type ContinuityProducerVersions,
} from "@localai/shared";
import {
  activateSlateContinuityGeneration,
  buildSlateContinuityShadowGeneration,
  compareSlateContinuityProducerVersions,
  completeSlateContinuityShadowGeneration,
  currentSlateContinuityRegistryEntry,
  deferSlateContinuityShadowGeneration,
  failSlateContinuityShadowGeneration,
  getSlateContinuityUpgradeState,
  listSlateContinuityGenerations,
  rollbackSlateContinuityGeneration,
} from "../slate-continuity-upgrades.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const NOW = "2026-07-16T12:00:00.000Z";

function seedUser(db: DatabaseSync, userId: string): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(userId, `${userId}@example.test`, userId, NOW, NOW);
}

function seedProject(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  manuscript = "Human prose stays exactly where the writer put it.\n",
): void {
  const seriesId = `${userId}-series`;
  db.prepare(
    `INSERT OR IGNORE INTO slate_series
      (id, user_id, title, description, created_at, updated_at)
     VALUES (?, ?, 'Test series', '', ?, ?)`,
  ).run(seriesId, userId, NOW, NOW);
  db.prepare(
    `INSERT INTO slate_projects
      (id, user_id, series_id, title, spark, manuscript, created_at, updated_at)
     VALUES (?, ?, ?, 'Test book', 'A test spark', ?, ?, ?)`,
  ).run(projectId, userId, seriesId, manuscript, NOW, NOW);
}

function legacyVersions(): ContinuityProducerVersions {
  return {
    continuity: "0.0",
    schema: 0,
    extraction: 0,
    reconciliation: 0,
    contextCompilation: 0,
    recap: 0,
    atmosphere: 0,
  };
}

function insertGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  generation: number,
  status: "building" | "ready" | "active" | "deferred" | "failed" | "superseded",
  versions: ContinuityProducerVersions,
): void {
  db.prepare(
    `INSERT INTO slate_continuity_generations
      (id, user_id, project_id, generation, status, target_version,
       source_fingerprint, comparison_summary, producer_versions_json,
       created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Seeded generation', ?, ?, ?)`,
  ).run(
    `${projectId}-generation-${generation}`,
    userId,
    projectId,
    generation,
    status,
    versions.continuity,
    `fingerprint-${generation}`,
    JSON.stringify(versions),
    NOW,
    status === "building" ? null : NOW,
  );
}

function seedActiveGeneration(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  versions: ContinuityProducerVersions = legacyVersions(),
): void {
  insertGeneration(db, userId, projectId, 1, "active", versions);
  db.prepare(
    `UPDATE slate_projects
        SET continuity_active_version = ?, continuity_target_version = ?,
            continuity_active_generation = 1,
            continuity_previous_generation = NULL,
            continuity_upgrade_status = 'current'
      WHERE id = ? AND user_id = ?`,
  ).run(versions.continuity, versions.continuity, projectId, userId);
}

function generationStatuses(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): Array<[number, string]> {
  return (
    db
      .prepare(
        `SELECT generation, status FROM slate_continuity_generations
          WHERE user_id = ? AND project_id = ? ORDER BY generation`,
      )
      .all(userId, projectId) as Array<{ generation: number; status: string }>
  ).map((row) => [Number(row.generation), row.status]);
}

describe("Slate Continuity version upgrades", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
    seedProject(db, "author-a", "book-a");
    seedProject(db, "author-b", "book-b", "Another tenant's prose.\n");
  });

  afterEach(() => closeTestDatabase(db));

  it("registers the runtime producer versions and compares old and future generations", () => {
    const current = currentContinuityProducerVersions();
    assert.deepEqual(currentSlateContinuityRegistryEntry().producerVersions, current);
    assert.equal(
      compareSlateContinuityProducerVersions(current).status,
      "current",
    );

    const older = { ...current, schema: Math.max(0, current.schema - 1) };
    const olderComparison = compareSlateContinuityProducerVersions(older);
    assert.equal(olderComparison.status, "upgrade_required");
    assert.equal(olderComparison.compatible, true);
    assert.deepEqual(
      olderComparison.deltas.find((delta) => delta.component === "schema"),
      {
        component: "schema",
        installed: older.schema,
        target: current.schema,
        relation: "older",
      },
    );

    const future = { ...current, extraction: current.extraction + 1 };
    const futureComparison = compareSlateContinuityProducerVersions(future);
    assert.equal(futureComparison.status, "unsupported_future");
    assert.equal(futureComparison.compatible, false);
    assert.equal(compareSlateContinuityProducerVersions({}).status, "invalid");
  });

  it("builds and completes a tenant-scoped shadow without changing active prose", () => {
    const manuscriptBefore = (
      db
        .prepare("SELECT manuscript FROM slate_projects WHERE id = 'book-a'")
        .get() as { manuscript: string }
    ).manuscript;
    const built = buildSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      { sourceFingerprint: "sources-sha256-a" },
    );

    assert.equal(built.generation.generation, 1);
    assert.equal(built.generation.status, "building");
    assert.equal(built.activeComparison.status, "upgrade_required");
    assert.deepEqual(getSlateContinuityUpgradeState(db, "author-a", "book-a"), {
      projectId: "book-a",
      activeVersion: "0.0",
      targetVersion: currentContinuityProducerVersions().continuity,
      activeGeneration: 0,
      previousGeneration: null,
      status: "building",
      lastSuccessfulAt: null,
    });
    assert.throws(
      () =>
        buildSlateContinuityShadowGeneration(db, "author-b", "book-a", {
          sourceFingerprint: "cross-tenant-attempt",
        }),
      /project not found/i,
    );
    assert.throws(
      () =>
        buildSlateContinuityShadowGeneration(db, "author-a", "book-a", {
          sourceFingerprint: "duplicate-shadow",
        }),
      /already in progress/i,
    );

    const ready = completeSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      built.generation.generation,
      "No material conclusion drift.",
    );
    assert.equal(ready.status, "ready");
    assert.equal(
      getSlateContinuityUpgradeState(db, "author-a", "book-a").status,
      "review",
    );
    assert.equal(
      (
        db
          .prepare("SELECT manuscript FROM slate_projects WHERE id = 'book-a'")
          .get() as { manuscript: string }
      ).manuscript,
      manuscriptBefore,
    );
    assert.deepEqual(
      listSlateContinuityGenerations(db, "author-a", "book-a").map(
        (generation) => generation.status,
      ),
      ["ready"],
    );
    assert.throws(
      () =>
        listSlateContinuityGenerations(db, "author-b", "book-a"),
      /project not found/i,
    );
  });

  it("atomically activates and rolls back generations without rewriting sources", () => {
    seedActiveGeneration(db, "author-a", "book-a");
    db.prepare(
      `INSERT INTO slate_continuity_sources
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         source_revision, content, content_hash, authority, provider, model,
         producer_versions_json, supersedes_source_id, created_at)
       VALUES ('source-a', 'author-a', 'author-a-series', 'book-a', NULL,
         'book', 'import', 0, 'Immutable human source.', 'source-hash',
         'human', NULL, NULL, ?, NULL, ?)`,
    ).run(JSON.stringify(legacyVersions()), NOW);
    const sourceBefore = db
      .prepare(
        `SELECT content, content_hash, producer_versions_json
           FROM slate_continuity_sources WHERE id = 'source-a'`,
      )
      .get();

    const shadow = buildSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      { sourceFingerprint: "sources-sha256-b" },
    ).generation;
    completeSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      shadow.generation,
      "Retrieval and conclusions match the active ledger.",
    );
    assert.throws(
      () =>
        activateSlateContinuityGeneration(
          db,
          "author-b",
          "book-a",
          shadow.generation,
        ),
      /project not found/i,
    );

    const activated = activateSlateContinuityGeneration(
      db,
      "author-a",
      "book-a",
      shadow.generation,
    );
    assert.equal(activated.activeGeneration, 2);
    assert.equal(activated.previousGeneration, 1);
    assert.equal(activated.status, "current");
    assert.deepEqual(generationStatuses(db, "author-a", "book-a"), [
      [1, "superseded"],
      [2, "active"],
    ]);
    assert.deepEqual(
      db
        .prepare(
          `SELECT content, content_hash, producer_versions_json
             FROM slate_continuity_sources WHERE id = 'source-a'`,
        )
        .get(),
      sourceBefore,
    );

    assert.throws(
      () => rollbackSlateContinuityGeneration(db, "author-b", "book-a"),
      /project not found/i,
    );
    const rolledBack = rollbackSlateContinuityGeneration(
      db,
      "author-a",
      "book-a",
    );
    assert.equal(rolledBack.activeGeneration, 1);
    assert.equal(rolledBack.previousGeneration, 2);
    assert.deepEqual(generationStatuses(db, "author-a", "book-a"), [
      [1, "active"],
      [2, "superseded"],
    ]);
    assert.deepEqual(
      db
        .prepare(
          `SELECT content, content_hash, producer_versions_json
             FROM slate_continuity_sources WHERE id = 'source-a'`,
        )
        .get(),
      sourceBefore,
    );
  });

  it("leaves the active generation intact when an upgrade is deferred or fails", () => {
    seedActiveGeneration(db, "author-a", "book-a");
    const deferredShadow = buildSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      { sourceFingerprint: "deferred-sources" },
    ).generation;
    const deferred = deferSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      deferredShadow.generation,
      "Wait until the author closes the current drafting session.",
    );
    assert.equal(deferred.status, "deferred");
    assert.equal(
      getSlateContinuityUpgradeState(db, "author-a", "book-a").activeGeneration,
      1,
    );
    assert.equal(
      getSlateContinuityUpgradeState(db, "author-a", "book-a").status,
      "deferred",
    );

    const failedShadow = buildSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      { sourceFingerprint: "failed-sources" },
    ).generation;
    completeSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      failedShadow.generation,
      "Comparison started.",
    );
    const failed = failSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      failedShadow.generation,
      "The comparison could not prove equivalence.",
    );
    assert.equal(failed.status, "failed");
    const state = getSlateContinuityUpgradeState(db, "author-a", "book-a");
    assert.equal(state.activeGeneration, 1);
    assert.equal(state.previousGeneration, null);
    assert.equal(state.status, "failed");
    assert.deepEqual(generationStatuses(db, "author-a", "book-a"), [
      [1, "active"],
      [2, "deferred"],
      [3, "failed"],
    ]);
  });

  it("rejects a future generation before changing either pointer", () => {
    const current = currentContinuityProducerVersions();
    seedActiveGeneration(db, "author-a", "book-a", current);
    const future = { ...current, schema: current.schema + 1 };
    insertGeneration(db, "author-a", "book-a", 2, "ready", future);
    db.prepare(
      `UPDATE slate_projects
          SET continuity_upgrade_status = 'review'
        WHERE id = 'book-a' AND user_id = 'author-a'`,
    ).run();

    assert.throws(
      () =>
        activateSlateContinuityGeneration(db, "author-a", "book-a", 2),
      /newer runtime/i,
    );
    assert.deepEqual(generationStatuses(db, "author-a", "book-a"), [
      [1, "active"],
      [2, "ready"],
    ]);
    const state = getSlateContinuityUpgradeState(db, "author-a", "book-a");
    assert.equal(state.activeGeneration, 1);
    assert.equal(state.previousGeneration, null);
    assert.equal(state.status, "review");
  });

  it("rolls back generation row changes when the project pointer swap fails", () => {
    seedActiveGeneration(db, "author-a", "book-a");
    const shadow = buildSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      { sourceFingerprint: "atomic-sources" },
    ).generation;
    completeSlateContinuityShadowGeneration(
      db,
      "author-a",
      "book-a",
      shadow.generation,
      "Ready for an atomic swap.",
    );
    db.exec(`
      CREATE TRIGGER reject_continuity_pointer_swap
      BEFORE UPDATE OF continuity_active_generation ON slate_projects
      WHEN OLD.id = 'book-a' AND NEW.continuity_active_generation = 2
      BEGIN
        SELECT RAISE(ABORT, 'simulated pointer failure');
      END;
    `);

    assert.throws(
      () =>
        activateSlateContinuityGeneration(
          db,
          "author-a",
          "book-a",
          shadow.generation,
        ),
      /simulated pointer failure/i,
    );
    assert.deepEqual(generationStatuses(db, "author-a", "book-a"), [
      [1, "active"],
      [2, "ready"],
    ]);
    const state = getSlateContinuityUpgradeState(db, "author-a", "book-a");
    assert.equal(state.activeGeneration, 1);
    assert.equal(state.previousGeneration, null);
    assert.equal(state.status, "review");
  });
});
