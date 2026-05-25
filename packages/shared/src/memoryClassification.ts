const BOT_RELATION_PATTERN =
  /\b(?:other bots?|another bot|bots?\s+(?:talk|interact|respond|remember|know|argue|agree)|bot-to-bot|coffee\s+session|group\s+chat)\b/i;

export type MemorySource = "direct" | "inferred" | "compiled" | "about_you";

export const LONG_TERM_MEMORY_SCORE = 0.95;
export const LONG_TERM_HIGH_TRUTH_SCORE = 0.9;
export const LONG_TERM_MIN_DURABILITY_FOR_HIGH_TRUTH = 0.5;

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function memoryTruthScore(confidence: number, certainty = confidence): number {
  const safeConfidence = clampUnit(confidence);
  const safeCertainty = Number.isFinite(certainty) ? clampUnit(certainty) : safeConfidence;
  return (safeConfidence + safeCertainty) / 2;
}

export function memoryLongTermScore(
  confidence: number,
  certainty = confidence,
  durability = 0
): number {
  return (memoryTruthScore(confidence, certainty) + clampUnit(durability)) / 2;
}

export function memoryQualifiesLongTerm(args: {
  confidence: number;
  certainty?: number;
  durability?: number;
  source?: MemorySource | string | null;
}): boolean {
  if (args.source === "about_you") return true;

  const truthScore = memoryTruthScore(args.confidence, args.certainty);
  const durability = clampUnit(args.durability ?? 0);
  if (truthScore >= LONG_TERM_MEMORY_SCORE) return true;

  // Only direct user evidence gets the lower 90% + durable promotion path.
  // Inferred/compiled/imported memories need stronger confidence before they
  // leave the orb layer.
  const source = args.source ?? "direct";
  return (
    source === "direct" &&
    truthScore >= LONG_TERM_HIGH_TRUTH_SCORE &&
    durability >= LONG_TERM_MIN_DURABILITY_FOR_HIGH_TRUTH
  );
}

/**
 * Heuristic: memories that belong in the "About you" tab (facts about the human user).
 * Bot-export persona lines often begin with "You …" meaning the bot — those must stay
 * "general", so avoid a blanket `^you\\b` match here.
 */
const ABOUT_USER_TEXT_PATTERN = new RegExp(
  [
    "^the\\s+user\\b",
    "^you\\s+(?:do\\s+not|don't)\\s+want\\s+me\\b",
    "^you\\s+(?:like|love|enjoy|prefer|dislike|need|hate|avoid|live)\\b",
    "^[A-Z][A-Za-z'-]*(?:\\s+[A-Z][A-Za-z'-]*){0,2}\\s+(?:likes|loves|enjoys|prefers|dislikes|needs|hates|avoids|lives)\\b",
    "^you\\s+want\\s+(?:to\\b|me\\s+to\\b|short|brief|shorter|longer|more|less|simple|simpler|detailed|clear|help\\b)",
    "^your\\s+(?:favorite|favourites|name|pronouns|birthday|preference|preferences|goal|goals|usual|typical)\\b",
    "\\b(?:you\\s+do\\s+not\\s+want\\s+me|you\\s+don't\\s+want\\s+me)\\b",
    "\\byour\\s+f(?:a|e)vou?rites?\\b",
    "\\b(?:said|mentioned|told)\\s+(?:me\\s+)?that\\s+you\\s+(?:like|love|enjoy|prefer|want|need)\\b",
  ].join("|"),
  "i"
);

/**
 * Lightweight category inference from free text (used when category is unset and for UI hints).
 */
export function classifyMemoryCategoryFromText(
  text: string
): "general" | "user" | "bot_relation" {
  const normalized = text.trim();
  if (BOT_RELATION_PATTERN.test(normalized)) return "bot_relation";
  if (ABOUT_USER_TEXT_PATTERN.test(normalized)) return "user";
  return "general";
}
