const CONTINUATION_MAX_TOKENS = 80;
const MIN_CLAUSE_LEFT_TOKENS = 4;
const MIN_CLAUSE_RIGHT_TOKENS = 3;

const COMMON_PERIOD_ABBREVIATIONS = new Set([
  "co.",
  "dr.",
  "e.g.",
  "etc.",
  "fig.",
  "i.e.",
  "inc.",
  "jr.",
  "ltd.",
  "mr.",
  "mrs.",
  "ms.",
  "no.",
  "prof.",
  "sr.",
  "st.",
  "vs.",
]);
const COORDINATING_CONJUNCTIONS = new Set([
  "and",
  "but",
  "for",
  "nor",
  "or",
  "so",
  "yet",
]);
const INTRODUCTORY_CLAUSE_OPENERS = new Set([
  "after",
  "although",
  "as",
  "because",
  "before",
  "if",
  "once",
  "since",
  "though",
  "unless",
  "until",
  "when",
  "whenever",
  "where",
  "wherever",
  "while",
]);
const RELATIVE_CLAUSE_OPENERS = new Set([
  "which",
  "who",
  "whom",
  "whose",
]);
const CLAUSE_SUBJECT_WORDS = new Set([
  "he",
  "her",
  "hers",
  "i",
  "it",
  "nobody",
  "nothing",
  "one",
  "she",
  "somebody",
  "someone",
  "something",
  "that",
  "they",
  "we",
  "what",
  "who",
  "you",
]);

export interface LocalVoiceStreamSplitOptions {
  /** Restrained punctuation boundaries are for Kokoro / PRISM Voice Pack only. */
  punctuationPacing?: boolean;
}

type PunctuationBoundaryKind = "comma" | "clause" | "strong";

function tokenCore(word: string): string {
  return word.replace(/["'”’)[\]]+$/gu, "");
}

function normalizedWord(word: string): string {
  return tokenCore(word)
    .replace(/^[^\p{L}\p{N}]+/gu, "")
    .replace(/[^\p{L}\p{N}]+$/gu, "")
    .toLocaleLowerCase("en-US");
}

function periodEndsAbbreviation(word: string): boolean {
  const core = tokenCore(word).toLocaleLowerCase("en-US");
  return (
    COMMON_PERIOD_ABBREVIATIONS.has(core) ||
    /^\p{L}\.$/u.test(core) ||
    /^(?:\p{L}\.){2,}$/u.test(core)
  );
}

function punctuationBoundaryKind(word: string): PunctuationBoundaryKind | null {
  const core = tokenCore(word);
  if (/(?:\.{3,}|…+)$/u.test(core) || /[!?]+$/u.test(core)) return "strong";
  if (/\.$/u.test(core)) {
    return periodEndsAbbreviation(word) ? null : "strong";
  }
  if (/,$/u.test(core)) return "comma";
  if (/[;:—–]$/u.test(core)) return "clause";
  return null;
}

function tokensUntilNextBoundary(
  words: readonly string[],
  start: number,
): number {
  let count = 0;
  for (let index = start; index < words.length; index += 1) {
    count += 1;
    if (punctuationBoundaryKind(words[index]!) !== null) break;
  }
  return count;
}

function commaIsMeaningfulClauseBoundary(args: {
  words: readonly string[];
  index: number;
  chunkStart: number;
}): boolean {
  const leftTokens = args.index - args.chunkStart + 1;
  const rightTokens = tokensUntilNextBoundary(args.words, args.index + 1);
  if (
    leftTokens < MIN_CLAUSE_LEFT_TOKENS ||
    rightTokens < MIN_CLAUSE_RIGHT_TOKENS
  ) {
    return false;
  }

  const currentWords = args.words.slice(args.chunkStart, args.index);
  const hasEarlierComma = currentWords.some(
    (word) => punctuationBoundaryKind(word) === "comma",
  );
  const firstWord = normalizedWord(args.words[args.chunkStart] ?? "");
  const nextWord = normalizedWord(args.words[args.index + 1] ?? "");
  const firstContinuationWord = normalizedWord(
    args.words[args.index + 2] ?? "",
  );
  const coordinatorStartsClause =
    CLAUSE_SUBJECT_WORDS.has(firstContinuationWord) ||
    /ly$/u.test(firstContinuationWord);

  // A single comma before a coordinating continuation is the conservative
  // general case. A previous comma makes this look like a list/Oxford comma.
  if (
    !hasEarlierComma &&
    COORDINATING_CONJUNCTIONS.has(nextWord) &&
    coordinatorStartsClause
  ) {
    return true;
  }

  // Long introductory dependent clauses and nonrestrictive relative clauses
  // carry a real grammatical turn without treating short interjections as one.
  if (!hasEarlierComma && INTRODUCTORY_CLAUSE_OPENERS.has(firstWord)) {
    return true;
  }
  return RELATIVE_CLAUSE_OPENERS.has(nextWord);
}

function clauseMarkIsMeaningfulBoundary(args: {
  words: readonly string[];
  index: number;
  chunkStart: number;
}): boolean {
  return (
    args.index - args.chunkStart + 1 >= MIN_CLAUSE_LEFT_TOKENS &&
    tokensUntilNextBoundary(args.words, args.index + 1) >=
      MIN_CLAUSE_RIGHT_TOKENS
  );
}

/**
 * Splits completed local speech into deterministic synthesis windows.
 *
 * Kokoro gets strong-stop boundaries plus guarded linguistic clause cuts.
 * System/Babble callers can disable punctuation pacing and retain only the
 * <=80-token safety fallback. No whitespace or punctuation is invented, so
 * canonical source spans remain valid for reveal, mouth, and interruption.
 */
export function splitLocalVoiceStreamText(
  text: string,
  options: LocalVoiceStreamSplitOptions = {},
): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let chunkStart = 0;
  const punctuationPacing = options.punctuationPacing ?? true;

  const commit = (nextWordIndex: number) => {
    const value = current.join(" ").trim();
    if (value) chunks.push(value);
    current = [];
    chunkStart = nextWordIndex;
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    current.push(word);
    const boundaryKind = punctuationPacing
      ? punctuationBoundaryKind(word)
      : null;
    const punctuationBoundary =
      boundaryKind === "strong" ||
      (boundaryKind === "comma" &&
        commaIsMeaningfulClauseBoundary({ words, index, chunkStart })) ||
      (boundaryKind === "clause" &&
        clauseMarkIsMeaningfulBoundary({ words, index, chunkStart }));
    if (punctuationBoundary || current.length >= CONTINUATION_MAX_TOKENS) {
      commit(index + 1);
    }
  }
  commit(words.length);
  return chunks;
}

export function splitLocalVoiceStreamSegments(
  text: string,
  sourceOffset = 0,
  options: LocalVoiceStreamSplitOptions = {},
): Array<{ text: string; sourceStart: number; sourceEnd: number }> {
  const chunks = splitLocalVoiceStreamText(text, options);
  const words = [...text.matchAll(/\S+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  let wordCursor = 0;
  return chunks.map((chunk) => {
    const tokenCount = chunk.split(/\s+/u).filter(Boolean).length;
    const first = words[wordCursor];
    const last = words[wordCursor + tokenCount - 1];
    wordCursor += tokenCount;
    return {
      text: chunk,
      sourceStart: sourceOffset + (first?.start ?? 0),
      sourceEnd: sourceOffset + (last?.end ?? text.length),
    };
  });
}
