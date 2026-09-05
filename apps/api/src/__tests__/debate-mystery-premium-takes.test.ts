import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { normalizeBotAudioVoiceProfileV1 } from "@localai/shared";
import { createHash } from "node:crypto";
import { initializeDatabase } from "../db.ts";
import {
  debateMysteryPremiumTakeCacheKeyV1,
  debateMysteryPremiumTakeDurationMsV1,
  prepareDebateMysteryPremiumTakesV1,
  readDebateMysteryPremiumTakeV1,
} from "../debate-mystery-premium-takes.ts";

const NOW = "2026-09-04T12:00:00.000Z";
const dataRoot = mkdtempSync(join(tmpdir(), "prism-premium-takes-"));
const priorDataRoot = process.env.LOCALAI_DATA_DIR;
process.env.LOCALAI_DATA_DIR = dataRoot;

after(() => {
  if (priorDataRoot === undefined) delete process.env.LOCALAI_DATA_DIR;
  else process.env.LOCALAI_DATA_DIR = priorDataRoot;
  rmSync(dataRoot, { recursive: true, force: true });
});

function takeDb(userId = "user-1", sessionId = "case-1"): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES (?, ?, 'Investigator', 'hash', 'salt', 'cipher', 'iv', 'tag',
             'local', ?, ?)`,
  ).run(userId, `${userId}@example.test`, NOW, NOW);
  db.prepare(
    `INSERT INTO debate_sessions
       (id, user_id, revision, status, phase, step_key, player_role,
        create_idempotency_key, motion, session_json, created_at, updated_at)
     VALUES (?, ?, 1, 'waiting_for_player', 'opening', 'mystery_v2_investigation',
             'participant', ?, 'Whodunnit?', '{}', ?, ?)`,
  ).run(sessionId, userId, `create-${sessionId}`, NOW, NOW);
  return db;
}

const voiceProfile = {
  enabled: true,
  elevenLabsVoiceId: "voice-peter",
} as unknown as Parameters<typeof readDebateMysteryPremiumTakeV1>[3]["voiceProfile"];

const alignment = {
  characters: ["H", "i", "?"],
  characterStartTimesSeconds: [0, 0.2, 0.4],
  characterEndTimesSeconds: [0.2, 0.4, 1.25],
};

test("measures a take by its alignment and falls back to a spoken pace", () => {
  assert.equal(debateMysteryPremiumTakeDurationMsV1(alignment, "Hi?"), 1250);
  assert.equal(debateMysteryPremiumTakeDurationMsV1(null, "A ten-word question about a long enough line?"), 45 * 65);
  assert.equal(debateMysteryPremiumTakeDurationMsV1(null, "Hi?"), 800);
});

test("prepares a take once, serves it for the same words, and drops it when the words change", async () => {
  const db = takeDb();
  let synthesized = 0;
  const synthesize = async () => {
    synthesized += 1;
    return {
      audioBase64: Buffer.from("not really mp3 bytes").toString("base64"),
      audioContentType: "audio/mpeg",
      alignment,
      normalizedAlignment: null,
    };
  };
  const line = {
    lineId: "line-talk-suspect-1-topic-a",
    speakerBotId: "bot-peter",
    spokenText: "Hi?",
    voiceProfile,
  };
  const first = await prepareDebateMysteryPremiumTakesV1({
    db, userId: "user-1", sessionId: "case-1", lines: [line], request: { apiKey: "key", model: "eleven_flash_v2_5" }, synthesize,
  });
  assert.deepEqual(first, { prepared: [line.lineId], failed: [] });
  const take = readDebateMysteryPremiumTakeV1(db, "user-1", "case-1", line);
  assert.ok(take, "the take is served for the same words and voice");
  assert.equal(take.durationMs, 1250);
  assert.equal(take.mimeType, "audio/mpeg");
  assert.deepEqual(take.alignment, alignment);
  assert.ok(existsSync(take.absolutePath));
  assert.equal(
    take.cacheKey,
    debateMysteryPremiumTakeCacheKeyV1("user-1", {
      spokenText: "Hi?",
      speakerBotId: "bot-peter",
      voiceProfileHash: createHash("sha256")
        .update(JSON.stringify(normalizeBotAudioVoiceProfileV1(voiceProfile)))
        .digest("hex"),
      model: "eleven_flash_v2_5",
    }),
    "the take is keyed by words, speaker, frozen voice, and model",
  );
  const cache = db.prepare(
    "SELECT ref_count FROM debate_mystery_audio_cache WHERE user_id = ? AND cache_key = ?",
  ).get("user-1", take.cacheKey) as { ref_count: number };
  assert.equal(cache.ref_count, 1, "the session line references its take");

  const again = await prepareDebateMysteryPremiumTakesV1({
    db, userId: "user-1", sessionId: "case-1", lines: [line], request: { apiKey: "key", model: "eleven_flash_v2_5" }, synthesize,
  });
  assert.deepEqual(again.prepared, [line.lineId]);
  assert.equal(synthesized, 1, "the same words in the same voice are never taken twice");

  assert.equal(
    readDebateMysteryPremiumTakeV1(db, "user-1", "case-1", { ...line, spokenText: "Hi there?" }),
    null,
    "a performed line with new words no longer matches the old take",
  );
  const silent = await prepareDebateMysteryPremiumTakesV1({
    db, userId: "user-1", sessionId: "case-1",
    lines: [{ ...line, lineId: "line-2", voiceProfile: { ...voiceProfile, elevenLabsVoiceId: "" } }],
    request: { apiKey: "key", model: "eleven_flash_v2_5" }, synthesize,
  });
  assert.deepEqual(silent, { prepared: [], failed: ["line-2"] }, "a line without a Premium voice is left to the local clip");
});
