import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  SIGNAL_PREPARATION_TABLES,
  advanceBotcastEpisode,
  botcastPreparedTurnCursor,
  createBotcastEpisode,
  createBotcastShow,
  getBotcastEpisode,
  persistCompletedBotcastPairHistory,
  recordBotcastSessionClockHold,
} from "../botcast.ts";
import { initializeDatabase } from "../db.ts";
import {
  applyPreparedDatabaseChangeset,
  capturePreparedDatabaseChangeset,
  createUserScopedPreparedDatabase,
} from "../prepared-db-changeset.ts";
import { preparedTurnCursorMatchesV1 } from "@localai/shared";
import type { LlmProvider } from "../providers.ts";
import type { selectProvider } from "../providers.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'signal@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  for (const [id, name, prompt] of [
    [
      "host-1",
      "Mara Vale",
      "A forensic cultural critic who asks precise questions and dislikes canned answers.",
    ],
    [
      "guest-1",
      "Ivo Stone",
      "A guarded inventor who resists personal speculation and warns people before walking away.",
    ],
  ]) {
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
       VALUES (?, 'user-1', ?, ?, '#a355e8', 'waves', 1, ?, ?)`,
    ).run(
      id,
      name,
      prompt,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  }
  return db;
}

function provider(): LlmProvider {
  return {
    name: "local",
    async generateResponse() {
      return "A concise in-character answer that keeps the conversation moving.";
    },
    async embedText() {
      return [];
    },
  };
}

function generation() {
  return {
    preferredProvider: "local" as const,
    providerFactory: (() => provider()) as typeof selectProvider,
    signalSocialSilenceChanceOverride: 0,
  };
}

function liveEpisode(db: DatabaseSync): string {
  const show = createBotcastShow(db, "user-1", {
    hostBotId: "host-1",
    name: "Mara Vale in the Margins",
    premise: "Interviews about the human cost hidden inside invention.",
  });
  const episode = createBotcastEpisode(db, "user-1", show.id, {
    guestBotId: "guest-1",
    topic: "What patience reveals about attention",
  });
  return episode.id;
}

describe("Signal turn preparation", () => {
  it("generates the next turn inside the private prepared database", async () => {
    const db = fixture();
    try {
      const episodeId = liveEpisode(db);
      await advanceBotcastEpisode(db, "user-1", episodeId, {}, generation());
      // The client closes the books on the wait that turn cost as playback
      // starts, and only then asks for the next turn to be prepared.
      recordBotcastSessionClockHold(db, "user-1", episodeId, {
        holdId: `${episodeId}:hold-live`,
        reason: "foreground_generation",
        durationMs: 6_200,
      });

      const isolated = createUserScopedPreparedDatabase(
        db,
        "user-1",
        SIGNAL_PREPARATION_TABLES,
      );
      let prepared;
      try {
        prepared = await advanceBotcastEpisode(
          isolated.db,
          "user-1",
          episodeId,
          {},
          generation(),
        );
      } catch (error) {
        isolated.session.close();
        isolated.db.close();
        throw error;
      }
      assert.ok(
        prepared.message,
        "the prepared advance produced no Signal turn",
      );
      const changeset = capturePreparedDatabaseChangeset(
        isolated.db,
        isolated.session,
      );

      const beforeCommit = getBotcastEpisode(db, "user-1", episodeId);
      assert.equal(
        beforeCommit.messages.some(
          (message) => message.id === prepared.message?.id,
        ),
        false,
        "speculative work leaked into the live database",
      );

      applyPreparedDatabaseChangeset(db, changeset);
      const committed = getBotcastEpisode(db, "user-1", episodeId);
      assert.equal(
        committed.messages.at(-1)?.id,
        prepared.message?.id,
        "the prepared turn did not commit onto the live episode",
      );
    } finally {
      db.close();
    }
  });

  it("keeps a prepared turn valid across the clock hold its own gap recorded", async () => {
    const db = fixture();
    try {
      const episodeId = liveEpisode(db);
      await advanceBotcastEpisode(db, "user-1", episodeId, {}, generation());
      const frozen = botcastPreparedTurnCursor(db, "user-1", episodeId);

      recordBotcastSessionClockHold(db, "user-1", episodeId, {
        holdId: `${episodeId}:hold-1`,
        reason: "foreground_generation",
        durationMs: 7_400,
      });

      assert.equal(
        preparedTurnCursorMatchesV1(
          frozen,
          botcastPreparedTurnCursor(db, "user-1", episodeId),
        ),
        true,
        "session-clock bookkeeping invalidated the turn it was measuring",
      );
    } finally {
      db.close();
    }
  });

  it("ignores relationship maintenance timestamps but rejects semantic changes", async () => {
    const db = fixture();
    try {
      const episodeId = liveEpisode(db);
      await advanceBotcastEpisode(db, "user-1", episodeId, {}, generation());
      db.prepare(
        `INSERT INTO bot_relationships (
          user_id, source_bot_id, target_bot_id, score, band, mood_key,
          trend, last_reason, recent_reasons, updated_at
        ) VALUES (
          'user-1', 'host-1', 'guest-1', 50, 'neutral', 'neutral',
          'steady', 'No durable shift.', '[]', '2026-01-01T00:00:00.000Z'
        )`,
      ).run();
      const frozen = botcastPreparedTurnCursor(db, "user-1", episodeId);

      db.prepare(
        `UPDATE bot_relationships
            SET updated_at = '2026-01-02T00:00:00.000Z'
          WHERE user_id = 'user-1'
            AND source_bot_id = 'host-1'
            AND target_bot_id = 'guest-1'`,
      ).run();
      assert.equal(
        preparedTurnCursorMatchesV1(
          frozen,
          botcastPreparedTurnCursor(db, "user-1", episodeId),
        ),
        true,
        "timestamp-only memory maintenance invalidated prepared speech",
      );

      db.prepare(
        `UPDATE bot_relationships
            SET score = 51
          WHERE user_id = 'user-1'
            AND source_bot_id = 'host-1'
            AND target_bot_id = 'guest-1'`,
      ).run();
      assert.equal(
        preparedTurnCursorMatchesV1(
          frozen,
          botcastPreparedTurnCursor(db, "user-1", episodeId),
        ),
        false,
        "a relationship meaning change did not invalidate prepared speech",
      );
    } finally {
      db.close();
    }
  });

  it("commits a prepared closing turn across background relationship maintenance", async () => {
    const db = fixture();
    try {
      const episodeId = liveEpisode(db);
      await advanceBotcastEpisode(db, "user-1", episodeId, {}, generation());
      await advanceBotcastEpisode(db, "user-1", episodeId, {}, generation());
      db.prepare(
        `UPDATE botcast_episodes
            SET segment = 'closing'
          WHERE id = ? AND user_id = 'user-1'`,
      ).run(episodeId);
      db.prepare(
        `INSERT INTO bot_relationships (
          user_id, source_bot_id, target_bot_id, score, band, mood_key,
          trend, last_reason, recent_reasons, updated_at
        ) VALUES (
          'user-1', 'host-1', 'guest-1', 50, 'neutral', 'neutral',
          'steady', 'No durable shift.', '[]', '2026-01-01T00:00:00.000Z'
        )`,
      ).run();

      const isolated = createUserScopedPreparedDatabase(
        db,
        "user-1",
        SIGNAL_PREPARATION_TABLES,
      );
      let prepared;
      try {
        prepared = await advanceBotcastEpisode(
          isolated.db,
          "user-1",
          episodeId,
          {},
          { ...generation(), userKey: Buffer.alloc(32, 7) },
          { deferPairHistoryMaintenance: true },
        );
      } catch (error) {
        isolated.session.close();
        isolated.db.close();
        throw error;
      }
      const changeset = capturePreparedDatabaseChangeset(
        isolated.db,
        isolated.session,
      );
      assert.equal(prepared.episode.status, "completed");

      db.prepare(
        `UPDATE bot_relationships
            SET updated_at = '2026-01-02T00:00:00.000Z'
          WHERE user_id = 'user-1'
            AND source_bot_id = 'host-1'
            AND target_bot_id = 'guest-1'`,
      ).run();
      assert.doesNotThrow(() => applyPreparedDatabaseChangeset(db, changeset));
      assert.equal(
        getBotcastEpisode(db, "user-1", episodeId).status,
        "completed",
      );

      db.prepare(
        "UPDATE users SET memory_learn_about_bots = 1 WHERE id = 'user-1'",
      ).run();
      persistCompletedBotcastPairHistory({
        db,
        userId: "user-1",
        episodeId,
        userKey: Buffer.alloc(32, 7),
      });
      assert.ok(
        (
          db.prepare(
            "SELECT pair_history_persisted_at AS persistedAt FROM botcast_episodes WHERE id = ?",
          ).get(episodeId) as { persistedAt: string | null }
        ).persistedAt,
        "authoritative completion did not persist pair history",
      );
    } finally {
      db.close();
    }
  });
});
