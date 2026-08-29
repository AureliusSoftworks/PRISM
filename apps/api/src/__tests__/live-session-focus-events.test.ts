import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { initializeDatabase } from "../db.ts";
import {
  listLiveSessionFocusEvents,
  liveSessionFocusBelongsToUser,
  recordLiveSessionFocusEvent,
} from "../live-session-focus-events.ts";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  db.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'one@example.test', 'One', 'hash', 'salt', 'cipher', 'iv', 'tag', 'now', 'now'),
            ('user-2', 'two@example.test', 'Two', 'hash', 'salt', 'cipher', 'iv', 'tag', 'now', 'now')`,
  ).run();
  db.prepare(
    `INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at)
     VALUES ('chat-1', 'user-1', 'Chat', 'chat', 'now', 'now'),
            ('zen-1', 'user-1', 'Zen', 'zen', 'now', 'now'),
            ('coffee-2', 'user-2', 'Elsewhere', 'coffee', 'now', 'now')`,
  ).run();
  return db;
}

describe("live session focus events", () => {
  it("keeps events tenant-scoped and accepts only the matching live surface", () => {
    const db = fixture();
    assert.equal(liveSessionFocusBelongsToUser(db, "user-1", "chat", "chat-1"), true);
    assert.equal(liveSessionFocusBelongsToUser(db, "user-1", "zen", "chat-1"), false);
    assert.equal(liveSessionFocusBelongsToUser(db, "user-1", "coffee", "coffee-2"), false);
    db.close();
  });

  it("deduplicates repeated foreground transitions without retaining external identity", () => {
    const db = fixture();
    assert.equal(recordLiveSessionFocusEvent(db, "user-1", "chat", "chat-1", "away", "2026-08-29T12:00:00Z").recorded, true);
    assert.equal(recordLiveSessionFocusEvent(db, "user-1", "chat", "chat-1", "away", "2026-08-29T12:00:01Z").recorded, false);
    assert.equal(recordLiveSessionFocusEvent(db, "user-1", "chat", "chat-1", "returned", "2026-08-29T12:00:07Z").recorded, true);
    assert.deepEqual(
      listLiveSessionFocusEvents(db, "user-1", "chat", "chat-1").map((event) => [event.transition, event.occurredAt]),
      [["away", "2026-08-29T12:00:00.000Z"], ["returned", "2026-08-29T12:00:07.000Z"]],
    );
    db.close();
  });
});
