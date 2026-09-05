import type { DatabaseSync } from "node:sqlite";

export const SPEECH_INTENT_REVEAL_MAX_LENGTH = 6_000;

export type SpeechIntentRevealMode =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export interface SpeechIntentRevealRequestV1 {
  mode: SpeechIntentRevealMode;
  scopeId: string;
  recordId: string;
}

export interface SpeechIntentRevealResponseV1 {
  ok: true;
  intendedSpeech: string;
}

interface EphemeralSpeechIntentRevealEntry {
  intendedSpeech: string;
  publicSpeech: string;
  expiresAt: number;
}

const EPHEMERAL_REVEAL_TTL_MS = 6 * 60 * 60 * 1_000;
const ephemeralSpeechIntentReveals = new Map<
  string,
  EphemeralSpeechIntentRevealEntry
>();

function ephemeralRevealKey(
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string {
  return `${userId}\u0000${request.mode}\u0000${request.scopeId}\u0000${request.recordId}`;
}

export function registerEphemeralSpeechIntentRevealV1(args: {
  userId: string;
  request: SpeechIntentRevealRequestV1;
  intendedSpeech: string;
  publicSpeech: string;
}): boolean {
  if (args.request.mode !== "chat" && args.request.mode !== "zen") return false;
  const intendedSpeech = cleanIntent(args.intendedSpeech, args.publicSpeech);
  if (!intendedSpeech) return false;
  const now = Date.now();
  for (const [key, entry] of ephemeralSpeechIntentReveals) {
    if (entry.expiresAt <= now) ephemeralSpeechIntentReveals.delete(key);
  }
  ephemeralSpeechIntentReveals.set(
    ephemeralRevealKey(args.userId, args.request),
    {
      intendedSpeech,
      publicSpeech: args.publicSpeech,
      expiresAt: now + EPHEMERAL_REVEAL_TTL_MS,
    },
  );
  return true;
}

export function readEphemeralSpeechIntentRevealV1(
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string | null {
  const key = ephemeralRevealKey(userId, request);
  const entry = ephemeralSpeechIntentReveals.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    ephemeralSpeechIntentReveals.delete(key);
    return null;
  }
  return cleanIntent(entry.intendedSpeech, entry.publicSpeech);
}

function objectValue(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function jsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return objectValue(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function cleanIntent(value: unknown, publicText: unknown): string | null {
  if (typeof value !== "string") return null;
  const intended = value.trim();
  if (!intended || intended.length > SPEECH_INTENT_REVEAL_MAX_LENGTH) return null;
  const publicSpeech = typeof publicText === "string" ? publicText.trim() : "";
  if (!publicSpeech || intended === publicSpeech) return null;
  return intended;
}

function storedDebateSpeakerObfuscatesSpeech(
  session: Record<string, unknown> | null,
  speakerBotId: string,
): boolean {
  const powerPlan = objectValue(session?.powerPlan);
  const bots = objectValue(powerPlan?.bots);
  const speakerPlan = objectValue(bots?.[speakerBotId]);
  const effects = Array.isArray(speakerPlan?.effects)
    ? speakerPlan.effects
    : [];
  return effects.some((entry) =>
    objectValue(objectValue(entry)?.effect)?.type === "speech_obfuscation",
  );
}

function revealFromChatFamily(
  db: DatabaseSync,
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string | null {
  const row = db.prepare(
    `SELECT m.role, m.bot_id, m.content, m.tool_payload, c.conversation_mode
       FROM messages m
       JOIN conversations c
         ON c.id = m.conversation_id AND c.user_id = m.user_id
      WHERE m.id = ? AND m.conversation_id = ? AND m.user_id = ?`,
  ).get(request.recordId, request.scopeId, userId) as
    | {
        role: string;
        bot_id: string | null;
        content: string;
        tool_payload: string | null;
        conversation_mode: string | null;
      }
    | undefined;
  if (
    !row ||
    row.role !== "assistant" ||
    !row.bot_id ||
    row.conversation_mode !== request.mode
  ) return null;
  const payload = jsonObject(row.tool_payload);
  if (!payload || payload.botPowerExactResponse !== "speech_obfuscation") return null;
  if (
    request.mode === "coffee" &&
    (payload.coffeeAside ||
      payload.coffeeInterruption ||
      payload.crosstalkReclaim ||
      payload.socialSilence ||
      payload.botPowerMutePerformance)
  ) return null;
  return cleanIntent(payload.botPowerIntendedSpeech, row.content);
}

function revealFromSignal(
  db: DatabaseSync,
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string | null {
  const rows = db.prepare(
    `SELECT e.kind, e.payload_json, m.content, m.speaker_role, m.bot_id
       FROM botcast_events e
       JOIN botcast_messages m
         ON m.user_id = e.user_id
        AND m.episode_id = e.episode_id
        AND m.id = ?
      WHERE e.user_id = ? AND e.episode_id = ? AND e.kind = 'utterance'`,
  ).all(request.recordId, userId, request.scopeId) as unknown as Array<{
    kind: string;
    payload_json: string;
    content: string;
    speaker_role: string;
    bot_id: string;
  }>;
  for (const row of rows) {
    const payload = jsonObject(row.payload_json);
    if (
      !payload ||
      payload.messageId !== request.recordId ||
      payload.publicSpeechEffect !== "speech_obfuscation" ||
      payload.mutePerformance ||
      payload.socialSilence ||
      payload.producerQuoteStance ||
      payload.producerDirectQuote ||
      !row.bot_id ||
      (row.speaker_role !== "host" && row.speaker_role !== "guest")
    ) continue;
    const intended = cleanIntent(payload.powerIntendedSpeech, row.content);
    if (intended) return intended;
  }
  return null;
}

const DEBATE_PRIMARY_REVEAL_KINDS = new Set([
  "intro",
  "speech",
  "testimony",
  "press",
  "objection",
  "interjection",
  "moderator_ruling",
  "jury_deliberation",
  "jury_verdict",
  "verdict",
]);

function revealFromDebate(
  db: DatabaseSync,
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string | null {
  const row = db.prepare(
    `SELECT e.event_json, s.session_json
       FROM debate_events e
       JOIN debate_sessions s
         ON s.id = e.session_id AND s.user_id = e.user_id
      WHERE e.id = ? AND e.session_id = ? AND e.user_id = ?`,
  ).get(request.recordId, request.scopeId, userId) as
    | { event_json: string; session_json: string }
    | undefined;
  const event = jsonObject(row?.event_json);
  if (
    !event ||
    !DEBATE_PRIMARY_REVEAL_KINDS.has(String(event.kind ?? "")) ||
    event.speakerKind === "player" ||
    event.speakerKind === "system" ||
    typeof event.speakerBotId !== "string" ||
    !event.speakerBotId.trim() ||
    event.interrupted === true ||
    event.mutePerformance ||
    !storedDebateSpeakerObfuscatesSpeech(
      jsonObject(row?.session_json),
      event.speakerBotId,
    )
  ) return null;
  return cleanIntent(event.powerIntendedContent, event.content);
}

function revealFromStory(
  db: DatabaseSync,
  userId: string,
  request: SpeechIntentRevealRequestV1,
): string | null {
  const row = db.prepare(
    "SELECT episode_json FROM story_sessions WHERE id = ? AND user_id = ?",
  ).get(request.scopeId, userId) as { episode_json: string | null } | undefined;
  const episode = jsonObject(row?.episode_json);
  const scenes = Array.isArray(episode?.scenes) ? episode.scenes : [];
  const scene = scenes
    .map(objectValue)
    .find((candidate) => candidate?.id === request.recordId);
  const sidecar = objectValue(episode?.privatePowerIntendedNarrationBySceneId);
  if (
    !scene ||
    scene.speechIntentRevealAvailable !== true ||
    typeof scene.speakerBotId !== "string" ||
    !scene.speakerBotId.trim() ||
    scene.mutePerformance
  ) return null;
  return cleanIntent(sidecar?.[request.recordId], scene.narration);
}

export function normalizeSpeechIntentRevealRequestV1(
  raw: unknown,
): SpeechIntentRevealRequestV1 | null {
  const value = objectValue(raw);
  const mode = value?.mode;
  const scopeId = typeof value?.scopeId === "string" ? value.scopeId.trim() : "";
  const recordId = typeof value?.recordId === "string" ? value.recordId.trim() : "";
  if (
    (mode !== "chat" &&
      mode !== "zen" &&
      mode !== "coffee" &&
      mode !== "signal" &&
      mode !== "debate" &&
      mode !== "story") ||
    !scopeId ||
    !recordId ||
    scopeId.length > 160 ||
    recordId.length > 160
  ) return null;
  return { mode, scopeId, recordId };
}

export function resolveSpeechIntentRevealV1(
  db: DatabaseSync,
  userId: string,
  request: SpeechIntentRevealRequestV1,
): SpeechIntentRevealResponseV1 | null {
  const intendedSpeech =
    readEphemeralSpeechIntentRevealV1(userId, request) ??
    (
      request.mode === "chat" || request.mode === "zen" || request.mode === "coffee"
        ? revealFromChatFamily(db, userId, request)
        : request.mode === "signal"
          ? revealFromSignal(db, userId, request)
          : request.mode === "debate"
            ? revealFromDebate(db, userId, request)
            : revealFromStory(db, userId, request)
    );
  return intendedSpeech ? { ok: true, intendedSpeech } : null;
}
