const BABBLE_ONSETS = [
  "b", "br", "ch", "d", "dr", "f", "g", "gr", "j", "k", "kl", "kr",
  "m", "n", "p", "pr", "r", "s", "sh", "t", "tr", "v", "z", "zh",
] as const;
const BABBLE_NUCLEI = ["a", "ae", "e", "ee", "i", "o", "oo", "u", "oi"] as const;
const BABBLE_CODAS = ["", "", "", "k", "n", "p", "r", "s", "t", "x", "z"] as const;
const UNSAFE_BABBLE_FRAGMENTS = [
  "cunt", "dick", "fuck", "kike", "nazi", "rape", "shit", "slut",
] as const;
const SPOKEN_LETTER_NAMES = new Set([
  "a", "ay", "bee", "cee", "see", "dee", "e", "ee", "eff", "gee",
  "aitch", "eye", "jay", "kay", "el", "em", "en", "oh", "pee",
  "cue", "queue", "ar", "ess", "tee", "you", "vee", "doubleyou",
  "ex", "why", "zee", "zed",
]);
const SPOKEN_TOKEN_RE = /[\p{L}\p{M}\p{N}]+/gu;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stablePick<T>(items: readonly T[], seed: string): T {
  return items[stableHash(seed) % items.length]!;
}

function syllableCountForToken(token: string): number {
  const length = Array.from(token).length;
  if (length <= 2) return 1;
  if (length <= 5) return 2;
  if (length <= 8) return 3;
  if (length <= 12) return 4;
  return Math.min(6, Math.ceil(length / 3));
}

function unsafeBabbleWord(value: string): boolean {
  const normalized = value.toLocaleLowerCase().replace(/[^a-z]/g, "");
  return SPOKEN_LETTER_NAMES.has(normalized)
    || UNSAFE_BABBLE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function capitalizeLikeSource(value: string, source: string): string {
  const first = Array.from(source)[0] ?? "";
  if (!first || first !== first.toLocaleUpperCase() || first === first.toLocaleLowerCase()) {
    return value;
  }
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function babbleWord(source: string, seed: string, tokenIndex: number): string {
  const syllableCount = syllableCountForToken(source);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const syllables = Array.from({ length: syllableCount }, (_, syllableIndex) => {
      const key = `${seed}:${tokenIndex}:${source.toLocaleLowerCase()}:${attempt}:${syllableIndex}`;
      return `${stablePick(BABBLE_ONSETS, `${key}:onset`)}${stablePick(BABBLE_NUCLEI, `${key}:nucleus`)}${stablePick(BABBLE_CODAS, `${key}:coda`)}`;
    });
    const joiner = stableHash(`${seed}:${tokenIndex}:join`) % 3 === 0 ? "-" : "";
    const candidate = syllables.join(joiner);
    if (
      candidate.toLocaleLowerCase() !== source.toLocaleLowerCase()
      && !syllables.some((syllable) => syllable.toLocaleLowerCase() === source.toLocaleLowerCase())
      && !syllables.some((syllable) => unsafeBabbleWord(syllable))
      && !unsafeBabbleWord(candidate)
    ) {
      return capitalizeLikeSource(candidate, source);
    }
  }
  return capitalizeLikeSource(`za-${tokenIndex.toString(36)}-vik`, source);
}

export function normalizeBabbleSeed(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback.slice(0, 160);
  const normalized = value.trim();
  return (normalized || fallback).slice(0, 160);
}

/** Converts cleaned speech into deterministic pronounceable robot language.
 * Punctuation and spacing remain intact so native TTS keeps the source cadence. */
export function buildBabbleSpeechText(args: { text: string; seed?: string }): string {
  const source = args.text.slice(0, 4000);
  const seed = normalizeBabbleSeed(args.seed, source);
  let tokenIndex = 0;
  return source.replace(SPOKEN_TOKEN_RE, (token) => {
    const transformed = babbleWord(token, seed, tokenIndex);
    tokenIndex += 1;
    return transformed;
  }).slice(0, 4000);
}
