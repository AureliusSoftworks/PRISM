import { type MemoryCategory, classifyMemoryCategoryFromText } from "@localai/shared";

export interface MemoryCandidate {
  text: string;
  confidence: number;
  category?: MemoryCategory;
  durability?: number;
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

const LEADING_APOLOGY_PREFIX_PATTERN =
  /^(?:sorry(?:\s+about\s+that)?|my\s+bad|apologies)[\s,.:;-]*/i;

const EXPLICIT_DISCLOSURE_PREFIX_PATTERN =
  /^(?:(?:just\s+)?(?:a\s+)?(?:fun|random)\s*[:,-]?\s*fact|funn?y\s+enough|interestingly(?:\s+enough)?|for\s+the\s+record)\s*[:,-]?\s*/i;

const TASK_REQUEST_PREFIX_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summarize|summarise|explain|help|help\s+me|give\s+me|show\s+me|tell\s+me|find|search|look\s+up|translate|rewrite|edit|review|fix|debug|build|plan)\b/i;

const FOUNDATIONAL_MEMORY_PATTERNS = [
  /\b(?:always|never|do not|don't|like|likes|love|loves|enjoy|enjoys|prefer|prefers|favorite|favourite|need|needs|want|wants|value|values|care about|cares about)\b/i,
  /\b(?:identity|personality|character|believes?|principles?|boundary|boundaries|comfort|safe|safety)\b/i,
  /\b(?:sees|treats|uses|understands)\s+.+\s+as\s+/i,
  /\b(?:born|founded|created|developed|built|grew|became|known for|signature|method|career|company|inc\.?|workshops?|instructors?|instructional|materials?|art supplies)\b/i,
] as const;

/**
 * Lightweight category inference for the memory browser. The text remains the
 * source of truth; categories are only organizational labels.
 */
export function classifyMemoryCategory(text: string): MemoryCategory {
  return classifyMemoryCategoryFromText(text);
}

export function estimateMemoryDurability(text: string, explicit = false): number {
  const normalized = text.trim();
  if (!normalized) return 0.25;
  let score = explicit ? 0.88 : 0.46;
  const durablePatternHits = FOUNDATIONAL_MEMORY_PATTERNS.reduce(
    (count, pattern) => count + (pattern.test(normalized) ? 1 : 0),
    0
  );
  const cat = classifyMemoryCategoryFromText(normalized);
  if (cat === "user") score += 0.16;
  if (cat === "bot_relation") score += 0.18;
  if (durablePatternHits > 0) {
    score += Math.min(0.44, durablePatternHits * 0.24);
  }
  if (
    /\b(?:remember|don't forget|do not forget|keep in mind|make a note)\b/i.test(normalized) ||
    /\b[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}\b/.test(normalized)
  ) {
    score += 0.3;
  }
  if (/\b(?:currently|today|right now|this moment|for now|temporarily|seems|might|maybe|probably)\b/i.test(normalized)) {
    score -= 0.22;
  }
  return Number(Math.max(0.1, Math.min(1, score)).toFixed(2));
}

/**
 * Normalize a raw user statement into a concise second-person memory line.
 * Strips conversational cue prefixes (e.g. "Don't forget that") and rewrites
 * first-person pronouns to second-person so the bot's stored recall reads
 * naturally as a fact about the user (e.g. "You like cheese.").
 */
export function rewriteMemoryText(rawLine: string): string {
  let text = rawLine.trim().replace(MEMORY_CUE_PREFIX_PATTERN_RAW, "");
  text = stripGlobalScopeCues(text);
  text = text.replace(LEADING_APOLOGY_PREFIX_PATTERN, "");
  text = text.replace(EXPLICIT_DISCLOSURE_PREFIX_PATTERN, "");
  text = text.replace(/^please[\s,]+/i, "");
  text = text.replace(TRAILING_CONVERSATIONAL_TAG_PATTERN, "").trim();
  text = rewriteAssistantDirectedMemory(text);
  for (const [pattern, replacement] of FIRST_PERSON_REWRITES) {
    text = text.replace(pattern, replacement);
  }
  text = rewriteSoftenedSelfStateMemory(text);
  text = rewriteAssistantIdentityReminderMemory(text);
  text = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
  if (text.length === 0) return rawLine.trim();
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

function rewriteAssistantDirectedMemory(text: string): string {
  let rewritten = text
    .replace(
      /^\s*I\s+do\s+not\s+want\s+you\s+to\s+/i,
      "you do not want me to "
    )
    .replace(/^\s*I\s+don't\s+want\s+you\s+to\s+/i, "you don't want me to ");
  if (/^\s*you\s+(?:do\s+not|don't)\s+want\s+me\s+to\b/i.test(rewritten)) {
    rewritten = rewritten.replace(/\bremind\s+me\b/gi, "remind you");
  }
  return rewritten;
}

function rewriteAssistantIdentityReminderMemory(text: string): string {
  return text
    .replace(
      /\byou\s+do\s+not\s+want\s+me\s+to\s+remind\s+you\s+that\s+you\s+are\s+ai\b/gi,
      "you do not want me to remind you that I am AI"
    )
    .replace(
      /\byou\s+don't\s+want\s+me\s+to\s+remind\s+you\s+that\s+you\s+are\s+ai\b/gi,
      "you don't want me to remind you that I'm AI"
    );
}

function rewriteSoftenedSelfStateMemory(text: string): string {
  return text.replace(
    /^\s*you(?:\s+are|'re)\s+just\s+distracted\b/i,
    "you seem a little distracted"
  );
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

function hasExplicitDisclosureCue(line: string): boolean {
  return EXPLICIT_DISCLOSURE_PREFIX_PATTERN.test(line.trim());
}

function extractMemoryCandidatesFromLines(lines: string[]): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  for (const line of lines) {
    const cleanLine = stripGlobalScopeCues(line);
    if (cleanLine.length <= 12) continue;

    const lower = line.toLowerCase();
    const hasHighConfidenceCue = hasSubstantiveHighConfidenceMemory(lower);
    const hasExplicitDisclosure = hasExplicitDisclosureCue(line);
    if (!hasHighConfidenceCue && isTaskRequest(cleanLine)) {
      continue;
    }
    const looksPersonal =
      hasHighConfidenceCue ||
      hasExplicitDisclosure ||
      lower.includes("i am") ||
      lower.includes("i'm") ||
      lower.includes("my ") ||
      lower.includes("i live") ||
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
      : hasExplicitDisclosure
        ? Math.max(0.9, Math.min(0.95, 0.55 + cleanLine.length / 220))
        : Math.min(0.95, 0.55 + cleanLine.length / 220);
    const text = rewriteMemoryText(cleanLine);
    if (text.length === 0) continue;
    candidates.push({
      text,
      confidence: Number(confidence.toFixed(2)),
      category: classifyMemoryCategory(text),
      durability: estimateMemoryDurability(text, hasHighConfidenceCue),
    });
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
  const explicit = scope === "global" || candidateLines.some((line) => {
    const lowerLine = line.toLowerCase();
    return hasSubstantiveHighConfidenceMemory(lowerLine) || hasExplicitDisclosureCue(line);
  });

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
