import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USER_NOTE_BODY_MAX, USER_NOTE_TITLE_MAX } from "@localai/shared";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";
import {
  deleteUserNote,
  executeUserNotesRequest,
  formatUserNoteTitlesHint,
  getUserNote,
  listUserNoteTitles,
  listUserNotes,
  saveUserNote,
} from "../user-notes.ts";

function seedUser(db: ReturnType<typeof createTestDatabase>, userId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    userId,
    `${userId}@example.test`,
    "Notes Tester",
    "hash",
    "salt",
    "wrapped",
    "iv",
    "tag",
    now,
    now
  );
}

describe("user-notes domain", () => {
  it("creates, lists, updates, gets, and deletes encrypted notes with tenancy", () => {
    const db = createTestDatabase();
    try {
      seedUser(db, "user-a");
      seedUser(db, "user-b");
      const keyA = Buffer.alloc(32, 3);
      const keyB = Buffer.alloc(32, 9);

      const created = saveUserNote(db, "user-a", keyA, {
        title: "Groceries",
        body: "milk, eggs",
      });
      assert.equal(created.created, true);
      assert.equal(created.note.title, "Groceries");
      assert.equal(created.note.body, "milk, eggs");

      const listed = listUserNotes(db, "user-a", keyA);
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.body, "milk, eggs");

      // Other account cannot see the note.
      assert.equal(listUserNotes(db, "user-b", keyB).length, 0);
      assert.equal(listUserNoteTitles(db, "user-b").length, 0);

      const updated = saveUserNote(db, "user-a", keyA, {
        id: created.note.id,
        body: "milk, eggs, bread",
      });
      assert.equal(updated.created, false);
      assert.equal(updated.note.body, "milk, eggs, bread");
      assert.equal(updated.note.title, "Groceries");

      const byTitle = getUserNote(db, "user-a", keyA, { title: "groceries" });
      assert.equal(byTitle.id, created.note.id);
      assert.equal(byTitle.body, "milk, eggs, bread");

      const deleted = deleteUserNote(db, "user-a", { id: created.note.id });
      assert.equal(deleted.title, "Groceries");
      assert.equal(listUserNotes(db, "user-a", keyA).length, 0);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("rejects oversize titles and bodies", () => {
    const db = createTestDatabase();
    try {
      seedUser(db, "user-a");
      const key = Buffer.alloc(32, 3);
      assert.throws(
        () =>
          saveUserNote(db, "user-a", key, {
            title: "x".repeat(USER_NOTE_TITLE_MAX + 1),
            body: "ok",
          }),
        /title/i
      );
      assert.throws(
        () =>
          saveUserNote(db, "user-a", key, {
            title: "Ok",
            body: "y".repeat(USER_NOTE_BODY_MAX + 1),
          }),
        /body/i
      );
    } finally {
      closeTestDatabase(db);
    }
  });

  it("executeUserNotesRequest returns privacy-safe receipts without bodies", () => {
    const db = createTestDatabase();
    try {
      seedUser(db, "user-a");
      const key = Buffer.alloc(32, 3);
      const saved = executeUserNotesRequest(db, "user-a", key, {
        v: 1,
        name: "userNotes",
        action: "save",
        title: "Packing",
        body: "passport",
      });
      assert.equal(saved.receipt.status, "saved");
      assert.equal(saved.receipt.title, "Packing");
      assert.equal(
        "body" in (saved.receipt as unknown as Record<string, unknown>),
        false
      );

      const listed = executeUserNotesRequest(db, "user-a", key, {
        v: 1,
        name: "userNotes",
        action: "list",
      });
      assert.equal(listed.receipt.status, "listed");
      assert.equal(listed.receipt.noteCount, 1);
      assert.equal(listed.notesForModel?.[0]?.body, "passport");
      assert.equal(listed.receipt.notes?.[0]?.title, "Packing");
      assert.ok(
        !JSON.stringify(listed.receipt).includes("passport"),
        "receipt must not include note body"
      );

      const hint = formatUserNoteTitlesHint(listUserNoteTitles(db, "user-a"));
      assert.match(hint, /Packing/);
      assert.doesNotMatch(hint, /passport/);
    } finally {
      closeTestDatabase(db);
    }
  });
});
