import type { DatabaseSync } from "node:sqlite";
import {
  BOT_RESPONSE_CUE_MAX_CHARACTERS,
  heardBotPresenceBeatTextV1,
  type BotPresenceBeatCompletionV1,
  type BotPresenceBeatSurfaceV1,
  type BotPresenceBeatV1,
  type BotResponseCueSourceV1,
  type BotResponseCueTriggerV1,
} from "@localai/shared";
import { randomId } from "./security.ts";

interface PresenceBeatRow {
  id: string;
  surface: BotPresenceBeatSurfaceV1;
  session_id: string;
  response_id: string;
  speaker_bot_id: string;
  speaker_name: string;
  trigger: BotResponseCueTriggerV1;
  source: BotResponseCueSourceV1;
  text: string;
  heard_character_count: number;
  completion: BotPresenceBeatCompletionV1;
  playback_started_at_ms: number;
  playback_ended_at_ms: number | null;
  created_at: string;
  updated_at: string;
}

function mapPresenceBeat(row: PresenceBeatRow): BotPresenceBeatV1 {
  return {
    v: 1,
    id: row.id,
    surface: row.surface,
    sessionId: row.session_id,
    responseId: row.response_id,
    speaker: { botId: row.speaker_bot_id, name: row.speaker_name },
    trigger: row.trigger,
    source: row.source,
    text: row.text,
    heardCharacterCount: row.heard_character_count,
    completion: row.completion,
    playbackStartedAtMs: row.playback_started_at_ms,
    playbackEndedAtMs: row.playback_ended_at_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createBotPresenceBeat(
  db: DatabaseSync,
  userId: string,
  input: Omit<
    BotPresenceBeatV1,
    "v" | "id" | "heardCharacterCount" | "completion" | "playbackEndedAtMs" | "createdAt" | "updatedAt"
  >,
): BotPresenceBeatV1 {
  const text = input.text.replace(/\s+/gu, " ").trim();
  if (!text || text.length > BOT_RESPONSE_CUE_MAX_CHARACTERS) {
    throw new Error("Response cue text must be between 1 and 48 characters.");
  }
  const now = new Date().toISOString();
  const id = randomId(12);
  db.prepare(
    `INSERT INTO bot_presence_beats (
       id, user_id, surface, session_id, response_id, speaker_bot_id,
       speaker_name, trigger, source, text, heard_character_count, completion,
       playback_started_at_ms, playback_ended_at_ms, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'playing', ?, NULL, ?, ?)`,
  ).run(
    id,
    userId,
    input.surface,
    input.sessionId,
    input.responseId,
    input.speaker.botId,
    input.speaker.name.slice(0, 120),
    input.trigger,
    input.source,
    text,
    Math.max(0, input.playbackStartedAtMs),
    now,
    now,
  );
  return getBotPresenceBeat(db, userId, id);
}

export function getBotPresenceBeat(
  db: DatabaseSync,
  userId: string,
  id: string,
): BotPresenceBeatV1 {
  const row = db
    .prepare("SELECT * FROM bot_presence_beats WHERE id = ? AND user_id = ?")
    .get(id, userId) as PresenceBeatRow | undefined;
  if (!row) throw new Error("Response cue not found.");
  return mapPresenceBeat(row);
}

export function updateBotPresenceBeat(
  db: DatabaseSync,
  userId: string,
  id: string,
  input: {
    heardCharacterCount: number;
    completion: BotPresenceBeatCompletionV1;
    playbackEndedAtMs?: number | null;
  },
): BotPresenceBeatV1 {
  const current = getBotPresenceBeat(db, userId, id);
  const heardCharacterCount = Math.max(
    current.heardCharacterCount,
    Math.min(current.text.length, Math.floor(input.heardCharacterCount)),
  );
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE bot_presence_beats
        SET heard_character_count = ?, completion = ?, playback_ended_at_ms = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    heardCharacterCount,
    input.completion,
    input.playbackEndedAtMs == null
      ? null
      : Math.max(current.playbackStartedAtMs, input.playbackEndedAtMs),
    now,
    id,
    userId,
  );
  return getBotPresenceBeat(db, userId, id);
}

export function listBotPresenceBeats(
  db: DatabaseSync,
  userId: string,
  surface: BotPresenceBeatSurfaceV1,
  sessionId: string,
): BotPresenceBeatV1[] {
  return (
    db
      .prepare(
        `SELECT * FROM bot_presence_beats
          WHERE user_id = ? AND surface = ? AND session_id = ?
          ORDER BY created_at, rowid`,
      )
      .all(userId, surface, sessionId) as unknown as PresenceBeatRow[]
  ).map(mapPresenceBeat);
}

export function listBotPresenceBeatsForSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): BotPresenceBeatV1[] {
  return (
    db
      .prepare(
        `SELECT * FROM bot_presence_beats
          WHERE user_id = ? AND session_id = ?
          ORDER BY created_at, rowid`,
      )
      .all(userId, sessionId) as unknown as PresenceBeatRow[]
  ).map(mapPresenceBeat);
}

export function botPresenceBeatPublicTranscriptLine(
  beat: BotPresenceBeatV1,
): string | null {
  const heard = heardBotPresenceBeatTextV1(beat).trim();
  return heard ? `[Response cue — ${beat.speaker.name}] ${heard}` : null;
}
