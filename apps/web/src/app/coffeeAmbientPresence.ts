import type { SessionAmbientFoleyProfile } from "./session-atmosphere-audio.ts";

/** Coffee is allowed to feel busier than the shared studio defaults, but its
 * one-shots stay quiet enough to read as table life rather than notifications. */
export const COFFEE_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 8_000,
  maxDelayMs: 19_000,
  trim: 0.52,
} as const satisfies SessionAmbientFoleyProfile;

export const COFFEE_AMBIENT_BOT_VOCALIZATION_PROFILE = {
  minDelayMs: 18_000,
  maxDelayMs: 34_000,
  trim: 0.58,
} as const satisfies SessionAmbientFoleyProfile;

/** Existing bundled recordings only: ambient Coffee never needs a provider or
 * a network request to create physical room life. */
export const COFFEE_AMBIENT_FOLEY_URLS = [
  "/audio/session-atmosphere/clothing-shuffle.mp3",
  "/audio/session-atmosphere/soft-foot-tap.mp3",
  "/audio/session-atmosphere/coffee-cup-place.mp3",
  "/audio/debate/courtroom-chair-shift.mp3",
  "/audio/debate/courtroom-paper-shuffle.mp3",
  "/audio/prism-companion/glass-tap-01.mp3",
  "/audio/prism-companion/glass-tap-02.mp3",
] as const;

const COFFEE_AMBIENT_WORDS = [
  "Mm.",
  "Hm.",
  "Mhm.",
  "Ah.",
  "Oh.",
  "Hmm.",
] as const;

export interface CoffeeAmbientPresenceWord {
  text: (typeof COFFEE_AMBIENT_WORDS)[number];
  durationMs: number;
  sequenceKey: string;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Two of every three eligible bot-presence beats are tiny word-like murmurs;
 * the remaining beat keeps the existing breath / swallow / throat Foley mix.
 * These are deliberately non-semantic so they cannot become phantom dialogue. */
export function coffeeAmbientPresenceWord(
  seed: string,
  index: number,
  botId: string,
): CoffeeAmbientPresenceWord | null {
  const normalizedIndex = Math.max(0, Math.floor(index));
  const cadenceOffset = stableHash(`${seed}:ambient-word-cadence`) % 3;
  if ((normalizedIndex + cadenceOffset) % 3 === 0) return null;

  const wordOffset =
    stableHash(`${seed}:${botId}:ambient-word`) % COFFEE_AMBIENT_WORDS.length;
  const text =
    COFFEE_AMBIENT_WORDS[
      (wordOffset + normalizedIndex) % COFFEE_AMBIENT_WORDS.length
    ]!;
  return {
    text,
    durationMs: text.length >= 4 ? 1_050 : 860,
    sequenceKey: `${seed}:coffee-ambient-word:${normalizedIndex}:${botId}`,
  };
}
