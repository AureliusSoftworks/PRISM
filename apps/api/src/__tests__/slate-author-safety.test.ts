import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  assertSafeSlateArchivePath,
  captureSlateSafetyContent,
  createSlateArchiveBundle,
  createSlateRecoverySnapshot,
  DEFAULT_SLATE_RECOVERY_RETENTION,
  listSlateRecoveryGenerations,
  newestVerifiedSlateRecovery,
  purgeSlateRecoveryProjectGenerations,
  selectSlateRecoveryRetention,
  verifySlateArchiveBundle,
  verifySlateRecoverySnapshot,
  writeSlateRecoveryGeneration,
  type SlateRecoveryGeneration,
} from "../slate-author-safety.ts";
import {
  createSlateSeries,
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import { createSlateProject, updateSlateProject } from "../slate.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-16T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, openai_key_ciphertext,
       created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?, ?)`,
  ).run(id, `${id}@example.test`, id, `secret-for-${id}`, now, now);
}

function createProjectWithScene(db: DatabaseSync, userId: string, title: string) {
  const series = createSlateSeries(db, userId, { title: `${title} Cycle` });
  const project = createSlateProject(db, userId, {
    title,
    spark: "A promise returns in winter.",
    seriesId: series.id,
  });
  updateSlateProject(db, userId, project.id, {
    premise: "A courier must decide whether an old promise still binds her.",
    structure: [
      {
        id: "scene-arrival",
        kind: "scene",
        title: "The Arrival",
        summary: "Mara reaches the winter city.",
        direction: "Let the welcome feel almost sincere.",
        status: "planned",
        locked: false,
      },
    ],
  });
  const section = listSlateProjectSections(db, userId, project.id)[0]!;
  saveSlateProjectSection(db, userId, project.id, section.id, {
    expectedRevision: section.revision,
    mutationId: `${project.id}-opening`,
    prose: "Snow moved sideways across the gate when Mara came home.",
    status: "drafted",
  });
  return { series, project, sectionId: section.id };
}

describe("Slate author-safety recovery", () => {
  let db: DatabaseSync;
  let directory: string;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
    directory = mkdtempSync(join(tmpdir(), "prism-slate-safety-"));
  });

  afterEach(() => {
    closeTestDatabase(db);
    chmodSync(directory, 0o700);
    rmSync(directory, { force: true, recursive: true });
  });

  it("captures deterministic tenant-scoped authoritative content without jobs, caches, or secrets", () => {
    const a = createProjectWithScene(db, "author-a", "The Snow Gate");
    const b = createProjectWithScene(db, "author-b", "The Hidden Tenant");
    db.prepare(
      `INSERT INTO slate_continuity_generations
        (id, user_id, project_id, generation, status, target_version,
         source_fingerprint, comparison_summary, producer_versions_json, created_at)
       VALUES ('generation-a', 'author-a', ?, 1, 'building', '0.0',
               'portable-generation-fingerprint', NULL, '{}', ?)`,
    ).run(a.project.id, "2026-07-16T01:00:00.000Z");
    db.prepare(
      `UPDATE slate_continuity_jobs SET error = 'excluded-job-payload'
        WHERE project_id = ? AND user_id = ?`,
    ).run(a.project.id, "author-a");

    const first = createSlateRecoverySnapshot(
      db,
      "author-a",
      a.project.id,
      new Date("2026-07-16T01:00:00.000Z"),
    );
    const second = createSlateRecoverySnapshot(
      db,
      "author-a",
      a.project.id,
      new Date("2026-07-16T01:05:00.000Z"),
    );
    const serialized = JSON.stringify(first);

    assert.equal(first.contentHash, second.contentHash);
    assert.notEqual(first.snapshotHash, second.snapshotHash);
    assert.equal(first.content.project.id, a.project.id);
    assert.equal(first.content.sections.length, 1);
    assert.equal(first.content.sections[0]?.prose, "Snow moved sideways across the gate when Mara came home.");
    assert.equal(serialized.includes("user_id"), false);
    assert.equal(serialized.includes("secret-for-author-a"), false);
    assert.equal(serialized.includes("excluded-job-payload"), false);
    assert.equal(serialized.includes("portable-generation-fingerprint"), true);
    assert.equal(first.content.continuity.generations.length, 1);
    assert.equal(serialized.includes(b.project.id), false);
    assert.throws(
      () => captureSlateSafetyContent(db, "author-b", a.project.id),
      /not found/i,
    );
  });

  it("writes owner-only, checksummed generations atomically and skips unchanged content", () => {
    const { project } = createProjectWithScene(db, "author-a", "The Safe Draft");
    const mirrorBlocker = join(directory, "not-a-directory");
    writeFileSync(mirrorBlocker, "block mirror creation");

    const first = writeSlateRecoveryGeneration(
      db,
      "author-a",
      project.id,
      join(directory, "local"),
      {
        capturedAt: new Date("2026-07-16T02:00:00.000Z"),
        mirrorDirectory: mirrorBlocker,
      },
    );
    const duplicate = writeSlateRecoveryGeneration(
      db,
      "author-a",
      project.id,
      join(directory, "local"),
      { capturedAt: new Date("2026-07-16T02:05:00.000Z") },
    );

    assert.equal(first.created, true);
    assert.equal(first.mirror.status, "failed");
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.path, first.path);
    assert.equal(
      verifySlateRecoverySnapshot(readFileSync(first.path)).contentHash,
      first.snapshot.contentHash,
    );
    assert.equal(
      readdirSync(join(directory, "local", project.id)).some((name) => name.endsWith(".tmp")),
      false,
    );
    if (process.platform !== "win32") {
      assert.equal(fileMode(first.path), 0o600);
      assert.equal(fileMode(join(directory, "local", project.id)), 0o700);
    }
  });

  it("lists corrupt generations but restores from the newest verified fallback", () => {
    const { project, sectionId } = createProjectWithScene(db, "author-a", "The Fallback Draft");
    const root = join(directory, "recovery");
    const older = writeSlateRecoveryGeneration(db, "author-a", project.id, root, {
      capturedAt: new Date("2026-07-16T03:00:00.000Z"),
    });
    saveSlateProjectSection(db, "author-a", project.id, sectionId, {
      expectedRevision: 1,
      mutationId: "newer-prose",
      prose: "The gate remembered Mara before any guard did.",
    });
    const newer = writeSlateRecoveryGeneration(db, "author-a", project.id, root, {
      capturedAt: new Date("2026-07-16T03:05:00.000Z"),
    });
    writeFileSync(newer.path, "{incomplete", "utf8");

    const listed = listSlateRecoveryGenerations(root, project.id);
    const fallback = newestVerifiedSlateRecovery(root, project.id);

    assert.deepEqual(listed.map((generation) => generation.status), ["corrupt", "verified"]);
    assert.match(listed[0]!.error ?? "", /JSON|checksum|object/i);
    assert.equal(fallback?.path, older.path);
    assert.equal(fallback?.snapshot?.content.sections[0]?.prose, "Snow moved sideways across the gate when Mara came home.");
  });

  it("purges only the requested project from local and mirror roots", () => {
    const owned = createProjectWithScene(db, "author-a", "The Erased Draft");
    const preserved = createProjectWithScene(db, "author-b", "The Other Draft");
    const localRoot = join(directory, "local");
    const mirrorRoot = join(directory, "mirror");
    for (const [userId, projectId] of [
      ["author-a", owned.project.id],
      ["author-b", preserved.project.id],
    ] as const) {
      writeSlateRecoveryGeneration(db, userId, projectId, localRoot, {
        mirrorDirectory: mirrorRoot,
      });
    }

    assert.equal(
      purgeSlateRecoveryProjectGenerations(localRoot, owned.project.id).removed,
      true,
    );
    assert.equal(
      purgeSlateRecoveryProjectGenerations(mirrorRoot, owned.project.id).removed,
      true,
    );

    assert.equal(existsSync(join(localRoot, owned.project.id)), false);
    assert.equal(existsSync(join(mirrorRoot, owned.project.id)), false);
    assert.equal(existsSync(join(localRoot, preserved.project.id)), true);
    assert.equal(existsSync(join(mirrorRoot, preserved.project.id)), true);
  });

  it("rejects escaping ids and unlinks project symlinks without following them", () => {
    const root = join(directory, "contained-root");
    const outside = join(directory, "outside-project");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "author-prose.txt"), "must survive", "utf8");

    assert.throws(
      () => purgeSlateRecoveryProjectGenerations(root, "../outside-project"),
      /cannot be used as a recovery path|escapes/i,
    );
    assert.equal(readFileSync(join(outside, "author-prose.txt"), "utf8"), "must survive");

    if (process.platform !== "win32") {
      const link = join(root, "linked-project");
      symlinkSync(outside, link, "dir");
      assert.equal(
        purgeSlateRecoveryProjectGenerations(root, "linked-project").removed,
        true,
      );
      assert.equal(existsSync(link), false);
      assert.equal(readFileSync(join(outside, "author-prose.txt"), "utf8"), "must survive");
    }
  });

  it("keeps the union of 12 recent, 24 hourly, 30 daily, and 12 monthly buckets", () => {
    const newest = Date.parse("2026-07-16T12:00:00.000Z");
    const generations: SlateRecoveryGeneration[] = Array.from({ length: 24 * 400 }, (_, index) => {
      const capturedAt = new Date(newest - index * 60 * 60 * 1000).toISOString();
      return {
        path: `/recovery/${index}`,
        filename: `${index}.slate-recovery.json`,
        capturedAt,
        contentHash: String(index).padStart(64, "0"),
        status: "verified",
        snapshot: null,
        error: null,
      };
    });
    const selected = selectSlateRecoveryRetention(generations);
    const expected = expectedRetentionPaths(generations);

    assert.deepEqual(selected, expected);
    assert.equal(generations.slice(0, 12).every((item) => selected.has(item.path)), true);
    assert.equal(DEFAULT_SLATE_RECOVERY_RETENTION.recent, 12);
    assert.equal(DEFAULT_SLATE_RECOVERY_RETENTION.hourly, 24);
    assert.equal(DEFAULT_SLATE_RECOVERY_RETENTION.daily, 30);
    assert.equal(DEFAULT_SLATE_RECOVERY_RETENTION.monthly, 12);
  });
});

describe("portable .slate archive contract", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
  });

  afterEach(() => closeTestDatabase(db));

  it("builds and verifies a versioned keyless bundle with a Markdown fallback", () => {
    const { project } = createProjectWithScene(db, "author-a", "The Portable Draft");
    const snapshot = createSlateRecoverySnapshot(db, "author-a", project.id);
    const bundle = createSlateArchiveBundle(
      snapshot,
      new Date("2026-07-16T04:00:00.000Z"),
    );

    assert.equal(verifySlateArchiveBundle(bundle), bundle);
    assert.equal(bundle.manifest.format, "prism-slate-project-v1");
    assert.equal(bundle.manifest.version, 1);
    assert.deepEqual(Object.keys(bundle.files).sort(), [
      "data/continuity.json",
      "data/manuscript.json",
      "data/project.json",
      "manuscript.md",
    ]);
    assert.match(bundle.files["manuscript.md"]!, /^# The Portable Draft/m);
    assert.match(bundle.files["manuscript.md"]!, /^## The Arrival/m);
    assert.equal(JSON.stringify(bundle).includes("user_id"), false);
    assert.equal(JSON.stringify(bundle).includes("openai_api_key"), false);
    assert.equal(JSON.stringify(bundle).includes("slate_continuity_jobs"), false);

    bundle.files["data/manuscript.json"] = `${bundle.files["data/manuscript.json"]}tampered`;
    assert.throws(() => verifySlateArchiveBundle(bundle), /checksum/i);
  });

  it("rejects traversal, absolute, Windows, and non-normalized archive paths", () => {
    for (const unsafe of [
      "../project.json",
      "/project.json",
      "C:/project.json",
      "data/C:/project.json",
      "data\\project.json",
      "data//project.json",
      "data/./project.json",
      "data/project.json ",
      "data/project\n.json",
    ]) {
      assert.throws(() => assertSafeSlateArchivePath(unsafe), /unsafe/i);
    }
    assert.doesNotThrow(() => assertSafeSlateArchivePath("data/project.json"));
  });
});

function fileMode(path: string): number {
  return statSync(path).mode & 0o777;
}

function expectedRetentionPaths(generations: SlateRecoveryGeneration[]): Set<string> {
  const expected = new Set(generations.slice(0, 12).map((item) => item.path));
  const addBuckets = (format: (date: Date) => string, count: number) => {
    const buckets = new Set<string>();
    for (const generation of generations) {
      if (buckets.size >= count) break;
      const key = format(new Date(generation.capturedAt));
      if (buckets.has(key)) continue;
      buckets.add(key);
      expected.add(generation.path);
    }
  };
  addBuckets((date) => date.toISOString().slice(0, 13), 24);
  addBuckets((date) => date.toISOString().slice(0, 10), 30);
  addBuckets((date) => date.toISOString().slice(0, 7), 12);
  return expected;
}
