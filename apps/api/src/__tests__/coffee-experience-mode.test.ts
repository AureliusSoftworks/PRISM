import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { createCoffeeConversation } from "../coffee.ts";
import { initializeDatabase } from "../db.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'pot@example.com', 'Host', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  for (const id of ["bot-1", "bot-2"]) {
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
       VALUES (?, 'user-1', ?, 'A regular.', '#a355e8', 'waves', 1, ?, ?)`,
    ).run(id, id, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  }
  return db;
}

/** Reads what was actually persisted, not what the caller passed in. */
async function createSession(
  db: DatabaseSync,
  durationMinutes: number | null,
): Promise<{ mode: string | undefined; timed: boolean }> {
  const result = await createCoffeeConversation(db, "user-1", {
    groupBotIds: ["bot-1", "bot-2"],
    durationMinutes,
  } as unknown as Parameters<typeof createCoffeeConversation>[2]);
  const row = db
    .prepare(
      "SELECT coffee_settings, coffee_duration_minutes AS duration FROM conversations WHERE id = ? AND user_id = ?",
    )
    .get(result.conversation.id, "user-1") as {
    coffee_settings: string | null;
    duration: number | null;
  };
  const settings = row.coffee_settings
    ? (JSON.parse(row.coffee_settings) as { experienceMode?: string })
    : {};
  return { mode: settings.experienceMode, timed: typeof row.duration === "number" };
}

describe("Coffee experience mode", () => {
  it("resolves a timed session with no stated mode to Serve", async () => {
    const db = fixture();
    try {
      const session = await createSession(db, 30);
      assert.equal(
        session.mode,
        "serve",
        // Serve is the mode that puts a coffee pot on the table. Leaving this
        // unset gave the player hospitality duties and nothing to pour with.
        "a timed session resolved to something other than Serve",
      );
      assert.equal(session.timed, true);
    } finally {
      db.close();
    }
  });

  it("resolves an open-ended session with no stated mode to Join", async () => {
    const db = fixture();
    try {
      const session = await createSession(db, null);
      assert.equal(session.mode, "join");
      assert.equal(session.timed, false);
    } finally {
      db.close();
    }
  });

  it("never stores a session that is timed and Join at once", async () => {
    const db = fixture();
    try {
      for (const duration of [null, 3, 30]) {
        const { mode, timed } = await createSession(db, duration);
        assert.notEqual(
          mode,
          undefined,
          `duration ${duration} stored no experience mode`,
        );
        assert.equal(
          timed,
          mode === "serve",
          `duration ${duration} stored mode ${mode} against its own timing`,
        );
      }
    } finally {
      db.close();
    }
  });
});
