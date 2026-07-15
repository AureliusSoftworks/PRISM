import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { botcastReplayTimeline } from "@localai/shared";

import {
  advanceBotcastEpisode,
  createBotcastEpisode,
  createBotcastShow,
  deleteBotcastEpisode,
  deleteBotcastShow,
  generateBotcastShowIdentity,
  getBotcastEpisode,
  getBotcastShow,
  updateBotcastShow,
} from "../botcast.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { initializeDatabase } from "../db.ts";
import { selectProvider, type LlmProvider, type ProviderMessage } from "../providers.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'botcast@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    "host-1",
    "Mara Vale",
    "A forensic cultural critic who asks precise questions and dislikes canned answers.",
    "#a355e8",
    "waves",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, chat_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    "guest-1",
    "Ivo Stone",
    "A guarded inventor who resists personal speculation and warns people before walking away.",
    "#3aa9a1",
    "radio",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
  return db;
}

function recordingProvider(lines: string[], captures: ProviderMessage[][]): LlmProvider {
  return {
    name: "local",
    async generateResponse(messages) {
      captures.push(messages);
      return lines.shift() ?? "A concise in-character answer.";
    },
    async embedText() {
      return [];
    },
  };
}

function generation(provider: LlmProvider) {
  return {
    preferredProvider: "local" as const,
    providerFactory: (() => provider) as typeof selectProvider,
  };
}

describe("Botcast persistence and isolation", () => {
  it("creates and renames a stable host-owned show", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      assert.equal(show.hostBotId, "host-1");
      assert.match(show.name, /Mara Vale/u);
      assert.equal(show.accentColor, "#a355e8");
      assert.equal(show.atmosphere.status, "fallback");
      assert.equal(show.logo.status, "fallback");
      assert.match(show.logo.prompt, /Mara Vale/u);
      assert.ok(
        ["frequency", "orbit", "aperture", "spark", "monogram"].includes(
          show.logo.fallbackGlyph,
        ),
      );
      const renamed = updateBotcastShow(db, "user-1", show.id, {
        name: "The Vale Frequency",
      });
      assert.equal(renamed.name, "The Vale Frequency");
      assert.equal(createBotcastShow(db, "user-1", { hostBotId: "host-1" }).id, show.id);
    } finally {
      db.close();
    }
  });

  it("generates an editable host-shaped show identity and refreshes its visual prompts", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      ['{"name":"The Vale Index","premise":"Precise conversations that inventory the stories culture tells itself."}'],
      captures,
    );
    try {
      const original = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const result = await generateBotcastShowIdentity(
        db,
        "user-1",
        original.id,
        generation(provider),
      );
      assert.equal(result.generated, true);
      assert.equal(result.show.name, "The Vale Index");
      assert.match(result.show.premise, /inventory the stories/u);
      assert.equal(result.show.atmosphere.revision, 2);
      assert.equal(result.show.logo.revision, 2);
      assert.match(result.show.logo.prompt, /The Vale Index/u);
      assert.match(captures[0]?.[1]?.content ?? "", /forensic cultural critic/u);
      const renamed = updateBotcastShow(db, "user-1", original.id, {
        name: "A User Chosen Name",
      });
      assert.equal(renamed.name, "A User Chosen Name");
    } finally {
      db.close();
    }
  });

  it("never includes a previous same-pair episode in a new episode prompt", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["PRIOR_EPISODE_MARKER", "Fresh opening"], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const first = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First topic",
      });
      await advanceBotcastEpisode(db, "user-1", first.id, {}, generation(provider));
      const second = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second topic",
      });
      await advanceBotcastEpisode(db, "user-1", second.id, {}, generation(provider));
      const secondPrompt = captures[1]!.map((message) => message.content).join("\n");
      assert.doesNotMatch(secondPrompt, /PRIOR_EPISODE_MARKER/u);
      assert.match(secondPrompt, /Second topic/u);
      assert.match(secondPrompt, /meeting for the first time/u);
      for (const table of [
        "memories",
        "memory_summaries",
        "bot_relationships",
        "coffee_bot_social_state",
      ]) {
        const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        assert.equal(count.count, 0, `${table} must remain untouched`);
      }
    } finally {
      db.close();
    }
  });

  it("deletes one episode and cascades its private production records", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["A line bound for deletion."], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A disposable recording",
      });
      const sibling = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A recording that stays",
      });
      await advanceBotcastEpisode(db, "user-1", episode.id, {}, generation(provider));

      assert.equal(deleteBotcastEpisode(db, "another-user", episode.id), false);
      assert.equal(getBotcastEpisode(db, "user-1", episode.id).messages.length, 1);
      assert.equal(deleteBotcastEpisode(db, "user-1", episode.id), true);
      assert.throws(
        () => getBotcastEpisode(db, "user-1", episode.id),
        /Signal episode not found/u,
      );
      const episodeCount = db.prepare(
        "SELECT COUNT(*) AS count FROM botcast_episodes WHERE id = ?",
      ).get(episode.id) as { count: number };
      assert.equal(episodeCount.count, 0);
      for (const table of ["botcast_episode_segments", "botcast_messages", "botcast_events"]) {
        const count = db.prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE episode_id = ?`,
        ).get(episode.id) as { count: number };
        assert.equal(count.count, 0, `${table} should not retain deleted episode rows`);
      }
      assert.equal(getBotcastEpisode(db, "user-1", sibling.id).topic, "A recording that stays");
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 1);
    } finally {
      db.close();
    }
  });

  it("deletes a show and cascades every episode archive beneath it", () => {
    const db = fixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "First archived episode",
      });
      createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Second archived episode",
      });

      assert.equal(deleteBotcastShow(db, "another-user", show.id), false);
      assert.equal(getBotcastShow(db, "user-1", show.id).episodeCount, 2);
      assert.equal(deleteBotcastShow(db, "user-1", show.id), true);
      assert.throws(
        () => getBotcastShow(db, "user-1", show.id),
        /Signal show not found/u,
      );
      for (const table of [
        "botcast_shows",
        "botcast_episodes",
        "botcast_episode_segments",
        "botcast_messages",
        "botcast_events",
      ]) {
        const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        };
        assert.equal(count.count, 0, `${table} should be empty after show deletion`);
      }
    } finally {
      db.close();
    }
  });

  it("strips an actual bot-name label from generated dialogue", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(['"Mara Vale: Welcome to the signal."'], captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Clean stage dialogue",
      });
      const advanced = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation(provider),
      );
      assert.equal(advanced.message?.content, "Welcome to the signal.");
    } finally {
      db.close();
    }
  });

  it("keeps private producer cues out of spoken lines and earns a departure", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const departureLines = Array.from(
      { length: 13 },
      (_, index) => `Departure episode line ${index + 1}.`,
    );
    departureLines[12] = "Should we keep interviewing?";
    const provider = recordingProvider(departureLines, captures);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Inventorship and public trust",
        producerBrief: "Find the point where confidence becomes secrecy.",
      });
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      // Reach the ordinary closing threshold on the second warning exchange so
      // the third cue proves pending departure wins over turn-count completion.
      for (let neutralTurn = 0; neutralTurn < 4; neutralTurn += 1) {
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      for (let pressure = 0; pressure < 3; pressure += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          created.id,
          { cue: { kind: "press_harder" } },
          generation(provider),
        );
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      let episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.outcome, "guest_departed");
      const departure = episode.events.find((event) => event.kind === "departure");
      assert.equal(departure?.payload.emptyChair, true);
      assert.equal(departure?.payload.microphoneRemains, true);
      assert.equal(departure?.payload.mugRemains, true);
      assert.equal(episode.warningCount, 1);
      assert.equal(
        episode.messages.some((message) => /producer/iu.test(message.content)),
        false,
      );
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "guest_departed");
      assert.match(episode.messages.at(-1)?.content ?? "", /left the studio/iu);
      const shots = episode.events
        .filter((event) => event.kind === "camera_suggestion")
        .map((event) => `${event.payload.shot}:${event.payload.reason}`);
      assert.ok(shots.includes("wide:departure"));
      assert.ok(shots.includes("wide:empty_chair"));
      assert.ok(shots.some((shot) => shot.startsWith("left:")));
    } finally {
      db.close();
    }
  });

  it("completes a normal episode after the closing host line", async () => {
    const db = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(
      Array.from({ length: 11 }, (_, index) => `Episode line ${index + 1}.`),
      captures,
    );
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const created = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "A complete interview",
      });
      for (let turn = 0; turn < 12; turn += 1) {
        await advanceBotcastEpisode(db, "user-1", created.id, {}, generation(provider));
      }
      const episode = getBotcastEpisode(db, "user-1", created.id);
      assert.equal(episode.status, "completed");
      assert.equal(episode.outcome, "completed");
      assert.equal(episode.messages.length, 11);
      assert.equal(episode.messages.at(-1)?.speakerRole, "host");
      assert.equal(episode.segments.at(-1)?.segment, "closing");
      assert.equal(
        episode.runtimeMs,
        botcastReplayTimeline(episode.messages, episode.events).durationMs,
      );
      assert.ok(episode.events.some((event) => event.kind === "episode_completed"));
    } finally {
      db.close();
    }
  });

  it("round-trips shows, episodes, transcript, and director events through account backup", async () => {
    const source = fixture();
    const target = fixture();
    const captures: ProviderMessage[][] = [];
    const provider = recordingProvider(["Welcome to the archive."], captures);
    try {
      const show = createBotcastShow(source, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(source, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "What survives an edit",
      });
      await advanceBotcastEpisode(source, "user-1", episode.id, {}, generation(provider));
      const key = Buffer.alloc(32, 7);
      const snapshot = exportUserSnapshot(source, "user-1", key);
      assert.equal(snapshot.botcast?.shows.length, 1);
      assert.equal(snapshot.botcast?.events.length, 4);
      importUserSnapshot(target, "user-1", snapshot, key);
      const restored = getBotcastEpisode(target, "user-1", episode.id);
      assert.equal(restored.topic, "What survives an edit");
      assert.equal(restored.messages[0]?.content, "Welcome to the archive.");
      assert.ok(restored.events.some((event) => event.kind === "camera_suggestion"));
    } finally {
      source.close();
      target.close();
    }
  });
});
