import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSlateProject,
  updateSlateProject,
} from "../slate.ts";
import {
  getSlateProjectSection,
  listSlateProjectSections,
  saveSlateProjectSection,
} from "../slate-continuity.ts";
import {
  createSlateSourceShelfItem,
  deleteSlateSourceShelfItem,
  listSlateReviewCircleSessions,
  listSlateSourceShelfItems,
  listSlateVisualReferences,
  promoteSlateSourceShelfItem,
  recordSlateVisualStudy,
  resolveSlateVisualReference,
  runSlateReviewCircle,
  updateSlateSourceShelfItem,
} from "../slate-creative-studios.ts";
import {
  closeTestDatabase,
  createDeterministicProvider,
  createTestDatabase,
} from "../test-support.ts";

const NOW = "2026-07-29T12:00:00.000Z";

function insertUser(
  db: ReturnType<typeof createTestDatabase>,
  id: string,
  email: string,
): void {
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, 'Slate Author', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(id, email, NOW, NOW);
}

function fixture(): {
  db: ReturnType<typeof createTestDatabase>;
  userId: string;
  otherUserId: string;
  projectId: string;
  sectionId: string;
} {
  const db = createTestDatabase();
  const userId = "studio-author";
  const otherUserId = "other-author";
  insertUser(db, userId, "studio@example.test");
  insertUser(db, otherUserId, "other@example.test");
  const project = createSlateProject(db, userId, {
    title: "The Bell's Dry Mouth",
    spark: "A drowned bell rings when the reservoir empties.",
  });
  updateSlateProject(db, userId, project.id, { proseMode: "online" });
  const section = listSlateProjectSections(db, userId, project.id)[0]!;
  saveSlateProjectSection(db, userId, project.id, section.id, {
    expectedRevision: section.revision,
    mutationId: "seed-accepted-prose",
    prose:
      "The rope remembered the lake better than Mara did. She pulled until the drowned bell answered with three dry knocks.",
    status: "drafting",
  });
  return {
    db,
    userId,
    otherUserId,
    projectId: project.id,
    sectionId: section.id,
  };
}

describe("Slate Creative Studios", () => {
  it("keeps Source Shelf outside Canon and Mirror until explicit promotion", () => {
    const { db, userId, otherUserId, projectId } = fixture();
    try {
      const item = createSlateSourceShelfItem(db, userId, projectId, {
        title: "Bell metallurgy",
        kind: "research",
        content: "Bronze expands differently after long immersion.",
        metadata: { url: "https://example.test/bells" },
      });
      assert.equal(item.promotedSourceId, null);
      assert.equal(item.mirrorEligible, false);
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_sources WHERE project_id = ?",
          )
          .get(projectId)?.count,
        1,
        "only accepted section prose is a Continuity source before promotion",
      );
      assert.throws(
        () => listSlateSourceShelfItems(db, otherUserId, projectId),
        /Slate project not found/u,
      );

      const promoted = promoteSlateSourceShelfItem(
        db,
        userId,
        projectId,
        item.id,
      );
      assert.ok(promoted.promotedSourceId);
      const source = db
        .prepare(
          `SELECT authority, kind, content FROM slate_continuity_sources
            WHERE id = ?`,
        )
        .get(promoted.promotedSourceId!) as {
        authority: string;
        kind: string;
        content: string;
      };
      assert.equal(source.authority, "human");
      assert.equal(source.kind, "source_shelf");
      assert.match(source.content, /Bell metallurgy/u);
      const queued = db
        .prepare(
          `SELECT kind, status, section_id
             FROM slate_continuity_jobs
            WHERE source_id = ?`,
        )
        .get(promoted.promotedSourceId!) as {
        kind: string;
        status: string;
        section_id: string | null;
      };
      assert.equal(queued.kind, "extract_source");
      assert.equal(queued.status, "queued");
      assert.equal(
        queued.section_id,
        null,
        "promotion queues book-scoped Continuity extraction",
      );

      const edited = updateSlateSourceShelfItem(
        db,
        userId,
        projectId,
        item.id,
        { content: "New research remains a non-canon shelf item." },
      );
      assert.equal(edited.promotedSourceId, null);
      assert.equal(edited.mirrorEligible, false);
      deleteSlateSourceShelfItem(db, userId, projectId, item.id);
      assert.equal(listSlateSourceShelfItems(db, userId, projectId).length, 0);
      assert.ok(
        db
          .prepare("SELECT id FROM slate_continuity_sources WHERE id = ?")
          .get(promoted.promotedSourceId!),
        "deleting the shelf item cannot erase promoted writer authority",
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("records non-canon visual studies and pins visual authority only", () => {
    const { db, userId, projectId, sectionId } = fixture();
    try {
      db.prepare(
        `INSERT INTO images
          (id, user_id, origin, prompt, url, provider, model, purpose, created_at)
         VALUES ('study-image', ?, 'slate_visual_bible', 'Mara at low water',
                 '/api/images/study-image/file', 'openai', 'gpt-image-2',
                 'slate_visual_bible', ?)`,
      ).run(userId, NOW);
      const study = recordSlateVisualStudy(db, userId, projectId, {
        imageId: "study-image",
        sectionId,
        kind: "character_study",
        prompt: "Mara at the emptied reservoir, restrained graphite and ochre.",
        provider: "openai",
        model: "gpt-image-2",
        visualStyleVersionId: "reservoir-v1",
        entityStates: [
          { entityId: "mara", state: "mud-streaked coat", sourceIds: [] },
        ],
      });
      assert.equal(study.status, "study");
      assert.equal(study.textualCanonSourceId, null);

      const pinned = resolveSlateVisualReference(
        db,
        userId,
        projectId,
        study.id,
        "pin",
      );
      assert.equal(pinned.status, "pinned");
      assert.ok(pinned.pinnedAt);
      assert.equal(pinned.textualCanonSourceId, null);
      assert.equal(listSlateVisualReferences(db, userId, projectId).length, 1);
      assert.throws(
        () =>
          resolveSlateVisualReference(
            db,
            userId,
            projectId,
            study.id,
            "reject",
          ),
        /Only an unresolved visual study/u,
      );

      updateSlateProject(db, userId, projectId, { proseMode: "offline" });
      db.prepare(
        `INSERT INTO images
          (id, user_id, origin, prompt, url, provider, model, purpose, created_at)
         VALUES ('online-image', ?, 'slate_visual_bible', 'Online result',
                 '/api/images/online-image/file', 'openai', 'gpt-image-2',
                 'slate_visual_bible', ?)`,
      ).run(userId, NOW);
      assert.throws(
        () =>
          recordSlateVisualStudy(db, userId, projectId, {
            imageId: "online-image",
            kind: "motif",
            prompt: "A glass bell.",
            provider: "openai",
            model: "gpt-image-2",
          }),
        /OFFLINE Slate projects cannot register online visual studies/u,
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("freezes one-section evidence and persists immutable independent verdicts plus a Room Note", async () => {
    const { db, userId, projectId, sectionId } = fixture();
    try {
      db.prepare(
        `INSERT INTO bots
          (id, user_id, name, system_prompt, created_at, updated_at)
         VALUES ('reader-bot', ?, 'June', 'A patient reader attentive to emotional causality.', ?, ?)`,
      ).run(userId, NOW, NOW);
      const provider = createDeterministicProvider([
        '{"verdict":"promising","headline":"The bell has pressure.","strongestElement":"The tactile opening.","primaryConcern":"Mara’s choice is not visible yet.","nextMove":"Make the next action cost her something."}',
        '{"verdict":"needs_attention","headline":"Atmosphere outruns motive.","strongestElement":"The three dry knocks.","primaryConcern":"The brother is not yet emotionally present.","nextMove":"Tie one physical detail to him."}',
        '{"verdict":"promising","headline":"A charged opening with one missing tether.","consensus":"The room trusts the bell and wants Mara’s choice foregrounded.","tensions":["One reader wants immediate cost; another wants the brother embodied first."],"nextMove":"Make Mara’s next physical action reveal what protecting her brother costs."}',
      ]);
      const session = await runSlateReviewCircle(db, userId, projectId, {
        sectionId,
        reviewerBotIds: ["reader-bot"],
        guest: {
          name: "First-page guest",
          readerBrief: "Read for motive, momentum, and emotional clarity.",
        },
        provider,
        model: "review-model",
        now: () => NOW,
      });
      assert.equal(provider.calls.length, 3);
      assert.equal(session.reviews.length, 2);
      assert.equal(session.reviewerSnapshots.length, 2);
      assert.equal(session.roomNote.verdict, "promising");
      assert.match(session.roomNote.headline, /charged opening/u);
      assert.equal(
        session.sectionRevisions[sectionId],
        getSlateProjectSection(db, userId, projectId, sectionId).revision,
      );
      assert.equal(session.artifact.evidence.length, 1);
      assert.match(
        session.artifact.evidence[0]?.channel === "text"
          ? session.artifact.evidence[0].content
          : "",
        /three dry knocks/u,
      );
      assert.equal(listSlateReviewCircleSessions(db, userId, projectId).length, 1);
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_continuity_sources WHERE project_id = ?",
          )
          .get(projectId)?.count,
        1,
        "Review Circle cannot mutate Canon",
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM slate_writing_operations WHERE project_id = ?",
          )
          .get(projectId)?.count,
        0,
        "Review Circle cannot mutate manuscript proposals",
      );
    } finally {
      closeTestDatabase(db);
    }
  });
});
