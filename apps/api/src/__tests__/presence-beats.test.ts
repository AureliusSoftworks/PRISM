import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  botPresenceBeatPublicTranscriptLine,
  createBotPresenceBeat,
  listBotPresenceBeats,
  updateBotPresenceBeat,
} from "../presence-beats.ts";

test("presence beats persist only the heard public prefix", () => {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users (
      id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
      created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("u", "u@example.test", "U", "x", "x", "x", "x", "x", "now", "now");
  const beat = createBotPresenceBeat(db, "u", {
    surface: "coffee",
    sessionId: "c",
    responseId: "r",
    speaker: { botId: "b", name: "Bot" },
    trigger: "interruption",
    source: "default",
    text: "…Okay, then.",
    playbackStartedAtMs: 10,
  });
  const interrupted = updateBotPresenceBeat(db, "u", beat.id, {
    heardCharacterCount: 5,
    completion: "interrupted",
    playbackEndedAtMs: 300,
  });
  assert.equal(
    botPresenceBeatPublicTranscriptLine(interrupted),
    "[Response cue — Bot] …Okay",
  );
  assert.equal(listBotPresenceBeats(db, "u", "coffee", "c").length, 1);
  assert.equal(
    db.prepare("SELECT count(*) AS count FROM messages").get()!.count,
    0,
  );
  db.close();
});
