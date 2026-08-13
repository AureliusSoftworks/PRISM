import {
  PRE_SPEECH_BREATH_URLS,
  hasAuthoredBreathDirection,
  type PreSpeechBreathIntensity,
  type PreSpeechBreathPlan,
} from "./preSpeechBreath.ts";
import {
  englishPacingPauseMsForKind,
  type EnglishPacingProfileV1,
} from "@localai/shared";

export type EnglishClausePunctuationKind =
  | "comma"
  | "clause"
  | "strong"
  | "glue";

export interface EnglishClauseGapPlan {
  pauseMs: number;
  kind: EnglishClausePunctuationKind;
  breath: PreSpeechBreathPlan | null;
}

/**
 * Intended waits between normalized Kokoro windows. The server strips the
 * generator's duplicated 300-460 ms outer silence while retaining a 40 ms
 * phoneme safety pad, so these small waits control the join instead of stacking
 * on a second full synthesis tail/head.
 */
export const KOKORO_DEFAULT_CLAUSE_PAUSE_MS = {
  comma: 80,
  clause: 120,
  strong: 180,
  glue: 0,
} as const satisfies Record<EnglishClausePunctuationKind, number>;

/**
 * Soft breath odds by trailing punctuation. Kept at zero — intermittent
 * mid-clause breaths sounded fake/disjointed; quiet profile pauses alone carry
 * pacing when the bot has a calibrated English profile.
 */
const BREATH_CHANCE = {
  comma: 0,
  clause: 0,
  strong: 0,
  glue: 0,
} as const satisfies Record<EnglishClausePunctuationKind, number>;

const TRAILING_PUNCT_RE =
  /([,;:—–]|[.!?]|…|\.{3})["'”’)\]]*\s*$/u;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value: string): number {
  return stableHash(value) / 0xffffffff;
}

/**
 * Classifies the punctuation that ends a streamed English speech chunk so
 * playback can insert a matching pause from the bot's pacing profile.
 */
export function classifyEnglishClausePunctuation(
  trailingText: string,
): EnglishClausePunctuationKind {
  const trimmed = trailingText.replace(/\s+/gu, " ").trimEnd();
  const match = TRAILING_PUNCT_RE.exec(trimmed);
  if (!match) return "glue";
  const mark = match[1]!;
  if (mark === ",") return "comma";
  if (mark === ";" || mark === ":" || mark === "—" || mark === "–") {
    return "clause";
  }
  return "strong";
}

function clauseBreathIntensity(
  kind: EnglishClausePunctuationKind,
  seed: string,
  chunkIndex: number,
): PreSpeechBreathIntensity {
  const roll = stableUnit(
    `${seed}:english-clause-breath:intensity:${chunkIndex}`,
  );
  if (kind === "strong") {
    if (roll < 0.72) return "natural";
    return roll < 0.92 ? "micro" : "deliberate";
  }
  return roll < 0.82 ? "micro" : "natural";
}

function resolveClauseBreathPlan(args: {
  seed: string;
  chunkIndex: number;
  kind: EnglishClausePunctuationKind;
}): PreSpeechBreathPlan | null {
  const chance = BREATH_CHANCE[args.kind];
  if (chance <= 0) return null;
  if (
    stableUnit(`${args.seed}:english-clause-breath:gate:${args.chunkIndex}`) >=
    chance
  ) {
    return null;
  }
  const intensity = clauseBreathIntensity(
    args.kind,
    args.seed,
    args.chunkIndex,
  );
  const urls = PRE_SPEECH_BREATH_URLS[intensity];
  const url =
    urls[
      stableHash(
        `${args.seed}:english-clause-breath:variant:${args.chunkIndex}`,
      ) % urls.length
    ]!;
  const gain =
    intensity === "micro" ? 0.42 : intensity === "natural" ? 0.5 : 0.56;
  const voiceOverlapMs =
    intensity === "micro" ? 160 : intensity === "natural" ? 200 : 220;
  return { url, intensity, gain, voiceOverlapMs };
}

/**
 * Plans silence after an English stream chunk.
 *
 * A calibrated bot/player profile wins. Otherwise, only a server-tagged
 * Kokoro punctuation stream receives the restrained default table; Premium,
 * system voices, Babble, and token-only fallback chunks remain unchanged.
 */
export function resolveEnglishClauseGap(args: {
  seed: string;
  chunkIndex: number;
  trailingText: string;
  fullText?: string | null;
  authoredPerformanceText?: string | null;
  enabled?: boolean;
  /** Hard Power: Ready breathless holders never emit mid-clause lung Foley. */
  breathless?: boolean;
  pacingProfile?: EnglishPacingProfileV1 | null;
  kokoroPunctuationPacing?: boolean;
}): EnglishClauseGapPlan {
  const kind = classifyEnglishClausePunctuation(args.trailingText);
  const profilePauseMs = englishPacingPauseMsForKind(args.pacingProfile, kind);
  const pauseMs =
    profilePauseMs ??
    (args.kokoroPunctuationPacing
      ? KOKORO_DEFAULT_CLAUSE_PAUSE_MS[kind]
      : 0);
  if (args.enabled === false || args.breathless === true || pauseMs <= 0) {
    return { pauseMs, kind, breath: null };
  }
  if (
    hasAuthoredBreathDirection(args.trailingText) ||
    hasAuthoredBreathDirection(args.fullText) ||
    hasAuthoredBreathDirection(args.authoredPerformanceText)
  ) {
    return { pauseMs, kind, breath: null };
  }
  return {
    pauseMs,
    kind,
    breath: resolveClauseBreathPlan({
      seed: args.seed,
      chunkIndex: args.chunkIndex,
      kind,
    }),
  };
}
