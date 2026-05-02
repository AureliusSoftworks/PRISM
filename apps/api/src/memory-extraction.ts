export interface MemoryCandidate {
  text: string;
  confidence: number;
}

const HIGH_CONFIDENCE_MEMORY_CUES = [
  "don't forget",
  "do not forget",
  "please remember",
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
  /^(?:please[\s,]+)?(?:(?:do\s+not|don't)[\s,]+forget(?:[\s,]+that)?|remember(?:[\s,]+that)?|please[\s,]+remember|keep[\s,]+in[\s,]+mind(?:[\s,]+that)?|make[\s,]+a[\s,]+note(?:[\s,]+that)?)[\s,]+/i;

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

/**
 * Normalize a raw user statement into a concise second-person memory line.
 * Strips conversational cue prefixes (e.g. "Don't forget that") and rewrites
 * first-person pronouns to second-person so the bot's stored recall reads
 * naturally as a fact about the user (e.g. "You like cheese.").
 */
export function rewriteMemoryText(rawLine: string): string {
  let text = rawLine.trim().replace(MEMORY_CUE_PREFIX_PATTERN_RAW, "");
  text = text.replace(/^please[\s,]+/i, "");
  for (const [pattern, replacement] of FIRST_PERSON_REWRITES) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim();
  if (text.length === 0) return rawLine.trim();
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  const lines = message
    .split(/[.!?\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12);
  const candidates: MemoryCandidate[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasHighConfidenceCue = hasSubstantiveHighConfidenceMemory(lower);
    const looksPersonal =
      hasHighConfidenceCue ||
      lower.includes("i am") ||
      lower.includes("i'm") ||
      lower.includes("my ") ||
      lower.includes("i prefer") ||
      lower.includes("i like");
    if (!looksPersonal) {
      continue;
    }
    const confidence = hasHighConfidenceCue
      ? 0.98
      : Math.min(0.95, 0.55 + line.length / 220);
    const text = rewriteMemoryText(line);
    if (text.length === 0) continue;
    candidates.push({ text, confidence: Number(confidence.toFixed(2)) });
  }
  return candidates.slice(0, 3);
}
