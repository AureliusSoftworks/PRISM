import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { currentContinuityProducerVersions } from "@localai/shared";
import {
  compileSlateReturnSynopsis,
  getSlateReturnSession,
  listSlateReturnSessions,
  openSlateReturnSession,
} from "../slate-return-sessions.ts";
import {
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
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, now, now);
}

function plannedScene(id: string, title: string, summary: string) {
  return {
    id,
    kind: "scene" as const,
    title,
    summary,
    direction: `Write ${title} with restraint.`,
    status: "planned" as const,
    locked: false,
  };
}

function createDraftedProject(db: DatabaseSync, userId: string, suffix: string) {
  const project = createSlateProject(db, userId, {
    title: `The Winter Archive ${suffix}`,
    spark: "A courier returns to a city that records every broken promise.",
  });
  updateSlateProject(db, userId, project.id, {
    premise: "Mara must recover a promise the city erased before winter closes its gates.",
    phase: "draft",
    direction: "Move toward the archive beneath the frozen river.",
    unresolvedThreads: [
      { id: "legacy-bell", label: "Why did the drowned bell ring?", resolved: false, locked: false },
    ],
    structure: [
      plannedScene("arrival", "The Return", "Mara enters the city under a borrowed name."),
      plannedScene("ledger", "The Missing Ledger", "The archive reveals a deliberate gap."),
      plannedScene("river", "Beneath the River", "Mara follows the erased promise below the ice."),
    ],
  });
  const sections = listSlateProjectSections(db, userId, project.id);
  saveSlateProjectSection(db, userId, project.id, sections[0]!.id, {
    expectedRevision: sections[0]!.revision,
    mutationId: `${suffix}-arrival`,
    prose: "Mara crossed the gate under falling snow.",
    status: "drafted",
  });
  saveSlateProjectSection(db, userId, project.id, sections[1]!.id, {
    expectedRevision: sections[1]!.revision,
    mutationId: `${suffix}-ledger`,
    prose: "The ledger skipped exactly seven winters, including hers.",
    status: "drafted",
  });
  db.prepare("UPDATE slate_sections SET updated_at = ? WHERE id = ? AND user_id = ?")
    .run("2026-07-16T01:00:00.000Z", sections[0]!.id, userId);
  db.prepare("UPDATE slate_sections SET updated_at = ? WHERE id = ? AND user_id = ?")
    .run("2026-07-16T02:00:00.000Z", sections[1]!.id, userId);
  return { project, sections };
}

describe("Slate return sessions", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
  });

  afterEach(() => closeTestDatabase(db));

  it("compiles and reopens a grounded deterministic synopsis without a model call", () => {
    const { project, sections } = createDraftedProject(db, "author-a", "A");
    const early = compileSlateReturnSynopsis(
      db,
      "author-a",
      project.id,
      new Date("2026-07-16T03:00:00.000Z"),
    );
    const later = compileSlateReturnSynopsis(
      db,
      "author-a",
      project.id,
      new Date("2026-07-17T03:00:00.000Z"),
    );

    assert.equal(early.sourceFingerprint, later.sourceFingerprint);
    assert.notEqual(early.synopsis.generatedAt, later.synopsis.generatedAt);
    assert.equal(early.synopsis.premise, "Mara must recover a promise the city erased before winter closes its gates.");
    assert.match(early.synopsis.storySoFar, /deliberate gap/i);
    assert.equal(early.synopsis.counts.sectionCount, 3);
    assert.equal(early.synopsis.counts.draftedSectionCount, 2);
    assert.equal(early.synopsis.counts.plannedSectionCount, 1);
    assert.ok(early.synopsis.counts.wordCount > 10);
    assert.equal(early.synopsis.mostRecentSection?.id, sections[1]!.id);
    assert.equal(early.synopsis.nextPlannedSection?.id, sections[2]!.id);
    assert.match(early.synopsis.trajectory, /Beneath the River/);
    assert.equal(early.synopsis.nextCard.kind, "draft_section");
    assert.equal(Array.isArray(early.synopsis.nextCard), false);

    const opened = openSlateReturnSession(
      db,
      "author-a",
      project.id,
      new Date("2026-07-16T03:00:00.000Z"),
    );
    const reopened = openSlateReturnSession(
      db,
      "author-a",
      project.id,
      new Date("2026-07-18T03:00:00.000Z"),
    );

    assert.equal(opened.reused, false);
    assert.equal(reopened.reused, true);
    assert.equal(reopened.id, opened.id);
    assert.equal(reopened.synopsis.generatedAt, opened.synopsis.generatedAt);
    assert.equal(reopened.isCurrent, true);
    assert.equal(listSlateReturnSessions(db, "author-a", project.id).length, 1);
  });

  it("recognizes prose drafted into a structural act as manuscript progress", () => {
    const project = createSlateProject(db, "author-a", {
      title: "The Glass Orchard",
      spark: "An orchard grows memories instead of fruit.",
    });
    updateSlateProject(db, "author-a", project.id, {
      phase: "draft",
      structure: [
        {
          id: "opening-act",
          kind: "act",
          title: "The Orchard Opens",
          summary: "Emilia first encounters the glass fruit.",
          direction: "Open in deep winter.",
          status: "planned",
          locked: false,
        },
        plannedScene("memory-tree", "The Memory Tree", "The tree remembers a future crime."),
      ],
    });
    const sections = listSlateProjectSections(db, "author-a", project.id);
    saveSlateProjectSection(db, "author-a", project.id, sections[0]!.id, {
      expectedRevision: sections[0]!.revision,
      mutationId: "drafted-opening-act",
      prose: "The orchard held winter like a secret, and one glass fruit turned toward Emilia.",
      status: "drafted",
    });

    const compiled = compileSlateReturnSynopsis(db, "author-a", project.id);

    assert.ok(compiled.synopsis.counts.wordCount > 0);
    assert.doesNotMatch(compiled.synopsis.draftedProgress, /has not begun/i);
    assert.match(compiled.synopsis.draftedProgress, /words drafted/i);
  });

  it("starts a fresh return session after the configured long-return window", () => {
    const { project } = createDraftedProject(db, "author-a", "fresh-window");
    const first = openSlateReturnSession(
      db,
      "author-a",
      project.id,
      new Date("2026-07-16T03:00:00.000Z"),
      { maxReuseAgeMs: 12 * 60 * 60 * 1_000 },
    );
    const sameVisit = openSlateReturnSession(
      db,
      "author-a",
      project.id,
      new Date("2026-07-16T10:00:00.000Z"),
      { maxReuseAgeMs: 12 * 60 * 60 * 1_000 },
    );
    const longReturn = openSlateReturnSession(
      db,
      "author-a",
      project.id,
      new Date("2026-07-17T04:00:00.000Z"),
      { maxReuseAgeMs: 12 * 60 * 60 * 1_000 },
    );

    assert.equal(sameVisit.id, first.id);
    assert.equal(sameVisit.reused, true);
    assert.notEqual(longReturn.id, first.id);
    assert.equal(longReturn.reused, false);
  });

  it("invalidates cached sessions after manuscript or Continuity version changes", () => {
    const { project, sections } = createDraftedProject(db, "author-a", "versions");
    const first = openSlateReturnSession(db, "author-a", project.id);

    saveSlateProjectSection(db, "author-a", project.id, sections[0]!.id, {
      expectedRevision: 1,
      mutationId: "return-session-new-prose",
      prose: "Mara crossed the gate under falling snow, and the city spoke her true name.",
      status: "drafted",
    });
    const afterManuscript = openSlateReturnSession(db, "author-a", project.id);

    assert.notEqual(afterManuscript.id, first.id);
    assert.notEqual(afterManuscript.sourceFingerprint, first.sourceFingerprint);
    assert.equal(getSlateReturnSession(db, "author-a", project.id, first.id).isCurrent, false);
    assert.equal(openSlateReturnSession(db, "author-a", project.id).id, afterManuscript.id);

    db.prepare(
      `UPDATE slate_projects
          SET continuity_active_version = '0.1',
              continuity_target_version = '0.1',
              continuity_active_generation = 2,
              continuity_last_success_at = '2026-07-16T05:00:00.000Z'
        WHERE id = ? AND user_id = ?`,
    ).run(project.id, "author-a");
    const afterVersion = openSlateReturnSession(db, "author-a", project.id);

    assert.notEqual(afterVersion.id, afterManuscript.id);
    assert.notEqual(afterVersion.sourceFingerprint, afterManuscript.sourceFingerprint);
    assert.equal(afterVersion.synopsis.continuity.activeVersion, "0.1");
    assert.equal(getSlateReturnSession(db, "author-a", project.id, afterManuscript.id).isCurrent, false);
    assert.equal(listSlateReturnSessions(db, "author-a", project.id).filter((session) => session.isCurrent).length, 1);
  });

  it("keeps persisted sessions tenant-scoped", () => {
    const a = createDraftedProject(db, "author-a", "tenant-a");
    const b = createDraftedProject(db, "author-b", "tenant-b");
    const sessionA = openSlateReturnSession(db, "author-a", a.project.id);
    const sessionB = openSlateReturnSession(db, "author-b", b.project.id);

    assert.notEqual(sessionA.id, sessionB.id);
    assert.throws(
      () => getSlateReturnSession(db, "author-b", a.project.id, sessionA.id),
      /not found/i,
    );
    assert.throws(
      () => openSlateReturnSession(db, "author-b", a.project.id),
      /project not found/i,
    );
    assert.throws(
      () => listSlateReturnSessions(db, "author-b", a.project.id),
      /project not found/i,
    );
    assert.equal(JSON.stringify(sessionB.synopsis).includes(a.project.title), false);
  });

  it("shows exactly one card in canon-risk, due-thread, upgrade, then guidance order", () => {
    const { project, sections } = createDraftedProject(db, "author-a", "priority");
    const storedProject = db
      .prepare("SELECT series_id FROM slate_projects WHERE id = ? AND user_id = ?")
      .get(project.id, "author-a") as { series_id: string };
    const source = db
      .prepare(
        `SELECT id FROM slate_continuity_sources
          WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(project.id, "author-a") as { id: string };
    const versions = JSON.stringify(currentContinuityProducerVersions());
    const now = "2026-07-16T06:00:00.000Z";
    db.prepare(
      `INSERT INTO slate_continuity_threads
        (id, user_id, series_id, project_id, section_id, scope_kind, label,
         status, due_section_id, anchors_json, source_id, producer_versions_json,
         created_at, updated_at)
       VALUES ('due-promise', ?, ?, ?, ?, 'book', 'the promise beneath the river',
               'due', ?, '[]', ?, ?, ?, ?)`,
    ).run(
      "author-a",
      storedProject.series_id,
      project.id,
      sections[1]!.id,
      sections[2]!.id,
      source.id,
      versions,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_concerns
        (id, user_id, series_id, project_id, section_id, scope_kind, kind,
         severity, status, summary, explanation, claim_ids_json, anchors_json,
         recommended_resolution, resolution_json, producer_versions_json, created_at)
       VALUES ('canon-risk', ?, ?, ?, ?, 'book', 'timeline_impossibility',
               'critical', 'open', 'The ledger predates its maker',
               'The current dates make the ledger impossible.', '[]', '[]',
               'revise_prose', NULL, ?, ?)`,
    ).run(
      "author-a",
      storedProject.series_id,
      project.id,
      sections[1]!.id,
      versions,
      now,
    );
    db.prepare(
      `INSERT INTO slate_continuity_generations
        (id, user_id, project_id, generation, status, target_version,
         source_fingerprint, comparison_summary, producer_versions_json, created_at, completed_at)
       VALUES ('upgrade-ready', ?, ?, 1, 'ready', '0.1', 'upgrade-fingerprint',
               'The new ledger changes Mara’s knowledge timeline.', ?, ?, ?)`,
    ).run("author-a", project.id, versions, now, now);
    db.prepare(
      `UPDATE slate_projects
          SET continuity_target_version = '0.1', continuity_upgrade_status = 'review'
        WHERE id = ? AND user_id = ?`,
    ).run(project.id, "author-a");

    const canon = openSlateReturnSession(db, "author-a", project.id);
    assert.equal(canon.synopsis.nextCard.kind, "canon_risk");
    assert.equal(canon.synopsis.nextCard.target.id, "canon-risk");
    assert.equal((JSON.stringify(canon.synopsis).match(/"nextCard"/g) ?? []).length, 1);

    db.prepare(
      `UPDATE slate_continuity_concerns
          SET status = 'resolved', resolved_at = ?
        WHERE id = 'canon-risk' AND user_id = ?`,
    ).run(now, "author-a");
    const due = openSlateReturnSession(db, "author-a", project.id);
    assert.equal(due.synopsis.nextCard.kind, "due_thread");
    assert.equal(due.synopsis.nextCard.target.id, "due-promise");

    db.prepare(
      `UPDATE slate_continuity_threads SET status = 'resolved', updated_at = ?
        WHERE id = 'due-promise' AND user_id = ?`,
    ).run("2026-07-16T06:01:00.000Z", "author-a");
    const upgrade = openSlateReturnSession(db, "author-a", project.id);
    assert.equal(upgrade.synopsis.nextCard.kind, "continuity_upgrade");
    assert.equal(upgrade.synopsis.nextCard.target.id, "upgrade-ready");

    db.prepare(
      `UPDATE slate_projects SET continuity_upgrade_status = 'current'
        WHERE id = ? AND user_id = ?`,
    ).run(project.id, "author-a");
    db.prepare(
      `UPDATE slate_continuity_generations SET status = 'active'
        WHERE id = 'upgrade-ready' AND user_id = ?`,
    ).run("author-a");
    const guidance = openSlateReturnSession(db, "author-a", project.id);
    assert.equal(guidance.synopsis.nextCard.kind, "draft_section");
    assert.equal(guidance.synopsis.nextCard.target.id, sections[2]!.id);

    assert.equal(new Set([canon.id, due.id, upgrade.id, guidance.id]).size, 4);
    for (const session of [canon, due, upgrade, guidance]) {
      assert.equal(Array.isArray(session.synopsis.nextCard), false);
    }
  });
});
