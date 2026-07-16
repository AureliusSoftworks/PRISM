import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  createSlateContinuityClaim,
  createSlateContinuityEntity,
  createSlateContinuitySource,
  createSlateSeries,
  getSlateContinuityStatus,
  getSlateManuscriptPage,
  getSlateProjectSection,
  getSlateSeries,
  listSlateContinuityClaims,
  listSlateContinuityEntities,
  listSlateProjectSections,
  listSlateSeries,
  saveSlateProjectSection,
  SlateSectionRevisionConflictError,
} from "../slate-continuity.ts";
import {
  createSlateProject,
  getSlateProject,
  updateSlateProject,
} from "../slate.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

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

function plannedScene(id: string, title: string) {
  return {
    id,
    kind: "scene" as const,
    title,
    summary: `${title} summary`,
    direction: `Draft ${title} quietly.`,
    status: "planned" as const,
    locked: false,
  };
}

function plannedStructureItem(
  id: string,
  kind: "act" | "chapter" | "scene",
  title: string,
) {
  return {
    ...plannedScene(id, title),
    kind,
  };
}

describe("Slate long-form persistence and Continuity", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    seedUser(db, "author-b");
  });

  afterEach(() => closeTestDatabase(db));

  it("scopes series, ordered books, and sections to their tenant", () => {
    const saga = createSlateSeries(db, "author-a", {
      title: "The Glass Cycle",
      description: "Three books about a city that remembers.",
    });
    const first = createSlateProject(db, "author-a", {
      title: "The Buried City",
      spark: "A city calls its architect home.",
      seriesId: saga.id,
    });
    const second = createSlateProject(db, "author-a", {
      title: "The Speaking Roads",
      spark: "The roads begin choosing their travelers.",
      seriesId: saga.id,
    });
    const privateSaga = createSlateSeries(db, "author-b", {
      title: "Another Tenant's Saga",
    });
    createSlateProject(db, "author-b", {
      title: "Hidden Book",
      spark: "This must never cross the tenant boundary.",
      seriesId: privateSaga.id,
    });

    updateSlateProject(db, "author-a", first.id, {
      structure: [plannedScene("arrival", "Arrival")],
    });
    const sections = listSlateProjectSections(db, "author-a", first.id);
    const reopenedSaga = getSlateSeries(db, "author-a", saga.id);

    assert.deepEqual(
      reopenedSaga.books.map((book) => [book.projectId, book.ordinal]),
      [
        [first.id, 0],
        [second.id, 1],
      ],
    );
    assert.equal(reopenedSaga.books[0]?.sectionCount, 1);
    assert.equal(sections[0]?.structureItemId, "arrival");
    assert.deepEqual(listSlateSeries(db, "author-a").map((item) => item.id), [saga.id]);
    assert.deepEqual(listSlateSeries(db, "author-b").map((item) => item.id), [privateSaga.id]);
    assert.throws(() => getSlateSeries(db, "author-b", saga.id), /not found/i);
    assert.throws(
      () => listSlateProjectSections(db, "author-b", first.id),
      /not found/i,
    );
    assert.throws(
      () =>
        createSlateProject(db, "author-b", {
          title: "Intruding Book",
          spark: "An invalid cross-tenant placement.",
          seriesId: saga.id,
        }),
      /not found/i,
    );
  });

  it("infers and repairs deterministic act, chapter, and scene parents", () => {
    const project = createSlateProject(db, "author-a", {
      title: "The Ordered House",
      spark: "Every room belongs to an unfolding memory.",
    });
    updateSlateProject(db, "author-a", project.id, {
      structure: [
        plannedStructureItem("prologue", "scene", "Prologue"),
        plannedStructureItem("root-chapter", "chapter", "Prelude"),
        plannedStructureItem("root-scene", "scene", "The First Memory"),
        plannedStructureItem("act-one", "act", "Act I"),
        plannedStructureItem("chapter-one", "chapter", "Chapter One"),
        plannedStructureItem("scene-one", "scene", "The Door"),
        plannedStructureItem("scene-two", "scene", "The Hall"),
        plannedStructureItem("chapter-two", "chapter", "Chapter Two"),
        plannedStructureItem("scene-three", "scene", "The Cellar"),
        plannedStructureItem("act-two", "act", "Act II"),
        plannedStructureItem("scene-four", "scene", "The Road"),
        plannedStructureItem("chapter-three", "chapter", "Chapter Three"),
        plannedStructureItem("scene-five", "scene", "The Return"),
      ],
    });

    const initial = listSlateProjectSections(db, "author-a", project.id);
    const byStructureId = new Map(
      initial.map((section) => [section.structureItemId, section]),
    );
    const parentStructureId = (structureItemId: string): string | null => {
      const section = byStructureId.get(structureItemId);
      assert.ok(section);
      if (!section.parentSectionId) return null;
      return initial.find((candidate) => candidate.id === section.parentSectionId)
        ?.structureItemId ?? null;
    };
    assert.deepEqual(
      initial.map((section) => [section.structureItemId, parentStructureId(section.structureItemId!)]),
      [
        ["prologue", null],
        ["root-chapter", null],
        ["root-scene", "root-chapter"],
        ["act-one", null],
        ["chapter-one", "act-one"],
        ["scene-one", "chapter-one"],
        ["scene-two", "chapter-one"],
        ["chapter-two", "act-one"],
        ["scene-three", "chapter-two"],
        ["act-two", null],
        ["scene-four", "act-two"],
        ["chapter-three", "act-two"],
        ["scene-five", "chapter-three"],
      ],
    );

    const sceneTwo = byStructureId.get("scene-two")!;
    saveSlateProjectSection(db, "author-a", project.id, sceneTwo.id, {
      expectedRevision: 0,
      mutationId: "hierarchy-prose",
      prose: "The hall kept every word spoken inside it.",
    });

    // Simulate the pre-hierarchy section layout and prove reopening repairs it.
    db.prepare(
      "UPDATE slate_sections SET parent_section_id = NULL WHERE project_id = ? AND user_id = ?",
    ).run(project.id, "author-a");
    const repaired = listSlateProjectSections(db, "author-a", project.id);
    const repairedChapter = repaired.find(
      (section) => section.structureItemId === "chapter-one",
    )!;
    const repairedScene = repaired.find(
      (section) => section.structureItemId === "scene-two",
    )!;
    assert.equal(
      repairedChapter.parentSectionId,
      repaired.find((section) => section.structureItemId === "act-one")!.id,
    );
    assert.equal(repairedScene.parentSectionId, repairedChapter.id);
    assert.equal(
      getSlateProjectSection(db, "author-a", project.id, repairedScene.id).prose,
      "The hall kept every word spoken inside it.",
    );

    updateSlateProject(db, "author-a", project.id, {
      structure: [
        plannedStructureItem("act-one", "act", "Act I"),
        plannedStructureItem("chapter-two", "chapter", "Chapter Two"),
        plannedStructureItem("scene-two", "scene", "The Hall"),
        plannedStructureItem("chapter-one", "chapter", "Chapter One"),
        plannedStructureItem("scene-one", "scene", "The Door"),
        plannedStructureItem("act-two", "act", "Act II"),
        plannedStructureItem("scene-four", "scene", "The Road"),
      ],
    });
    const rearranged = listSlateProjectSections(db, "author-a", project.id);
    const movedScene = rearranged.find(
      (section) => section.structureItemId === "scene-two",
    )!;
    const newChapter = rearranged.find(
      (section) => section.structureItemId === "chapter-two",
    )!;
    assert.equal(movedScene.id, sceneTwo.id);
    assert.equal(movedScene.parentSectionId, newChapter.id);
    assert.equal(
      getSlateProjectSection(db, "author-a", project.id, movedScene.id).prose,
      "The hall kept every word spoken inside it.",
    );
    assert.throws(
      () => listSlateProjectSections(db, "author-b", project.id),
      /not found/i,
    );
  });

  it("migrates a legacy manuscript byte-for-byte with a checkpoint and immutable source", () => {
    const original = "  Chapter One\n\nSnow fell over Sævar.  \n\n\t'Tell no one,' Mara said.\n";
    const project = createSlateProject(db, "author-a", {
      title: "The Exact Manuscript",
      spark: "An old draft must survive migration without normalization.",
    });
    updateSlateProject(db, "author-a", project.id, {
      manuscript: original,
      lockedRanges: [
        { id: "human-line", start: 2, end: 13, label: "Human opening" },
      ],
    });

    const migrated = listSlateProjectSections(db, "author-a", project.id);
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0]?.kind, "imported");
    assert.equal(migrated[0]?.title, "Imported manuscript");

    const section = getSlateProjectSection(
      db,
      "author-a",
      project.id,
      migrated[0]!.id,
    );
    assert.equal(section.prose, original);
    assert.equal(section.contentHash, sha256(original));
    assert.deepEqual(section.lockedRanges, [
      { id: "human-line", start: 2, end: 13, label: "Human opening" },
    ]);
    assert.equal(getSlateProject(db, "author-a", project.id).manuscript, original);

    const checkpoint = db
      .prepare(
        `SELECT manuscript, reason FROM slate_versions
          WHERE project_id = ? AND user_id = ?`,
      )
      .get(project.id, "author-a") as
      | { manuscript: string; reason: string }
      | undefined;
    assert.equal(checkpoint?.manuscript, original);
    assert.equal(checkpoint?.reason, "Before long-form section migration");

    const source = db
      .prepare(
        `SELECT content, content_hash, authority, kind, source_revision
           FROM slate_continuity_sources
          WHERE project_id = ? AND section_id = ? AND user_id = ?`,
      )
      .get(project.id, section.id, "author-a") as
      | {
          content: string;
          content_hash: string;
          authority: string;
          kind: string;
          source_revision: number;
        }
      | undefined;
    assert.equal(source?.content, original);
    assert.equal(source?.content_hash, sha256(original));
    assert.equal(source?.authority, "human");
    assert.equal(source?.kind, "import");
    assert.equal(source?.source_revision, 0);

    const state = db
      .prepare(
        `SELECT storage_version, original_manuscript_hash, migrated_at
           FROM slate_manuscript_state
          WHERE project_id = ? AND user_id = ?`,
      )
      .get(project.id, "author-a") as
      | {
          storage_version: number;
          original_manuscript_hash: string;
          migrated_at: string | null;
        }
      | undefined;
    assert.equal(state?.storage_version, 2);
    assert.equal(state?.original_manuscript_hash, sha256(original));
    assert.ok(state?.migrated_at);

    // Reopening is idempotent: migration does not duplicate sections or sources.
    assert.deepEqual(listSlateProjectSections(db, "author-a", project.id), migrated);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_sources WHERE project_id = ?",
          )
          .get(project.id) as { count: number }
      ).count,
      1,
    );
  });

  it("migrates an existing flat plan with persisted hierarchy and stable order", () => {
    const project = createSlateProject(db, "author-a", {
      title: "The Flat Plan",
      spark: "A legacy outline needs real descendants.",
    });
    const legacyStructure = [
      plannedStructureItem("legacy-act", "act", "Act I"),
      plannedStructureItem("legacy-chapter", "chapter", "Chapter One"),
      plannedStructureItem("legacy-scene", "scene", "The Bell"),
    ];
    db.prepare(
      "UPDATE slate_projects SET structure_json = ? WHERE id = ? AND user_id = ?",
    ).run(JSON.stringify(legacyStructure), project.id, "author-a");

    const migrated = listSlateProjectSections(db, "author-a", project.id);
    assert.deepEqual(
      migrated.map((section) => [
        section.ordinal,
        section.structureItemId,
        section.title,
      ]),
      [
        [0, "legacy-act", "Act I"],
        [1, "legacy-chapter", "Chapter One"],
        [2, "legacy-scene", "The Bell"],
      ],
    );
    assert.equal(migrated[0]!.parentSectionId, null);
    assert.equal(migrated[1]!.parentSectionId, migrated[0]!.id);
    assert.equal(migrated[2]!.parentSectionId, migrated[1]!.id);
  });

  it("saves with compare-and-swap, retries mutation ids idempotently, and rejects stale edits", () => {
    const project = createSlateProject(db, "author-a", {
      title: "A Safe Draft",
      spark: "Every human edit must remain authoritative.",
    });
    updateSlateProject(db, "author-a", project.id, {
      structure: [plannedScene("signal", "The Signal")],
    });
    const [summary] = listSlateProjectSections(db, "author-a", project.id);
    assert.ok(summary);

    const firstSave = saveSlateProjectSection(
      db,
      "author-a",
      project.id,
      summary.id,
      {
        expectedRevision: 0,
        mutationId: "edit-1",
        prose: "At midnight, the pavement answered Mara.",
        status: "drafted",
        lockedRanges: [
          { id: "opening", start: 0, end: 11, label: "Author opening" },
        ],
      },
    );
    assert.equal(firstSave.revision, 1);
    assert.equal(firstSave.status, "drafted");

    const retried = saveSlateProjectSection(
      db,
      "author-a",
      project.id,
      summary.id,
      {
        expectedRevision: 0,
        mutationId: "edit-1",
        prose: "At midnight, the pavement answered Mara.",
      },
    );
    assert.equal(retried.revision, 1);
    assert.equal(retried.contentHash, firstSave.contentHash);

    assert.throws(
      () =>
        saveSlateProjectSection(db, "author-a", project.id, summary.id, {
          expectedRevision: 0,
          mutationId: "stale-edit",
          prose: "This stale writer must not overwrite the accepted edit.",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SlateSectionRevisionConflictError);
        assert.equal(error.code, "slate_section_revision_conflict");
        assert.equal(error.sectionId, summary.id);
        assert.equal(error.currentRevision, 1);
        assert.equal(error.currentContentHash, firstSave.contentHash);
        return true;
      },
    );

    const reopened = getSlateProjectSection(
      db,
      "author-a",
      project.id,
      summary.id,
    );
    assert.equal(reopened.prose, "At midnight, the pavement answered Mara.");
    assert.equal(reopened.revision, 1);
    assert.equal(
      getSlateProject(db, "author-a", project.id).manuscript,
      `The Signal\n\n${reopened.prose}`,
    );
    assert.equal(getSlateContinuityStatus(db, "author-a", project.id).pendingJobCount, 1);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM slate_continuity_sources
              WHERE project_id = ? AND kind = 'human_edit'`,
          )
          .get(project.id) as { count: number }
      ).count,
      1,
    );
  });

  it("reopens a sectioned manuscript through stable cursor pagination", () => {
    const project = createSlateProject(db, "author-a", {
      title: "Three Movements",
      spark: "A story told in three precise scenes.",
    });
    updateSlateProject(db, "author-a", project.id, {
      structure: [
        plannedScene("scene-a", "Arrival"),
        plannedScene("scene-b", "Recognition"),
        plannedScene("scene-c", "Departure"),
      ],
    });
    const sections = listSlateProjectSections(db, "author-a", project.id);
    const prose = ["First scene.", "Second scene is longer.", "Third scene."];
    sections.forEach((section, index) => {
      saveSlateProjectSection(db, "author-a", project.id, section.id, {
        expectedRevision: 0,
        mutationId: `pagination-edit-${index}`,
        prose: prose[index]!,
      });
    });

    const firstPage = getSlateManuscriptPage(db, "author-a", project.id, {
      limit: 1,
    });
    const secondPage = getSlateManuscriptPage(db, "author-a", project.id, {
      cursor: firstPage.nextCursor,
      limit: 1,
    });
    const finalPage = getSlateManuscriptPage(db, "author-a", project.id, {
      cursor: secondPage.nextCursor,
      limit: 1,
    });

    assert.deepEqual(
      [firstPage, secondPage, finalPage].flatMap((page) =>
        page.sections.map((section) => [section.ordinal, section.prose]),
      ),
      [
        [0, prose[0]],
        [1, prose[1]],
        [2, prose[2]],
      ],
    );
    assert.ok(firstPage.nextCursor);
    assert.ok(secondPage.nextCursor);
    assert.equal(finalPage.nextCursor, null);
    assert.equal(
      finalPage.totalProseLength,
      prose.reduce((total, sectionProse) => total + sectionProse.length, 0),
    );
    assert.equal(
      getSlateProject(db, "author-a", project.id).manuscript,
      ["Arrival", "Recognition", "Departure"]
        .map((title, index) => `${title}\n\n${prose[index]}`)
        .join("\n\n\n"),
    );
    assert.throws(
      () => getSlateManuscriptPage(db, "author-b", project.id),
      /not found/i,
    );
  });

  it("reorders structure atomically while preserving removed prose and stable section ids", () => {
    const project = createSlateProject(db, "author-a", {
      title: "Movable Scenes",
      spark: "The order changes without losing a line.",
    });
    updateSlateProject(db, "author-a", project.id, {
      structure: [
        plannedScene("scene-a", "Arrival"),
        plannedScene("scene-b", "Recognition"),
      ],
    });
    const original = listSlateProjectSections(db, "author-a", project.id);
    const arrival = original.find((section) => section.structureItemId === "scene-a")!;
    const recognition = original.find(
      (section) => section.structureItemId === "scene-b",
    )!;
    saveSlateProjectSection(db, "author-a", project.id, arrival.id, {
      expectedRevision: 0,
      mutationId: "arrival-prose",
      prose: "Mara crossed the threshold.",
    });
    saveSlateProjectSection(db, "author-a", project.id, recognition.id, {
      expectedRevision: 0,
      mutationId: "recognition-prose",
      prose: "The city recognized her first.",
    });

    updateSlateProject(db, "author-a", project.id, {
      structure: [
        { ...plannedScene("scene-b", "The Recognition"), status: "drafted" },
        plannedScene("scene-c", "The Answer"),
      ],
    });
    const reordered = listSlateProjectSections(db, "author-a", project.id);
    assert.deepEqual(
      reordered.map((section) => [
        section.ordinal,
        section.id,
        section.structureItemId,
        section.kind,
        section.title,
      ]),
      [
        [0, recognition.id, "scene-b", "scene", "The Recognition"],
        [1, reordered[1]!.id, "scene-c", "scene", "The Answer"],
        [2, arrival.id, null, "imported", "Arrival"],
      ],
    );
    assert.equal(reordered[2]!.parentSectionId, null);
    assert.equal(
      getSlateProjectSection(db, "author-a", project.id, arrival.id).prose,
      "Mara crossed the threshold.",
    );
    assert.equal(
      getSlateProjectSection(db, "author-a", project.id, recognition.id).prose,
      "The city recognized her first.",
    );
    const checkpoint = db
      .prepare(
        `SELECT reason FROM slate_versions
          WHERE project_id = ? AND user_id = ?
          ORDER BY rowid DESC LIMIT 1`,
      )
      .get(project.id, "author-a") as { reason: string };
    assert.equal(checkpoint.reason, "Before structure change");
  });

  it("preserves model provenance on series-scoped sources, entities, aliases, and claims", () => {
    const series = createSlateSeries(db, "author-a", {
      title: "The Lantern Archive",
    });
    const project = createSlateProject(db, "author-a", {
      title: "Book One",
      spark: "A keeper discovers that lanterns remember names.",
      seriesId: series.id,
    });
    const source = createSlateContinuitySource(db, {
      userId: "author-a",
      seriesId: series.id,
      projectId: project.id,
      sectionId: null,
      scopeKind: "book",
      kind: "review_direction",
      sourceRevision: 1,
      content: "The keeper is named Elian; his sister calls him Eli.",
      authority: "ai",
      provider: "local",
      model: "llama3.2",
    });
    const entity = createSlateContinuityEntity(db, "author-a", {
      seriesId: series.id,
      kind: "character",
      canonicalName: "Elian Vale",
      aliases: ["Eli", "eli", "The Keeper"],
      description: "Keeper of the western lantern archive.",
      locked: true,
      sourceId: source.id,
    });
    const claim = createSlateContinuityClaim(db, "author-a", {
      scope: {
        kind: "book",
        seriesId: series.id,
        projectId: project.id,
        sectionId: null,
      },
      subjectEntityId: entity.id,
      predicate: "occupation",
      value: "keeper of the western lantern archive",
      epistemicStatus: "fact",
      confidence: 0.93,
      sourceId: source.id,
    });

    assert.deepEqual(entity.aliases, ["Eli", "The Keeper"]);
    assert.equal(entity.provenance.authority, "ai");
    assert.equal(entity.provenance.provider, "local");
    assert.equal(entity.provenance.model, "llama3.2");
    assert.equal(entity.provenance.producerVersions.continuity, "0.0");
    assert.equal(claim.provenance.provider, "local");
    assert.equal(claim.scope.projectId, project.id);
    assert.equal(claim.confidence, 0.93);
    assert.deepEqual(
      listSlateContinuityEntities(db, "author-a", series.id).map((item) => item.id),
      [entity.id],
    );
    assert.deepEqual(
      listSlateContinuityClaims(db, "author-a", series.id, project.id).map(
        (item) => item.id,
      ),
      [claim.id],
    );

    assert.throws(
      () => listSlateContinuityEntities(db, "author-b", series.id),
      /not found/i,
    );
    assert.throws(
      () =>
        createSlateContinuityEntity(db, "author-b", {
          seriesId: series.id,
          kind: "character",
          canonicalName: "Intruder",
          sourceId: source.id,
        }),
      /not found/i,
    );
  });
});
