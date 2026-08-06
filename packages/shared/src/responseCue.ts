import type { BotVoicePreset } from "./botProfile.js";

export const BOT_RESPONSE_CUE_PROFILE_VERSION = 1 as const;
export const BOT_RESPONSE_CUE_MAX_PHRASES = 6;
export const BOT_RESPONSE_CUE_MAX_WORDS = 8;
export const BOT_RESPONSE_CUE_MAX_CHARACTERS = 48;
export const BOT_RESPONSE_CUE_MAX_PLAYBACK_MS = 1_200;
export const BOT_RESPONSE_CUE_EXPLICIT_COOLDOWN_MS = 10_000;
export const BOT_RESPONSE_CUE_WAIT_DELAY_MS = 3_000;
export const BOT_RESPONSE_CUE_WAIT_ELIGIBILITY = 0.35;
export const BOT_RESPONSE_CUE_WAIT_TURN_COOLDOWN = 3;
export const BOT_RESPONSE_CUE_RECENT_PHRASE_WINDOW = 4;

export type BotResponseCueTriggerV1 = "interruption" | "redirect" | "waiting";
export type BotResponseCueSourceV1 = "default" | "custom";

/** Optional author-controlled presentation metadata. It is never model-facing prose. */
export interface BotResponseCueProfileV1 {
  v: 1;
  enabled: boolean;
  interruption: string[];
  redirect: string[];
  waiting: string[];
  blockedDefaults: string[];
}

export type BotPresenceBeatSurfaceV1 =
  | "chat"
  | "zen"
  | "sandbox"
  | "coffee"
  | "signal"
  | "debate";

/**
 * Chat and Zen are two presentations of the same direct-conversation surface,
 * where a filler line would compete with the real reply. Presence beats remain
 * available to session/show surfaces and Sandbox.
 */
export function botResponseCuesEnabledForSurfaceV1(
  surface: BotPresenceBeatSurfaceV1,
): boolean {
  return surface !== "chat" && surface !== "zen";
}

export type BotPresenceBeatCompletionV1 =
  | "playing"
  | "completed"
  | "interrupted"
  | "failed";

/**
 * A heard-speech presentation event. Consumers must use `heardCharacterCount`
 * for public transcript/replay projection and must not inject `text` into a
 * canonical message, prompt, summary, memory, social state, or ballot.
 */
export interface BotPresenceBeatV1 {
  v: 1;
  id: string;
  surface: BotPresenceBeatSurfaceV1;
  sessionId: string;
  responseId: string;
  speaker: {
    botId: string;
    name: string;
  };
  trigger: BotResponseCueTriggerV1;
  source: BotResponseCueSourceV1;
  text: string;
  heardCharacterCount: number;
  completion: BotPresenceBeatCompletionV1;
  playbackStartedAtMs: number;
  playbackEndedAtMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotResponseCueSelectionInputV1 {
  botId: string;
  responseId: string;
  trigger: BotResponseCueTriggerV1;
  communicationStyle: BotVoicePreset;
  temperament?: string | null;
  mood?: string | null;
  profile?: BotResponseCueProfileV1 | null;
  nowMs: number;
  waitingElapsedMs?: number;
  lastCueAtMs?: number | null;
  completedTurnsSinceCue?: number | null;
  recentPhrases?: readonly string[];
  voiceActive: boolean;
  audible: boolean;
  clipReady: boolean;
  hardMuted?: boolean;
  exactResponseRequired?: boolean;
  proceduralAudioActive?: boolean;
  canonicalBridgeActive?: boolean;
}

export interface BotResponseCueSelectionV1 {
  phrase: string;
  trigger: BotResponseCueTriggerV1;
  source: BotResponseCueSourceV1;
  eligibilityRoll: number;
}

export type BotResponseCueSkipReasonV1 =
  | "disabled"
  | "inaudible"
  | "clip_not_ready"
  | "semantic_or_procedural_audio"
  | "cooldown"
  | "too_early"
  | "ineligible_roll"
  | "no_phrase";

export type BotResponseCueDecisionV1 =
  | { selected: true; cue: BotResponseCueSelectionV1 }
  | { selected: false; reason: BotResponseCueSkipReasonV1 };

type CueBanks = Record<BotResponseCueTriggerV1, readonly string[]>;

const RESPONSE_CUE_BANKS: Record<BotVoicePreset, CueBanks> = {
  neutral: {
    interruption: ["…Okay, then.", "Got it.", "All right.", "Understood."],
    redirect: ["All right.", "Let's do that.", "On it.", "Got you."],
    waiting: ["Hmm…", "Let's see…", "One moment.", "Okay…"],
  },
  warm: {
    interruption: ["Oh—okay.", "Of course.", "I'm with you.", "All right."],
    redirect: ["Of course.", "Let's do that.", "I'm with you.", "Okay."],
    waiting: ["Hmm…", "Let's see…", "One moment.", "Okay, let me think…"],
  },
  concise: {
    interruption: ["Okay.", "Got it.", "Right.", "Sure."],
    redirect: ["On it.", "Sure.", "Right.", "Okay."],
    waiting: ["Hmm.", "One moment.", "Let's see.", "Right…"],
  },
  playful: {
    interruption: ["Plot twist—okay.", "Oh! All right.", "Well, then.", "You got it."],
    redirect: ["Plot twist.", "Let's do it.", "Okay, okay.", "I'm game."],
    waiting: ["Hmm…", "Let's see here…", "Okay, brain…", "One tiny moment."],
  },
  formal: {
    interruption: ["Very well.", "Understood.", "Certainly.", "All right."],
    redirect: ["Certainly.", "Very well.", "Understood.", "Proceeding."],
    waiting: ["One moment, please.", "Let me consider that.", "Very well…", "Let's see…"],
  },
  reflective: {
    interruption: ["Hmm—okay.", "Fair enough.", "All right, then.", "I hear you."],
    redirect: ["Let's sit with that.", "Okay—new angle.", "I'm with you.", "All right."],
    waiting: ["Hmm…", "Let me think…", "One moment.", "Give me a beat…"],
  },
  direct: {
    interruption: ["Okay.", "Got it.", "Fine.", "Right."],
    redirect: ["On it.", "Done.", "Right.", "Okay."],
    waiting: ["One sec.", "Thinking.", "Hold on.", "Right…"],
  },
};

function stableHashV1(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizedComparison(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function normalizeBotResponseCuePhraseV1(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > BOT_RESPONSE_CUE_MAX_CHARACTERS) return null;
  const words = normalized.split(/\s+/u).filter(Boolean);
  if (words.length > BOT_RESPONSE_CUE_MAX_WORDS) return null;
  return normalized;
}

function normalizePhraseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const candidate of value) {
    const phrase = normalizeBotResponseCuePhraseV1(candidate);
    if (!phrase) continue;
    const comparison = normalizedComparison(phrase);
    if (seen.has(comparison)) continue;
    seen.add(comparison);
    phrases.push(phrase);
    if (phrases.length >= BOT_RESPONSE_CUE_MAX_PHRASES) break;
  }
  return phrases;
}

export function normalizeBotResponseCueProfileV1(
  value: unknown,
): BotResponseCueProfileV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    v: 1,
    enabled: record.enabled !== false,
    interruption: normalizePhraseList(record.interruption),
    redirect: normalizePhraseList(record.redirect),
    waiting: normalizePhraseList(record.waiting),
    blockedDefaults: normalizePhraseList(record.blockedDefaults),
  };
}

function effectiveStyle(
  input: Pick<
    BotResponseCueSelectionInputV1,
    "communicationStyle" | "temperament" | "mood"
  >,
): BotVoicePreset {
  const temperament = `${input.temperament ?? ""} ${input.mood ?? ""}`.toLocaleLowerCase();
  if (/\b(?:angry|irritated|tense|guarded|reserved|terse)\b/u.test(temperament)) {
    return input.communicationStyle === "formal" ? "formal" : "concise";
  }
  if (/\b(?:playful|excited|bubbly|mischievous|expressive)\b/u.test(temperament)) {
    return input.communicationStyle === "formal" ? "formal" : "playful";
  }
  if (/\b(?:warm|tender|gentle|supportive)\b/u.test(temperament)) return "warm";
  return input.communicationStyle;
}

export function responseCueCandidatesV1(
  input: Pick<
    BotResponseCueSelectionInputV1,
    "communicationStyle" | "temperament" | "mood" | "profile" | "trigger"
  >,
): Array<{ phrase: string; source: BotResponseCueSourceV1 }> {
  const custom = input.profile?.[input.trigger] ?? [];
  const source: BotResponseCueSourceV1 = custom.length > 0 ? "custom" : "default";
  const phrases = custom.length > 0 ? custom : RESPONSE_CUE_BANKS[effectiveStyle(input)][input.trigger];
  const blocked = new Set(
    (input.profile?.blockedDefaults ?? []).map((phrase) => normalizedComparison(phrase)),
  );
  return phrases
    .map(normalizeBotResponseCuePhraseV1)
    .filter((phrase): phrase is string => Boolean(phrase))
    .filter((phrase) => !blocked.has(normalizedComparison(phrase)))
    .map((phrase) => ({ phrase, source }));
}

function stableUnitRoll(input: BotResponseCueSelectionInputV1, purpose: string): number {
  const key = [
    purpose,
    input.botId,
    input.responseId,
    input.trigger,
    input.communicationStyle,
    input.temperament ?? "",
    input.mood ?? "",
  ].join("\u001f");
  return stableHashV1(key) / 0x1_0000_0000;
}

export function selectBotResponseCueV1(
  input: BotResponseCueSelectionInputV1,
): BotResponseCueDecisionV1 {
  if (input.profile?.enabled === false) return { selected: false, reason: "disabled" };
  if (!input.voiceActive || !input.audible || input.hardMuted) {
    return { selected: false, reason: "inaudible" };
  }
  if (!input.clipReady) return { selected: false, reason: "clip_not_ready" };
  if (
    input.exactResponseRequired ||
    input.proceduralAudioActive ||
    input.canonicalBridgeActive
  ) {
    return { selected: false, reason: "semantic_or_procedural_audio" };
  }

  const explicit = input.trigger === "interruption" || input.trigger === "redirect";
  if (
    explicit &&
    input.lastCueAtMs !== null &&
    input.lastCueAtMs !== undefined &&
    input.nowMs - input.lastCueAtMs < BOT_RESPONSE_CUE_EXPLICIT_COOLDOWN_MS
  ) {
    return { selected: false, reason: "cooldown" };
  }
  const eligibilityRoll = stableUnitRoll(input, "eligibility");
  if (!explicit) {
    if ((input.waitingElapsedMs ?? 0) < BOT_RESPONSE_CUE_WAIT_DELAY_MS) {
      return { selected: false, reason: "too_early" };
    }
    if ((input.completedTurnsSinceCue ?? Number.POSITIVE_INFINITY) < BOT_RESPONSE_CUE_WAIT_TURN_COOLDOWN) {
      return { selected: false, reason: "cooldown" };
    }
    if (eligibilityRoll >= BOT_RESPONSE_CUE_WAIT_ELIGIBILITY) {
      return { selected: false, reason: "ineligible_roll" };
    }
  }

  const recent = new Set(
    (input.recentPhrases ?? [])
      .slice(-BOT_RESPONSE_CUE_RECENT_PHRASE_WINDOW)
      .map((phrase) => normalizedComparison(phrase)),
  );
  const candidates = responseCueCandidatesV1(input).filter(
    ({ phrase }) => !recent.has(normalizedComparison(phrase)),
  );
  if (candidates.length === 0) return { selected: false, reason: "no_phrase" };
  const phraseRoll = stableUnitRoll(input, "phrase");
  const choice = candidates[Math.floor(phraseRoll * candidates.length) % candidates.length];
  return {
    selected: true,
    cue: {
      phrase: choice.phrase,
      trigger: input.trigger,
      source: choice.source,
      eligibilityRoll,
    },
  };
}

export function heardBotPresenceBeatTextV1(
  beat: Pick<BotPresenceBeatV1, "text" | "heardCharacterCount">,
): string {
  const count = Number.isFinite(beat.heardCharacterCount)
    ? Math.max(0, Math.min(beat.text.length, Math.floor(beat.heardCharacterCount)))
    : 0;
  return beat.text.slice(0, count);
}
