export const ZEN_LIVE_MOUTH_PHASE_MS = 120;
export const ZEN_LIVE_CUSTOM_MOUTH_SPIN_TURN_MS =
  ZEN_LIVE_MOUTH_PHASE_MS * 4;
/** Bottish notes can arrive much faster than a readable CRT mouth pose. */
export const BOTTISH_MOUTH_PHASE_MS = 240;

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

function zenLiveMouthShapeIsOpen(
  mouthShape: ZenLiveTalkingMouthShape,
): boolean {
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
  return Array.from(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
}

export type EnglishCrtVisemeBeat = {
  shape: ZenLiveBotMouthShape;
  sourceStart: number;
  sourceEnd: number;
  durationUnits: number;
  kind: "consonant" | "rest" | "vowel";
};

type EnglishCrtVisemeStep = Pick<
  EnglishCrtVisemeBeat,
  "durationUnits" | "kind" | "shape"
>;

type EnglishCrtGraphemeRule = {
  length: number;
  steps: readonly EnglishCrtVisemeStep[];
};

const ENGLISH_CRT_VOWEL_HOLD_UNITS = 1.7;
const ENGLISH_CRT_CONSONANT_HOLD_UNITS = 0.62;
const ENGLISH_CRT_CLOSURE_HOLD_UNITS = 0.72;
const ENGLISH_CRT_DIGIT_PRONUNCIATIONS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;
const ENGLISH_CRT_SHORT_FINAL_E_WORDS = new Set([
  "above",
  "are",
  "come",
  "done",
  "give",
  "gone",
  "have",
  "live",
  "love",
  "none",
  "one",
  "some",
]);
const ENGLISH_CRT_PRONOUNCED_FINAL_E_WORDS = new Set([
  "be",
  "cafe",
  "he",
  "me",
  "recipe",
  "she",
  "the",
  "we",
]);
const ENGLISH_CRT_OH_UH_WORDS = new Set([
  "above",
  "come",
  "done",
  "go",
  "love",
  "no",
  "none",
  "oh",
  "one",
  "so",
  "some",
]);

function englishCrtVisemeStep(
  shape: ZenLiveBotMouthShape,
  durationUnits: number,
  kind: EnglishCrtVisemeBeat["kind"],
): EnglishCrtVisemeStep {
  return { shape, durationUnits, kind };
}

function englishCrtRestDurationUnits(character: string): number {
  if (/\s/u.test(character)) return 0.34;
  if (/[.!?…]/u.test(character)) return 1.45;
  if (/[,;:]/u.test(character)) return 0.92;
  if (/[—–-]/u.test(character)) return 0.78;
  return 0.5;
}

function englishCrtSilentFinalEIndex(word: string): number | null {
  if (
    !word.endsWith("e") ||
    word.length <= 2 ||
    ENGLISH_CRT_PRONOUNCED_FINAL_E_WORDS.has(word)
  ) {
    return null;
  }
  return word.length - 1;
}

function englishCrtMagicELeadIndex(
  word: string,
  silentFinalEIndex: number | null,
): number | null {
  if (
    silentFinalEIndex === null ||
    ENGLISH_CRT_SHORT_FINAL_E_WORDS.has(word)
  ) {
    return null;
  }
  const leadIndex = silentFinalEIndex - 2;
  const middle = word[silentFinalEIndex - 1] ?? "";
  return leadIndex >= 0 &&
    /[aeiou]/u.test(word[leadIndex] ?? "") &&
    /[b-df-hj-np-tv-z]/u.test(middle)
    ? leadIndex
    : null;
}

function englishCrtVowelRuleAt(
  word: readonly string[],
  index: number,
  options: {
    magicELeadIndex: number | null;
    silentFinalEIndex: number | null;
    wordText: string;
  },
): EnglishCrtGraphemeRule | null {
  if (index === options.silentFinalEIndex) return null;
  const current = word[index] ?? "";
  const next = word[index + 1] ?? "";
  const third = word[index + 2] ?? "";
  const pair = `${current}${next}`;
  const triple = `${pair}${third}`;
  const wide = englishCrtVisemeStep(
    "open-wide",
    ENGLISH_CRT_VOWEL_HOLD_UNITS,
    "vowel",
  );
  const narrow = englishCrtVisemeStep(
    "narrow",
    ENGLISH_CRT_VOWEL_HOLD_UNITS,
    "vowel",
  );
  const tightRound = englishCrtVisemeStep(
    "dot",
    ENGLISH_CRT_VOWEL_HOLD_UNITS,
    "vowel",
  );
  const smallRound = englishCrtVisemeStep(
    "open-small",
    ENGLISH_CRT_VOWEL_HOLD_UNITS,
    "vowel",
  );
  const broadRound = englishCrtVisemeStep(
    "open-round",
    ENGLISH_CRT_VOWEL_HOLD_UNITS,
    "vowel",
  );
  const transition = (shape: ZenLiveBotMouthShape) =>
    englishCrtVisemeStep(shape, 0.92, "vowel");

  if (index === options.magicELeadIndex) {
    if (current === "a" || current === "i") {
      return { length: 1, steps: [wide, transition("narrow")] };
    }
    if (current === "o") {
      return { length: 1, steps: [smallRound, transition("dot")] };
    }
    if (current === "u") return { length: 1, steps: [tightRound] };
    return { length: 1, steps: [narrow] };
  }

  if (triple === "igh") {
    return { length: 3, steps: [wide, transition("narrow")] };
  }
  if (/^(ai|ay|ey|ie)$/u.test(pair)) {
    return { length: 2, steps: [wide, transition("narrow")] };
  }
  if (/^(ou|ow)$/u.test(pair)) {
    return { length: 2, steps: [wide, transition("dot")] };
  }
  if (/^(oi|oy)$/u.test(pair)) {
    return { length: 2, steps: [broadRound, transition("narrow")] };
  }
  if (/^(ee|ea|ei)$/u.test(pair)) {
    return {
      length: 2,
      steps: [
        englishCrtVisemeStep("narrow", 2.15, "vowel"),
      ],
    };
  }
  if (/^(oo|ue|ui|ew)$/u.test(pair)) {
    return {
      length: 2,
      steps: [
        englishCrtVisemeStep("dot", 2.15, "vowel"),
      ],
    };
  }
  if (/^(oa|oe)$/u.test(pair)) {
    return {
      length: 2,
      steps: [smallRound, transition("dot")],
    };
  }
  if (/^(aw|au)$/u.test(pair)) {
    return {
      length: 2,
      steps: [
        englishCrtVisemeStep("open-round", 2.15, "vowel"),
      ],
    };
  }
  if (pair === "ah") {
    return {
      length: 2,
      steps: [englishCrtVisemeStep("open-round", 2.05, "vowel")],
    };
  }
  if (/^(er|ir|ur)$/u.test(pair)) {
    return {
      length: 2,
      steps: [englishCrtVisemeStep("narrow", 1.95, "vowel")],
    };
  }
  if (pair === "ar") {
    return { length: 2, steps: [wide, transition("narrow")] };
  }
  if (pair === "or") {
    return { length: 2, steps: [broadRound, transition("narrow")] };
  }

  if (current === "a") return { length: 1, steps: [wide] };
  if (current === "e") return { length: 1, steps: [wide] };
  if (current === "i") return { length: 1, steps: [narrow] };
  if (current === "o") {
    return {
      length: 1,
      steps: [
        ENGLISH_CRT_OH_UH_WORDS.has(options.wordText)
          ? smallRound
          : broadRound,
      ],
    };
  }
  if (current === "u") return { length: 1, steps: [smallRound] };
  if (current === "y" && !(index === 0 && /[aeiou]/u.test(next))) {
    return { length: 1, steps: [narrow] };
  }
  return null;
}

function appendEnglishCrtRule(
  target: EnglishCrtVisemeBeat[],
  rule: EnglishCrtGraphemeRule,
  sourceStart: number,
): void {
  for (let index = 0; index < rule.steps.length; index += 1) {
    const step = rule.steps[index]!;
    const sourceOffset = Math.min(
      rule.length - 1,
      Math.floor((index * rule.length) / rule.steps.length),
    );
    target.push({
      ...step,
      sourceStart: sourceStart + sourceOffset,
      sourceEnd:
        sourceStart +
        (rule.steps.length === 1 ? rule.length : sourceOffset + 1),
    });
  }
}

function englishCrtNextVowelShape(
  word: readonly string[],
  fromIndex: number,
  options: Parameters<typeof englishCrtVowelRuleAt>[2],
): ZenLiveBotMouthShape | null {
  for (let index = fromIndex; index < word.length; index += 1) {
    const rule = englishCrtVowelRuleAt(word, index, options);
    if (rule) return rule.steps[0]?.shape ?? null;
  }
  return null;
}

function englishCrtWordVisemeBeats(
  word: readonly string[],
  sourceStart: number,
): EnglishCrtVisemeBeat[] {
  const beats: EnglishCrtVisemeBeat[] = [];
  const wordText = word.join("");
  const silentFinalEIndex = englishCrtSilentFinalEIndex(wordText);
  const options = {
    magicELeadIndex: englishCrtMagicELeadIndex(
      wordText,
      silentFinalEIndex,
    ),
    silentFinalEIndex,
    wordText,
  };

  for (let index = 0; index < word.length; ) {
    if (index === silentFinalEIndex) {
      index += 1;
      continue;
    }
    const vowelRule = englishCrtVowelRuleAt(word, index, options);
    if (vowelRule) {
      appendEnglishCrtRule(beats, vowelRule, sourceStart + index);
      index += vowelRule.length;
      continue;
    }

    const current = word[index] ?? "";
    const pair = `${current}${word[index + 1] ?? ""}`;
    const digit = Number.parseInt(current, 10);
    if (/\d/u.test(current) && Number.isInteger(digit)) {
      const pronunciation = ENGLISH_CRT_DIGIT_PRONUNCIATIONS[digit] ?? "";
      const digitBeats = englishCrtWordVisemeBeats(
        Array.from(pronunciation),
        sourceStart + index,
      );
      beats.push(
        ...digitBeats.map((beat) => ({
          ...beat,
          sourceStart: sourceStart + index,
          sourceEnd: sourceStart + index + 1,
        })),
      );
      index += 1;
      continue;
    }
    if (!/[a-z]/u.test(current)) {
      beats.push({
        shape:
          CRT_SPEECH_FALLBACK_SHAPES[
            zenLiveMouthHashText(current) % CRT_SPEECH_FALLBACK_SHAPES.length
          ]!,
        sourceStart: sourceStart + index,
        sourceEnd: sourceStart + index + 1,
        durationUnits: 1,
        kind: "vowel",
      });
      index += 1;
      continue;
    }

    let length = 1;
    let shape: ZenLiveBotMouthShape;
    let durationUnits = ENGLISH_CRT_CONSONANT_HOLD_UNITS;
    if (pair === "th") {
      length = 2;
      shape = "at";
      durationUnits = 0.9;
    } else if (pair === "ph") {
      length = 2;
      shape = "dot";
      durationUnits = 0.78;
    } else if (pair === "wh" || pair === "qu") {
      length = 2;
      shape = "dot";
      durationUnits = 0.82;
    } else if (/^(sh|ch|zh|ng|ck|gh)$/u.test(pair)) {
      length = 2;
      shape =
        englishCrtNextVowelShape(word, index + length, options) ??
        "open-small";
    } else if (/[bmp]/u.test(current)) {
      shape = "speech-closed";
      durationUnits = ENGLISH_CRT_CLOSURE_HOLD_UNITS;
    } else if (/[fv]/u.test(current)) {
      shape = "dot";
      durationUnits = 0.68;
    } else if (current === "l") {
      shape = "at";
      durationUnits = 0.86;
    } else if (current === "r") {
      shape = "narrow";
      durationUnits = 0.84;
    } else if (current === "w" || current === "q") {
      shape = "dot";
      durationUnits = 0.76;
    } else {
      shape =
        englishCrtNextVowelShape(word, index + 1, options) ?? "open-small";
      if (current === "h") durationUnits = 0.48;
    }
    beats.push({
      shape,
      sourceStart: sourceStart + index,
      sourceEnd: sourceStart + index + length,
      durationUnits,
      kind: "consonant",
    });
    index += length;
  }
  return beats;
}

/**
 * Builds a deterministic, fully local approximation of English pronunciation.
 * It deliberately targets a small CRT viseme vocabulary rather than linguistic
 * transcription, but follows lip closure, tongue, rounding, vowel, and
 * diphthong motion closely enough to read as speech instead of letter cycling.
 */
export function englishCrtVisemeTimeline(
  text: string,
): EnglishCrtVisemeBeat[] {
  const characters = normalizedCrtSpeechCharacters(text);
  const beats: EnglishCrtVisemeBeat[] = [];
  for (let index = 0; index < characters.length; ) {
    const current = characters[index] ?? "";
    if (/[\p{L}\p{N}]/u.test(current)) {
      let end = index + 1;
      while (
        end < characters.length &&
        /[\p{L}\p{N}]/u.test(characters[end] ?? "")
      ) {
        end += 1;
      }
      beats.push(
        ...englishCrtWordVisemeBeats(characters.slice(index, end), index),
      );
      index = end;
      continue;
    }
    beats.push({
      shape: "closed",
      sourceStart: index,
      sourceEnd: index + 1,
      durationUnits: englishCrtRestDurationUnits(current),
      kind: "rest",
    });
    index += 1;
  }
  return beats;
}

function englishCrtVisemeTimelineDurationUnits(
  beats: readonly EnglishCrtVisemeBeat[],
): number {
  return beats.reduce((total, beat) => total + beat.durationUnits, 0);
}

function englishCrtVisemeShapeAtUnit(
  beats: readonly EnglishCrtVisemeBeat[],
  rawUnit: number,
): ZenLiveBotMouthShape {
  const durationUnits = englishCrtVisemeTimelineDurationUnits(beats);
  if (beats.length === 0 || durationUnits <= 0) return "closed";
  const safeRawUnit = Number.isFinite(rawUnit) ? rawUnit : 0;
  const unit = ((safeRawUnit % durationUnits) + durationUnits) % durationUnits;
  let elapsedUnits = 0;
  for (const beat of beats) {
    elapsedUnits += beat.durationUnits;
    if (unit < elapsedUnits) return beat.shape;
  }
  return beats.at(-1)?.shape ?? "closed";
}

/**
 * Maps one visible text cursor position through PRISM's local pronunciation
 * timeline. It remains deterministic and network-free while accounting for
 * closures, vowel families, consonant anticipation, and diphthongs.
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
    Math.min(
      characters.length - 1,
      Math.floor(Number.isFinite(cursorIndex) ? cursorIndex : 0),
    ),
  );
  const beats = englishCrtVisemeTimeline(text);
  const coveringBeat = beats.find(
    (beat) =>
      safeCursorIndex >= beat.sourceStart && safeCursorIndex < beat.sourceEnd,
  );
  if (coveringBeat) return coveringBeat.shape;
  for (let index = beats.length - 1; index >= 0; index -= 1) {
    const beat = beats[index]!;
    if (beat.sourceEnd <= safeCursorIndex + 1) return beat.shape;
  }
  return "closed";
}

export function crtSpeechMouthShapeFromVisibleTextProgress({
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
    Math.min(
      characters.length,
      Math.floor(Number.isFinite(visibleLength) ? visibleLength : 0),
    ),
  );
  if (safeVisibleLength <= 0) return "closed";
  const safeCharactersPerPhase = Math.max(1, Math.floor(charactersPerPhase));
  const cursorIndex =
    Math.floor((safeVisibleLength - 1) / safeCharactersPerPhase) *
    safeCharactersPerPhase;
  return crtSpeechMouthShapeAtTextCursor({ text, cursorIndex });
}

export function crtSpeechMouthShapeAtElapsedMs({
  text,
  elapsedMs,
  durationMs,
  phaseMs = ZEN_LIVE_MOUTH_PHASE_MS,
}: {
  text: string;
  elapsedMs: number;
  durationMs?: number;
  phaseMs?: number;
}): ZenLiveBotMouthShape {
  const beats = englishCrtVisemeTimeline(text);
  const durationUnits = englishCrtVisemeTimelineDurationUnits(beats);
  if (beats.length === 0 || durationUnits <= 0) return "closed";
  const safeElapsedMs = Math.max(
    0,
    Number.isFinite(elapsedMs) ? elapsedMs : 0,
  );
  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
  ) {
    const progress = Math.min(0.999_999, safeElapsedMs / durationMs);
    return englishCrtVisemeShapeAtUnit(beats, progress * durationUnits);
  }
  const safePhaseMs = Math.max(1, phaseMs);
  return englishCrtVisemeShapeAtUnit(beats, safeElapsedMs / safePhaseMs);
}

/**
 * Uses provider character timings when available so each viseme changes on the
 * audio clock instead of spreading the written phrase evenly across the clip.
 */
export function crtSpeechMouthShapeAtAlignedElapsedMs({
  text,
  elapsedMs,
  durationMs,
  alignment,
}: {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: {
    characters: readonly string[];
    characterStartTimesSeconds: readonly number[];
    characterEndTimesSeconds: readonly number[];
  } | null;
}): ZenLiveBotMouthShape {
  const fallback = () =>
    crtSpeechMouthShapeAtElapsedMs({ text, elapsedMs, durationMs });
  if (!alignment) return fallback();

  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length
  ) {
    return fallback();
  }

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
    ) {
      return fallback();
    }
    previousStart = start;
    previousEnd = end;
  }
  if (previousEnd <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return fallback();
  }

  const safeElapsedMs = Math.max(
    0,
    Number.isFinite(elapsedMs) ? elapsedMs : 0,
  );
  const providerElapsedSeconds =
    (Math.min(durationMs, safeElapsedMs) / durationMs) * previousEnd;
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (
      (alignment.characterStartTimesSeconds[middle] ??
        Number.POSITIVE_INFINITY) <= providerElapsedSeconds
    ) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const cursorIndex = Math.max(0, low - 1);
  if (
    safeElapsedMs >= durationMs ||
    providerElapsedSeconds >
      (alignment.characterEndTimesSeconds[cursorIndex] ?? previousEnd)
  ) {
    return "closed";
  }
  return crtSpeechMouthShapeAtTextCursor({
    text: alignment.characters.join(""),
    cursorIndex,
  });
}

/**
 * Keeps Bottish on the audio clock without changing pose on every synthesized
 * note. Provider alignment still closes the mouth for real phrase gaps.
 */
export function bottishMouthShapeAtAlignedElapsedMs({
  text,
  elapsedMs,
  durationMs,
  alignment,
  phaseMs = BOTTISH_MOUTH_PHASE_MS,
}: {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: {
    characters: readonly string[];
    characterStartTimesSeconds: readonly number[];
    characterEndTimesSeconds: readonly number[];
  } | null;
  phaseMs?: number;
}): ZenLiveBotMouthShape {
  const activityShape = crtSpeechMouthShapeAtAlignedElapsedMs({
    text,
    elapsedMs,
    durationMs,
    alignment,
  });
  if (activityShape === "closed") return "closed";
  return zenLiveBotMouthShapeFromSpeechPhase({
    speechSeedText: text,
    phaseIndex: Math.floor(
      Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) /
        Math.max(1, phaseMs),
    ),
  });
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
    Math.min(
      characters.length,
      Math.floor(Number.isFinite(visibleLength) ? visibleLength : 0),
    ),
  );
  if (safeVisibleLength <= 0) return "closed";
  const safeCharactersPerPhase = Math.max(1, Math.floor(charactersPerPhase));
  const phaseIndex = Math.floor(
    (safeVisibleLength - 1) / safeCharactersPerPhase,
  );
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
  phonemeAware = false,
}: {
  tokens: readonly string[];
  visibleTokenCount: number;
  nowMs: number;
  firstSeenAtMs: number;
  startDelayMs: number;
  phaseMs?: number;
  phonemeAware?: boolean;
}): ZenLiveBotMouthShape | null {
  const clampedVisibleTokenCount = Math.min(
    tokens.length,
    Math.max(0, Math.floor(visibleTokenCount)),
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
  if (phonemeAware) {
    const activeTokenIndex = tokens
      .slice(0, clampedVisibleTokenCount)
      .findLastIndex(zenLiveRevealTokenHasWord);
    if (activeTokenIndex < 0) return null;
    const activeToken = tokens[activeTokenIndex] ?? "";
    return crtSpeechMouthShapeAtElapsedMs({
      text: activeToken,
      elapsedMs: elapsedSpeechMs,
      phaseMs: safePhaseMs,
    });
  }
  return zenLiveTalkingMouthShapeAtPhase(phaseIndex, tokens.join(""));
}

export function zenLiveBotMouthOpenFromRevealProgress(
  input: Parameters<typeof zenLiveBotMouthShapeFromRevealProgress>[0],
): boolean | null {
  const mouthShape = zenLiveBotMouthShapeFromRevealProgress(input);
  return mouthShape === null
    ? null
    : mouthShape !== "closed" &&
        mouthShape !== "speech-closed" &&
        mouthShape !== "narrow" &&
        mouthShape !== "dot";
}
