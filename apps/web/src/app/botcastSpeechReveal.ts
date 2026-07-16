import type { SpeechCharacterAlignment } from "./speechRevealTimeline";

export type BotcastSpeechRevealPhase = "preparing" | "playing" | "ended";

export interface BotcastSpeechRevealToken {
  /** Exact source slice, including surrounding whitespace. */
  text: string;
  /** Audio-clock time after this token has finished being spoken. */
  completionAtMs: number;
}

export interface BotcastSpeechRevealState {
  text: string;
  tokens: BotcastSpeechRevealToken[];
  durationMs: number;
  elapsedMs: number;
  progress: number;
  phase: BotcastSpeechRevealPhase;
}

interface SourceToken {
  text: string;
  completionCharacterIndex: number;
}

function tokenizePreservingWhitespace(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let characterOffset = 0;

  for (const match of text.matchAll(/\s*\S+(?:\s+|$)/gu)) {
    const tokenText = match[0];
    const characters = Array.from(tokenText);
    let lastSpokenOffset = characters.length - 1;
    while (lastSpokenOffset >= 0 && /\s/u.test(characters[lastSpokenOffset] ?? "")) {
      lastSpokenOffset -= 1;
    }
    if (lastSpokenOffset >= 0) {
      tokens.push({
        text: tokenText,
        completionCharacterIndex: characterOffset + lastSpokenOffset,
      });
    }
    characterOffset += characters.length;
  }

  return tokens;
}

function tokenWeight(token: string): number {
  const spoken = token.trim();
  const spokenLength = Math.max(1, Array.from(spoken).length);
  let weight = Math.max(0.7, Math.sqrt(spokenLength));
  if (/[,;:]$/u.test(spoken)) weight += 0.45;
  if (/[.!?]$/u.test(spoken)) weight += 0.9;
  if (/[—–…]$/u.test(spoken)) weight += 1.1;
  return weight;
}

function alignmentIsUsable(
  text: string,
  alignment: SpeechCharacterAlignment | null | undefined
): alignment is SpeechCharacterAlignment {
  if (!alignment) return false;
  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length ||
    alignment.characters.join("") !== text
  ) return false;

  let previousStart = 0;
  let previousEnd = 0;
  for (let index = 0; index < count; index += 1) {
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart ||
      end < previousEnd
    ) return false;
    previousStart = start;
    previousEnd = end;
  }
  return previousEnd > 0;
}

function alignedCompletionTimes(
  text: string,
  tokens: readonly SourceToken[],
  durationMs: number,
  alignment: SpeechCharacterAlignment | null | undefined
): number[] | null {
  if (!alignmentIsUsable(text, alignment)) return null;
  return tokens.map((token) => {
    const completionSeconds =
      alignment.characterEndTimesSeconds[token.completionCharacterIndex];
    if (typeof completionSeconds !== "number") return durationMs;
    return Math.max(1, Math.min(durationMs, Math.round(completionSeconds * 1000)));
  });
}

function fallbackCompletionTimes(
  tokens: readonly SourceToken[],
  durationMs: number
): number[] {
  const weights = tokens.map((token) => tokenWeight(token.text));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let completedWeight = 0;
  return weights.map((weight, index) => {
    completedWeight += weight;
    if (index === weights.length - 1) return durationMs;
    return Math.max(1, Math.min(
      durationMs,
      Math.round((completedWeight / Math.max(totalWeight, 1)) * durationMs)
    ));
  });
}

/** Hold a completed Signal turn off-screen until its audio begins. */
export function prepareBotcastSpeechReveal(text: string): BotcastSpeechRevealState {
  return {
    text,
    tokens: [],
    durationMs: 0,
    elapsedMs: 0,
    progress: 0,
    phase: "preparing",
  };
}

/** Start transcript reveal from the real audio clock. */
export function startBotcastSpeechReveal({
  text,
  durationMs,
  alignment,
}: {
  text: string;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): BotcastSpeechRevealState {
  const normalizedDurationMs = Math.max(1, Math.round(
    Number.isFinite(durationMs) ? durationMs : 0
  ));
  const sourceTokens = tokenizePreservingWhitespace(text);
  const completionTimes = alignedCompletionTimes(
    text,
    sourceTokens,
    normalizedDurationMs,
    alignment
  ) ?? fallbackCompletionTimes(sourceTokens, normalizedDurationMs);

  return {
    text,
    tokens: sourceTokens.map((token, index) => ({
      text: token.text,
      completionAtMs: completionTimes[index] ?? normalizedDurationMs,
    })),
    durationMs: normalizedDurationMs,
    elapsedMs: 0,
    progress: 0,
    phase: "playing",
  };
}

export function updateBotcastSpeechReveal(
  state: BotcastSpeechRevealState,
  elapsedMs: number
): BotcastSpeechRevealState {
  if (state.phase !== "playing") return state;
  const elapsed = Math.max(0, Math.min(
    state.durationMs,
    Number.isFinite(elapsedMs) ? elapsedMs : 0
  ));
  return {
    ...state,
    elapsedMs: elapsed,
    progress: elapsed / Math.max(1, state.durationMs),
  };
}

export function finishBotcastSpeechReveal(
  state: BotcastSpeechRevealState
): BotcastSpeechRevealState {
  return {
    ...state,
    elapsedMs: state.durationMs,
    progress: 1,
    phase: "ended",
  };
}

export function botcastSpeechRevealVisibleTokenCount(
  state: BotcastSpeechRevealState
): number {
  if (state.phase === "preparing") return 0;
  if (state.phase === "ended") return state.tokens.length;
  let low = 0;
  let high = state.tokens.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((state.tokens[middle]?.completionAtMs ?? Number.POSITIVE_INFINITY) <= state.elapsedMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Exact transcript prefix containing only fully spoken tokens. */
export function botcastSpeechRevealVisibleText(
  state: BotcastSpeechRevealState
): string {
  if (state.phase === "ended") return state.text;
  return state.tokens
    .slice(0, botcastSpeechRevealVisibleTokenCount(state))
    .map((token) => token.text)
    .join("");
}
