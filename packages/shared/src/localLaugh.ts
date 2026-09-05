export const BOT_LOCAL_LAUGH_SYLLABLE_MAX_LENGTH = 4;
export const BOT_LOCAL_LAUGH_DELIMITER_MAX_LENGTH = 1;

export type BotLocalLaughIntensity = "soft" | "medium" | "hard";

/** Normalize one authored alphabetic laugh syllable without inventing a value. */
export function normalizeBotLocalLaughSyllable(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase();
  return /^\p{L}{1,4}$/u.test(normalized) ? normalized : fallback;
}

/** Keep authored laugh separators compact and safe for a single TTS phrase. */
export function normalizeBotLocalLaughDelimiter(
  value: unknown,
  fallback = "-",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.normalize("NFKC");
  if (normalized === "") return "";
  return /^[\x20-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]$/u.test(normalized)
    ? normalized
    : fallback;
}

export function botLocalLaughIntensityForCue(
  cue: unknown,
  modifiers: readonly string[] = [],
): BotLocalLaughIntensity {
  const normalized =
    typeof cue === "string"
      ? cue.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim()
      : "";
  if (
    modifiers.includes("loud") ||
    /\b(?:hard|loud|uproar(?:ious|iously)?|uncontrollably|hysteric(?:al|ally)?|wildly|heartily|howl(?:s|ing)?|roar(?:s|ing)?|burst(?:s|ing)? out)\b/u.test(
      normalized,
    )
  ) {
    return "hard";
  }
  if (
    modifiers.some((modifier) =>
      ["soft", "brief", "dry", "restrained", "nervous"].includes(modifier),
    ) ||
    /\b(?:chuckl\w*|snicker\w*|soft(?:ly)?|quiet(?:ly)?|under (?:their|his|her|its) breath)\b/u.test(
      normalized,
    )
  ) {
    return "soft";
  }
  return "medium";
}

export function botLocalLaughSynthesisText(args: {
  syllable: unknown;
  delimiter?: unknown;
  intensity: BotLocalLaughIntensity;
}): string | null {
  const syllable = normalizeBotLocalLaughSyllable(args.syllable);
  if (!syllable) return null;
  const delimiter = normalizeBotLocalLaughDelimiter(args.delimiter);
  const repetitions =
    args.intensity === "soft" ? 2 : args.intensity === "hard" ? 7 : 4;
  return Array.from({ length: repetitions }, () => syllable).join(delimiter);
}

const RAW_WRITTEN_LAUGH_PATTERN =
  /(^|[^\p{L}])((?:ha){2,}h?|(?:he){2,}h?|(?:hi){2,}h?|(?:ho){2,}h?|(?:hu){2,}h?)(?=$|[^\p{L}])/giu;

/**
 * Project contiguous written laughter into bounded, collision-friendly local
 * synthesis text. The visible/canonical source string remains untouched.
 */
export function projectLocalWrittenLaughterForSynthesis(
  value: unknown,
  authoredSyllable?: unknown,
  authoredDelimiter?: unknown,
): string {
  if (typeof value !== "string" || !value) return "";
  const authored = normalizeBotLocalLaughSyllable(authoredSyllable);
  const delimiter = normalizeBotLocalLaughDelimiter(authoredDelimiter);
  return value.replace(
    RAW_WRITTEN_LAUGH_PATTERN,
    (_match, prefix: string, run: string) => {
      const normalizedRun = run.toLocaleLowerCase();
      const inferred = normalizedRun.startsWith("he")
        ? "he"
        : normalizedRun.startsWith("hi")
          ? "hi"
          : normalizedRun.startsWith("ho")
            ? "ho"
            : normalizedRun.startsWith("hu")
              ? "hu"
              : "ha";
      const sourceRepetitions = Math.max(
        2,
        Math.round(normalizedRun.length / 2),
      );
      const repetitions = Math.min(7, sourceRepetitions);
      const syllable = authored ?? inferred;
      return `${prefix}${Array.from({ length: repetitions }, () => syllable).join(delimiter)}`;
    },
  );
}

/** Provider laughter tags Premium may hand back, in any bracket casing. */
const PREMIUM_LAUGH_TAG_WORDS =
  /\b(?:laugh\w*|chuckl\w*|giggl\w*|snicker\w*|cackl\w*|guffaw\w*|titter\w*)\b/iu;

const PREMIUM_TAG_SPLIT_PATTERN = /(\[[^\[\]\r\n]{1,48}\])/gu;

/**
 * Project one Premium line onto the authored laugh recipe. Premium laughter
 * normally arrives as a provider audio tag rather than written syllables, so
 * parity with Instant TTS means answering both: a laughter tag becomes the
 * authored phrase at the intensity its own wording implies, and written
 * laughter in the prose is projected exactly as the local lane projects it.
 * Non-laughter tags are untouched, so `[sighs]` still reaches the provider.
 * Returns the input unchanged when no laugh syllable is authored.
 */
export function projectPremiumLaughterForSynthesis(
  value: unknown,
  authoredSyllable?: unknown,
  authoredDelimiter?: unknown,
): string {
  if (typeof value !== "string" || !value) return "";
  const authored = normalizeBotLocalLaughSyllable(authoredSyllable);
  if (!authored) return value;
  const delimiter = normalizeBotLocalLaughDelimiter(authoredDelimiter);
  return value
    .split(PREMIUM_TAG_SPLIT_PATTERN)
    .map((segment, index) => {
      if (index % 2 === 0) {
        return projectLocalWrittenLaughterForSynthesis(
          segment,
          authored,
          delimiter,
        );
      }
      const body = segment.slice(1, -1);
      if (!PREMIUM_LAUGH_TAG_WORDS.test(body)) return segment;
      return (
        botLocalLaughSynthesisText({
          syllable: authored,
          delimiter,
          intensity: botLocalLaughIntensityForCue(body),
        }) ?? segment
      );
    })
    .join("")
    .replace(/[^\S\r\n]{2,}/gu, " ")
    .trim();
}
