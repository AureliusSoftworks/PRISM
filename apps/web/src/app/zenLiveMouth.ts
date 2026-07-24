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

type NormalizedCrtSpeechCharacter = {
  character: string;
  sourceStart: number;
  sourceEnd: number;
};

const ENGLISH_CRT_COMPATIBILITY_EXPANSIONS: Readonly<Record<string, string>> = {
  æ: "ae",
  ð: "th",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

/**
 * Normalizes one Unicode code point at a time so source offsets continue to
 * match Array.from(text), provider alignment, and streamed reveal cursors.
 */
function normalizedCrtSpeechCharacters(
  text: string,
): NormalizedCrtSpeechCharacter[] {
  const normalized: NormalizedCrtSpeechCharacter[] = [];
  for (const [sourceStart, sourceCharacter] of Array.from(text).entries()) {
    const lower = sourceCharacter.toLocaleLowerCase("en-US");
    const expanded =
      ENGLISH_CRT_COMPATIBILITY_EXPANSIONS[lower] ??
      lower.normalize("NFKD").replace(/\p{M}/gu, "");
    for (const character of Array.from(expanded)) {
      normalized.push({
        character,
        sourceStart,
        sourceEnd: sourceStart + 1,
      });
    }
  }
  return normalized;
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
  "come",
  "does",
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
  "does",
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
const ENGLISH_CRT_LONG_E_WORDS = new Set([
  "be",
  "he",
  "me",
  "recipe",
  "she",
  "we",
]);
const ENGLISH_CRT_SHORT_OO_WORDS = new Set([
  "book",
  "brook",
  "cook",
  "foot",
  "good",
  "hood",
  "hook",
  "look",
  "nook",
  "shook",
  "stood",
  "took",
  "wood",
  "wool",
]);
const ENGLISH_CRT_SHORT_EA_WORDS = new Set([
  "bread",
  "breakfast",
  "breast",
  "breath",
  "dead",
  "deaf",
  "death",
  "dread",
  "head",
  "health",
  "heaven",
  "heavy",
  "instead",
  "meadow",
  "meant",
  "pleasant",
  "ready",
  "spread",
  "steady",
  "sweat",
  "thread",
  "threat",
  "wealth",
  "weapon",
  "weather",
]);
const ENGLISH_CRT_LONG_IE_WORDS = new Set([
  "belief",
  "brief",
  "chief",
  "field",
  "fiend",
  "grief",
  "niece",
  "piece",
  "priest",
  "relief",
  "retrieve",
  "shield",
  "thief",
  "yield",
]);
const ENGLISH_CRT_LONG_EY_WORDS = new Set([
  "donkey",
  "honey",
  "journey",
  "key",
  "money",
  "monkey",
  "turkey",
  "valley",
]);
const ENGLISH_CRT_LONG_O_OW_WORDS = new Set([
  "blow",
  "bowl",
  "crow",
  "flow",
  "glow",
  "grow",
  "know",
  "low",
  "mow",
  "own",
  "show",
  "slow",
  "snow",
  "throw",
  "window",
  "yellow",
]);
const ENGLISH_CRT_LONG_A_EY_WORDS = new Set([
  "convey",
  "grey",
  "obey",
  "prey",
  "survey",
  "they",
  "whey",
]);

/**
 * Small, high-value exception lexicon for spellings that no deterministic
 * grapheme rules can infer. Values are intentionally readable pseudo-spelling,
 * not IPA, so they pass through the same local viseme engine.
 */
const ENGLISH_CRT_PRONUNCIATION_OVERRIDES: Readonly<
  Record<string, string>
> = {
  "can't": "kant",
  "couldn't": "cudent",
  "doesn't": "duzent",
  "don't": "dohnt",
  "he's": "heez",
  "i'd": "eyed",
  "i'll": "eyel",
  "i'm": "eyem",
  "i've": "eyev",
  "she's": "sheez",
  "shouldn't": "shudent",
  "they'll": "thayl",
  "they're": "thair",
  "they've": "thayv",
  "we'll": "weel",
  "we're": "weer",
  "we've": "weev",
  "won't": "wohnt",
  "you'll": "yool",
  "you're": "yor",
  "you've": "yoov",
  any: "enee",
  answer: "anser",
  bear: "bair",
  break: "brayk",
  bury: "beree",
  business: "biznes",
  busy: "bizee",
  calm: "kahm",
  colonel: "kernel",
  cough: "coff",
  could: "cud",
  enough: "enuff",
  four: "fawr",
  friend: "frend",
  great: "grayt",
  half: "haff",
  heart: "hart",
  honest: "onest",
  hour: "our",
  island: "iland",
  many: "menee",
  of: "uv",
  once: "wuns",
  one: "wun",
  people: "peepul",
  pretty: "pritee",
  queue: "cue",
  rough: "ruff",
  said: "sed",
  says: "sez",
  should: "shud",
  steak: "stayk",
  sure: "shur",
  sword: "sord",
  talk: "tawk",
  the: "thuh",
  their: "thair",
  there: "thair",
  though: "thoh",
  thought: "thawt",
  through: "thoo",
  tough: "tuff",
  two: "too",
  walk: "wawk",
  was: "wuz",
  wear: "wair",
  were: "wur",
  who: "hoo",
  whole: "hole",
  whom: "hoom",
  whose: "hooz",
  woman: "wumun",
  women: "wimin",
  wont: "wohnt",
  would: "wud",
  yacht: "yot",
  your: "yor",
};

function englishCrtWordSetHas(
  words: ReadonlySet<string>,
  word: string,
): boolean {
  if (words.has(word)) return true;
  const candidates: string[] = [];
  if (word.endsWith("s") && word.length > 2) {
    candidates.push(word.slice(0, -1));
  }
  if (word.endsWith("ed") && word.length > 3) {
    candidates.push(word.slice(0, -2), word.slice(0, -1));
  }
  if (word.endsWith("ing") && word.length > 4) {
    const withoutIng = word.slice(0, -3);
    candidates.push(withoutIng, `${withoutIng}e`);
  }
  return candidates.some((candidate) => words.has(candidate));
}

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
  if (/[—–]/u.test(character)) return 0.78;
  if (character === "-") return 0.22;
  return 0.5;
}

function englishCrtSilentFinalEIndex(word: string): number | null {
  let candidateIndex = word.endsWith("e")
    ? word.length - 1
    : word.length >= 4 && /e[ds]$/u.test(word)
      ? word.length - 2
      : -1;
  if (candidateIndex < 0 || word.length <= 2) return null;

  const baseWord = word.slice(0, candidateIndex + 1);
  if (ENGLISH_CRT_PRONOUNCED_FINAL_E_WORDS.has(baseWord)) return null;
  if (
    word.endsWith("ed") &&
    /[td]/u.test(word[candidateIndex - 1] ?? "")
  ) {
    candidateIndex = -1;
  }
  return candidateIndex >= 0 ? candidateIndex : null;
}

function englishCrtMagicELeadIndex(
  word: string,
  silentFinalEIndex: number | null,
): number | null {
  if (
    silentFinalEIndex === null ||
    ENGLISH_CRT_SHORT_FINAL_E_WORDS.has(
      word.slice(0, silentFinalEIndex + 1),
    )
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

  if (options.wordText === "i" && index === 0) {
    return { length: 1, steps: [wide, transition("narrow")] };
  }
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
  if (triple === "air") {
    return { length: 3, steps: [wide, transition("narrow")] };
  }
  if (/^(ai|ay)$/u.test(pair)) {
    return { length: 2, steps: [wide, transition("narrow")] };
  }
  if (pair === "ey") {
    return englishCrtWordSetHas(
      ENGLISH_CRT_LONG_A_EY_WORDS,
      options.wordText,
    )
      ? { length: 2, steps: [wide, transition("narrow")] }
      : englishCrtWordSetHas(
            ENGLISH_CRT_LONG_EY_WORDS,
            options.wordText,
          ) ||
          options.wordText.endsWith("ey")
        ? { length: 2, steps: [narrow] }
        : { length: 2, steps: [wide, transition("narrow")] };
  }
  if (pair === "ie") {
    return englishCrtWordSetHas(
      ENGLISH_CRT_LONG_IE_WORDS,
      options.wordText,
    )
      ? { length: 2, steps: [narrow] }
      : { length: 2, steps: [wide, transition("narrow")] };
  }
  if (/^(ou|ow)$/u.test(pair)) {
    if (
      pair === "ow" &&
      englishCrtWordSetHas(
        ENGLISH_CRT_LONG_O_OW_WORDS,
        options.wordText,
      )
    ) {
      return { length: 2, steps: [smallRound, transition("dot")] };
    }
    return { length: 2, steps: [wide, transition("dot")] };
  }
  if (/^(oi|oy)$/u.test(pair)) {
    return { length: 2, steps: [broadRound, transition("narrow")] };
  }
  if (
    pair === "ea" &&
    englishCrtWordSetHas(ENGLISH_CRT_SHORT_EA_WORDS, options.wordText)
  ) {
    return { length: 2, steps: [wide] };
  }
  if (pair === "ei" && /^eigh/u.test(word.slice(index).join(""))) {
    return { length: 4, steps: [wide, transition("narrow")] };
  }
  if (/^(ee|ea|ei)$/u.test(pair)) {
    return {
      length: 2,
      steps: [
        englishCrtVisemeStep("narrow", 2.15, "vowel"),
      ],
    };
  }
  if (
    pair === "oo" &&
    englishCrtWordSetHas(ENGLISH_CRT_SHORT_OO_WORDS, options.wordText)
  ) {
    return { length: 2, steps: [smallRound] };
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
  if (pair === "oh") {
    return { length: 2, steps: [smallRound, transition("dot")] };
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
  if (current === "e") {
    return {
      length: 1,
      steps: [
        englishCrtWordSetHas(ENGLISH_CRT_LONG_E_WORDS, options.wordText) &&
        index === word.length - 1
          ? narrow
          : wide,
      ],
    };
  }
  if (current === "i") return { length: 1, steps: [narrow] };
  if (current === "o") {
    return {
      length: 1,
      steps: [
        englishCrtWordSetHas(ENGLISH_CRT_OH_UH_WORDS, options.wordText)
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
  word: readonly NormalizedCrtSpeechCharacter[],
  wordIndex: number,
): void {
  for (let index = 0; index < rule.steps.length; index += 1) {
    const step = rule.steps[index]!;
    const sourceOffset = Math.min(
      rule.length - 1,
      Math.floor((index * rule.length) / rule.steps.length),
    );
    const sourceCharacter = word[wordIndex + sourceOffset];
    const lastSourceCharacter =
      word[
        wordIndex +
          (rule.steps.length === 1 ? rule.length - 1 : sourceOffset)
      ] ?? sourceCharacter;
    if (!sourceCharacter || !lastSourceCharacter) continue;
    target.push({
      ...step,
      sourceStart: sourceCharacter.sourceStart,
      sourceEnd: lastSourceCharacter.sourceEnd,
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
  word: readonly NormalizedCrtSpeechCharacter[],
  allowPronunciationOverride = true,
  pronunciationLookupText?: string,
): EnglishCrtVisemeBeat[] {
  const beats: EnglishCrtVisemeBeat[] = [];
  const wordCharacters = word.map(({ character }) => character);
  const wordText = wordCharacters.join("");
  const normalizedPronunciationLookupText = pronunciationLookupText?.replace(
    /’/gu,
    "'",
  );
  const pronunciationOverride = allowPronunciationOverride
    ? ENGLISH_CRT_PRONUNCIATION_OVERRIDES[
        normalizedPronunciationLookupText ?? wordText
      ] ?? ENGLISH_CRT_PRONUNCIATION_OVERRIDES[wordText]
    : undefined;
  if (pronunciationOverride && word.length > 0) {
    const pronunciationCharacters =
      normalizedCrtSpeechCharacters(pronunciationOverride);
    const lastWordIndex = word.length - 1;
    const lastPronunciationIndex = pronunciationCharacters.length - 1;
    const remappedPronunciation = pronunciationCharacters.map(
      ({ character }, index) => {
        const sourceIndex =
          lastPronunciationIndex <= 0
            ? 0
            : Math.round((index * lastWordIndex) / lastPronunciationIndex);
        const sourceCharacter = word[sourceIndex] ?? word[0]!;
        return {
          character,
          sourceStart: sourceCharacter.sourceStart,
          sourceEnd: sourceCharacter.sourceEnd,
        };
      },
    );
    return englishCrtWordVisemeBeats(remappedPronunciation, false);
  }
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
    const vowelRule = englishCrtVowelRuleAt(wordCharacters, index, options);
    if (vowelRule) {
      appendEnglishCrtRule(beats, vowelRule, word, index);
      index += vowelRule.length;
      continue;
    }

    const currentSourceCharacter = word[index];
    if (!currentSourceCharacter) break;
    const current = currentSourceCharacter.character;
    const pair = `${current}${wordCharacters[index + 1] ?? ""}`;
    const digit = Number.parseInt(current, 10);
    if (/\d/u.test(current) && Number.isInteger(digit)) {
      const pronunciation = ENGLISH_CRT_DIGIT_PRONUNCIATIONS[digit] ?? "";
      const digitBeats = englishCrtWordVisemeBeats(
        normalizedCrtSpeechCharacters(pronunciation).map((entry) => ({
          ...entry,
          sourceStart: currentSourceCharacter.sourceStart,
          sourceEnd: currentSourceCharacter.sourceEnd,
        })),
      );
      beats.push(
        ...digitBeats.map((beat) => ({
          ...beat,
          sourceStart: currentSourceCharacter.sourceStart,
          sourceEnd: currentSourceCharacter.sourceEnd,
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
        sourceStart: currentSourceCharacter.sourceStart,
        sourceEnd: currentSourceCharacter.sourceEnd,
        durationUnits: 1,
        kind: "vowel",
      });
      index += 1;
      continue;
    }

    let length = 1;
    let shape: ZenLiveBotMouthShape;
    let durationUnits = ENGLISH_CRT_CONSONANT_HOLD_UNITS;
    if (
      index === 0 &&
      /^(kn|wr|gn|ps|pn|pt)$/u.test(pair)
    ) {
      index += 1;
      continue;
    }
    if (
      (pair === "gh" && index > 0) ||
      (current === "b" &&
        index === word.length - 1 &&
        wordCharacters[index - 1] === "m")
    ) {
      index += pair === "gh" ? 2 : 1;
      continue;
    }
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
    } else if (/^(sh|ch|zh|ng|ck)$/u.test(pair)) {
      length = 2;
      shape =
        englishCrtNextVowelShape(
          wordCharacters,
          index + length,
          options,
        ) ??
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
        englishCrtNextVowelShape(wordCharacters, index + 1, options) ??
        "open-small";
      if (current === "h") durationUnits = 0.48;
    }
    const lastSourceCharacter =
      word[index + length - 1] ?? currentSourceCharacter;
    beats.push({
      shape,
      sourceStart: currentSourceCharacter.sourceStart,
      sourceEnd: lastSourceCharacter.sourceEnd,
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
    const current = characters[index];
    if (!current) break;
    if (/[\p{L}\p{N}]/u.test(current.character)) {
      let end = index + 1;
      while (
        end < characters.length &&
        (/[\p{L}\p{N}]/u.test(characters[end]?.character ?? "") ||
          (/[’']/u.test(characters[end]?.character ?? "") &&
            /[\p{L}\p{N}]/u.test(
              characters[end + 1]?.character ?? "",
            )))
      ) {
        end += 1;
      }
      const wordSourceCharacters = characters.slice(index, end);
      beats.push(
        ...englishCrtWordVisemeBeats(
          wordSourceCharacters
            .filter(({ character }) => /[\p{L}\p{N}]/u.test(character)),
          true,
          wordSourceCharacters.map(({ character }) => character).join(""),
        ),
      );
      index = end;
      continue;
    }
    if (/[’']/u.test(current.character)) {
      index += 1;
      continue;
    }
    beats.push({
      shape: "closed",
      sourceStart: current.sourceStart,
      sourceEnd: current.sourceEnd,
      durationUnits: englishCrtRestDurationUnits(current.character),
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
  cursorProgress = 0,
}: {
  text: string;
  cursorIndex: number;
  cursorProgress?: number;
}): ZenLiveBotMouthShape {
  const characters = normalizedCrtSpeechCharacters(text);
  if (characters.length === 0) return "closed";
  const sourceCharacterCount = Array.from(text).length;
  const safeCursorIndex = Math.max(
    0,
    Math.min(
      Math.max(0, sourceCharacterCount - 1),
      Math.floor(Number.isFinite(cursorIndex) ? cursorIndex : 0),
    ),
  );
  const beats = englishCrtVisemeTimeline(text);
  const coveringBeats = beats.filter(
    (beat) =>
      safeCursorIndex >= beat.sourceStart && safeCursorIndex < beat.sourceEnd,
  );
  if (coveringBeats.length > 0) {
    const safeCursorProgress = Math.min(
      0.999_999,
      Math.max(
        0,
        Number.isFinite(cursorProgress) ? cursorProgress : 0,
      ),
    );
    return englishCrtVisemeShapeAtUnit(
      coveringBeats,
      safeCursorProgress *
        englishCrtVisemeTimelineDurationUnits(coveringBeats),
    );
  }
  for (let index = beats.length - 1; index >= 0; index -= 1) {
    const beat = beats[index]!;
    if (beat.sourceEnd <= safeCursorIndex + 1) return beat.shape;
  }
  return (
    beats.find((beat) => beat.sourceStart >= safeCursorIndex)?.shape ?? "closed"
  );
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
  const safeCharactersPerPhase = Math.max(
    1,
    Math.floor(
      Number.isFinite(charactersPerPhase) ? charactersPerPhase : 1,
    ),
  );
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
    if (safeElapsedMs >= durationMs) return "closed";
    const progress = Math.min(0.999_999, safeElapsedMs / durationMs);
    return englishCrtVisemeShapeAtUnit(beats, progress * durationUnits);
  }
  const safePhaseMs = Math.max(
    1,
    Number.isFinite(phaseMs) ? phaseMs : ZEN_LIVE_MOUTH_PHASE_MS,
  );
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

  const characters: string[] = [];
  const characterStartTimesSeconds: number[] = [];
  const characterEndTimesSeconds: number[] = [];
  let previousStart = 0;
  let alignmentEndSeconds = 0;
  for (let index = 0; index < count; index += 1) {
    const characterChunk = alignment.characters[index];
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof characterChunk !== "string" ||
      Array.from(characterChunk).length === 0 ||
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart
    ) {
      return fallback();
    }
    const chunkCharacters = Array.from(characterChunk);
    for (const [chunkIndex, character] of chunkCharacters.entries()) {
      const chunkStart =
        start + ((end - start) * chunkIndex) / chunkCharacters.length;
      const chunkEnd =
        start + ((end - start) * (chunkIndex + 1)) / chunkCharacters.length;
      characters.push(character);
      characterStartTimesSeconds.push(chunkStart);
      characterEndTimesSeconds.push(chunkEnd);
    }
    previousStart = start;
    alignmentEndSeconds = Math.max(alignmentEndSeconds, end);
  }
  if (
    characters.length === 0 ||
    alignmentEndSeconds <= 0 ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return fallback();
  }

  const safeElapsedMs = Math.max(
    0,
    Number.isFinite(elapsedMs) ? elapsedMs : 0,
  );
  const providerElapsedSeconds =
    (Math.min(durationMs, safeElapsedMs) / durationMs) *
    alignmentEndSeconds;
  if (
    providerElapsedSeconds <
    (characterStartTimesSeconds[0] ?? Number.POSITIVE_INFINITY)
  ) {
    return "closed";
  }
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (
      (characterStartTimesSeconds[middle] ?? Number.POSITIVE_INFINITY) <=
      providerElapsedSeconds
    ) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const cursorIndex = Math.max(0, low - 1);
  if (safeElapsedMs >= durationMs) {
    return "closed";
  }
  const currentCharacterEndSeconds =
    characterEndTimesSeconds[cursorIndex] ?? alignmentEndSeconds;
  if (providerElapsedSeconds >= currentCharacterEndSeconds) {
    // Mid-phrase gap: close. Trailing audio after the final character: hold
    // the last mouth shape so the closing vowel/consonant is not swallowed.
    if (cursorIndex < characters.length - 1) {
      return "closed";
    }
  }
  // After the final letter, hold that phoneme through trailing whitespace or
  // alignment silence so the closing vowel/consonant is not swallowed.
  let shapeCursorIndex = cursorIndex;
  const hasLaterLetter = characters
    .slice(cursorIndex + 1)
    .some((character) => /[\p{L}\p{N}]/u.test(character));
  if (
    !hasLaterLetter &&
    !/[\p{L}\p{N}]/u.test(characters[shapeCursorIndex] ?? "")
  ) {
    for (let index = shapeCursorIndex; index >= 0; index -= 1) {
      if (/[\p{L}\p{N}]/u.test(characters[index] ?? "")) {
        shapeCursorIndex = index;
        break;
      }
    }
  }
  const characterStartSeconds =
    characterStartTimesSeconds[shapeCursorIndex] ?? providerElapsedSeconds;
  const characterEndSeconds =
    characterEndTimesSeconds[shapeCursorIndex] ?? characterStartSeconds;
  const cursorProgress =
    characterEndSeconds > characterStartSeconds
      ? Math.min(
          1,
          Math.max(
            0,
            (providerElapsedSeconds - characterStartSeconds) /
              (characterEndSeconds - characterStartSeconds),
          ),
        )
      : 0;
  return crtSpeechMouthShapeAtTextCursor({
    text: characters.join(""),
    cursorIndex: shapeCursorIndex,
    cursorProgress,
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
  const safeCharactersPerPhase = Math.max(
    1,
    Math.floor(
      Number.isFinite(charactersPerPhase) ? charactersPerPhase : 1,
    ),
  );
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
