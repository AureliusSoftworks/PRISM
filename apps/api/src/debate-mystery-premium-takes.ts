import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { normalizeBotAudioVoiceProfileV1 } from "@localai/shared";
import type { BotAudioVoiceProfileV1 } from "@localai/shared";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";
import {
  elevenLabsVoiceIsolationSeed,
  normalizeElevenLabsTtsModel,
  requestElevenLabsSpeechWithTimestamps,
  resolveElevenLabsVoiceId,
} from "./voices.ts";
import type { VoiceCharacterAlignment } from "./voices.ts";

/**
 * Premium takes for Whodunnit lines, prepared while the speaker thinks.
 *
 * The Speech picker's Premium choice means the frozen ElevenLabs voice. A take
 * is synthesized during the action that queues the line, stored beside the
 * local clips in the shared audio cache (mp3 rather than wav) with its
 * character alignment, and referenced per session line so cleanup counts it.
 * The client plays it as-is: no second ElevenLabs request when the line
 * becomes visible, and the alignment drives the mouth. The local clip stays
 * the fallback, synthesized on demand only if the take cannot play.
 */
const PREMIUM_TAKE_AUDIO_SUBDIR = "debate-mystery-audio-v2";
const PREMIUM_TAKE_MS_PER_CHARACTER = 65;
const PREMIUM_TAKE_MIN_DURATION_MS = 800;

export interface DebateMysteryPremiumTakeRequestV1 {
  apiKey: string;
  /** The account's ElevenLabs model choice; normalized before use. */
  model: unknown;
}

export interface DebateMysteryPremiumTakeLineV1 {
  lineId: string;
  speakerBotId: string;
  spokenText: string;
  voiceProfile: BotAudioVoiceProfileV1;
}

export interface DebateMysteryPremiumTakeV1 {
  lineId: string;
  cacheKey: string;
  absolutePath: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
  alignment: VoiceCharacterAlignment | null;
}

export interface DebateMysteryPremiumTakeSynthesisV1 {
  audioBase64: string;
  audioContentType: string;
  alignment: VoiceCharacterAlignment | null;
  normalizedAlignment: VoiceCharacterAlignment | null;
}

export type DebateMysteryPremiumTakeSynthesizerV1 = (args: {
  apiKey: string;
  tenantId: string;
  voiceId: string;
  model: unknown;
  text: string;
  profile: BotAudioVoiceProfileV1;
  seed: number | undefined;
  signal?: AbortSignal;
}) => Promise<DebateMysteryPremiumTakeSynthesisV1>;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function debateMysteryPremiumTakeCacheKeyV1(
  userId: string,
  contract: { spokenText: string; speakerBotId: string; voiceProfileHash: string; model: unknown },
): string {
  return sha256(
    `PRISM\0WHODUNNIT-PREMIUM-TAKE\0V1\0${userId}\0${JSON.stringify({
      textHash: sha256(contract.spokenText),
      speakerBotId: contract.speakerBotId,
      voiceProfileHash: contract.voiceProfileHash,
      model: normalizeElevenLabsTtsModel(contract.model),
    })}`,
  );
}

/** The take's length from its alignment, or a spoken-pace estimate without one. */
export function debateMysteryPremiumTakeDurationMsV1(
  alignment: VoiceCharacterAlignment | null,
  text: string,
): number {
  const ends = alignment?.characterEndTimesSeconds ?? [];
  const end = ends.length ? Math.max(...ends) : 0;
  if (Number.isFinite(end) && end > 0) return Math.max(1, Math.round(end * 1_000));
  return Math.max(PREMIUM_TAKE_MIN_DURATION_MS, text.trim().length * PREMIUM_TAKE_MS_PER_CHARACTER);
}

function takeRelativePath(userId: string, cacheKey: string): string {
  return `${PREMIUM_TAKE_AUDIO_SUBDIR}/${sha256(userId).slice(0, 24)}/cache/${cacheKey}.mp3`;
}

function writeBytesAtomically(relativePath: string, bytes: Uint8Array): string {
  const absolutePath = resolveAbsoluteUnderDataRoot(relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const staging = `${absolutePath}.staging`;
  writeFileSync(staging, bytes);
  renameSync(staging, absolutePath);
  return absolutePath;
}

function verifiedTakeFile(
  relativePath: string,
  expected: { sha256: string; byteSize: number },
): string | null {
  try {
    const absolutePath = resolveAbsoluteUnderDataRoot(relativePath);
    if (!existsSync(absolutePath)) return null;
    const bytes = readFileSync(absolutePath);
    if (bytes.byteLength !== expected.byteSize || sha256(bytes) !== expected.sha256) return null;
    return absolutePath;
  } catch {
    return null;
  }
}

function parseAlignment(value: string | null | undefined): VoiceCharacterAlignment | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<VoiceCharacterAlignment> | null;
    if (
      !parsed ||
      !Array.isArray(parsed.characters) ||
      !Array.isArray(parsed.characterStartTimesSeconds) ||
      !Array.isArray(parsed.characterEndTimesSeconds)
    ) return null;
    return {
      characters: parsed.characters,
      characterStartTimesSeconds: parsed.characterStartTimesSeconds,
      characterEndTimesSeconds: parsed.characterEndTimesSeconds,
    };
  } catch {
    return null;
  }
}

const defaultSynthesizer: DebateMysteryPremiumTakeSynthesizerV1 = async (args) => {
  const speech = await requestElevenLabsSpeechWithTimestamps({
    apiKey: args.apiKey,
    tenantId: args.tenantId,
    privacyMode: "online",
    voiceId: args.voiceId,
    model: normalizeElevenLabsTtsModel(args.model),
    text: args.text,
    profile: args.profile,
    seed: args.seed,
    signal: args.signal,
  });
  return {
    audioBase64: speech.audioBase64,
    audioContentType: speech.audioContentType,
    alignment: speech.alignment,
    normalizedAlignment: speech.normalizedAlignment,
  };
};

interface CacheRow {
  clip_path: string;
  mime_type: string;
  sha256: string;
  byte_size: number;
  duration_ms: number;
}

function cacheRow(db: DatabaseSync, userId: string, cacheKey: string): CacheRow | undefined {
  return db.prepare(
    `SELECT clip_path, mime_type, sha256, byte_size, duration_ms
       FROM debate_mystery_audio_cache
      WHERE user_id = ? AND cache_key = ?`,
  ).get(userId, cacheKey) as CacheRow | undefined;
}

async function prepareOneTake(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  line: DebateMysteryPremiumTakeLineV1;
  request: DebateMysteryPremiumTakeRequestV1;
  synthesize: DebateMysteryPremiumTakeSynthesizerV1;
  signal?: AbortSignal;
}): Promise<void> {
  const profile = normalizeBotAudioVoiceProfileV1(args.line.voiceProfile);
  const voiceId = resolveElevenLabsVoiceId(profile);
  const text = args.line.spokenText.replace(/\s+/gu, " ").trim();
  if (!voiceId || !profile.enabled || !text) {
    throw new Error(`Line ${args.line.lineId} has no Premium voice to take.`);
  }
  const voiceProfileHash = sha256(JSON.stringify(profile));
  const textHash = sha256(text);
  const cacheKey = debateMysteryPremiumTakeCacheKeyV1(args.userId, {
    spokenText: text,
    speakerBotId: args.line.speakerBotId,
    voiceProfileHash,
    model: args.request.model,
  });
  const now = new Date().toISOString();
  const existing = cacheRow(args.db, args.userId, cacheKey);
  let alignmentJson: string | null = null;
  if (existing && verifiedTakeFile(existing.clip_path, { sha256: existing.sha256, byteSize: existing.byte_size })) {
    // The same words in the same voice were taken before; keep that take and
    // the alignment saved beside it.
    const sidecar = resolveAbsoluteUnderDataRoot(`${existing.clip_path}.alignment.json`);
    alignmentJson = existsSync(sidecar) ? readFileSync(sidecar, "utf8") : null;
  } else {
    const speech = await args.synthesize({
      apiKey: args.request.apiKey,
      tenantId: args.userId,
      voiceId,
      model: args.request.model,
      text,
      profile,
      seed: elevenLabsVoiceIsolationSeed(args.line.speakerBotId),
      signal: args.signal,
    });
    const bytes = Buffer.from(speech.audioBase64, "base64");
    if (bytes.byteLength <= 0) throw new Error(`Premium take for ${args.line.lineId} is empty.`);
    const alignment = speech.alignment ?? speech.normalizedAlignment;
    const durationMs = debateMysteryPremiumTakeDurationMsV1(alignment, text);
    const clipPath = takeRelativePath(args.userId, cacheKey);
    if (existing) {
      args.db.prepare(
        "DELETE FROM debate_mystery_audio_cache WHERE user_id = ? AND cache_key = ? AND ref_count = 0",
      ).run(args.userId, cacheKey);
    }
    writeBytesAtomically(clipPath, bytes);
    alignmentJson = alignment ? JSON.stringify(alignment) : null;
    writeFileSync(
      resolveAbsoluteUnderDataRoot(`${clipPath}.alignment.json`),
      alignmentJson ?? "null",
    );
    args.db.prepare(
      `INSERT INTO debate_mystery_audio_cache
         (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
          duration_ms, ref_count, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(user_id, cache_key) DO UPDATE SET
         clip_path = excluded.clip_path, mime_type = excluded.mime_type,
         sha256 = excluded.sha256, byte_size = excluded.byte_size,
         duration_ms = excluded.duration_ms, last_used_at = excluded.last_used_at`,
    ).run(
      cacheKey,
      args.userId,
      clipPath,
      speech.audioContentType || "audio/mpeg",
      sha256(bytes),
      bytes.byteLength,
      durationMs,
      now,
      now,
    );
  }
  const current = args.db.prepare(
    `SELECT cache_key FROM debate_mystery_premium_takes
      WHERE session_id = ? AND user_id = ? AND line_id = ?`,
  ).get(args.sessionId, args.userId, args.line.lineId) as { cache_key: string } | undefined;
  args.db.exec("BEGIN IMMEDIATE");
  try {
    if (current && current.cache_key !== cacheKey) {
      args.db.prepare(
        `DELETE FROM debate_mystery_premium_takes
          WHERE session_id = ? AND user_id = ? AND line_id = ?`,
      ).run(args.sessionId, args.userId, args.line.lineId);
    }
    if (!current || current.cache_key !== cacheKey) {
      args.db.prepare(
        `INSERT INTO debate_mystery_premium_takes
           (session_id, user_id, line_id, cache_key, text_hash, voice_profile_hash,
            alignment_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(args.sessionId, args.userId, args.line.lineId, cacheKey, textHash, voiceProfileHash, alignmentJson, now);
      args.db.prepare(
        `UPDATE debate_mystery_audio_cache
            SET ref_count = ref_count + 1, last_used_at = ?
          WHERE user_id = ? AND cache_key = ?`,
      ).run(now, args.userId, cacheKey);
    } else {
      args.db.prepare(
        `UPDATE debate_mystery_premium_takes
            SET text_hash = ?, voice_profile_hash = ?, alignment_json = ?
          WHERE session_id = ? AND user_id = ? AND line_id = ?`,
      ).run(textHash, voiceProfileHash, alignmentJson, args.sessionId, args.userId, args.line.lineId);
    }
    args.db.exec("COMMIT");
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Takes every line it can and reports which ones are ready. A line without a
 * Premium voice, or whose synthesis fails, is left to the local clip; the
 * caller decides whether to synthesize that clip now or on demand.
 */
export async function prepareDebateMysteryPremiumTakesV1(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  lines: readonly DebateMysteryPremiumTakeLineV1[];
  request: DebateMysteryPremiumTakeRequestV1;
  signal?: AbortSignal;
  synthesize?: DebateMysteryPremiumTakeSynthesizerV1;
}): Promise<{ prepared: string[]; failed: string[] }> {
  const synthesize = args.synthesize ?? defaultSynthesizer;
  const outcomes = await Promise.all(args.lines.map(async (line) => {
    try {
      await prepareOneTake({
        db: args.db,
        userId: args.userId,
        sessionId: args.sessionId,
        line,
        request: args.request,
        synthesize,
        signal: args.signal,
      });
      return { lineId: line.lineId, ok: true };
    } catch {
      return { lineId: line.lineId, ok: false };
    }
  }));
  return {
    prepared: outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.lineId),
    failed: outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.lineId),
  };
}

/** The prepared take for exactly this line's current words and frozen voice, or null. */
export function readDebateMysteryPremiumTakeV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  line: { lineId: string; spokenText: string; voiceProfile: BotAudioVoiceProfileV1 },
): DebateMysteryPremiumTakeV1 | null {
  const row = db.prepare(
    `SELECT take.cache_key, take.text_hash, take.voice_profile_hash, take.alignment_json,
            cache.clip_path, cache.mime_type, cache.sha256, cache.byte_size, cache.duration_ms
       FROM debate_mystery_premium_takes AS take
       JOIN debate_mystery_audio_cache AS cache
         ON cache.user_id = take.user_id AND cache.cache_key = take.cache_key
      WHERE take.session_id = ? AND take.user_id = ? AND take.line_id = ?`,
  ).get(sessionId, userId, line.lineId) as ({
    cache_key: string;
    text_hash: string;
    voice_profile_hash: string;
    alignment_json: string | null;
  } & CacheRow) | undefined;
  if (!row) return null;
  const text = line.spokenText.replace(/\s+/gu, " ").trim();
  const profile = normalizeBotAudioVoiceProfileV1(line.voiceProfile);
  if (row.text_hash !== sha256(text) || row.voice_profile_hash !== sha256(JSON.stringify(profile))) {
    return null;
  }
  const absolutePath = verifiedTakeFile(row.clip_path, { sha256: row.sha256, byteSize: row.byte_size });
  if (!absolutePath) return null;
  return {
    lineId: line.lineId,
    cacheKey: row.cache_key,
    absolutePath,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    durationMs: row.duration_ms,
    alignment: parseAlignment(row.alignment_json),
  };
}
