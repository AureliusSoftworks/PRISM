import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { initializeDatabase } from "../db.ts";
import {
  commitSlateHandoff,
  listSlateProjectHandoffs,
  prepareSlateHandoff,
} from "../slate-handoffs.ts";
import { createSlateProject } from "../slate.ts";

function fixture(): {
  db: DatabaseSync;
  userId: string;
  projectId: string;
  sectionId: string;
} {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const userId = "handoff-user";
  const now = "2026-07-22T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, 'Spectrum', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(userId, "handoff@example.com", now, now);
  db.prepare(
    `INSERT INTO bots (id, user_id, name, system_prompt, created_at, updated_at)
     VALUES ('source-bot', ?, 'Iris', '', ?, ?)`,
  ).run(userId, now, now);
  db.prepare(
    `INSERT INTO conversations (
       id, user_id, title, conversation_mode, bot_id, created_at, updated_at
     ) VALUES ('zen-source', ?, 'A quiet spark', 'zen', 'source-bot', ?, ?)`,
  ).run(userId, now, now);
  db.prepare(
    `INSERT INTO messages (
       id, conversation_id, user_id, role, content, bot_id, created_at
     ) VALUES ('zen-message', 'zen-source', ?, 'assistant',
               'A prism remembers the shape of light.', 'source-bot', ?)`,
  ).run(userId, now);
  const project = createSlateProject(db, userId, {
    title: "Existing Book",
    spark: "An older beginning",
  });
  const seriesId = (
    db.prepare("SELECT series_id FROM slate_projects WHERE id = ?").get(
      project.id,
    ) as { series_id: string }
  ).series_id;
  const sectionId = "source-section";
  db.prepare(
    `INSERT INTO slate_sections (
       id, project_id, series_id, user_id, kind, ordinal, title, prose,
       content_hash, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'scene', 0, 'Opening',
               'The sea held a second moon beneath its skin.', 'hash', ?, ?)`,
  ).run(sectionId, project.id, seriesId, userId, now, now);
  return { db, userId, projectId: project.id, sectionId };
}

describe("explicit Slate handoffs", () => {
  it("previews exact Zen text and attaches it without mutating a manuscript", () => {
    const { db, userId, projectId } = fixture();
    const content = "A prism remembers the shape of light.";
    const start = content.indexOf("remembers");
    const prepared = prepareSlateHandoff(db, userId, {
      direction: "zen-to-slate",
      conversationId: "zen-source",
      messageId: "zen-message",
      selectionStart: start,
      selectionEnd: content.length - 1,
    });
    assert.equal(prepared.sourceText, "remembers the shape of light");
    const before = db
      .prepare("SELECT manuscript FROM slate_projects WHERE id = ?")
      .get(projectId) as { manuscript: string };
    const committed = commitSlateHandoff(db, userId, prepared.id, {
      target: "existing_project",
      projectId,
    });
    assert.equal(committed.projectId, projectId);
    assert.equal(listSlateProjectHandoffs(db, userId, projectId).length, 1);
    const after = db
      .prepare("SELECT manuscript FROM slate_projects WHERE id = ?")
      .get(projectId) as { manuscript: string };
    assert.equal(after.manuscript, before.manuscript);
    db.close();
  });

  it("creates a new project whose spark is exactly the approved Zen source", () => {
    const { db, userId } = fixture();
    const source = "A prism remembers the shape of light.";
    const prepared = prepareSlateHandoff(db, userId, {
      direction: "zen-to-slate",
      conversationId: "zen-source",
      messageId: "zen-message",
      selectionStart: 0,
      selectionEnd: source.length,
    });
    const committed = commitSlateHandoff(db, userId, prepared.id, {
      target: "new_project",
      title: "Refracted Notes",
    });
    const project = db
      .prepare("SELECT title, spark, manuscript FROM slate_projects WHERE id = ?")
      .get(committed.projectId) as {
      title: string;
      spark: string;
      manuscript: string;
    };
    assert.deepEqual({ ...project }, {
      title: "Refracted Notes",
      spark: "A prism remembers the shape of light.",
      manuscript: "",
    });
    db.close();
  });

  it("approves a Slate excerpt for Zen without creating chat or memory rows", () => {
    const { db, userId, projectId, sectionId } = fixture();
    const prose = "The sea held a second moon beneath its skin.";
    const start = prose.indexOf("second");
    const beforeMessages = (
      db.prepare("SELECT COUNT(*) AS count FROM messages").get() as {
        count: number;
      }
    ).count;
    const prepared = prepareSlateHandoff(db, userId, {
      direction: "slate-to-zen",
      projectId,
      sectionId,
      selectionStart: start,
      selectionEnd: prose.length - 1,
    });
    assert.equal(prepared.sourceText, "second moon beneath its skin");
    commitSlateHandoff(db, userId, prepared.id, { target: "zen" });
    const afterMessages = (
      db.prepare("SELECT COUNT(*) AS count FROM messages").get() as {
        count: number;
      }
    ).count;
    assert.equal(afterMessages, beforeMessages);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM memories").get() as {
        count: number;
      }).count,
      0,
    );
    db.close();
  });

  it("keeps prepared sources and project attachments tenant scoped", () => {
    const { db, userId, projectId } = fixture();
    const now = "2026-07-22T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users (
         id, email, display_name, password_hash, password_salt,
         wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
         created_at, last_active_at
       ) VALUES ('other-user', 'other@example.com', 'Other', 'hash', 'salt',
                 'cipher', 'iv', 'tag', ?, ?)`,
    ).run(now, now);
    const prepared = prepareSlateHandoff(db, userId, {
      direction: "zen-to-slate",
      conversationId: "zen-source",
      messageId: "zen-message",
      selectionStart: 0,
      selectionEnd: 7,
    });
    assert.throws(
      () =>
        commitSlateHandoff(db, "other-user", prepared.id, {
          target: "existing_project",
          projectId,
        }),
      /not found/u,
    );
    assert.throws(
      () => listSlateProjectHandoffs(db, "other-user", projectId),
      /not found/u,
    );
    db.close();
  });
});
