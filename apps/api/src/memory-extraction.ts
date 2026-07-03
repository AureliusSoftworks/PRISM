import { type MemoryCategory, classifyMemoryCategoryFromText } from "@localai/shared";

export interface MemoryCandidate {
  text: string;
  confidence: number;
  category?: MemoryCategory;
  durability?: number;
}

interface BotJudgmentRule {
  pattern: RegExp;
  memoryFactory: (botName: string) => string;
  confidence: number;
}

interface CoffeeObserverMemoryRule {
  pattern: RegExp;
  textFactory: (speakerName: string, peerName: string) => string;
}

interface CoffeeObserverBotNameRef {
  canonicalName: string;
  mentionNames: string[];
}

interface BotPreferredAddressRule {
  pattern: RegExp;
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

const BOT_JUDGMENT_DISALLOWED_PATTERN =
  /\b(?:worthless|pathetic|disgusting|subhuman|hate\s+you|idiot|moron|stupid|deranged|crazy|insane|psycho|kill|harm|punish|ban(?:ned)?\s+you|never\s+talk\s+to\s+you)\b/i;

const BOT_JUDGMENT_RULES: BotJudgmentRule[] = [
  {
    pattern:
      /\b(?:creepy|creeped\s+out|uncomfortable|unsettling|inappropriate|cross(?:ing)?\s+(?:a\s+)?line)\b/i,
    memoryFactory: (botName) =>
      `${botName} felt uneasy about the user's vibe and wanted clearer boundaries.`,
    confidence: 0.7,
  },
  {
    pattern:
      /\b(?:pushy|pressuring|pressure(?:d|s)?|too\s+aggressive|too\s+intense|back\s+off)\b/i,
    memoryFactory: (botName) =>
      `${botName} felt pressured by the user's approach and preferred a calmer pace.`,
    confidence: 0.68,
  },
  {
    pattern:
      /\b(?:rude|dismissive|condescending|harsh|hostile|disrespectful)\b/i,
    memoryFactory: (botName) =>
      `${botName} felt the user's wording was harsh and preferred gentler language.`,
    confidence: 0.66,
  },
  {
    pattern:
      /\b(?:guarded|wary|don't\s+fully\s+trust|not\s+sure\s+about\s+your\s+intent|unsure\s+about\s+your\s+intent)\b/i,
    memoryFactory: (botName) =>
      `${botName} felt unsure about the user's intent and stayed a little guarded.`,
    confidence: 0.64,
  },
];

const COFFEE_OBSERVER_USER_FACT_CONFIDENCE = 0.64;
const COFFEE_OBSERVER_NAME_CONFIDENCE = 0.62;
const COFFEE_OBSERVER_BOT_RELATION_CONFIDENCE = 0.56;
const COFFEE_OBSERVER_USER_FACT_DURABILITY = 0.74;
const COFFEE_OBSERVER_BOT_RELATION_DURABILITY = 0.68;
const BOT_PREFERRED_ADDRESS_CONFIDENCE = 0.71;
const BOT_PREFERRED_ADDRESS_DURABILITY = 0.82;

const BOT_PREFERRED_ADDRESS_RULES: BotPreferredAddressRule[] = [
  {
    pattern:
      /^(?:(?:please|kindly)\s+)?(?:can|could|would)?\s*(?:you\s+)?(?:call|refer\s+to|address)\s+me(?:\s+(?:as|by))?\s+(.+)$/i,
  },
  {
    pattern:
      /^(?:i(?:'d| would)\s+prefer(?:\s+that)?\s+(?:you\s+)?(?:call|refer\s+to|address)\s+me(?:\s+(?:as|by))?\s+(.+))$/i,
  },
  {
    pattern: /^i(?:'d| would)?\s+prefer\s+to\s+be\s+called\s+(.+)$/i,
  },
];

const BOT_PREFERRED_ADDRESS_DISALLOWED_PATTERN =
  /\b(?:worthless|pathetic|disgusting|subhuman|idiot|moron|stupid|deranged|crazy|insane|psycho|hate\s+you|kill|harm|punish)\b/i;

const COFFEE_OBSERVER_USER_VERB_REWRITES = new Map<string, string>([
  ["likes", "like"],
  ["loves", "love"],
  ["enjoys", "enjoy"],
  ["prefers", "prefer"],
  ["dislikes", "dislike"],
  ["hates", "hate"],
  ["avoids", "avoid"],
  ["needs", "need"],
  ["wants", "want"],
  ["values", "value"],
  ["uses", "use"],
  ["lives", "live"],
]);

const COFFEE_OBSERVER_BOT_RELATION_RULES: CoffeeObserverMemoryRule[] = [
  {
    pattern: /\b(?:agree|agrees|agreed)\b/i,
    textFactory: (speakerName, peerName) =>
      `${speakerName} tended to agree with ${peerName} during Coffee.`,
  },
  {
    pattern: /\b(?:disagree|disagrees|disagreed|challenge|challenges|challenged)\b/i,
    textFactory: (speakerName, peerName) =>
      `${speakerName} challenged ${peerName}'s view during Coffee.`,
  },
  {
    pattern: /\b(?:calm|calms|calmed|soothe|soothes|soothed)\b/i,
    textFactory: (speakerName, peerName) =>
      `${speakerName} seemed to calm ${peerName} during Coffee.`,
  },
  {
    pattern: /\b(?:trust|trusts|trusted|admire|admires|admired|appreciate|appreciates|appreciated)\b/i,
    textFactory: (speakerName, peerName) =>
      `${speakerName} showed warmth toward ${peerName} during Coffee.`,
  },
  {
    pattern: /\b(?:annoy|annoys|annoyed|frustrate|frustrates|frustrated|tense|tension)\b/i,
    textFactory: (speakerName, peerName) =>
      `${speakerName} seemed tense with ${peerName} during Coffee.`,
  },
];

const FOUNDATIONAL_MEMORY_PATTERNS = [
  /\b(?:always|never|do not|don't|like|likes|love|loves|enjoy|enjoys|prefer|prefers|favorite|favourite|need|needs|want|wants|value|values|care about|cares about)\b/i,
  /\b(?:identity|personality|character|believes?|principles?|boundary|boundaries|comfort|safe|safety)\b/i,
  /\b(?:sees|treats|uses|understands)\s+.+\s+as\s+/i,
  /\b(?:born|founded|created|developed|built|grew|became|known for|signature|method|career|company|inc\.?|workshops?|instructors?|instructional|materials?|art supplies)\b/i,
] as const;

const PREFERRED_NAME_PATTERNS = [
  /^(?:you\s+must\s+)?(?:only\s+)?(?:call|refer\s+to|address)\s+me(?:\s+(?:only|exclusively))?(?:\s+as)?\s+(.+)$/i,
  /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:only\s+)?call\s+me(?:\s+(?:only|exclusively))?\s+(.+)$/i,
  /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:only\s+)?(?:refer\s+to|address)\s+me(?:\s+(?:only|exclusively))?(?:\s+as)?\s+(.+)$/i,
  /^(?:you\s+(?:can|may)\s+)?call\s+me\s+(.+)$/i,
  /^my\s+name\s+is\s+(.+)$/i,
  /^i\s+go\s+by\s+(.+)$/i,
  /^i(?:'m| am)\s+called\s+(.+)$/i,
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
  text = rewritePreferredNameMemory(text);
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

function normalizeBotJudgmentName(rawName: string | null | undefined): string {
  const trimmed = rawName?.trim();
  if (!trimmed) return "This bot";
  return trimmed.length > 80 ? trimmed.slice(0, 80).trim() : trimmed;
}

function cleanPreferredName(rawName: string): string | null {
  const name = rawName
    .replace(/[.!?]+$/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!name) return null;
  if (/^(?:not|no|none|nothing|unknown)\b/i.test(name)) return null;
  if (name.length > 80) return null;
  return name;
}

function extractPreferredName(text: string): string | null {
  const normalized = stripGlobalScopeCues(text)
    .replace(MEMORY_CUE_PREFIX_PATTERN_RAW, "")
    .replace(/^please[\s,]+/i, "")
    .trim();
  for (const pattern of PREFERRED_NAME_PATTERNS) {
    const match = normalized.match(pattern);
    const name = match?.[1] ? cleanPreferredName(match[1]) : null;
    if (name) return name;
  }
  return null;
}

function rewritePreferredNameMemory(text: string): string {
  const name = extractPreferredName(text);
  if (!name) return text;
  return `you prefer to be called ${name}`;
}

function extractTentativePreferredNameCorrection(message: string): MemoryCandidate | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /\bi\s+have\s+a\s+name\b.{0,100}?\b(?:it(?:'s| is)|name(?:'s| is))\s+([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,2})\b/iu
  );
  const name = match?.[1] ? cleanPreferredName(match[1]) : null;
  if (!name) return null;
  const text = `You prefer to be called ${name}.`;
  return {
    text,
    confidence: 0.56,
    category: classifyMemoryCategory(text),
    durability: estimateMemoryDurability(text),
  };
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
    const hasPreferredNameCue = extractPreferredName(cleanLine) !== null;
    if (!hasHighConfidenceCue && isTaskRequest(cleanLine)) {
      continue;
    }
    const looksPersonal =
      hasHighConfidenceCue ||
      hasPreferredNameCue ||
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
      lower.includes("i dislike") ||
      lower.includes("call me") ||
      lower.includes("refer to me") ||
      lower.includes("my name is") ||
      lower.includes("i go by") ||
      lower.includes("address me");
    if (!looksPersonal) {
      continue;
    }
    const confidence = hasPreferredNameCue
      ? 0.98
      : hasHighConfidenceCue
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
      durability: estimateMemoryDurability(text, hasHighConfidenceCue || hasPreferredNameCue),
    });
  }
  return candidates.slice(0, 3);
}

export function extractMemoryCandidates(message: string): MemoryCandidate[] {
  const candidates = extractMemoryCandidatesFromLines(
    splitMemorySentences(message).filter((line) => !isRetractionCue(line))
  );
  const tentativePreferredName = extractTentativePreferredNameCorrection(message);
  if (
    tentativePreferredName &&
    !candidates.some((candidate) => /prefer to be called/i.test(candidate.text))
  ) {
    return [tentativePreferredName, ...candidates].slice(0, 3);
  }
  return candidates;
}

export function extractBotJudgmentMemoryCandidates(args: {
  assistantMessage: string;
  botName?: string | null;
}): MemoryCandidate[] {
  const normalized = args.assistantMessage.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (BOT_JUDGMENT_DISALLOWED_PATTERN.test(normalized)) return [];
  if (!/\b(?:you|your|user)\b/i.test(normalized)) return [];
  const botName = normalizeBotJudgmentName(args.botName);
  for (const rule of BOT_JUDGMENT_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    const text = rule.memoryFactory(botName);
    return [
      {
        text,
        confidence: rule.confidence,
        category: "general",
        durability: estimateMemoryDurability(text),
      },
    ];
  }
  return [];
}

function normalizeCoffeeObserverName(rawName: string | null | undefined): string | null {
  const name = rawName
    ?.replace(/^@/, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}' -]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return null;
  if (name.length > 80) return null;
  return name;
}

function coffeeObserverNameKey(rawName: string | null | undefined): string | null {
  return normalizeCoffeeObserverName(rawName)?.toLocaleLowerCase() ?? null;
}

const COFFEE_OBSERVER_TITLE_TOKENS = new Set([
  "captain",
  "capt",
  "doctor",
  "dr",
  "lord",
  "madam",
  "miss",
  "mister",
  "mr",
  "mrs",
  "ms",
  "prof",
  "professor",
  "sir",
]);

function coffeeObserverNameVariants(rawName: string | null | undefined): string[] {
  const canonicalName = normalizeCoffeeObserverName(rawName);
  if (!canonicalName) return [];
  const variants = [canonicalName];
  const parts = canonicalName
    .split(/\s+/)
    .map((part) => normalizeCoffeeObserverName(part))
    .filter((part): part is string => part !== null);
  if (parts.length > 1) {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    const firstKey = coffeeObserverNameKey(first);
    if (
      first.length >= 3 &&
      firstKey &&
      !COFFEE_OBSERVER_TITLE_TOKENS.has(firstKey)
    ) {
      variants.push(first);
    }
    if (
      last.length >= 3 &&
      firstKey &&
      COFFEE_OBSERVER_TITLE_TOKENS.has(firstKey)
    ) {
      variants.push(last);
    }
  }
  return variants.filter((name, index, all) => all.indexOf(name) === index);
}

function buildCoffeeObserverBotNameRefs(seatedBotNames: string[]): {
  botRefs: CoffeeObserverBotNameRef[];
  botNameKeys: Set<string>;
} {
  const variantsByName = seatedBotNames.map((name) => ({
    canonicalName: name,
    variants: coffeeObserverNameVariants(name),
  }));
  const keyCounts = new Map<string, number>();
  const botNameKeys = new Set<string>();
  for (const { variants } of variantsByName) {
    for (const variant of variants) {
      const key = coffeeObserverNameKey(variant);
      if (!key) continue;
      botNameKeys.add(key);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  const botRefs = variantsByName.map(({ canonicalName, variants }) => {
    const canonicalKey = coffeeObserverNameKey(canonicalName);
    return {
      canonicalName,
      mentionNames: variants.filter((variant) => {
        const key = coffeeObserverNameKey(variant);
        return key !== null && (key === canonicalKey || keyCounts.get(key) === 1);
      }),
    };
  });
  return { botRefs, botNameKeys };
}

function stripCoffeeBotMentionMarkdown(text: string): string {
  return text.replace(/\[([^\]]+)\]\(prism-bot:\/\/[^)]+\)/g, "$1");
}

function uniqueMemoryCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>();
  const unique: MemoryCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.category ?? "general"}:${candidate.text
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function sanitizeCoffeeObserverDetail(rawDetail: string): string | null {
  const detail = rawDetail
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s]+/, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (detail.length < 3 || detail.length > 160) return null;
  if (/^(?:that|this|it|you|me|i|we)\b/i.test(detail)) return null;
  return detail;
}

function cleanBotPreferredAddress(rawName: string): string | null {
  const cleaned = rawName
    .replace(/[.!?]+$/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 80) return null;
  if (/^(?:not|none|nothing|n\/a|unknown)\b/i.test(cleaned)) return null;
  if (BOT_PREFERRED_ADDRESS_DISALLOWED_PATTERN.test(cleaned)) return null;
  return cleaned;
}

function extractBotPreferredAddressValue(message: string): string | null {
  const normalized = stripCoffeeBotMentionMarkdown(message)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  for (const rule of BOT_PREFERRED_ADDRESS_RULES) {
    const match = normalized.match(rule.pattern);
    const rawName = match?.[1];
    if (!rawName) continue;
    const preferred = cleanBotPreferredAddress(rawName);
    if (preferred) return preferred;
  }
  return null;
}

function subjectLooksLikeCoffeeUser(
  subject: string,
  botNameKeys: Set<string>
): boolean {
  const normalized = subject.trim().replace(/\s+/g, " ");
  if (/^(?:the\s+user|user|our\s+user|the\s+human|human)$/i.test(normalized)) {
    return true;
  }
  const key = coffeeObserverNameKey(normalized);
  return key !== null && !botNameKeys.has(key);
}

function extractCoffeeObserverUserFacts(
  normalizedMessage: string,
  botNameKeys: Set<string>
): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const sentences = splitMemorySentences(normalizedMessage);
  for (const sentence of sentences) {
    const fact = sentence.match(
      /^(the\s+user|user|our\s+user|the\s+human|human|[A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,2})\s+(likes|loves|enjoys|prefers|dislikes|hates|avoids|needs|wants|values|uses|lives)\s+(.+)$/u
    );
    if (fact?.[1] && fact[2] && fact[3] && subjectLooksLikeCoffeeUser(fact[1], botNameKeys)) {
      const verb = COFFEE_OBSERVER_USER_VERB_REWRITES.get(fact[2].toLocaleLowerCase());
      const detail = sanitizeCoffeeObserverDetail(fact[3]);
      if (verb && detail) {
        const text = `You ${verb} ${detail}.`;
        candidates.push({
          text,
          confidence: COFFEE_OBSERVER_USER_FACT_CONFIDENCE,
          category: "user",
          durability: COFFEE_OBSERVER_USER_FACT_DURABILITY,
        });
      }
      continue;
    }

    const address = sentence.match(
      /^([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,2}),\s+.{4,}$/u
    );
    const addressedName = address?.[1]
      ? normalizeCoffeeObserverName(address[1])
      : null;
    const addressedKey = coffeeObserverNameKey(addressedName);
    if (addressedName && addressedKey && !botNameKeys.has(addressedKey)) {
      candidates.push({
        text: `You prefer to be called ${addressedName}.`,
        confidence: COFFEE_OBSERVER_NAME_CONFIDENCE,
        category: "user",
        durability: COFFEE_OBSERVER_USER_FACT_DURABILITY,
      });
    }
  }
  return candidates;
}

function textMentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function extractCoffeeObserverBotRelations(args: {
  normalizedMessage: string;
  speakerName: string;
  seatedBotRefs: CoffeeObserverBotNameRef[];
}): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const speakerKey = coffeeObserverNameKey(args.speakerName);
  for (const peer of args.seatedBotRefs) {
    const peerKey = coffeeObserverNameKey(peer.canonicalName);
    if (!peerKey || peerKey === speakerKey) continue;
    if (!peer.mentionNames.some((name) => textMentionsName(args.normalizedMessage, name))) {
      continue;
    }
    for (const rule of COFFEE_OBSERVER_BOT_RELATION_RULES) {
      if (!rule.pattern.test(args.normalizedMessage)) continue;
      candidates.push({
        text: rule.textFactory(args.speakerName, peer.canonicalName),
        confidence: COFFEE_OBSERVER_BOT_RELATION_CONFIDENCE,
        category: "bot_relation",
        durability: COFFEE_OBSERVER_BOT_RELATION_DURABILITY,
      });
      break;
    }
  }
  return candidates;
}

export function extractCoffeeObserverMemoryCandidates(args: {
  speakerName: string;
  assistantMessage: string;
  seatedBotNames: string[];
}): MemoryCandidate[] {
  const normalizedMessage = stripCoffeeBotMentionMarkdown(args.assistantMessage)
    .replace(/\s+/g, " ")
    .trim();
  const speakerName = normalizeCoffeeObserverName(args.speakerName);
  if (!normalizedMessage || !speakerName) return [];
  const seatedBotNames = args.seatedBotNames
    .map(normalizeCoffeeObserverName)
    .filter((name): name is string => name !== null);
  const { botRefs, botNameKeys } = buildCoffeeObserverBotNameRefs(seatedBotNames);
  return uniqueMemoryCandidates([
    ...extractCoffeeObserverUserFacts(normalizedMessage, botNameKeys),
    ...extractCoffeeObserverBotRelations({
      normalizedMessage,
      speakerName,
      seatedBotRefs: botRefs,
    }),
  ]).slice(0, 3);
}

export function extractBotPreferredAddressMemoryCandidates(args: {
  assistantMessage: string;
  targetBotName: string;
}): MemoryCandidate[] {
  const targetBotName = normalizeCoffeeObserverName(args.targetBotName);
  if (!targetBotName) return [];
  const preferredAddress = extractBotPreferredAddressValue(args.assistantMessage);
  if (!preferredAddress) return [];
  if (preferredAddress.toLocaleLowerCase() === targetBotName.toLocaleLowerCase()) return [];
  const text = `${targetBotName} prefers to be called ${preferredAddress}.`;
  return [
    {
      text,
      confidence: BOT_PREFERRED_ADDRESS_CONFIDENCE,
      category: "bot_relation",
      durability: BOT_PREFERRED_ADDRESS_DURABILITY,
    },
  ];
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
