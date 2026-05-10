const BOT_RELATION_PATTERN =
  /\b(?:other bots?|another bot|bots?\s+(?:talk|interact|respond|remember|know|argue|agree)|bot-to-bot|coffee\s+session|group\s+chat)\b/i;

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
