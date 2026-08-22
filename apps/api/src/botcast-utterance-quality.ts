/**
 * Signal sanitizer quality checks: screenplay leaks, repeated answers,
 * generic host stalls, and producer-cue delivery.
 *
 * These helpers decide when a generated line is unusable on air and should
 * be replaced with a deterministic recovery line. They do not generate copy.
 */

/** Markdown or labeled screenplay scaffolding that must never reach captions. */
const BOTCAST_SCREENPLAY_LABEL_NAMES =
  "(?:action|spoken\\s+line|stage\\s+direction|parenthetical|dialogue)";
export const BOTCAST_SCREENPLAY_LABEL_PATTERN = new RegExp(
  String.raw`(?:\*{1,2}|_{1,2})\s*${BOTCAST_SCREENPLAY_LABEL_NAMES}\s*:\s*(?:\*{1,2}|_{1,2})?|(?:\*{1,2}|_{1,2})\s*${BOTCAST_SCREENPLAY_LABEL_NAMES}\s*(?:\*{1,2}|_{1,2})\s*:`,
  "iu",
);

const BOTCAST_GENERIC_HOST_STALL_PATTERNS = [
  /^what would you like to (?:explore|talk about|discuss) next\??$/iu,
  /^what do you (?:want to|wanna) (?:talk about|discuss|explore)(?: next)?\??$/iu,
  /^where (?:should|do) we go from here\??$/iu,
  /^what should we (?:talk about|discuss|explore) next\??$/iu,
  /^(?:the signal is clear(?: that)?\s+)?we need to (?:move|go) forward[.!?]?$/iu,
  /^(?:let(?:'s| us)|time to) (?:move|go) (?:this |the conversation )?forward[.!?]?$/iu,
  /^this is (?:hopeful|interesting|important|the end|enough|clear|good|bad|true|false|complicated|difficult)[.!?]?$/iu,
] as const;

const BOTCAST_GENERIC_GUEST_STALL_PATTERNS = [
  /^(?:that|this|it) (?:is|feels|seems) [^.!?…]{1,48}[.!?…]?$/iu,
  /^I mean,? (?:it(?:['’]s| is)|this is|that is) (?:over|done|finished|the end)[.!?…]?$/iu,
] as const;

const BOTCAST_DUPLICATE_MIN_WORDS = 8;
const BOTCAST_DUPLICATE_PREFIX_MIN_WORDS = 12;
const BOTCAST_DUPLICATE_PREFIX_RATIO = 0.55;
const BOTCAST_DUPLICATE_JACCARD_MIN_WORDS = 12;
const BOTCAST_DUPLICATE_JACCARD_RATIO = 0.88;

const BOTCAST_CUE_STOPWORDS = new Set([
  "about",
  "after",
  "because",
  "before",
  "being",
  "could",
  "doing",
  "does",
  "from",
  "have",
  "herself",
  "himself",
  "into",
  "itself",
  "just",
  "like",
  "more",
  "most",
  "only",
  "other",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "very",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "yours",
]);

const BOTCAST_CUE_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  [
    "repeat",
    "repeats",
    "repeated",
    "repeating",
    "again",
    "loop",
    "looping",
    "verbatim",
    "echo",
    "echoing",
  ],
];

function spokenForQualityCheck(value: string): string {
  return value
    .replace(/\[[^\]]{1,64}\]/gu, " ")
    .replace(/\*[^*\n]{1,160}\*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function normalizeForDuplicate(value: string): string {
  return spokenForQualityCheck(value)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function words(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function stemCueWord(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ing$/u, "")
    .replace(/ed$/u, "")
    .replace(/ies$/u, "y")
    .replace(/es$/u, "")
    .replace(/s$/u, "");
}

function expandCueTokens(source: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of words(normalizeForDuplicate(source))) {
    if (word.length < 4 || BOTCAST_CUE_STOPWORDS.has(word)) continue;
    const stemmed = stemCueWord(word);
    tokens.add(word);
    tokens.add(stemmed);
    for (const group of BOTCAST_CUE_SYNONYM_GROUPS) {
      if (group.includes(word) || group.includes(stemmed)) {
        for (const member of group) {
          tokens.add(member);
          tokens.add(stemCueWord(member));
        }
      }
    }
  }
  return tokens;
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;
  for (const word of leftSet) {
    if (rightSet.has(word)) overlap += 1;
  }
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : overlap / union;
}

function isPrefixNearDuplicate(left: string, right: string): boolean {
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (words(shorter).length < BOTCAST_DUPLICATE_PREFIX_MIN_WORDS) return false;
  return (
    longer.startsWith(shorter) &&
    shorter.length / longer.length >= BOTCAST_DUPLICATE_PREFIX_RATIO
  );
}

/** True when the draft still contains labeled Action / Spoken Line scaffolding. */
export function botcastUtteranceContainsScreenplayLabels(value: string): boolean {
  return BOTCAST_SCREENPLAY_LABEL_PATTERN.test(value);
}

/** True when a host line is a generic stall instead of an interview question. */
export function botcastHostUtteranceIsGenericStall(value: string): boolean {
  const spoken = spokenForQualityCheck(value).replace(/["'”’]+$/u, "");
  return BOTCAST_GENERIC_HOST_STALL_PATTERNS.some((pattern) =>
    pattern.test(spoken),
  );
}

/** True when an ordinary host turn fails to return the floor with a question. */
export function botcastHostUtteranceNeedsInterviewQuestion(
  value: string,
): boolean {
  const spoken = spokenForQualityCheck(value);
  return Boolean(spoken) && !/\?\s*["”'’)]*$/u.test(spoken);
}

/** True when a primary guest turn is only a vague reaction or sign-off. */
export function botcastGuestUtteranceIsGenericStall(value: string): boolean {
  const spoken = spokenForQualityCheck(value).replace(/["'”’]+$/u, "");
  return BOTCAST_GENERIC_GUEST_STALL_PATTERNS.some((pattern) =>
    pattern.test(spoken),
  );
}

/**
 * True when this speaker is re-airing a recent line instead of advancing.
 * Short backchannels and Power-forced repeats should not use this helper.
 */
export function botcastUtteranceIsNearDuplicate(
  content: string,
  recentSpeakerContents: readonly string[],
): boolean {
  const current = normalizeForDuplicate(content);
  const currentWords = words(current);
  if (currentWords.length < BOTCAST_DUPLICATE_MIN_WORDS) return false;
  for (const prior of recentSpeakerContents) {
    const previous = normalizeForDuplicate(prior);
    const previousWords = words(previous);
    if (previousWords.length < BOTCAST_DUPLICATE_MIN_WORDS) continue;
    if (current === previous) return true;
    if (isPrefixNearDuplicate(current, previous)) return true;
    if (
      currentWords.length >= BOTCAST_DUPLICATE_JACCARD_MIN_WORDS &&
      previousWords.length >= BOTCAST_DUPLICATE_JACCARD_MIN_WORDS &&
      jaccard(currentWords, previousWords) >= BOTCAST_DUPLICATE_JACCARD_RATIO
    ) {
      return true;
    }
  }
  return false;
}

function normalizeDirectQuote(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\p{M}+/gu, "")
    .replace(/[“”«»]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/[^\p{L}\p{N}'"]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * True when the host's aired line still carries the producer ask_about
 * subject. A complete but unrelated line is treated as undelivered.
 */
export function botcastHostTurnAddressesAskAboutCue(
  hostContent: string,
  cueDetail: string,
): boolean {
  const cueTokens = expandCueTokens(cueDetail);
  if (cueTokens.size === 0) return true;
  const hostTokens = expandCueTokens(hostContent);
  for (const token of cueTokens) {
    if (hostTokens.has(token)) return true;
  }
  return false;
}

/** True when the host spoke the producer's required on-air quote. */
export function botcastHostTurnIncludesDirectQuote(
  hostContent: string,
  directQuote: string,
): boolean {
  const quote = normalizeDirectQuote(directQuote);
  if (!quote) return true;
  return normalizeDirectQuote(hostContent).includes(quote);
}

/**
 * Direct quotes are a hard wording contract. Topic direction stays a
 * paraphrase check only when no quote was supplied.
 */
export function botcastHostTurnAddressesProducerCue(
  hostContent: string,
  cue: { detail?: string; directQuote?: string },
): boolean {
  const quote = cue.directQuote?.trim() ?? "";
  if (quote) return botcastHostTurnIncludesDirectQuote(hostContent, quote);
  return botcastHostTurnAddressesAskAboutCue(hostContent, cue.detail ?? "");
}
