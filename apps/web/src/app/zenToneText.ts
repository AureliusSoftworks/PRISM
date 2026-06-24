import type {
  ZenDisplayAlign,
  ZenDisplayMetadata,
  ZenDisplayPlacement,
} from "@localai/shared";

export type ZenTextEffect =
  | "impact"
  | "question"
  | "affirm"
  | "negative"
  | "whisper"
  | "action";

export interface ZenTextEffectSpan {
  effect: ZenTextEffect;
  startTokenIndex: number;
  endTokenIndex: number;
}

export interface ZenResolvedLinePlacement {
  index: number;
  x: number;
  y: number;
  align: ZenDisplayAlign;
  source: "metadata" | "automatic";
}

export interface ZenResolvedMessagePlacement {
  x: number;
  y: number;
  align: ZenDisplayAlign;
  source: "metadata";
}

const ZEN_TONE_SPACE_BASE_ANNOYANCE = 0.12;
const ZEN_TONE_SPACE_MAX_ANNOYANCE = 0.82;
const ZEN_AUTOMATIC_PLACEMENT_MAX_LINES = 5;
const ZEN_AUTOMATIC_PLACEMENT_MAX_WORDS = 12;
const ZEN_AUTOMATIC_PLACEMENT_MAX_FINAL_CHARS = 36;
const ZEN_ACTION_MARKER_PATTERN = /(?<!\*)\*(?!\*)/gu;
const ZEN_FENCED_CODE_MARKER_PATTERN = /```/g;
const ZEN_SENTENCE_END_PATTERN = /[.!?][)"'\]}>*_`~]*$/u;
const ZEN_PHRASE_BOUNDARY_PATTERN = /[,;:][)"'\]}>*_`~]*$/u;
const ZEN_AFFIRMATIVE_WORDS = new Set([
  "yes",
  "yeah",
  "yep",
  "yup",
  "sure",
  "absolutely",
  "positive",
  "ok",
  "okay",
  "agreed",
  "definitely",
  "certainly",
]);
const ZEN_NEGATIVE_WORDS = new Set([
  "no",
  "nope",
  "nah",
  "negative",
  "not",
  "never",
  "cannot",
  "can't",
  "won't",
  "don't",
]);

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveCoordinate(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clampUnit(value) : fallback;
}

function resolveAlign(value: ZenDisplayAlign | undefined): ZenDisplayAlign {
  return value ?? "center";
}

export function resolveZenToneSpaceFromAnnoyance(
  annoyance: number | null | undefined
): number {
  if (typeof annoyance !== "number" || !Number.isFinite(annoyance)) return 0;
  const range = ZEN_TONE_SPACE_MAX_ANNOYANCE - ZEN_TONE_SPACE_BASE_ANNOYANCE;
  if (range <= 0) return 0;
  return clampUnit((annoyance - ZEN_TONE_SPACE_BASE_ANNOYANCE) / range);
}

function normalizedWordToken(token: string): string {
  return token
    .trim()
    .replace(/^[*_`~"'“”‘’([{<]+/u, "")
    .replace(/[!?,.;:)\]}>*_`~"'“”‘’]+$/u, "")
    .replace(/[’]/gu, "'")
    .toLowerCase();
}

function countPatternMatches(value: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return value.match(pattern)?.length ?? 0;
}

function tokenHasHardLineBreak(token: string): boolean {
  return /[\r\n]/u.test(token);
}

function tokenHasSentenceEnd(token: string): boolean {
  return ZEN_SENTENCE_END_PATTERN.test(token.trim());
}

function tokenHasPhraseBoundary(token: string): boolean {
  const trimmed = token.trim();
  return tokenHasHardLineBreak(token) || ZEN_PHRASE_BOUNDARY_PATTERN.test(trimmed);
}

function isPunctuationKindToken(token: string, effect: "impact" | "question"): boolean {
  return effect === "impact" ? token.includes("!") : token.includes("?");
}

function resolveCodeTokenMask(tokens: readonly string[]): boolean[] {
  const mask = new Array<boolean>(tokens.length).fill(false);
  let inFence = false;
  let inInlineCode = false;

  tokens.forEach((token, index) => {
    const fenceMarkerCount = countPatternMatches(token, ZEN_FENCED_CODE_MARKER_PATTERN);
    const startsInFence = inFence;
    if (startsInFence || fenceMarkerCount > 0) {
      mask[index] = true;
    }
    if (fenceMarkerCount % 2 === 1) {
      inFence = !inFence;
    }
    if (startsInFence || inFence || fenceMarkerCount > 0) return;

    const inlineMarkerCount = countPatternMatches(token, /`/g);
    const startsInInlineCode = inInlineCode;
    if (startsInInlineCode || inlineMarkerCount > 0) {
      mask[index] = true;
    }
    if (inlineMarkerCount % 2 === 1) {
      inInlineCode = !inInlineCode;
    }
  });

  return mask;
}

function findActionSpan(
  tokens: readonly string[],
  codeMask: readonly boolean[],
  startTokenIndex: number,
  endTokenIndex: number
): ZenTextEffectSpan | null {
  let actionStart: number | null = null;

  for (let index = startTokenIndex; index < endTokenIndex; index += 1) {
    if (codeMask[index]) continue;
    const markerCount = countPatternMatches(tokens[index] ?? "", ZEN_ACTION_MARKER_PATTERN);
    if (markerCount === 0) continue;
    if (actionStart === null) {
      actionStart = index;
      if (markerCount >= 2) {
        return { effect: "action", startTokenIndex: actionStart, endTokenIndex: index + 1 };
      }
    } else {
      return { effect: "action", startTokenIndex: actionStart, endTokenIndex: index + 1 };
    }
  }

  if (actionStart !== null) {
    return { effect: "action", startTokenIndex: actionStart, endTokenIndex };
  }
  return null;
}

function findWhisperSpan(
  tokens: readonly string[],
  codeMask: readonly boolean[],
  startTokenIndex: number,
  endTokenIndex: number
): ZenTextEffectSpan | null {
  let whisperStart: number | null = null;

  for (let index = startTokenIndex; index < endTokenIndex; index += 1) {
    if (codeMask[index]) continue;
    const token = tokens[index] ?? "";
    if (whisperStart === null && token.includes("(")) {
      whisperStart = index;
    }
    if (whisperStart !== null && token.includes(")")) {
      return { effect: "whisper", startTokenIndex: whisperStart, endTokenIndex: index + 1 };
    }
  }

  return null;
}

function earlierExplicitSpan(
  action: ZenTextEffectSpan | null,
  whisper: ZenTextEffectSpan | null
): ZenTextEffectSpan | null {
  if (!action) return whisper;
  if (!whisper) return action;
  return action.startTokenIndex <= whisper.startTokenIndex ? action : whisper;
}

function findPunctuationSpan(
  tokens: readonly string[],
  codeMask: readonly boolean[],
  startTokenIndex: number,
  endTokenIndex: number
): ZenTextEffectSpan | null {
  let punctuationIndex = -1;
  let effect: "impact" | "question" | null = null;

  for (let index = startTokenIndex; index < endTokenIndex; index += 1) {
    if (codeMask[index]) continue;
    const token = tokens[index] ?? "";
    const impactAt = token.indexOf("!");
    const questionAt = token.indexOf("?");
    if (impactAt === -1 && questionAt === -1) continue;
    punctuationIndex = index;
    effect = questionAt === -1 || (impactAt !== -1 && impactAt < questionAt)
      ? "impact"
      : "question";
    break;
  }

  if (punctuationIndex < 0 || effect === null) return null;

  let spanStart = startTokenIndex;
  for (let index = punctuationIndex - 1; index >= startTokenIndex; index -= 1) {
    if (tokenHasPhraseBoundary(tokens[index] ?? "")) {
      spanStart = index + 1;
      break;
    }
    if (tokenHasSentenceEnd(tokens[index] ?? "")) {
      spanStart = index + 1;
      break;
    }
  }

  let phraseEndIndex = endTokenIndex;
  for (let index = punctuationIndex; index < endTokenIndex; index += 1) {
    if (tokenHasPhraseBoundary(tokens[index] ?? "")) {
      phraseEndIndex = index + 1;
      break;
    }
  }

  let lastSameKindPunctuationIndex = punctuationIndex;
  for (let index = punctuationIndex + 1; index < phraseEndIndex; index += 1) {
    if (codeMask[index]) continue;
    const token = tokens[index] ?? "";
    if (isPunctuationKindToken(token, effect)) {
      lastSameKindPunctuationIndex = index;
    }
  }

  return {
    effect,
    startTokenIndex: spanStart,
    endTokenIndex: lastSameKindPunctuationIndex + 1,
  };
}

function lexicalEffectForToken(token: string): "affirm" | "negative" | null {
  const normalized = normalizedWordToken(token);
  if (ZEN_AFFIRMATIVE_WORDS.has(normalized)) return "affirm";
  if (ZEN_NEGATIVE_WORDS.has(normalized)) return "negative";
  return null;
}

function findLexicalSpan(
  tokens: readonly string[],
  codeMask: readonly boolean[],
  startTokenIndex: number,
  endTokenIndex: number
): ZenTextEffectSpan | null {
  let effect: "affirm" | "negative" | null = null;
  let spanStart = -1;
  let spanEnd = -1;

  for (let index = startTokenIndex; index < endTokenIndex; index += 1) {
    if (codeMask[index]) continue;
    const tokenEffect = lexicalEffectForToken(tokens[index] ?? "");
    if (!tokenEffect) continue;
    if (effect === null) {
      effect = tokenEffect;
      spanStart = index;
      spanEnd = index + 1;
      continue;
    }
    if (tokenEffect === effect) {
      spanEnd = index + 1;
    }
  }

  if (effect === null || spanStart < 0 || spanEnd <= spanStart) return null;
  return { effect, startTokenIndex: spanStart, endTokenIndex: spanEnd };
}

function resolveZenSentenceEffectSpan(
  tokens: readonly string[],
  codeMask: readonly boolean[],
  startTokenIndex: number,
  endTokenIndex: number
): ZenTextEffectSpan | null {
  const explicitSpan = earlierExplicitSpan(
    findActionSpan(tokens, codeMask, startTokenIndex, endTokenIndex),
    findWhisperSpan(tokens, codeMask, startTokenIndex, endTokenIndex)
  );
  if (explicitSpan) return explicitSpan;

  return (
    findPunctuationSpan(tokens, codeMask, startTokenIndex, endTokenIndex) ??
    findLexicalSpan(tokens, codeMask, startTokenIndex, endTokenIndex)
  );
}

export function resolveZenTextEffectSpans(tokens: readonly string[]): ZenTextEffectSpan[] {
  const codeMask = resolveCodeTokenMask(tokens);
  const spans: ZenTextEffectSpan[] = [];
  let sentenceStartIndex = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const sentenceEnds = !codeMask[index] && (tokenHasSentenceEnd(token) || tokenHasHardLineBreak(token));
    if (!sentenceEnds && index < tokens.length - 1) continue;
    const sentenceEndIndex = index + 1;
    const span = resolveZenSentenceEffectSpan(
      tokens,
      codeMask,
      sentenceStartIndex,
      sentenceEndIndex
    );
    if (span && span.endTokenIndex > span.startTokenIndex) {
      spans.push(span);
    }
    sentenceStartIndex = sentenceEndIndex;
  }

  return spans;
}

function splitDisplayLines(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

function visibleWordCount(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

function isEllipsisLikeLine(line: string): boolean {
  const compact = line.trim().replace(/\s+/g, "");
  return compact.length > 0 && /^[.…]+$/u.test(compact);
}

function hasMarkdownStructure(line: string): boolean {
  const trimmed = line.trim();
  return /^(#{1,6}\s|[-*+]\s+|>\s+|\d+[.)]\s+)/u.test(trimmed);
}

function metadataLinePlacements(
  zenDisplay: ZenDisplayMetadata | null | undefined
): ZenResolvedLinePlacement[] {
  return (zenDisplay?.lines ?? []).map((line) => ({
    index: line.index,
    x: resolveCoordinate(line.x, 0.5),
    y: resolveCoordinate(line.y, 0.5),
    align: resolveAlign(line.align),
    source: "metadata" as const,
  }));
}

function automaticLinePlacements(content: string, hasFencedCodeBlock: boolean): ZenResolvedLinePlacement[] {
  if (hasFencedCodeBlock) return [];
  const lines = splitDisplayLines(content);
  if (lines.length > ZEN_AUTOMATIC_PLACEMENT_MAX_LINES) return [];
  if (lines.some(hasMarkdownStructure)) return [];
  const nonEmpty = lines
    .map((line, index) => ({ line, index, trimmed: line.trim() }))
    .filter((entry) => entry.trimmed.length > 0);
  if (nonEmpty.length < 2) return [];
  const totalWords = visibleWordCount(nonEmpty.map((entry) => entry.trimmed).join(" "));
  if (totalWords > ZEN_AUTOMATIC_PLACEMENT_MAX_WORDS) return [];

  const final = nonEmpty[nonEmpty.length - 1]!;
  const hasEllipsisSetup = nonEmpty.slice(0, -1).some((entry) => isEllipsisLikeLine(entry.trimmed));
  if (!hasEllipsisSetup) return [];
  if (
    final.trimmed.length > ZEN_AUTOMATIC_PLACEMENT_MAX_FINAL_CHARS ||
    visibleWordCount(final.trimmed) > 4
  ) {
    return [];
  }

  const leading = nonEmpty.slice(0, -1);
  return [
    ...leading.map((entry, order) => ({
      index: entry.index,
      x: 0.5,
      y: Math.min(0.42, 0.24 + order * 0.12),
      align: "center" as const,
      source: "automatic" as const,
    })),
    {
      index: final.index,
      x: 0.5,
      y: 0.5,
      align: "center" as const,
      source: "automatic" as const,
    },
  ];
}

export function resolveZenLineDisplayPlacements(args: {
  content: string;
  hasFencedCodeBlock: boolean;
  zenDisplay?: ZenDisplayMetadata | null;
}): ZenResolvedLinePlacement[] {
  const explicit = metadataLinePlacements(args.zenDisplay);
  if (explicit.length > 0) return explicit;
  return automaticLinePlacements(args.content, args.hasFencedCodeBlock);
}

export function resolveZenMessageDisplayPlacement(
  zenDisplay: ZenDisplayMetadata | null | undefined
): ZenResolvedMessagePlacement | null {
  const placement: ZenDisplayPlacement | undefined = zenDisplay?.placement;
  if (!placement) return null;
  return {
    x: resolveCoordinate(placement.x, 0.5),
    y: resolveCoordinate(placement.y, 0.5),
    align: resolveAlign(placement.align),
    source: "metadata",
  };
}
