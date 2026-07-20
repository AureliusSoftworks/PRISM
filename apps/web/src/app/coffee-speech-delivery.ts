import {
  buildSpeechActivityWindows,
  speechActivityAtMs,
  type SpeechActivityWindow,
} from "./speechActivity.ts";

export type CoffeeDeliveryMood = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export interface CoffeeDeliveryPlan {
  text: string;
  revealAtMs: number[];
  durationMs: number;
  baseCharacterMs: number;
  emphasis: { start: number; end: number } | null;
  speechActivityWindows: SpeechActivityWindow[] | null;
}

export interface CoffeeDeliveryCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export const COFFEE_DELIVERY_MIN_DURATION_MS = 280;
export const COFFEE_DELIVERY_MAX_DURATION_MS = 18_000;
export const COFFEE_VOICE_REVEAL_TAIL_GRACE_MS = 2_000;

export const COFFEE_DELIVERY_MOOD_CHARACTERS_PER_SECOND: Record<CoffeeDeliveryMood, number> = {
  joyful: 14,
  warm: 12,
  neutral: 10,
  guarded: 8,
  strained: 6,
};

/**
 * Keep the reveal's safety timer just behind voiced playback. Normal completion
 * is owned by Web Audio's `ended` event; this longer grace is only a watchdog
 * for engines that fail to deliver that callback. It must not retire the table
 * line while provider duration metadata is still catching up with playback.
 */
export function coffeeVoiceRevealFallbackDelayMs(
  durationMs: number,
  voiced: boolean,
): number {
  const safeDurationMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  return safeDurationMs + (voiced ? COFFEE_VOICE_REVEAL_TAIL_GRACE_MS : 0);
}

/** Resolve the delivery duration only after playback's real start callback. */
export function coffeeVoiceStartedDurationMs(
  durationMs: number | null | undefined,
  fallbackDurationMs: number,
): number | null {
  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
  ) {
    return durationMs;
  }
  return Number.isFinite(fallbackDurationMs) && fallbackDurationMs > 0
    ? fallbackDurationMs
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function normalizeMood(mood: CoffeeDeliveryMood | null | undefined): CoffeeDeliveryMood {
  return mood === "joyful" || mood === "warm" || mood === "guarded" || mood === "strained"
    ? mood
    : "neutral";
}

function punctuationHoldMs(character: string, intensity: number): number {
  if (character === "," || character === ";" || character === ":") return 100 * intensity;
  if (character === "—" || character === "–") return 220 * intensity;
  if (character === "." || character === "!" || character === "?") return 280 * intensity;
  if (character === "…") return 600 * intensity;
  return 0;
}

function hesitationHoldAt(text: string, characterIndex: number, intensity: number): number {
  if (intensity <= 0) return 0;
  const prefix = Array.from(text).slice(0, characterIndex + 1).join("");
  if (!/(?:^|\s)(?:um+|uh+|hmm+|well)(?:,|…)?$/iu.test(prefix)) return 0;
  return 600 * intensity;
}

function resolveEmphasis(text: string): CoffeeDeliveryPlan["emphasis"] {
  const strongLanding = /([\p{L}\p{N}'’\-]+)(?=[!?](?:\s|$))/gu;
  let match: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  while ((match = strongLanding.exec(text)) !== null) last = match;
  const interjection = /\b(wait|really|exactly|no|yes)\b/iu.exec(text);
  const selected = interjection ?? last;
  if (!selected || selected.index < 0) return null;
  return { start: selected.index, end: selected.index + selected[0].length };
}

/** Build a deterministic character reveal clock for one Coffee utterance. */
export function buildCoffeeDeliveryPlan({
  text,
  seed,
  mood,
  humanPacing,
  audioDurationMs,
  audioAlignment,
}: {
  text: string;
  seed: string;
  mood?: CoffeeDeliveryMood | null;
  humanPacing: number;
  audioDurationMs?: number | null;
  audioAlignment?: CoffeeDeliveryCharacterAlignment | null;
}): CoffeeDeliveryPlan {
  const characters = Array.from(text);
  if (characters.length === 0) {
    return {
      text,
      revealAtMs: [],
      durationMs: 0,
      baseCharacterMs: 0,
      emphasis: null,
      speechActivityWindows: null,
    };
  }
  const intensity = clamp(humanPacing, 0, 100) / 50;
  const baseCharacterMs =
    1000 / COFFEE_DELIVERY_MOOD_CHARACTERS_PER_SECOND[normalizeMood(mood)];
  const variationAmplitude = 0.12 * clamp(intensity, 0, 2);
  const revealAtMs: number[] = [];
  let elapsedMs = 0;
  let phraseIndex = 0;
  for (let index = 0; index < characters.length; index += 1) {
    revealAtMs.push(elapsedMs);
    const character = characters[index] ?? "";
    const phraseUnit = stableUnit(`${seed}:phrase:${phraseIndex}`) * 2 - 1;
    const phraseMultiplier = 1 + phraseUnit * variationAmplitude;
    elapsedMs += baseCharacterMs * phraseMultiplier;
    elapsedMs += punctuationHoldMs(character, intensity);
    elapsedMs += hesitationHoldAt(text, index, intensity);
    if (/[,;:!?…]|[–—]/u.test(character)) phraseIndex += 1;
  }
  elapsedMs = Math.max(elapsedMs, 1);
  const requestedAudioDuration =
    typeof audioDurationMs === "number" && Number.isFinite(audioDurationMs) && audioDurationMs > 0
      ? audioDurationMs
      : null;
  const targetDuration = requestedAudioDuration ?? clamp(
    elapsedMs,
    COFFEE_DELIVERY_MIN_DURATION_MS,
    COFFEE_DELIVERY_MAX_DURATION_MS
  );
  const alignmentLength = audioAlignment?.characters.length ?? 0;
  const alignmentValid = Boolean(
    audioAlignment &&
    alignmentLength > 0 &&
    alignmentLength === audioAlignment.characterStartTimesSeconds.length &&
    alignmentLength === audioAlignment.characterEndTimesSeconds.length
  );
  if (alignmentValid && audioAlignment) {
    const alignedText = audioAlignment.characters.join("");
    const exactText = alignedText === text;
    const alignedDurationMs = Math.max(
      1,
      (audioAlignment.characterEndTimesSeconds[alignmentLength - 1] ?? 0) * 1000
    );
    const alignmentScale = targetDuration / alignedDurationMs;
    const alignedRevealAtMs = characters.map((_, index) => {
      const alignedIndex = exactText
        ? Math.min(alignmentLength - 1, index)
        : Math.min(
            alignmentLength - 1,
            Math.round((index / Math.max(1, characters.length - 1)) * (alignmentLength - 1))
          );
      return Math.max(0, Math.min(
        targetDuration,
        Math.round(
          (audioAlignment.characterStartTimesSeconds[alignedIndex] ?? 0) *
          1000 *
          alignmentScale
        )
      ));
    });
    return {
      text,
      revealAtMs: alignedRevealAtMs,
      durationMs: Math.round(targetDuration),
      baseCharacterMs: targetDuration / Math.max(1, characters.length),
      emphasis: resolveEmphasis(text),
      speechActivityWindows: buildSpeechActivityWindows(
        audioAlignment,
        targetDuration,
      ),
    };
  }
  const scale = targetDuration / elapsedMs;
  return {
    text,
    revealAtMs: revealAtMs.map((atMs) => Math.round(atMs * scale)),
    durationMs: Math.round(targetDuration),
    baseCharacterMs: baseCharacterMs * scale,
    emphasis: resolveEmphasis(text),
    speechActivityWindows: null,
  };
}

export function coffeeDeliveryVisibleLengthAtMs(
  plan: CoffeeDeliveryPlan,
  elapsedMs: number
): number {
  if (plan.revealAtMs.length === 0) return 0;
  const elapsed = Math.max(0, elapsedMs);
  let low = 0;
  let high = plan.revealAtMs.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((plan.revealAtMs[middle] ?? Number.POSITIVE_INFINITY) <= elapsed) low = middle + 1;
    else high = middle;
  }
  return elapsed >= plan.durationMs ? plan.revealAtMs.length : low;
}

export function coffeeDeliveryIsHoldingAtMs(
  plan: CoffeeDeliveryPlan,
  elapsedMs: number
): boolean {
  const alignedActivity = speechActivityAtMs(
    plan.speechActivityWindows,
    elapsedMs,
  );
  if (alignedActivity !== null) {
    return elapsedMs < plan.durationMs && !alignedActivity;
  }
  const visible = coffeeDeliveryVisibleLengthAtMs(plan, elapsedMs);
  if (visible <= 0 || visible >= plan.revealAtMs.length) return false;
  const previousAt = plan.revealAtMs[visible - 1] ?? 0;
  const nextAt = plan.revealAtMs[visible] ?? previousAt;
  return nextAt - previousAt > plan.baseCharacterMs * 2.25;
}
