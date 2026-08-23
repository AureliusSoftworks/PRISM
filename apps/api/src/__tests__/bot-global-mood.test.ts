import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  composeBotRuntimePersona,
  deriveSignalFeedbackMood,
  neutralizeGlobalBotMood,
  persistSignalFeedbackMood,
  readGlobalBotMood,
  setGlobalBotMood,
} from "../bot-global-mood.ts";
import { initializeDatabase } from "../db.ts";
import { botPowerSourceHashV1 } from "@localai/shared";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const insertUser = db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  );
  insertUser.run(
    "user-1",
    "one@example.com",
    "One",
    "2026-08-14T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
  );
  insertUser.run(
    "user-2",
    "two@example.com",
    "Two",
    "2026-08-14T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
  );
  const insertBot = db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, chat_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  );
  insertBot.run(
    "bot-1",
    "user-1",
    "Mara",
    "Private persona one.",
    "2026-08-14T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
  );
  insertBot.run(
    "peer-1",
    "user-1",
    "Ivo",
    "Do not expose this private prompt.",
    "2026-08-14T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
  );
  insertBot.run(
    "other-secret",
    "user-2",
    "Other Account Secret Bot",
    "Other user's private prompt.",
    "2026-08-14T00:00:00.000Z",
    "2026-08-14T00:00:00.000Z",
  );
  return db;
}

describe("global bot mood", () => {
  it("defaults neutral, persists by tenant, and resets immediately", () => {
    const db = fixture();
    try {
      assert.equal(readGlobalBotMood(db, "user-1", "bot-1").moodKey, "neutral");
      setGlobalBotMood(
        db,
        "user-1",
        "bot-1",
        "warm",
        "signal_feedback",
        "2026-08-14T01:00:00.000Z",
      );
      assert.equal(readGlobalBotMood(db, "user-1", "bot-1").moodKey, "warm");
      assert.equal(readGlobalBotMood(db, "user-2", "bot-1").moodKey, "neutral");
      assert.throws(
        () =>
          setGlobalBotMood(
            db,
            "user-2",
            "bot-1",
            "strained",
            "signal_feedback",
          ),
        /Bot not found/u,
      );
      neutralizeGlobalBotMood(db, "user-1", "bot-1");
      assert.equal(readGlobalBotMood(db, "user-1", "bot-1").moodKey, "neutral");
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM bot_global_moods WHERE user_id = ? AND bot_id = ?",
            )
            .get("user-1", "bot-1") as { count: number }
        ).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("derives one bounded Signal step without storing raw feedback", () => {
    const db = fixture();
    try {
      assert.equal(
        deriveSignalFeedbackMood("Ivo was much better than you tonight.", "neutral"),
        "guarded",
      );
      assert.equal(
        deriveSignalFeedbackMood("Your hosting was brilliant tonight.", "neutral"),
        "warm",
      );
      assert.equal(deriveSignalFeedbackMood("What should we do next?", "neutral"), null);
      persistSignalFeedbackMood({
        db,
        userId: "user-1",
        botId: "bot-1",
        content: "Ivo was much better than you tonight.",
      });
      const row = db
        .prepare(
          "SELECT mood_key, source FROM bot_global_moods WHERE user_id = ? AND bot_id = ?",
        )
        .get("user-1", "bot-1") as Record<string, unknown>;
      assert.deepEqual({ ...row }, {
        mood_key: "guarded",
        source: "signal_feedback",
      });
      assert.doesNotMatch(JSON.stringify(row), /Ivo was much better/u);
    } finally {
      db.close();
    }
  });

  it("keeps an enabled Troll warm and refuses mutable global mood writes", () => {
    const db = fixture();
    try {
      const intent = "Interrupt every other bot and troll them.";
      db.prepare(
        "UPDATE bots SET powers_json = ? WHERE id = ? AND user_id = ?",
      ).run(
        JSON.stringify([{
          version: 1,
          id: "troll",
          name: "Troll",
          intent,
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: botPowerSourceHashV1("Troll", intent),
            selfCue: "",
            observerCue: "",
            effects: [{ type: "troll" }],
            ruleLabels: [],
          },
        }]),
        "bot-1",
        "user-1",
      );
      assert.equal(readGlobalBotMood(db, "user-1", "bot-1").moodKey, "warm");
      assert.equal(
        setGlobalBotMood(
          db,
          "user-1",
          "bot-1",
          "strained",
          "signal_feedback",
          "2026-08-22T00:00:00.000Z",
        ).moodKey,
        "warm",
      );
      assert.equal(
        (
          db.prepare(
            "SELECT COUNT(*) AS count FROM bot_global_moods WHERE user_id = ? AND bot_id = ?",
          ).get("user-1", "bot-1") as { count: number }
        ).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("composes soft mood and safe same-tenant metadata without prompts or other users", () => {
    const db = fixture();
    try {
      setGlobalBotMood(db, "user-1", "bot-1", "guarded", "signal_feedback");
      const prompt = composeBotRuntimePersona({
        db,
        userId: "user-1",
        botId: "bot-1",
        basePrompt: "Authored persona.",
      });
      assert.match(prompt, /guarded, slightly reserved/u);
      assert.match(prompt, /Ivo/u);
      assert.match(prompt, /never deterministic puppeting/u);
      assert.doesNotMatch(prompt, /Do not expose this private prompt/u);
      assert.doesNotMatch(prompt, /Other Account Secret Bot/u);
      assert.doesNotMatch(prompt, /Other user's private prompt/u);
    } finally {
      db.close();
    }
  });
});
