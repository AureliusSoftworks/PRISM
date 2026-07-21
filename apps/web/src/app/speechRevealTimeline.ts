import {
  buildSpeechActivityWindows,
  speechActivityAtMs,
  type SpeechActivityWindow,
} from "./speechActivity.ts";

export type SpeechRevealPhase = "preparing" | "playing" | "ended";

export interface SpeechRevealTimeline {
  tokenSignature: string;
  revealAtMs: number[];
  durationMs: number;
  elapsedMs: number;
  phase: SpeechRevealPhase;
  /** Tokens already completed by earlier buffered phrases. */
  visiblePrefixTokenCount?: number;
  /** Full utterance token count when this timeline represents one phrase. */
  totalTokenCount?: number;
  /** True when the active phrase is the final phrase in the utterance. */
  finalSegment?: boolean;
  /** Provider-timed regions where the face should actively articulate. */
  speechActivityWindows: SpeechActivityWindow[] | null;
  /** Provider timing retained for the live avatar's aligned visemes. */
  alignment: SpeechCharacterAlignment | null;
}

export interface SpeechCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface SpeechRevealPhrase {
  text: string;
  startTokenIndex: number;
  endTokenIndex: number;
}

function tokenWeight(token: string): number {
  const spokenLength = Array.from(token.trim()).length;
  let weight = Math.max(0.55, Math.sqrt(Math.max(1, spokenLength)));
  if (/[,;:]\s*$/u.test(token)) weight += 0.8;
  if (/[.!?]\s*$/u.test(token)) weight += 1.5;
  if (/[—–…]\s*$/u.test(token)) weight += 1.8;
  return weight;
}

export function prepareSpeechRevealTimeline(tokenSignature: string): SpeechRevealTimeline {
  return {
    tokenSignature,
    revealAtMs: [],
    durationMs: 0,
    elapsedMs: 0,
    phase: "preparing",
    visiblePrefixTokenCount: 0,
    totalTokenCount: 0,
    finalSegment: true,
    speechActivityWindows: null,
    alignment: null,
  };
}

/** True while text is waiting for synthesized audio to begin or resume. */
export function speechRevealTimelineWaitingForAudio(
  timeline: SpeechRevealTimeline | null | undefined
): boolean {
  return timeline?.phase === "preparing";
}

function revealAtMsFromAlignment(
  tokens: readonly string[],
  tokenSignature: string,
  durationMs: number,
  alignment: SpeechCharacterAlignment
): number[] | null {
  const characterCount = alignment.characters.length;
  if (
    characterCount === 0 ||
    characterCount !== alignment.characterStartTimesSeconds.length ||
    characterCount !== alignment.characterEndTimesSeconds.length
  ) return null;
  const alignedDurationMs = Math.max(
    1,
    (alignment.characterEndTimesSeconds[characterCount - 1] ?? 0) * 1000
  );
  const timeScale = durationMs / alignedDurationMs;
  const exactText = alignment.characters.join("") === tokenSignature;
  const signatureLength = Math.max(1, Array.from(tokenSignature).length);
  let sourceOffset = 0;
  return tokens.map((token) => {
    const tokenCharacters = Array.from(token);
    const firstSpokenOffset = Math.max(
      0,
      tokenCharacters.findIndex((character) => !/\s/u.test(character))
    );
    const sourceCharacterIndex = Math.min(
      signatureLength - 1,
      sourceOffset + firstSpokenOffset
    );
    const alignedIndex = exactText
      ? Math.min(characterCount - 1, sourceCharacterIndex)
      : Math.min(
          characterCount - 1,
          Math.round((sourceCharacterIndex / Math.max(1, signatureLength - 1)) * (characterCount - 1))
        );
    sourceOffset += tokenCharacters.length;
    return Math.max(
      0,
      Math.min(durationMs, Math.round(
        (alignment.characterStartTimesSeconds[alignedIndex] ?? 0) * 1000 * timeScale
      ))
    );
  });
}

function buildSpeechRevealTimeline(args: {
  tokens: readonly string[];
  tokenSignature: string;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
  visiblePrefixTokenCount?: number;
  totalTokenCount?: number;
  finalSegment?: boolean;
}): SpeechRevealTimeline {
  const normalizedDurationMs = Math.max(1, Math.round(args.durationMs));
  const visiblePrefixTokenCount = Math.max(0, Math.round(args.visiblePrefixTokenCount ?? 0));
  const totalTokenCount = Math.max(
    visiblePrefixTokenCount + args.tokens.length,
    Math.round(args.totalTokenCount ?? args.tokens.length)
  );
  if (args.tokens.length === 0) {
    return {
      tokenSignature: args.tokenSignature,
      revealAtMs: [],
      durationMs: normalizedDurationMs,
      elapsedMs: 0,
      phase: "playing",
      visiblePrefixTokenCount,
      totalTokenCount,
      finalSegment: args.finalSegment ?? true,
      speechActivityWindows: buildSpeechActivityWindows(
        args.alignment,
        normalizedDurationMs,
      ),
      alignment: args.alignment ?? null,
    };
  }
  const alignedRevealAtMs = args.alignment
    ? revealAtMsFromAlignment(
        args.tokens,
        args.tokens.join(""),
        normalizedDurationMs,
        args.alignment
      )
    : null;
  const weights = args.tokens.map(tokenWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const revealAtMs: number[] = alignedRevealAtMs ?? [];
  if (!alignedRevealAtMs) {
    let consumedWeight = 0;
    for (const weight of weights) {
      revealAtMs.push(Math.round((consumedWeight / totalWeight) * normalizedDurationMs));
      consumedWeight += weight;
    }
  }
  return {
    tokenSignature: args.tokenSignature,
    revealAtMs,
    durationMs: normalizedDurationMs,
    elapsedMs: 0,
    phase: "playing",
    visiblePrefixTokenCount,
    totalTokenCount,
    finalSegment: args.finalSegment ?? true,
    speechActivityWindows: buildSpeechActivityWindows(
      args.alignment,
      normalizedDurationMs,
    ),
    alignment: args.alignment ?? null,
  };
}

export function startSpeechRevealTimeline(
  tokens: readonly string[],
  tokenSignature: string,
  durationMs: number
): SpeechRevealTimeline {
  return buildSpeechRevealTimeline({ tokens, tokenSignature, durationMs });
}

export function startAlignedSpeechRevealTimeline(
  tokens: readonly string[],
  tokenSignature: string,
  durationMs: number,
  alignment: SpeechCharacterAlignment | null | undefined
): SpeechRevealTimeline {
  return buildSpeechRevealTimeline({ tokens, tokenSignature, durationMs, alignment });
}

export function startSpeechRevealPhraseTimeline(args: {
  tokens: readonly string[];
  tokenSignature: string;
  phrase: SpeechRevealPhrase;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): SpeechRevealTimeline {
  const start = Math.max(0, Math.min(args.tokens.length, args.phrase.startTokenIndex));
  const end = Math.max(start, Math.min(args.tokens.length, args.phrase.endTokenIndex));
  return buildSpeechRevealTimeline({
    tokens: args.tokens.slice(start, end),
    tokenSignature: args.tokenSignature,
    durationMs: args.durationMs,
    alignment: args.alignment,
    visiblePrefixTokenCount: start,
    totalTokenCount: args.tokens.length,
    finalSegment: end >= args.tokens.length,
  });
}

/** Split a tokenized utterance into quick, speakable buffers without changing text. */
export function buildSpeechRevealPhrases(
  tokens: readonly string[],
  options: { minWords?: number; maxWords?: number } = {}
): SpeechRevealPhrase[] {
  const minWords = Math.max(1, Math.round(options.minWords ?? 3));
  const maxWords = Math.max(minWords, Math.round(options.maxWords ?? 8));
  const phrases: SpeechRevealPhrase[] = [];
  let startTokenIndex = 0;
  let wordCount = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (/[\p{L}\p{N}]/u.test(token)) wordCount += 1;
    const sentenceBoundary = /[.!?…][\s\])}'"]*$/u.test(token);
    const clauseBoundary = /[,;:—–][\s\])}'"]*$/u.test(token);
    const shouldCut = wordCount >= maxWords ||
      (wordCount >= minWords && (sentenceBoundary || clauseBoundary));
    if (!shouldCut) continue;
    phrases.push({
      text: tokens.slice(startTokenIndex, index + 1).join(""),
      startTokenIndex,
      endTokenIndex: index + 1,
    });
    startTokenIndex = index + 1;
    wordCount = 0;
  }
  if (startTokenIndex < tokens.length) {
    phrases.push({
      text: tokens.slice(startTokenIndex).join(""),
      startTokenIndex,
      endTokenIndex: tokens.length,
    });
  }
  return phrases;
}

export function updateSpeechRevealTimeline(
  timeline: SpeechRevealTimeline,
  elapsedMs: number
): SpeechRevealTimeline {
  if (timeline.phase !== "playing") return timeline;
  return {
    ...timeline,
    elapsedMs: Math.min(timeline.durationMs, Math.max(0, elapsedMs)),
  };
}

export function finishSpeechRevealTimeline(
  timeline: SpeechRevealTimeline
): SpeechRevealTimeline {
  const completedTokenCount = (timeline.visiblePrefixTokenCount ?? 0) + timeline.revealAtMs.length;
  if (timeline.finalSegment === false) {
    return {
      ...timeline,
      revealAtMs: [],
      durationMs: 0,
      elapsedMs: 0,
      phase: "preparing",
      visiblePrefixTokenCount: completedTokenCount,
    };
  }
  return {
    ...timeline,
    elapsedMs: timeline.durationMs,
    phase: "ended",
  };
}

export function speechRevealVisibleTokenCount(timeline: SpeechRevealTimeline): number {
  const prefix = timeline.visiblePrefixTokenCount ?? 0;
  if (timeline.phase === "preparing") return prefix;
  if (timeline.phase === "ended") return prefix + timeline.revealAtMs.length;
  let low = 0;
  let high = timeline.revealAtMs.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((timeline.revealAtMs[middle] ?? Number.POSITIVE_INFINITY) <= timeline.elapsedMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return prefix + low;
}

/** Null preserves the legacy cadence when provider alignment is unavailable. */
export function speechRevealTimelineIsVoicing(
  timeline: SpeechRevealTimeline | null | undefined,
): boolean | null {
  if (!timeline || timeline.phase !== "playing") return false;
  return speechActivityAtMs(timeline.speechActivityWindows, timeline.elapsedMs);
}

export function speechRevealTimelineComplete(timeline: SpeechRevealTimeline): boolean {
  if (timeline.phase === "preparing") return false;
  return timeline.phase === "ended" && timeline.finalSegment !== false;
}
