export interface MemoryCandidate {
  text: string;
  confidence: number;
}

export interface MemoryRetractionCue {
  cuePhrase: string;
}

export type MemoryIntent =
  | {
      kind: "create";
      candidates: MemoryCandidate[];
      scope: "bot" | "global";
      explicit: boolean;
    }
  | {
      kind: "retract";
      cuePhrase: string;
      cuePhrases: string[];
    }
  | {
      kind: "correct";
      cuePhrase: string;
      cuePhrases: string[];
      newCandidates: MemoryCandidate[];
      scope: "bot" | "global";
      explicit: boolean;
    };

const HIGH_CONFIDENCE_MEMORY_CUES = [
  "don't forget",
  "do not forget",
  "please remember",
  "remember this",
  "remember that",
  "keep in mind",
  "make a note",
  "please don't",
  "please do not",
] as const;

const HIGH_CONFIDENCE_CUE_FILLER_WORDS = new Set([
  "ok",
  "okay",
  "but",
  "and",
  "also",
  "please",
  "that",
  "this",
  "it",
  "to",
  "me",
]);

function hasSubstantiveHighConfidenceMemory(lower: string): boolean {
  const cue = HIGH_CONFIDENCE_MEMORY_CUES.find((candidate) =>
    lower.includes(candidate)
  );
  if (!cue) return false;

  const remainder = lower
    .replace(cue, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !HIGH_CONFIDENCE_CUE_FILLER_WORDS.has(word));

  return remainder.length > 0;
}

const MEMORY_CUE_PREFIX_PATTERN_RAW =
  /^(?:please[\s,]+)?(?:(?:do\s+not|don't)[\s,]+forget(?:[\s,]+that)?|remember(?:[\s,]+(?:that|this))?|please[\s,]+remember|keep[\s,]+in[\s,]+mind(?:[\s,]+that)?|make[\s,]+a[\s,]+note(?:[\s,]+that)?|actually(?:[\s,]+|$)|correction:?\s*|scratch[\s,]+that(?:[\s,]+|$))[\s,:]*/i;

const GLOBAL_SCOPE_PATTERNS = [
  /\b(?:save|remember)\s+(?:this|that|it)\s+globally\b/i,
  /\b(?:save|remember)\s+(?:this|that|it)\s+to\s+prism\b/i,
  /\bmake\s+(?:this|that|it)\s+a\s+global\s+memory\b/i,
  /\bprism\s+should\s+remember\b/i,
  /\bglobal\s+memory\b/i,
  /\bremember\s+globally\b/i,
] as const;

const RETRACTION_PATTERNS = [
  /\bforget\s+(?:what\s+i\s+said\s+(?:about\s+.+)?|that|the\s+.+|.+)\b/i,
  /\bnever\s?mind\s+(?:what\s+i\s+said\s+(?:about\s+.+)?|about\s+.+|that)\b/i,
  /\bignore\s+(?:that|what\s+i\s+said|the\s+.+)\b/i,
  /\bthat(?:'s| is)\s+not\s+(?:right|true|correct)\b/i,
] as const;

const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\bi\s+changed\s+my\s+mind\b/i,
  /\bcorrection:?\b/i,
  /\bscratch\s+that\b/i,
] as const;

const GLOBAL_SCOPE_CUE_REMOVALS = [
  /\b(?:save|remember)\s+(?:this|that|it)\s+globally\b/gi,
  /\b(?:save|remember)\s+(?:this|that|it)\s+to\s+prism\b/gi,
  /\bmake\s+(?:this|that|it)\s+a\s+global\s+memory\b/gi,
  /\bprism\s+should\s+remember(?:\s+that)?\b/gi,
  /\b(?:as\s+)?a\s+global\s+memory\b/gi,
  /\bremember\s+globally\b/gi,
] as const;

const FIRST_PERSON_REWRITES: Array<[RegExp, string]> = [
  [/\bI'm\b/gi, "you're"],
  [/\bI am\b/gi, "you are"],
  [/\bI've\b/gi, "you've"],
  [/\bI'll\b/gi, "you'll"],
  [/\bI'd\b/gi, "you'd"],
  [/\bI\b/gi, "you"],
  [/\bmyself\b/gi, "yourself"],
  [/\bmy\b/gi, "your"],
  [/\bmine\b/gi, "yours"],
];

const TRAILING_CONVERSATIONAL_TAG_PATTERN =
  /\s*,\s*(?:(?:(?:do|don't|did|didn't|would|wouldn't|could|couldn't|can|can't|will|won't|are|aren't|is|isn't|was|wasn't|were|weren't|have|haven't|has|hasn't|had|hadn't|should|shouldn't)\s+(?:you|we|they|it|he|she))|right|yeah|yes|no|okay|ok|you know)\s*$/i;

const TASK_REQUEST_PREFIX_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summarize|summarise|explain|help|help\s+me|give\s+me|show\s+me|tell\s+me|find|search|look\s+up|translate|rewrite|edit|review|fix|debug|build|plan)\b/i;

/**
 * Normalize a raw user statement into a concise second-person memory line.
 * Strips conversational cue prefixes (e.g. "Don't forget that") and rewrites
 * first-person pronouns to second-person so the bot's stored recall reads
 * naturally as a fact about the user (e.g. "You like cheese.").
 */
export function rewriteMemoryText(rawLine: string): string {
  let text = rawLine.trim().replace(MEMORY_CUE_PREFIX_PATTERN_RAW, "");
  text = stripGlobalScopeCues(text);
  text = text.replace(/^please[\s,]+/i, "");
  text = text.replace(TRAILING_CONVERSATIONAL_TAG_PATTERN, "").trim();
  for (const [pattern, replacement] of FIRST_PERSON_REWRITES) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
  if (text.length === 0) return rawLine.trim();
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

function splitMemorySentences(message: string): string[] {
  return message
    .split(/[.!?\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function stripGlobalScopeCues(line: string): string {
  let stripped = line;
  for (const pattern of GLOBAL_SCOPE_CUE_REMOVALS) {
    stripped = stripped.replace(pattern, " ");
  }
  return stripped.replace(/\s+/g, " ").trim();
}

function hasGlobalScopeCue(message: string): boolean {
  return GLOBAL_SCOPE_PATTERNS.some((pattern) => pattern.test(message));
}

function isRetractionCue(line: string): boolean {
  if (/\b(?:do\s+not|don't|please\s+don't|please\s+do\s+not)\s+forget\b/i.test(line)) {
    return false;
  }
  return RETRACTION_PATTERNS.some((pattern) => pattern.test(line));
}

function isCorrectionCue(line: string): boolean {
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(line));
}

function isTaskRequest(line: string): boolean {
  return TASK_REQUEST_PREFIX_PATTERN.test(line.trim());
}

function extractMemoryCandidatesFromLines(lines: string[]): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  for (const line of lines) {
    const cleanLine = stripGlobalScopeCues(line);
    if (cleanLine.length <= 12) continue;

    const lower = line.toLowerCase();
    const hasHighConfidenceCue = hasSubstantiveHighConfidenceMemory(lower);
    if (!hasHighConfidenceCue && isTaskRequest(cleanLine)) {
      continue;
    }
    const looksPersonal =
      hasHighConfidenceCue ||
      lower.includes("i am") ||
      lower.includes("i'm") ||
      lower.includes("my ") ||
      lower.includes("i prefer") ||
      lower.includes("i like") ||
      lower.includes("i love") ||
      lower.includes("i enjoy") ||
      lower.includes("i want") ||
      lower.includes("i need") ||
      lower.includes("i use") ||
      lower.includes("i dislike");
    if (!looksPersonal) {
      continue;
    }
    const confidence = hasHighConfidenceCue
      ? 0.98
      : Math.min(0.95, 0.55 + cleanLine.length / 220);
    const text = rewriteMemoryText(cleanLine);
    if (text.length === 0) continue;
    candidates.push({ text, confidence: Number(confidence.toFixed(2)) });
  }
  return candidates.slice(0, 3);
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  return extractMemoryCandidatesFromLines(
    splitMemorySentences(message).filter((line) => !isRetractionCue(line))
  );
}

export function analyzeMemoryIntent(message: string): MemoryIntent {
  const lines = splitMemorySentences(message);
  const scope: "bot" | "global" = hasGlobalScopeCue(message) ? "global" : "bot";
  const cuePhrases = lines.filter(isRetractionCue);
  const candidateLines = lines.filter((line) => !isRetractionCue(line));
  const newCandidates = extractMemoryCandidatesFromLines(candidateLines);
  const hasCorrection = candidateLines.some(isCorrectionCue);
  const explicit = scope === "global" || candidateLines.some((line) =>
    hasSubstantiveHighConfidenceMemory(line.toLowerCase())
  );

  if (cuePhrases.length > 0 && (hasCorrection || newCandidates.length > 0)) {
    return {
      kind: "correct",
      cuePhrase: cuePhrases[0],
      cuePhrases,
      newCandidates,
      scope,
      explicit: true,
    };
  }

  if (cuePhrases.length > 0) {
    return {
      kind: "retract",
      cuePhrase: cuePhrases[0],
      cuePhrases,
    };
  }

  return {
    kind: "create",
    candidates: newCandidates,
    scope,
    explicit,
  };
}
