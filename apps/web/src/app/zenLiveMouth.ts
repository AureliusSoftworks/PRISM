export const ZEN_LIVE_MOUTH_PHASE_MS = 120;

export type ZenLiveBotMouthShape =
  | "open-wide"
  | "closed"
  | "speech-closed"
  | "narrow"
  | "open-small"
  | "open-round"
  | "dot"
  | "at";

/** Keeps mood-specific resting mouths out of active speech's closed beats. */
export function zenLiveBotMouthShapeForTalkingState({
  mouthShape,
  isTalking,
}: {
  mouthShape: ZenLiveBotMouthShape;
  isTalking: boolean;
}): ZenLiveBotMouthShape {
  return isTalking && mouthShape === "closed" ? "speech-closed" : mouthShape;
}

type ZenLiveTalkingMouthShape = Exclude<ZenLiveBotMouthShape, "closed">;

const ZEN_LIVE_TALKING_MOUTH_TRANSITIONS = {
  "speech-closed": ["open-wide", "open-wide", "open-small", "dot"],
  narrow: ["open-small", "open-small", "open-wide", "dot"],
  dot: ["speech-closed", "speech-closed", "open-small"],
  "open-small": ["speech-closed", "speech-closed", "open-wide", "open-round"],
  "open-wide": ["narrow", "narrow", "open-small", "open-round"],
  "open-round": ["open-small", "open-small", "open-wide", "at"],
  at: ["open-round"],
} as const satisfies Record<
  ZenLiveTalkingMouthShape,
  readonly ZenLiveTalkingMouthShape[]
>;

function zenLiveMouthShapeIsOpen(mouthShape: ZenLiveTalkingMouthShape): boolean {
  return (
    mouthShape === "open-small" ||
    mouthShape === "open-wide" ||
    mouthShape === "open-round" ||
    mouthShape === "at"
  );
}

function zenLiveTalkingMouthShapeAtPhase(
  phaseIndex: number,
  speechSeedText: string,
): ZenLiveTalkingMouthShape {
  const safePhaseIndex = Math.max(0, Math.floor(phaseIndex));
  let mouthShape: ZenLiveTalkingMouthShape = "speech-closed";
  let consecutiveOpenShapes = 0;
  for (let index = 0; index < safePhaseIndex; index += 1) {
    let choices: readonly ZenLiveTalkingMouthShape[] =
      ZEN_LIVE_TALKING_MOUTH_TRANSITIONS[mouthShape];
    if (consecutiveOpenShapes >= 3) {
      if (mouthShape === "open-round") choices = ["open-small"];
      if (mouthShape === "open-wide") choices = ["narrow"];
      if (mouthShape === "open-small") choices = ["speech-closed"];
    }
    const roll = zenLiveMouthHashText(
      `${speechSeedText}:transition:${index}:${mouthShape}`,
    );
    mouthShape = choices[roll % choices.length]!;
    consecutiveOpenShapes = zenLiveMouthShapeIsOpen(mouthShape)
      ? consecutiveOpenShapes + 1
      : 0;
  }
  return mouthShape;
}

const CRT_SPEECH_DIGRAPH_SHAPES: Readonly<Record<string, ZenLiveBotMouthShape>> = {
  ah: "open-wide",
  ai: "open-wide",
  ay: "open-wide",
  ch: "narrow",
  ea: "narrow",
  ee: "narrow",
  ei: "narrow",
  ey: "narrow",
  ie: "narrow",
  ph: "narrow",
  sh: "narrow",
  th: "narrow",
  zh: "narrow",
  oo: "open-round",
  ou: "open-round",
  ow: "open-round",
  qu: "open-round",
  wh: "open-round",
};

const CRT_SPEECH_FALLBACK_SHAPES = [
  "narrow",
  "open-small",
  "open-wide",
  "open-round",
] as const satisfies readonly ZenLiveBotMouthShape[];

function zenLiveMouthHashText(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizedCrtSpeechCharacters(text: string): string[] {
  return Array.from(
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
  );
}

function crtSpeechDigraphShape(
  characters: readonly string[],
  cursorIndex: number
): ZenLiveBotMouthShape | null {
  const current = characters[cursorIndex] ?? "";
  const forward = `${current}${characters[cursorIndex + 1] ?? ""}`;
  const backward = `${characters[cursorIndex - 1] ?? ""}${current}`;
  return CRT_SPEECH_DIGRAPH_SHAPES[forward] ?? CRT_SPEECH_DIGRAPH_SHAPES[backward] ?? null;
}

/**
 * Maps one visible text cursor position onto PRISM's deliberately small CRT
 * viseme vocabulary. This is spelling-aware rather than audio-grade lip sync:
 * the goal is a readable illusion that stays synchronized with the typewriter.
 */
export function crtSpeechMouthShapeAtTextCursor({
  text,
  cursorIndex,
}: {
  text: string;
  cursorIndex: number;
}): ZenLiveBotMouthShape {
  const characters = normalizedCrtSpeechCharacters(text);
  if (characters.length === 0) return "closed";
  const safeCursorIndex = Math.max(
    0,
    Math.min(characters.length - 1, Math.floor(Number.isFinite(cursorIndex) ? cursorIndex : 0))
  );
  const current = characters[safeCursorIndex] ?? "";
  if (!/[\p{L}\p{N}]/u.test(current)) return "closed";

  const digraphShape = crtSpeechDigraphShape(characters, safeCursorIndex);
  if (digraphShape) return digraphShape;
  if (/[bmp]/u.test(current)) return "speech-closed";
  if (current === "a") return "open-wide";
  if (/[ouwq]/u.test(current)) return "open-round";
  if (/[eiyfvsztdnlr]/u.test(current)) return "narrow";
  if (/[a-z]/u.test(current)) return "open-small";

  return CRT_SPEECH_FALLBACK_SHAPES[
    zenLiveMouthHashText(current) % CRT_SPEECH_FALLBACK_SHAPES.length
  ]!;
}

/** Removes content that is visible as formatting or a card rather than speech. */
export function normalizeCrtSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`\r\n]*`/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[*_~#>]/gu, " ");
}

export function zenLiveBotMouthShapeFromVisibleTextProgress({
  text,
  visibleLength,
  charactersPerPhase = 1,
}: {
  text: string;
  visibleLength: number;
  charactersPerPhase?: number;
}): ZenLiveBotMouthShape {
  const characters = Array.from(text);
  const safeVisibleLength = Math.max(
    0,
    Math.min(characters.length, Math.floor(Number.isFinite(visibleLength) ? visibleLength : 0))
  );
  if (safeVisibleLength <= 0) return "closed";
  const safeCharactersPerPhase = Math.max(1, Math.floor(charactersPerPhase));
  const phaseIndex = Math.floor((safeVisibleLength - 1) / safeCharactersPerPhase);
  return zenLiveTalkingMouthShapeAtPhase(phaseIndex, text);
}

export function zenLiveBotMouthShapeFromSpeechPhase({
  speechSeedText,
  phaseIndex,
}: {
  speechSeedText: string;
  phaseIndex: number;
}): ZenLiveBotMouthShape {
  const safePhaseIndex = Math.max(0, Math.floor(phaseIndex));
  return zenLiveTalkingMouthShapeAtPhase(safePhaseIndex, speechSeedText);
}

function zenLiveRevealTokenHasWord(token: string | undefined): boolean {
  return typeof token === "string" && /[\p{L}\p{N}]/u.test(token);
}

export function zenLiveBotMouthShapeFromRevealProgress({
  tokens,
  visibleTokenCount,
  nowMs,
  firstSeenAtMs,
  startDelayMs,
  phaseMs = ZEN_LIVE_MOUTH_PHASE_MS,
}: {
  tokens: readonly string[];
  visibleTokenCount: number;
  nowMs: number;
  firstSeenAtMs: number;
  startDelayMs: number;
  phaseMs?: number;
}): ZenLiveBotMouthShape | null {
  const clampedVisibleTokenCount = Math.min(
    tokens.length,
    Math.max(0, Math.floor(visibleTokenCount))
  );
  if (clampedVisibleTokenCount <= 0) return null;
  const hasVisibleWord = tokens
    .slice(0, clampedVisibleTokenCount)
    .some(zenLiveRevealTokenHasWord);
  if (!hasVisibleWord) return null;

  const elapsedSpeechMs = nowMs - firstSeenAtMs - startDelayMs;
  if (elapsedSpeechMs < 0) return null;

  const safePhaseMs = Math.max(1, phaseMs);
  const phaseIndex = Math.floor(elapsedSpeechMs / safePhaseMs);
  return zenLiveTalkingMouthShapeAtPhase(phaseIndex, tokens.join(""));
}

export function zenLiveBotMouthOpenFromRevealProgress(
  input: Parameters<typeof zenLiveBotMouthShapeFromRevealProgress>[0]
): boolean | null {
  const mouthShape = zenLiveBotMouthShapeFromRevealProgress(input);
  return mouthShape === null
    ? null
    : mouthShape !== "closed" &&
        mouthShape !== "speech-closed" &&
        mouthShape !== "narrow" &&
        mouthShape !== "dot";
}
