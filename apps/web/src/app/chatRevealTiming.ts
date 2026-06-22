export type ChatRevealMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export type ChatRevealPauseKind = "base" | "clause" | "sentence" | "ellipsis";

export type ChatRevealEllipsisPhase = "typing" | "complete";

export interface ChatRevealTimingSettings {
  baseWordDelayMs: number;
  clausePauseMs: number;
  sentencePauseMs: number;
  ellipsisHoldMs: number;
  ellipsisDotStepMs: number;
}

export const DEFAULT_CHAT_REVEAL_TIMING: ChatRevealTimingSettings = {
  baseWordDelayMs: 78,
  clausePauseMs: 140,
  sentencePauseMs: 260,
  ellipsisHoldMs: 720,
  ellipsisDotStepMs: 240,
};

const CHAT_REVEAL_LETTER_REVEAL_MS = 170;
const CHAT_REVEAL_LETTER_REVEAL_STEP_MS = 18;
const CHAT_REVEAL_WORD_REVEAL_SETTLE_MS = 12;
const CHAT_REVEAL_ELLIPSIS_TOKEN_PATTERN = /^(?:\.\.\.|…)\s*$/u;
const CHAT_REVEAL_TRAILING_PAUSE_CLOSER_PATTERN = /[)"'\]}»”’]+$/u;
const CHAT_REVEAL_SENTENCE_PAUSE_PATTERN = /[.!?]$/u;
const CHAT_REVEAL_CLAUSE_PAUSE_PATTERN = /[,;:]$/u;
const CHAT_REVEAL_DASH_PAUSE_PATTERN = /(?:--|[–—])$/u;
const CHAT_REVEAL_STRONG_MARKER_PATTERN = /\*\*/g;
const CHAT_REVEAL_EMPHASIS_MARKER_PATTERN = /(?<!\*)\*(?!\*)/g;
const CHAT_REVEAL_MARKDOWN_THEMATIC_BREAK_PATTERN = /^\s{0,3}([*_-])(?:\s*\1){2,}\s*$/;
const CHAT_REVEAL_TIMING_MAX_MS = 5000;
const CHAT_REVEAL_TIMING_MIN_MULTIPLIER = 0.05;
const CHAT_REVEAL_TIMING_MAX_MULTIPLIER = 20;
const CHAT_REVEAL_MOOD_WORD_REVEAL_MS: Record<ChatRevealMoodKey, number> = {
  joyful: 58,
  warm: 68,
  neutral: DEFAULT_CHAT_REVEAL_TIMING.baseWordDelayMs,
  guarded: 104,
  strained: 132,
};

function finiteMs(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(CHAT_REVEAL_TIMING_MAX_MS, value))
    : fallback;
}

function trailingWhitespaceForToken(token: string): string {
  return token.match(/\s+$/u)?.[0] ?? "";
}

function normalizeMoodKey(moodKey: ChatRevealMoodKey | null | undefined): ChatRevealMoodKey {
  return moodKey === "joyful" ||
    moodKey === "warm" ||
    moodKey === "neutral" ||
    moodKey === "guarded" ||
    moodKey === "strained"
    ? moodKey
    : "neutral";
}

export function normalizeChatRevealTimingSettings(
  value: unknown,
  fallback: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): ChatRevealTimingSettings {
  const record = value && typeof value === "object" ? value as Partial<ChatRevealTimingSettings> : {};
  return {
    baseWordDelayMs: finiteMs(record.baseWordDelayMs, fallback.baseWordDelayMs),
    clausePauseMs: finiteMs(record.clausePauseMs, fallback.clausePauseMs),
    sentencePauseMs: finiteMs(record.sentencePauseMs, fallback.sentencePauseMs),
    ellipsisHoldMs: finiteMs(record.ellipsisHoldMs, fallback.ellipsisHoldMs),
    ellipsisDotStepMs: finiteMs(record.ellipsisDotStepMs, fallback.ellipsisDotStepMs),
  };
}

export function scaleChatRevealTimingSettings(
  timing: ChatRevealTimingSettings,
  delayMultiplier: number
): ChatRevealTimingSettings {
  const normalizedTiming = normalizeChatRevealTimingSettings(timing);
  const multiplier = Number.isFinite(delayMultiplier)
    ? Math.min(
        CHAT_REVEAL_TIMING_MAX_MULTIPLIER,
        Math.max(CHAT_REVEAL_TIMING_MIN_MULTIPLIER, delayMultiplier)
      )
    : 1;
  return normalizeChatRevealTimingSettings(
    {
      baseWordDelayMs: normalizedTiming.baseWordDelayMs * multiplier,
      clausePauseMs: normalizedTiming.clausePauseMs * multiplier,
      sentencePauseMs: normalizedTiming.sentencePauseMs * multiplier,
      ellipsisHoldMs: normalizedTiming.ellipsisHoldMs * multiplier,
      ellipsisDotStepMs: normalizedTiming.ellipsisDotStepMs * multiplier,
    },
    normalizedTiming
  );
}

export function normalizeChatRevealFencedCodeBlockLeadingNewline(text: string): string {
  return text.replace(/([^\n])(```[^\n\r]*\r?\n)/g, "$1\n$2");
}

export function stripChatRevealThematicBreakLines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (CHAT_REVEAL_MARKDOWN_THEMATIC_BREAK_PATTERN.test(line) ? "" : line))
    .join("\n");
}

export function isChatRevealEllipsisToken(token: string): boolean {
  return CHAT_REVEAL_ELLIPSIS_TOKEN_PATTERN.test(token);
}

export function splitChatRevealTokenForEllipsis(token: string): string[] {
  const trailingWhitespace = trailingWhitespaceForToken(token);
  const core = trailingWhitespace ? token.slice(0, -trailingWhitespace.length) : token;
  if (core.length === 0) return [token];
  if (isChatRevealEllipsisToken(token)) return [token];
  if (core.endsWith("...") && core.length > 3) {
    return [core.slice(0, -3), `...${trailingWhitespace}`];
  }
  if (core.endsWith("…") && core.length > 1) {
    return [core.slice(0, -1), `…${trailingWhitespace}`];
  }
  return [token];
}

export function tokenizeChatRevealText(text: string): string[] {
  const rawTokens = text.match(/\S+\s*/g) ?? [];
  return rawTokens.flatMap(splitChatRevealTokenForEllipsis);
}

export function formatChatRevealTokenDisplay(
  token: string,
  options: { ellipsisPhase?: ChatRevealEllipsisPhase } = {}
): string {
  const withoutMarkdownMarkers = token
    .replace(CHAT_REVEAL_STRONG_MARKER_PATTERN, "")
    .replace(CHAT_REVEAL_EMPHASIS_MARKER_PATTERN, "");
  if (!isChatRevealEllipsisToken(token)) return withoutMarkdownMarkers;
  const trailingWhitespace = trailingWhitespaceForToken(token);
  return options.ellipsisPhase === "typing"
    ? `. . .${trailingWhitespace}`
    : `…${trailingWhitespace}`;
}

export function resolveChatRevealPauseKind(token: string): ChatRevealPauseKind {
  if (isChatRevealEllipsisToken(token)) return "ellipsis";
  const displayToken = formatChatRevealTokenDisplay(token)
    .trimEnd()
    .replace(CHAT_REVEAL_TRAILING_PAUSE_CLOSER_PATTERN, "");
  if (CHAT_REVEAL_SENTENCE_PAUSE_PATTERN.test(displayToken)) return "sentence";
  if (
    CHAT_REVEAL_CLAUSE_PAUSE_PATTERN.test(displayToken) ||
    CHAT_REVEAL_DASH_PAUSE_PATTERN.test(displayToken)
  ) {
    return "clause";
  }
  return "base";
}

export function resolveChatRevealWordDelayMsByMood(
  moodKey: ChatRevealMoodKey | null | undefined,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  const normalizedMood = normalizeMoodKey(moodKey);
  if (normalizedMood === "neutral") return timing.baseWordDelayMs;
  const baseScale =
    DEFAULT_CHAT_REVEAL_TIMING.baseWordDelayMs > 0
      ? timing.baseWordDelayMs / DEFAULT_CHAT_REVEAL_TIMING.baseWordDelayMs
      : 1;
  return CHAT_REVEAL_MOOD_WORD_REVEAL_MS[normalizedMood] * baseScale;
}

export function resolveChatRevealTokenLetterDurationMs(
  token: string,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  const isEllipsis = isChatRevealEllipsisToken(token);
  const displayToken = formatChatRevealTokenDisplay(token, {
    ellipsisPhase: isEllipsis ? "typing" : undefined,
  }).trimEnd();
  if (displayToken.length === 0) return 0;
  if (isEllipsis) {
    const dotCount = displayToken.match(/\./g)?.length ?? 1;
    return CHAT_REVEAL_LETTER_REVEAL_MS + Math.max(0, dotCount - 1) * timing.ellipsisDotStepMs;
  }
  return (
    CHAT_REVEAL_LETTER_REVEAL_MS +
    Math.max(0, Array.from(displayToken).length - 1) * CHAT_REVEAL_LETTER_REVEAL_STEP_MS
  );
}

export function resolveChatRevealTokenPunctuationPauseMs(
  token: string,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  const pauseKind = resolveChatRevealPauseKind(token);
  if (pauseKind === "ellipsis") return timing.ellipsisHoldMs;
  if (pauseKind === "sentence") return timing.sentencePauseMs;
  if (pauseKind === "clause") return timing.clausePauseMs;
  return 0;
}

export function resolveChatRevealStepDelayMs(
  previousToken: string,
  moodKey?: ChatRevealMoodKey | null,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  if (isChatRevealEllipsisToken(previousToken)) {
    return timing.ellipsisHoldMs;
  }
  const minimumDelayMs = resolveChatRevealWordDelayMsByMood(moodKey, timing);
  return Math.max(
    minimumDelayMs,
    resolveChatRevealTokenLetterDurationMs(previousToken, timing) + CHAT_REVEAL_WORD_REVEAL_SETTLE_MS
  ) + resolveChatRevealTokenPunctuationPauseMs(previousToken, timing);
}

export function resolveVisibleChatRevealTokenCountAtElapsedMs(
  tokens: readonly string[],
  elapsedMs: number,
  moodKey?: ChatRevealMoodKey | null,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  if (tokens.length <= 1) return 1;
  let visible = 1;
  let remaining = Math.max(0, elapsedMs);
  while (visible < tokens.length) {
    const delayMs = resolveChatRevealStepDelayMs(tokens[visible - 1] ?? "", moodKey, timing);
    if (remaining < delayMs) break;
    remaining -= delayMs;
    visible += 1;
  }
  return visible;
}

export function resolveChatRevealDurationMsForTokens(
  tokens: readonly string[],
  moodKey?: ChatRevealMoodKey | null,
  timing: ChatRevealTimingSettings = DEFAULT_CHAT_REVEAL_TIMING
): number {
  if (tokens.length <= 1) return 0;
  let total = 0;
  for (let i = 1; i < tokens.length; i += 1) {
    total += resolveChatRevealStepDelayMs(tokens[i - 1] ?? "", moodKey, timing);
  }
  return total;
}
