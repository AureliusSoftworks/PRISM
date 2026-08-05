/**
 * Local English pacing profiles — Premium with-timestamps bake of clause
 * pause medians for offline Kokoro playback. Never Marketplace-exported.
 */

import type { DatabaseSync } from "node:sqlite";
import {
  ENGLISH_PACING_CALIBRATE_SCRIPT,
  ENGLISH_PACING_PROFILE_SOURCE,
  ENGLISH_PACING_PROFILE_VERSION,
  actionSfxPackOwnerIdFor,
  extractEnglishPacingPauseMedians,
  normalizeEnglishPacingProfileV1,
  normalizeBotAudioVoiceProfileV1,
  type ActionSfxPackOwnerKind,
  type BotAudioVoiceProfileV1,
  type EnglishPacingProfileV1,
} from "@localai/shared";
import {
  ElevenLabsVoiceError,
  elevenLabsVoiceIsolationSeed,
  requestElevenLabsSpeechWithTimestamps,
} from "./voices.ts";

export const ENGLISH_PACING_MISSING_VOICE_MESSAGE =
  "Assign a Premium voice before calibrating English pacing.";

export function ensureEnglishPacingProfileSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS english_pacing_profiles (
      user_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      comma_ms INTEGER NOT NULL,
      clause_ms INTEGER NOT NULL,
      strong_ms INTEGER NOT NULL,
      calibrated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (user_id, owner_kind, owner_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_english_pacing_owner
      ON english_pacing_profiles (user_id, owner_kind, owner_id);
  `);
}

export function getEnglishPacingProfile(
  db: DatabaseSync,
  userId: string,
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
): EnglishPacingProfileV1 | null {
  const row = db
    .prepare(
      `SELECT owner_kind, owner_id, comma_ms, clause_ms, strong_ms,
              calibrated_at, source
         FROM english_pacing_profiles
        WHERE user_id = ? AND owner_kind = ? AND owner_id = ?`,
    )
    .get(userId, ownerKind, ownerId) as
    | {
        owner_kind: string;
        owner_id: string;
        comma_ms: number;
        clause_ms: number;
        strong_ms: number;
        calibrated_at: string;
        source: string;
      }
    | undefined;
  if (!row) return null;
  return normalizeEnglishPacingProfileV1({
    v: ENGLISH_PACING_PROFILE_VERSION,
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    commaMs: row.comma_ms,
    clauseMs: row.clause_ms,
    strongMs: row.strong_ms,
    calibratedAt: row.calibrated_at,
    source: row.source,
  });
}

export function saveEnglishPacingProfile(
  db: DatabaseSync,
  userId: string,
  profile: EnglishPacingProfileV1,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO english_pacing_profiles
      (user_id, owner_kind, owner_id, comma_ms, clause_ms, strong_ms,
       calibrated_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    profile.ownerKind,
    profile.ownerId,
    profile.commaMs,
    profile.clauseMs,
    profile.strongMs,
    profile.calibratedAt,
    profile.source,
  );
}

export function listEnglishPacingProfilesForBackup(
  db: DatabaseSync,
  userId: string,
): EnglishPacingProfileV1[] {
  const rows = db
    .prepare(
      `SELECT owner_kind, owner_id, comma_ms, clause_ms, strong_ms,
              calibrated_at, source
         FROM english_pacing_profiles
        WHERE user_id = ?
        ORDER BY calibrated_at ASC`,
    )
    .all(userId) as Array<{
    owner_kind: string;
    owner_id: string;
    comma_ms: number;
    clause_ms: number;
    strong_ms: number;
    calibrated_at: string;
    source: string;
  }>;
  return rows
    .map((row) =>
      normalizeEnglishPacingProfileV1({
        v: ENGLISH_PACING_PROFILE_VERSION,
        ownerKind: row.owner_kind,
        ownerId: row.owner_id,
        commaMs: row.comma_ms,
        clauseMs: row.clause_ms,
        strongMs: row.strong_ms,
        calibratedAt: row.calibrated_at,
        source: row.source,
      }),
    )
    .filter((profile): profile is EnglishPacingProfileV1 => profile !== null);
}

export function restoreEnglishPacingProfilesFromBackup(
  db: DatabaseSync,
  userId: string,
  entries: unknown,
): void {
  if (!Array.isArray(entries)) return;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO english_pacing_profiles
      (user_id, owner_kind, owner_id, comma_ms, clause_ms, strong_ms,
       calibrated_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const entry of entries) {
    const profile = normalizeEnglishPacingProfileV1(entry);
    if (!profile) continue;
    insert.run(
      userId,
      profile.ownerKind,
      profile.ownerId,
      profile.commaMs,
      profile.clauseMs,
      profile.strongMs,
      profile.calibratedAt,
      profile.source,
    );
  }
}

export async function calibrateEnglishPacingProfile(args: {
  db: DatabaseSync;
  userId: string;
  ownerKind: ActionSfxPackOwnerKind;
  botId?: string | null;
  apiKey: string;
  voiceId: string;
  voiceProfile: BotAudioVoiceProfileV1;
  voiceModel?: unknown;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<EnglishPacingProfileV1> {
  const voiceId = args.voiceId.trim();
  if (!voiceId) {
    throw new ElevenLabsVoiceError(400, ENGLISH_PACING_MISSING_VOICE_MESSAGE);
  }
  const ownerId = actionSfxPackOwnerIdFor(args.ownerKind, args.botId);
  const profile = normalizeBotAudioVoiceProfileV1(args.voiceProfile);
  const timestamped = await requestElevenLabsSpeechWithTimestamps({
    apiKey: args.apiKey,
    voiceId,
    model: args.voiceModel ?? "eleven_v3",
    text: ENGLISH_PACING_CALIBRATE_SCRIPT,
    profile,
    seed: elevenLabsVoiceIsolationSeed(`english-pacing:${ownerId}`),
    signal: args.signal,
    fetchImpl: args.fetchImpl,
  });
  const alignment =
    timestamped.alignment ?? timestamped.normalizedAlignment ?? null;
  const medians = extractEnglishPacingPauseMedians(alignment);
  const next: EnglishPacingProfileV1 = {
    v: ENGLISH_PACING_PROFILE_VERSION,
    ownerKind: args.ownerKind,
    ownerId,
    commaMs: medians.commaMs,
    clauseMs: medians.clauseMs,
    strongMs: medians.strongMs,
    calibratedAt: new Date().toISOString(),
    source: ENGLISH_PACING_PROFILE_SOURCE,
  };
  saveEnglishPacingProfile(args.db, args.userId, next);
  return next;
}
