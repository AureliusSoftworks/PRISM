import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  ensureSlateProjectSections,
  saveSlateProjectSection,
  type SlateSectionSummary,
} from "../slate-continuity.ts";
import {
  createSlateManuscriptExport,
  listSlateManuscriptExportHistory,
  SlateManuscriptExportServiceError,
} from "../slate-manuscript-export-service.ts";
import { createSlateProject, updateSlateProject } from "../slate.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

const EXPORTED_AT = new Date("2026-07-16T20:15:30.000Z");

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-16T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, now, now);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface Fixture {
  projectId: string;
  actId: string;
  chapterId: string;
  firstSceneId: string;
  secondSceneId: string;
  firstSceneProse: string;
  laterActProse: string;
}

function sectionByStructureId(
  sections: readonly SlateSectionSummary[],
  structureItemId: string,
): SlateSectionSummary {
  const section = sections.find(
    (candidate) => candidate.structureItemId === structureItemId,
  );
  assert.ok(section, `Expected section for ${structureItemId}`);
  return section;
}

function createFixture(db: DatabaseSync, userId: string, title: string): Fixture {
  const project = createSlateProject(db, userId, {
    title,
    spark: "A winter city remembers every promise.",
  });
  updateSlateProject(db, userId, project.id, {
    structure: [
      {
        id: "plan-act",
        kind: "act",
        title: "Act I — Winter",
        summary: "PRIVATE SUMMARY: the city wakes.",
        direction: "PRIVATE DIRECTION: use a colder register.",
        status: "planned",
        locked: false,
      },
      {
        id: "plan-chapter",
        kind: "chapter",
        title: "Chapter One: Snow",
        summary: "PRIVATE SUMMARY: Mara returns.",
        direction: "PRIVATE DIRECTION: hide the keeper's motive.",
        status: "planned",
        locked: false,
      },
      {
        id: "plan-scene-one",
        kind: "scene",
        title: "The Gate",
        summary: "PRIVATE SUMMARY: the gate speaks.",
        direction: "PRIVATE DIRECTION: preserve ambiguity.",
        status: "planned",
        locked: false,
      },
      {
        id: "plan-scene-two",
        kind: "scene",
        title: "The Keep",
        summary: "PRIVATE SUMMARY: the keeper answers.",
        direction: "PRIVATE DIRECTION: no exposition.",
        status: "planned",
        locked: false,
      },
      {
        id: "plan-act-two",
        kind: "act",
        title: "Act II — Thaw",
        summary: "PRIVATE SUMMARY: the city changes.",
        direction: "PRIVATE DIRECTION: let the register warm.",
        status: "planned",
        locked: false,
      },
      {
        id: "plan-scene-three",
        kind: "scene",
        title: "The River",
        summary: "PRIVATE SUMMARY: the river remembers.",
        direction: "PRIVATE DIRECTION: keep the ending open.",
        status: "planned",
        locked: false,
      },
    ],
  });
  const sections = ensureSlateProjectSections(db, userId, project.id);
  const act = sectionByStructureId(sections, "plan-act");
  const chapter = sectionByStructureId(sections, "plan-chapter");
  const firstScene = sectionByStructureId(sections, "plan-scene-one");
  const secondScene = sectionByStructureId(sections, "plan-scene-two");
  const secondAct = sectionByStructureId(sections, "plan-act-two");
  const laterScene = sectionByStructureId(sections, "plan-scene-three");
  const firstSceneProse =
    "Snow fell over Sævar. 🐉\n\nMara said, “夜明け will remember.”";
  const secondSceneProse = "At the keep, Þóra opened the iron door.";
  const laterActProse = "Far beyond the thaw, the river spoke her name.";

  assert.equal(chapter.parentSectionId, act.id);
  assert.equal(firstScene.parentSectionId, chapter.id);
  assert.equal(secondScene.parentSectionId, chapter.id);
  assert.equal(secondAct.parentSectionId, null);
  assert.equal(laterScene.parentSectionId, secondAct.id);
  const proseSaves: Array<[SlateSectionSummary, string, string]> = [
    [firstScene, firstSceneProse, "first-scene-prose"],
    [secondScene, secondSceneProse, "second-scene-prose"],
    [laterScene, laterActProse, "later-scene-prose"],
  ];
  proseSaves.forEach(([section, prose, mutationId]) => {
    saveSlateProjectSection(db, userId, project.id, section.id, {
      expectedRevision: 0,
      mutationId,
      prose,
      status: "drafted",
    });
  });
  return {
    projectId: project.id,
    actId: act.id,
    chapterId: chapter.id,
    firstSceneId: firstScene.id,
    secondSceneId: secondScene.id,
    firstSceneProse,
    laterActProse,
  };
}

describe("Slate manuscript export service", () => {
  let db: DatabaseSync;
  let fixture: Fixture;
  let nextId: number;
  const options = () => ({
    now: () => new Date(EXPORTED_AT),
    id: () => `export-${++nextId}`,
  });

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
    fixture = createFixture(db, "author-a", "The Glass / Cycle");
    nextId = 0;
  });

  afterEach(() => closeTestDatabase(db));

  it("exports every supported scope and format from tenant-scoped section prose", async () => {
    const selectionStart = fixture.firstSceneProse.indexOf("🐉");
    const requests = [
      { scope: { kind: "book" }, format: "markdown" },
      {
        scope: { kind: "act", sectionId: fixture.actId },
        format: "text",
      },
      {
        scope: { kind: "chapter", sectionId: fixture.chapterId },
        format: "markdown",
      },
      {
        scope: { kind: "scene", sectionId: fixture.secondSceneId },
        format: "docx",
      },
      {
        scope: {
          kind: "selection",
          sectionId: fixture.firstSceneId,
          start: selectionStart,
          end: fixture.firstSceneProse.length,
        },
        format: "text",
      },
    ] as const;

    const results = [];
    for (const request of requests) {
      results.push(
        await createSlateManuscriptExport(
          db,
          "author-a",
          fixture.projectId,
          request,
          options(),
        ),
      );
    }

    const decoder = new TextDecoder();
    const book = decoder.decode(results[0]!.payload);
    const act = decoder.decode(results[1]!.payload);
    const chapter = decoder.decode(results[2]!.payload);
    const selection = decoder.decode(results[4]!.payload);
    assert.match(book, /# The Glass \/ Cycle/u);
    assert.match(book, /Snow fell over Sævar\. 🐉/u);
    assert.match(book, /the river spoke her name/u);
    assert.match(book, /\* \* \*/u);
    assert.match(act, /The Gate/u);
    assert.match(act, /The Keep/u);
    assert.ok(!act.includes(fixture.laterActProse));
    assert.match(chapter, /### Chapter One: Snow/u);
    assert.ok(!chapter.includes("Act I — Winter"));
    assert.ok(!chapter.includes(fixture.laterActProse));
    assert.equal(String.fromCharCode(...results[3]!.payload.subarray(0, 2)), "PK");
    assert.match(selection, /🐉\n\nMara said, “夜明け will remember\.”/u);
    assert.equal(results[4]!.manifest.scope.kind, "selection");
    assert.equal(
      results[4]!.manifest.sourceRevisions[0]?.contentSha256,
      sha256(fixture.firstSceneProse),
    );
    assert.equal(results[0]!.filename, "the-glass-cycle-book-20260716-201530.md");
    assert.match(results[3]!.filename, /^the-glass-cycle-the-keep-.*\.docx$/u);
  });

  it("stores checksum history only and lists it newest-first", async () => {
    const first = await createSlateManuscriptExport(
      db,
      "author-a",
      fixture.projectId,
      { scope: { kind: "book" }, format: "markdown" },
      options(),
    );
    const second = await createSlateManuscriptExport(
      db,
      "author-a",
      fixture.projectId,
      {
        scope: { kind: "scene", sectionId: fixture.firstSceneId },
        format: "text",
      },
      options(),
    );
    const history = listSlateManuscriptExportHistory(
      db,
      "author-a",
      fixture.projectId,
    );

    assert.deepEqual(history.map((entry) => entry.id), [second.id, first.id]);
    assert.equal(history[0]?.manifest.payloadSha256, second.manifest.payloadSha256);
    assert.equal(history[1]?.manifest.manifestSha256, first.manifest.manifestSha256);
    const row = db
      .prepare("SELECT * FROM slate_manuscript_exports WHERE id = ?")
      .get(first.id) as Record<string, unknown>;
    const stored = JSON.stringify(row);
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at",
      "filename",
      "format",
      "id",
      "manifest_json",
      "project_id",
      "scope_json",
      "user_id",
    ]);
    assert.ok(!stored.includes("Snow fell over Sævar"));
    assert.ok(!stored.includes("PRIVATE DIRECTION"));
    assert.ok(!stored.includes("PRIVATE SUMMARY"));
    assert.equal(row.user_id, "author-a");
  });

  it("rejects cross-tenant exports and history reads without revealing the project", async () => {
    await assert.rejects(
      createSlateManuscriptExport(
        db,
        "author-b",
        fixture.projectId,
        { scope: { kind: "book" }, format: "text" },
        options(),
      ),
      (error: unknown) =>
        error instanceof SlateManuscriptExportServiceError &&
        error.status === 404 &&
        /not found/iu.test(error.message),
    );
    assert.throws(
      () =>
        listSlateManuscriptExportHistory(db, "author-b", fixture.projectId),
      (error: unknown) =>
        error instanceof SlateManuscriptExportServiceError && error.status === 404,
    );
    assert.equal(
      (db
        .prepare("SELECT COUNT(*) AS count FROM slate_manuscript_exports")
        .get() as { count: number }).count,
      0,
    );
  });

  it("returns request errors for invalid formats, scope kinds, target kinds, and selections", async () => {
    const invalidRequests = [
      { scope: { kind: "book" }, format: "pdf" },
      { scope: { kind: "series" }, format: "text" },
      {
        scope: { kind: "chapter", sectionId: fixture.firstSceneId },
        format: "text",
      },
      {
        scope: {
          kind: "selection",
          sectionId: fixture.firstSceneId,
          start: 2,
          end: fixture.firstSceneProse.length + 1,
        },
        format: "markdown",
      },
    ];
    for (const request of invalidRequests) {
      await assert.rejects(
        createSlateManuscriptExport(
          db,
          "author-a",
          fixture.projectId,
          request,
          options(),
        ),
        (error: unknown) =>
          error instanceof SlateManuscriptExportServiceError && error.status === 400,
      );
    }
    assert.equal(
      (db
        .prepare("SELECT COUNT(*) AS count FROM slate_manuscript_exports")
        .get() as { count: number }).count,
      0,
    );
  });

  it("bounds tenant history reads", async () => {
    await createSlateManuscriptExport(
      db,
      "author-a",
      fixture.projectId,
      { scope: { kind: "book" }, format: "text" },
      options(),
    );
    assert.equal(
      listSlateManuscriptExportHistory(db, "author-a", fixture.projectId, 1)
        .length,
      1,
    );
    assert.throws(
      () =>
        listSlateManuscriptExportHistory(
          db,
          "author-a",
          fixture.projectId,
          101,
        ),
      (error: unknown) =>
        error instanceof SlateManuscriptExportServiceError && error.status === 400,
    );
  });
});
