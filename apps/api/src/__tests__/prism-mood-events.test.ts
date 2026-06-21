import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { recordPrismMoodEventOnce } from "../db.ts";

function createMoodEventTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE prism_mood_events (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (user_id, conversation_id, message_id, event_type)
    );
  `);
  return db;
}

describe("recordPrismMoodEventOnce", () => {
  it("records a Prism mood event once per assistant message and type", () => {
    const db = createMoodEventTestDb();
    const args = {
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      eventType: "ignored_question",
      createdAt: "2026-06-21T12:00:00.000Z",
      payload: { timeoutMs: 75_000 },
    };

    assert.equal(recordPrismMoodEventOnce(db, args), true);
    assert.equal(recordPrismMoodEventOnce(db, args), false);
    assert.equal(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM prism_mood_events")
          .get() as { n: number }
      ).n,
      1
    );
  });
});
