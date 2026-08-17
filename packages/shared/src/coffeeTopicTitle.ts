/** Visible Coffee topic titles stay short; the raw prompt remains the table seed. */
export const COFFEE_TOPIC_TITLE_MAX_CHARS = 60;
export const COFFEE_TOPIC_TITLE_MIN_WORDS = 2;
export const COFFEE_TOPIC_TITLE_MAX_WORDS = 8;

const INSTRUCTION_PREFIX_PATTERN =
  /^(?:please\s+)?(?:ask|tell|have|listen(?:\s+up)?|let(?:'s| us)|can you|could you|would you|i want you to|i(?:'d| would) like you to)\b/iu;

function collapseCoffeeTopicText(raw: string): string {
  return raw
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^["“”']+|["“”']+$/gu, "");
}

function coffeeTopicTitleWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’:-][\p{L}\p{N}]+)*/gu) ?? [];
}

const COFFEE_TOPIC_TITLE_SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "but",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

function titleCaseCoffeeTopicTitle(text: string): string {
  const words = text.split(/\s+/u).filter(Boolean);
  return words
    .map((word, index) => {
      const possessive = word.match(/^(.*?)(['’]s)$/u);
      const core = possessive?.[1] ?? word;
      const suffix = possessive?.[2] ?? "";
      const lower = core.toLowerCase();
      const isEdge = index === 0 || index === words.length - 1;
      if (!isEdge && COFFEE_TOPIC_TITLE_SMALL_WORDS.has(lower)) {
        return `${lower}${suffix}`;
      }
      return `${core.slice(0, 1).toUpperCase()}${core.slice(1)}${suffix}`;
    })
    .join(" ");
}

/**
 * True when a stored title is already short and display-ready.
 * Instruction-shaped prompts and truncated leftovers stay dirty.
 */
export function isCleanCoffeeTopicTitle(
  title: string,
  source?: string | null,
): boolean {
  const cleaned = collapseCoffeeTopicText(title);
  if (!cleaned) return false;
  if (cleaned.length > COFFEE_TOPIC_TITLE_MAX_CHARS) return false;
  const words = coffeeTopicTitleWords(cleaned);
  if (
    words.length < COFFEE_TOPIC_TITLE_MIN_WORDS ||
    words.length > COFFEE_TOPIC_TITLE_MAX_WORDS
  ) {
    return false;
  }
  if (/[?]/.test(cleaned) || cleaned.endsWith("...")) return false;
  if (INSTRUCTION_PREFIX_PATTERN.test(cleaned)) return false;
  const sourceTrim = collapseCoffeeTopicText(source ?? "");
  if (sourceTrim.length > COFFEE_TOPIC_TITLE_MAX_CHARS && cleaned === sourceTrim) {
    return false;
  }
  return true;
}

/** Local cleanup used when no model title is available yet. */
export function heuristicCoffeeTopicTitle(raw: string): string {
  const source = collapseCoffeeTopicText(raw);
  if (!source) return "";
  if (isCleanCoffeeTopicTitle(source, source)) return source;

  const askMatch = source.match(/^(?:please\s+)?ask\s+(.+?)[,:]\s*(.+)$/iu);
  let name = "";
  let text = source;
  if (askMatch) {
    name = collapseCoffeeTopicText(askMatch[1] ?? "");
    text = collapseCoffeeTopicText(askMatch[2] ?? "");
  } else {
    text = text.replace(INSTRUCTION_PREFIX_PATTERN, "").replace(/^[,:\s]+/u, "");
  }

  text = text
    .replace(/^(?:what(?:'s| is| was| are| were)|who(?:'s| is)|how|why|when|where)\s+/iu, "")
    .replace(/^(?:the|a|an)\s+/iu, "")
    .replace(/\bpart of (?:your|my|the) (?:story|life|journey|tale)\b/giu, "moment")
    .replace(/\b(?:your|my)\b/giu, "")
    .replace(/\bpart$/iu, "moment")
    .replace(/\s+(?:so far|please|for me)\??$/iu, "")
    .replace(/[?!.,;:]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (name) {
    const possessive = /['’]s$/u.test(name) ? name : `${name}'s`;
    text = text ? `${possessive} ${text}` : name;
  }

  const words = coffeeTopicTitleWords(text);
  const clippedWords =
    words.length > 0
      ? words.slice(0, COFFEE_TOPIC_TITLE_MAX_WORDS)
      : coffeeTopicTitleWords(source).slice(0, COFFEE_TOPIC_TITLE_MAX_WORDS);
  let titled = titleCaseCoffeeTopicTitle(clippedWords.join(" "));
  if (titled.length > COFFEE_TOPIC_TITLE_MAX_CHARS) {
    titled = titled.slice(0, COFFEE_TOPIC_TITLE_MAX_CHARS).trimEnd();
  }
  return titled;
}

/** Accept a model title only when it is short, specific, and not the raw prompt. */
export function cleanGeneratedCoffeeTopicTitle(
  raw: unknown,
  source: string,
): string | null {
  if (typeof raw !== "string") return null;
  let candidate = collapseCoffeeTopicText(raw)
    .replace(/^\s*```(?:json|text)?\s*/iu, "")
    .replace(/\s*```\s*$/u, "");
  const objectCandidate = candidate.match(/\{[\s\S]*\}/u)?.[0];
  if (objectCandidate) {
    try {
      const parsed = JSON.parse(objectCandidate) as Record<string, unknown>;
      const value =
        parsed.title ?? parsed.topicTitle ?? parsed.topic_title ?? parsed.topic;
      if (typeof value === "string") candidate = collapseCoffeeTopicText(value);
    } catch {
      // Fall through to plain-text cleanup.
    }
  }
  candidate = candidate.replace(/^["“]|["”]$/gu, "").replace(/[?.!]+$/u, "");
  if (!isCleanCoffeeTopicTitle(candidate, source)) return null;
  return titleCaseCoffeeTopicTitle(candidate);
}

/** Header / list title: prefer a clean stored title, else a local summary of the prompt. */
export function resolveCoffeeTopicDisplayTitle(args: {
  title?: string | null;
  coffeeTopic?: string | null;
}): string {
  const title = collapseCoffeeTopicText(args.title ?? "");
  const topic = collapseCoffeeTopicText(args.coffeeTopic ?? "");
  if (title && isCleanCoffeeTopicTitle(title, topic || title)) return title;
  if (topic) {
    const heuristic = heuristicCoffeeTopicTitle(topic);
    if (heuristic) return heuristic;
  }
  return title || "Table talk";
}
