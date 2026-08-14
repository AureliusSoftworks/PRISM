import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  appendAppletSessionNote,
  appletSessionBelongsToUser,
  formatAppletSessionNoteCollectionBody,
  getAppletSessionNote,
  saveAppletSessionNote,
  sentenceCaseAppletSessionNoteEntry,
} from "../applet-session-notes.ts";
import { initializeDatabase } from "../db.ts";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  const insertUser = db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', 'now', 'now')`,
  );
  insertUser.run("user-1", "one@example.test", "One");
  insertUser.run("user-2", "two@example.test", "Two");
  db.prepare(
    `INSERT INTO conversations
      (id, user_id, title, conversation_mode, created_at, updated_at)
     VALUES ('coffee-1', 'user-1', 'Table', 'coffee', 'now', 'now'),
            ('coffee-2', 'user-2', 'Other table', 'coffee', 'now', 'now'),
            ('chat-1', 'user-1', 'Chat', 'zen', 'now', 'now')`,
  ).run();
  return db;
}

describe("applet session notes", () => {
  it("keeps legacy replacement behavior tenant-scoped", () => {
    const db = fixture();
    assert.equal(
      appletSessionBelongsToUser(db, "user-1", "coffee", "coffee-1"),
      true,
    );
    assert.equal(
      appletSessionBelongsToUser(db, "user-1", "coffee", "coffee-2"),
      false,
    );
    assert.equal(
      appletSessionBelongsToUser(db, "user-1", "coffee", "chat-1"),
      false,
    );

    const created = saveAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "  Remember the quiet turn.  ",
    );
    assert.equal(created?.body, "Remember the quiet turn.");

    const updated = saveAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "Keep the interruption too.",
    );
    assert.equal(updated?.body, "Keep the interruption too.");
    assert.equal(
      getAppletSessionNote(db, "user-1", "coffee", "coffee-1")?.body,
      "Keep the interruption too.",
    );
    db.close();
  });

  it("appends fresh captures as readable sentence-cased bullets", () => {
    const db = fixture();
    saveAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "remember the quiet turn",
    );

    const first = appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "  keep   NASA casing  ",
      "2026-08-14T18:01:02.345Z",
    );
    assert.equal(
      first.body,
      "- Remember the quiet turn.\n- Keep NASA casing.",
    );
    assert.deepEqual(first.captures, [
      {
        body: "Keep NASA casing.",
        startedAt: "2026-08-14T18:01:02.345Z",
        committedAt: first.captures[0]?.committedAt,
      },
    ]);
    assert.ok(Number.isFinite(Date.parse(first.captures[0]?.committedAt ?? "")));

    const second = appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "- revisit the ending?",
      "2026-08-14T18:02:03.456Z",
    );
    assert.equal(
      second.body,
      "- Remember the quiet turn.\n- Keep NASA casing.\n- Revisit the ending?",
    );
    assert.equal(
      getAppletSessionNote(db, "user-1", "coffee", "coffee-1")?.body,
      second.body,
    );
    assert.equal(second.captures.length, 2);
    assert.equal(second.captures[1]?.startedAt, "2026-08-14T18:02:03.456Z");
    db.close();
  });

  it("preserves capture history when the consolidated appendix is edited", () => {
    const db = fixture();
    appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "remember this turn",
      "2026-08-14T18:03:04.567Z",
    );
    const edited = saveAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "Remember this exact turn.",
    );
    assert.equal(edited?.captures.length, 1);
    assert.equal(
      edited?.captures[0]?.startedAt,
      "2026-08-14T18:03:04.567Z",
    );
    db.close();
  });

  it("normalizes legacy and collected note bodies without flattening acronyms", () => {
    assert.equal(
      sentenceCaseAppletSessionNoteEntry(
        "  ask about PRISM later. revisit tomorrow  ",
      ),
      "Ask about PRISM later. Revisit tomorrow.",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody("first line\nsecond line"),
      "- First line second line.",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody("- first\n* SECOND!"),
      "- First.\n- SECOND!",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody(
        "- This is a test Hello world!\n- This is a test.\n- Hello world!",
      ),
      "- This is a test Hello world!",
    );
  });

  it("collapses overlapping captures once their complete note is saved", () => {
    const db = fixture();
    appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "this is a test",
    );
    appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "hello world",
    );
    const complete = appendAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "this is a test hello world!",
    );

    assert.equal(complete.body, "- This is a test hello world!");
    db.close();
  });

  it("clears a note when the saved body is empty", () => {
    const db = fixture();
    saveAppletSessionNote(
      db,
      "user-1",
      "coffee",
      "coffee-1",
      "A note",
    );
    assert.equal(
      saveAppletSessionNote(db, "user-1", "coffee", "coffee-1", "   "),
      null,
    );
    assert.equal(
      getAppletSessionNote(db, "user-1", "coffee", "coffee-1"),
      null,
    );
    db.close();
  });
});
