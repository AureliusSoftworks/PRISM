import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KINDS,
  normalizeBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  ACTION_SFX_PACK_MISSING_VOICE_MESSAGE,
  ensureActionSfxPackSchema,
  generateActionSfxPack,
  getActionSfxPackClip,
  getActionSfxPackSummary,
  listActionSfxPackClipsForBackup,
  restoreActionSfxPackClipsFromBackup,
} from "../action-sfx-pack.ts";
import { ElevenLabsVoiceError } from "../voices.ts";

const tinyMp3 = Buffer.from(
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
  "base64",
);

function createPackTestDb(): { db: DatabaseSync; userId: string } {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
  `);
  ensureActionSfxPackSchema(db);
  const userId = "user-pack-1";
  db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  return { db, userId };
}

describe("action-sfx-pack", () => {
  it("stores a full vocal TTS pack and refuses empty Premium voice", async () => {
    const { db, userId } = createPackTestDb();
    const voiceIds: string[] = [];
    const texts: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      assert.match(url, /\/v1\/text-to-speech\//u);
      voiceIds.push(decodeURIComponent(url.split("/text-to-speech/")[1]!.split("/")[0]!));
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      texts.push(body.text ?? "");
      return new Response(tinyMp3, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    };

    await assert.rejects(
      () =>
        generateActionSfxPack({
          db,
          userId,
          ownerKind: "bot",
          botId: "bot-alpha",
          ownerLabel: "Alpha",
          apiKey: "test-key",
          voiceId: "  ",
          voiceProfile: normalizeBotAudioVoiceProfileV1(undefined),
          fetchImpl,
        }),
      (error: unknown) =>
        error instanceof ElevenLabsVoiceError &&
        error.message === ACTION_SFX_PACK_MISSING_VOICE_MESSAGE,
    );

    const summary = await generateActionSfxPack({
      db,
      userId,
      ownerKind: "bot",
      botId: "bot-alpha",
      ownerLabel: "Alpha",
      personaSnippet: "dry wit, mid-aged",
      apiKey: "test-key",
      voiceId: "voice-alpha",
      voiceProfile: normalizeBotAudioVoiceProfileV1({
        elevenLabsVoiceId: "voice-alpha",
      }),
      fetchImpl,
    });

    assert.equal(voiceIds.length, ACTION_SFX_PACK_CLIP_COUNT);
    assert.ok(voiceIds.every((id) => id === "voice-alpha"));
    assert.equal(summary.clipCount, ACTION_SFX_PACK_CLIP_COUNT);
    assert.equal(summary.kinds.length, ACTION_SFX_PACK_KINDS.length);
    assert.deepEqual([...summary.kinds], [...ACTION_SFX_PACK_KINDS]);
    assert.ok(texts.every((text) => /^\[[^\]]+\]/u.test(text)));
    assert.ok(!texts.some((text) => /fart|burp|cough/iu.test(text)));

    const laugh = getActionSfxPackClip(
      db,
      userId,
      "bot",
      "bot-alpha",
      "laugh",
      1,
    );
    assert.ok(laugh);
    assert.equal(laugh.contentType, "audio/mpeg");
    assert.match(laugh.promptSeed, /laugh/iu);

    const bodilyKinds = ["fart", "burp", "cough"] as const;
    for (const kind of bodilyKinds) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS count FROM action_sfx_pack_clips
            WHERE user_id = ? AND kind = ?`,
        )
        .get(userId, kind) as { count: number };
      assert.equal(row.count, 0, `unexpected bodily pack rows for ${kind}`);
    }

    const pack = getActionSfxPackSummary(db, userId, "bot", "bot-alpha");
    assert.ok(pack);
    assert.equal(pack.clipCount, ACTION_SFX_PACK_CLIP_COUNT);
    assert.equal(pack.v, 2);

    const backupClips = listActionSfxPackClipsForBackup(db, userId);
    assert.equal(backupClips.length, ACTION_SFX_PACK_CLIP_COUNT);

    const restored = createPackTestDb();
    restoreActionSfxPackClipsFromBackup(
      restored.db,
      restored.userId,
      backupClips,
    );
    assert.equal(
      getActionSfxPackSummary(restored.db, restored.userId, "bot", "bot-alpha")
        ?.clipCount,
      ACTION_SFX_PACK_CLIP_COUNT,
    );
  });

  it("ignores legacy bodily rows and sound-gen takes when summarizing", () => {
    const { db, userId } = createPackTestDb();
    const insert = db.prepare(
      `INSERT INTO action_sfx_pack_clips
        (user_id, owner_kind, owner_id, kind, variant_index, content_type,
         audio_bytes, prompt_seed, pack_generation_id, created_at)
       VALUES (?, 'bot', 'bot-legacy', ?, 0, 'audio/mpeg', ?, ?, 'gen1', ?)`,
    );
    const now = new Date().toISOString();
    insert.run(userId, "fart", tinyMp3, "fart sound effect", now);
    insert.run(
      userId,
      "laugh",
      tinyMp3,
      "A short unique laugh for Alpha, dry wit",
      now,
    );
    assert.equal(
      getActionSfxPackSummary(db, userId, "bot", "bot-legacy"),
      null,
    );

    db.prepare(
      `UPDATE action_sfx_pack_clips
          SET prompt_seed = '[laughs]'
        WHERE user_id = ? AND owner_id = 'bot-legacy' AND kind = 'laugh'`,
    ).run(userId);
    const summary = getActionSfxPackSummary(db, userId, "bot", "bot-legacy");
    assert.ok(summary);
    assert.equal(summary.clipCount, 1);
    assert.deepEqual(summary.kinds, ["laugh"]);
  });

  it("keeps packs out of Marketplace bot export SQL", () => {
    const marketplace = readFileSync(
      fileURLToPath(new URL("../prism-marketplace.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(marketplace, /action_sfx_pack/u);
  });

  it("wires backup export/import and generate routes for TTS packs", () => {
    const backup = readFileSync(
      fileURLToPath(new URL("../backup.ts", import.meta.url)),
      "utf8",
    );
    assert.match(backup, /actionSfxPacks:\s*listActionSfxPackClipsForBackup/u);
    assert.match(backup, /restoreActionSfxPackClipsFromBackup/u);

    const server = readFileSync(
      fileURLToPath(new URL("../server.ts", import.meta.url)),
      "utf8",
    );
    assert.match(server, /route\("GET", "\/api\/action-sfx-pack"/u);
    assert.match(server, /route\("GET", "\/api\/action-sfx-pack\/clip"/u);
    assert.match(server, /route\("POST", "\/api\/action-sfx-pack\/generate"/u);
    assert.match(server, /x-prism-action-sfx-pack-progress/u);
    assert.match(server, /ACTION_SFX_PACK_MISSING_VOICE_MESSAGE/u);
    assert.match(server, /resolveElevenLabsVoiceId\(voiceProfile\)/u);
    assert.match(server, /voiceId,/u);
    assert.match(server, /ACTION_SFX_PACK_CLIP_COUNT/u);
  });
});
