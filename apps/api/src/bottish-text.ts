import { normalizeBotAudioVoiceControl } from "@localai/shared";

const BOTTISH_ONSETS = [
  "b", "br", "ch", "d", "dr", "f", "g", "gr", "j", "k", "kl", "kr",
  "m", "n", "p", "pr", "r", "s", "sh", "t", "tr", "v", "z", "zh",
] as const;
const BOTTISH_NUCLEI = ["a", "ae", "e", "ee", "i", "o", "oo", "u", "oi"] as const;
const BOTTISH_CODAS = ["", "", "", "k", "n", "p", "r", "s", "t", "x", "z"] as const;
const UNSAFE_BOTTISH_FRAGMENTS = [
  "cunt", "dick", "fuck", "kike", "nazi", "rape", "shit", "slut",
] as const;
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

function unsafeBottishWord(value: string): boolean {
  const normalized = value.toLocaleLowerCase().replace(/[^a-z]/g, "");
  return UNSAFE_BOTTISH_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function capitalizeLikeSource(value: string, source: string): string {
  const first = Array.from(source)[0] ?? "";
  if (!first || first !== first.toLocaleUpperCase() || first === first.toLocaleLowerCase()) {
    return value;
  }
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function bottishWord(
  source: string,
  seed: string,
  tokenIndex: number,
  tone: number
): string {
  const syllableCount = syllableCountForToken(source);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const syllables = Array.from({ length: syllableCount }, (_, syllableIndex) => {
      const key = `${seed}:${tokenIndex}:${source.toLocaleLowerCase()}:${attempt}:${syllableIndex}`;
      const onset = stablePick(BOTTISH_ONSETS, `${key}:onset`);
      const nucleus = stablePick(BOTTISH_NUCLEI, `${key}:nucleus`);
      const coda = stablePick(BOTTISH_CODAS, `${key}:coda`);
      return `${onset}${nucleus}${coda}`;
    });
    const clipped = tone > 0.45;
    const lightlySegmented = tone > -0.2 && stableHash(`${seed}:${tokenIndex}:join`) % 3 === 0;
    const joiner = clipped || lightlySegmented ? "-" : "";
    const candidate = syllables.join(joiner);
    if (
      candidate.toLocaleLowerCase() !== source.toLocaleLowerCase() &&
      !syllables.some((syllable) => syllable.toLocaleLowerCase() === source.toLocaleLowerCase()) &&
      !unsafeBottishWord(candidate)
    ) {
      return capitalizeLikeSource(candidate, source);
    }
  }
  return capitalizeLikeSource(`za-${tokenIndex.toString(36)}-vik`, source);
}

export function normalizeBottishSeed(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback.slice(0, 160);
  const normalized = value.trim();
  return (normalized || fallback).slice(0, 160);
}

/** Converts cleaned speech into deterministic pronounceable robot language.
 * Punctuation and spacing remain intact so native TTS keeps the source cadence. */
export function buildBottishSpeechText(args: {
  text: string;
  seed?: string;
  tone?: number;
}): string {
  const source = args.text.slice(0, 4000);
  const seed = normalizeBottishSeed(args.seed, source);
  const tone = normalizeBotAudioVoiceControl(args.tone, 0.45);
  let tokenIndex = 0;
  return source.replace(SPOKEN_TOKEN_RE, (token) => {
    const transformed = bottishWord(token, seed, tokenIndex, tone);
    tokenIndex += 1;
    return transformed;
  }).slice(0, 4000);
}
