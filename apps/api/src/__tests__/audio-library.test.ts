import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { ensureActionSfxPackSchema } from "../action-sfx-pack.ts";
import {
  listAudioLibraryClips,
  readBotAvatarSfxBytes,
  summarizeAudioLibraryBytes,
} from "../audio-library.ts";

const tinyMp3 = Buffer.from(
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
  "base64",
);

function createAudioLibraryDb(): { db: DatabaseSync; userId: string } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      authored_audio_voice_profile TEXT,
      audio_voice_profile_override TEXT
    );
    CREATE TABLE botcast_shows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE botcast_show_intro_audio (
      show_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      content_type TEXT NOT NULL,
      audio_bytes BLOB NOT NULL,
      duration_ms INTEGER NOT NULL,
      outdent_prompt TEXT,
      outdent_content_type TEXT,
      outdent_audio_bytes BLOB,
      outdent_duration_ms INTEGER,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE botcast_show_atmosphere_audio (
      show_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      content_type TEXT NOT NULL,
      audio_bytes BLOB NOT NULL,
      duration_ms INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureActionSfxPackSchema(db);
  const userId = "user-audio-lib";
  db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  return { db, userId };
}

describe("audio-library", () => {
  it("lists vocal action packs and avatar loops under Sound Effects", () => {
    const { db, userId } = createAudioLibraryDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO bots (id, user_id, name, authored_audio_voice_profile)
       VALUES (?, ?, ?, ?)`,
    ).run(
      "bot-mira",
      userId,
      "Mira",
      JSON.stringify({
        v: 1,
        avatarSfx: {
          v: 1,
          audioDataUrl: `data:audio/mpeg;base64,${tinyMp3.toString("base64")}`,
          source: "elevenlabs",
          prompt: "soft thinking hum",
        },
      }),
    );
    db.prepare(
      `INSERT INTO action_sfx_pack_clips
        (user_id, owner_kind, owner_id, kind, variant_index, content_type,
         audio_bytes, prompt_seed, pack_generation_id, created_at)
       VALUES (?, 'bot', ?, 'laugh', 0, 'audio/mpeg', ?, '[laughs]', 'gen1', ?)`,
    ).run(userId, "bot-mira", tinyMp3, now);
    // Legacy bodily / non-TTS seed must stay out of Space Lens.
    db.prepare(
      `INSERT INTO action_sfx_pack_clips
        (user_id, owner_kind, owner_id, kind, variant_index, content_type,
         audio_bytes, prompt_seed, pack_generation_id, created_at)
       VALUES (?, 'bot', ?, 'laugh', 1, 'audio/mpeg', ?, 'legacy prose seed', 'gen1', ?)`,
    ).run(userId, "bot-mira", tinyMp3, now);

    const clips = listAudioLibraryClips(db, userId, "sound_effects");
    assert.equal(clips.length, 2);
    assert.ok(clips.some((clip) => clip.id.startsWith("action-sfx:")));
    assert.ok(clips.some((clip) => clip.id === "avatar-sfx:bot-mira"));
    assert.ok(
      clips.every(
        (clip) =>
          clip.url.startsWith("/api/action-sfx-pack/clip?") ||
          clip.url === "/api/bots/bot-mira/avatar-sfx",
      ),
    );

    const avatarBytes = readBotAvatarSfxBytes(db, userId, "bot-mira");
    assert.ok(avatarBytes);
    assert.equal(avatarBytes.contentType, "audio/mpeg");
    assert.ok(avatarBytes.bytes.length > 0);
  });

  it("lists Signal ident and atmosphere beds under Music", () => {
    const { db, userId } = createAudioLibraryDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO botcast_shows (id, user_id, title) VALUES (?, ?, ?)`,
    ).run("show-1", userId, "Night Desk");
    db.prepare(
      `INSERT INTO botcast_show_intro_audio
        (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
         duration_ms, outdent_prompt, outdent_content_type, outdent_audio_bytes,
         outdent_duration_ms, revision, created_at, updated_at)
       VALUES (?, ?, 'elevenlabs', 'music-v1', 'ident', 'audio/mpeg', ?,
         1200, 'outdent', 'audio/mpeg', ?, 800, 2, ?, ?)`,
    ).run("show-1", userId, tinyMp3, tinyMp3, now, now);
    db.prepare(
      `INSERT INTO botcast_show_atmosphere_audio
        (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
         duration_ms, revision, created_at, updated_at)
       VALUES (?, ?, 'elevenlabs', 'music-v1', 'bed', 'audio/mpeg', ?,
         4000, 1, ?, ?)`,
    ).run("show-1", userId, tinyMp3, now, now);

    const clips = listAudioLibraryClips(db, userId, "music");
    assert.equal(clips.length, 3);
    assert.ok(clips.some((clip) => clip.label.includes("Ident")));
    assert.ok(clips.some((clip) => clip.label.includes("Outdent")));
    assert.ok(clips.some((clip) => clip.label.includes("Atmosphere")));
    assert.ok(
      clips.every((clip) => clip.url.includes("/api/botcast/shows/show-1/")),
    );

    const summary = summarizeAudioLibraryBytes(db, userId);
    assert.ok(summary.musicBytes > 0);
    assert.equal(summary.soundEffectsBytes, 0);
    assert.equal(summary.totalBytes, summary.musicBytes);
  });

  it("keeps other users' audio out of the inventory", () => {
    const { db, userId } = createAudioLibraryDb();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (id) VALUES (?)").run("other-user");
    db.prepare(
      `INSERT INTO botcast_shows (id, user_id, title) VALUES (?, ?, ?)`,
    ).run("show-other", "other-user", "Elsewhere");
    db.prepare(
      `INSERT INTO botcast_show_atmosphere_audio
        (show_id, user_id, provider, model, prompt, content_type, audio_bytes,
         duration_ms, revision, created_at, updated_at)
       VALUES (?, ?, 'elevenlabs', 'music-v1', 'bed', 'audio/mpeg', ?,
         4000, 1, ?, ?)`,
    ).run("show-other", "other-user", tinyMp3, now, now);

    assert.deepEqual(listAudioLibraryClips(db, userId, "music"), []);
  });
});
