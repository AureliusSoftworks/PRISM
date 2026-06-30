/**
 * Bot @-mention wire format and plain-text helpers (composer + tests).
 *
 * Stored markdown: `[Display Name](prism-bot://<botId>)`
 * (`encodeURIComponent` on id so href stays a single URI token.)
 */

export const PRISM_BOT_MENTION_SCHEME = "prism-bot:";
export const PRISM_BOT_MENTION_PREFIX = "prism-bot://";

/** Markdown link pattern: capture name + id (decoded). */
export const PRISM_BOT_MARKDOWN_LINK_RE =
  /\[((?:[^\]]|\\.)*)\]\s*\(\s*prism-bot:\/\/([^)\s]+)\s*\)/gi;

export interface BotMentionPick {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
}

export function prismBotMentionHref(botId: string): string {
  return `${PRISM_BOT_MENTION_PREFIX}${encodeURIComponent(botId)}`;
}

/** Returns decoded bot id, or null if href is not a prism-bot mention. */
export function parsePrismBotMentionHref(href: string | undefined | null): string | null {
  if (typeof href !== "string" || href.length === 0) return null;
  const trimmed = href.trim();
  if (!trimmed.toLowerCase().startsWith(PRISM_BOT_MENTION_PREFIX)) return null;
  const raw = trimmed.slice(PRISM_BOT_MENTION_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Escape `]` and `\` for safe use as markdown link label text. */
export function escapeMarkdownLinkLabel(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function unescapeMarkdownLinkLabel(text: string): string {
  return text.replace(/\\([\\\]])/g, "$1");
}

export function formatBotMentionMarkdown(bot: { id: string; name: string }): string {
  return `[${escapeMarkdownLinkLabel(bot.name)}](${prismBotMentionHref(bot.id)})`;
}

/**
 * Prefer the explicit chip label when it differs intentionally from the
 * canonical roster name (for example learned address preferences like
 * "Dr. Freud"), but still repair obvious truncations like `Mr` -> `Mr. Krabs`.
 */
export function normalizePeerMentionChipLabel(
  label: string,
  botCanonicalName: string,
  preferredLabel?: string | null
): string {
  const canonical = botCanonicalName.trim();
  const raw = label.trim();
  const preferred = typeof preferredLabel === "string" ? preferredLabel.trim() : "";
  if (preferred.length > 0) return preferred;
  if (canonical.length === 0) return raw;
  if (raw.length === 0) return canonical;
  const rawLower = raw.toLocaleLowerCase();
  const canonicalLower = canonical.toLocaleLowerCase();
  if (rawLower === canonicalLower) return canonical;
  if (canonicalLower.startsWith(rawLower)) return canonical;
  return raw;
}

/**
 * Source-text segment used by both the static and reveal-aware bot-mention
 * renderers. `srcStart`/`srcEnd` are offsets into the original markdown
 * string. Mention segments span the entire `[name](prism-bot://id)` token;
 * text segments cover everything between mentions.
 */
export interface BotMentionSourceSegment {
  kind: "text" | "mention";
  srcStart: number;
  srcEnd: number;
  /** Original markdown slice for this segment. */
  text: string;
  /** Decoded bot id (empty string for `text` segments). */
  botId: string;
  /** Display label with markdown escapes removed (empty for `text`). */
  displayName: string;
}

/**
 * One slice of plain prose returned by {@link splitTextByBotNames}. Either
 * a stretch of unstyled text, or a contiguous bot-name occurrence we should
 * auto-color in the speaker's identity color.
 */
export interface BotNameInlineSegment {
  kind: "text" | "name";
  text: string;
  /** When `kind === "name"`, the bot whose name (or possessive) matched. */
  bot: BotMentionPick | null;
}

/**
 * Escape a string for safe inclusion in a regex character class / pattern.
 */
function escapeRegExpLiteral(input: string): string {
  return input.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function decodePrismBotHrefId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Cleans malformed bot-mention fragments inside plain prose segments before
 * the renderer applies soft name coloring.
 *
 * This is a defensive client-side fallback for model output like:
 * - `[SpongeBob]'s idea` → `SpongeBob's idea`
 * - `(prism-bot://bot-id) has a point` → `SpongeBob has a point`
 *
 * Well-formed markdown links are tokenized before this runs, so this only
 * affects raw text pieces that would otherwise leak brackets or hrefs onto
 * the table.
 */
export function cleanBotMentionTextArtifacts(
  text: string,
  bots: readonly BotMentionPick[]
): string {
  if (!text) return text;
  const byId = new Map<string, BotMentionPick>();
  const byNameLower = new Map<string, BotMentionPick>();
  for (const bot of bots) {
    if (bot.id) byId.set(bot.id, bot);
    if (bot.name.trim()) byNameLower.set(bot.name.trim().toLowerCase(), bot);
  }

  let cleaned = text.replace(/\(\s*prism-bot:\/\/([^)\s]+)\s*\)/gi, (_match, rawId) => {
    const bot = byId.get(decodePrismBotHrefId(String(rawId)));
    return bot?.name ?? "";
  });

  cleaned = cleaned.replace(
    /\[((?:[^\]\n]|\\\])*)\](['’]s)?(?!\s*\()/g,
    (match, label, suffix = "") => {
      const cleanLabel = String(label).replace(/\\([\\\]])/g, "$1").trim();
      const bot = byNameLower.get(cleanLabel.toLowerCase());
      return bot ? `${bot.name}${suffix}` : match;
    }
  );

  return cleaned.replace(/[ \t]{2,}/g, " ");
}

/**
 * Walks a plain-text string and splits it into ordered text/name segments
 * for the auto-color renderer.
 *
 * Rules:
 * - Match whole-word, case-insensitively (so "spongebob" inside another
 *   word like "Spongebob3000" doesn't trigger).
 * - Sort the roster longest-first so a multi-word name like "Mr. Krabs"
 *   matches before its substring "Krabs" would.
 * - Allow an optional possessive `'s` or `'s` suffix to be folded into the
 *   colored span ("Squidward's coffee" → the apostrophe-s sits inside the
 *   colored span so it doesn't visually disconnect from the name).
 * - `excludeBotId` skips occurrences of one specific bot — used so a
 *   speaker's reply doesn't auto-color their own name in third person.
 */
export function splitTextByBotNames(
  text: string,
  bots: readonly BotMentionPick[],
  excludeBotId?: string | null
): BotNameInlineSegment[] {
  if (!text) return [];
  const eligible = bots.filter(
    (b) => b.id !== excludeBotId && typeof b.name === "string" && b.name.trim().length > 0
  );
  if (eligible.length === 0) {
    return [{ kind: "text", text, bot: null }];
  }
  const byNameLower = new Map<string, BotMentionPick>();
  for (const bot of eligible) {
    byNameLower.set(bot.name.trim().toLowerCase(), bot);
  }
  const sortedNames = Array.from(byNameLower.keys()).sort((a, b) => b.length - a.length);
  // Wrap each escaped name in a non-capturing group; outer group covers the
  // possessive `'s` / curly-quote `’s` suffix so it lands inside the colored span.
  const pattern = new RegExp(
    `(?:^|(?<=[^\\p{L}\\p{N}_]))(${sortedNames.map(escapeRegExpLiteral).join("|")})(['’]s)?(?=$|[^\\p{L}\\p{N}_])`,
    "giu"
  );
  const segments: BotNameInlineSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start), bot: null });
    }
    const matchedName = (match[1] ?? "").trim();
    const possessive = match[2] ?? "";
    const bot = byNameLower.get(matchedName.toLowerCase()) ?? null;
    segments.push({
      kind: "name",
      text: matchedName + possessive,
      bot,
    });
    cursor = start + (match[0]?.length ?? 0);
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor), bot: null });
  }
  return segments;
}

export interface StageDirectionCue {
  action: string;
  /** Display-length threshold where this action should become visible. */
  revealAtDisplayLength: number;
}

function looksLikeStageDirectionAction(inner: string): boolean {
  const normalized = inner.trim().toLowerCase();
  if (!normalized) return false;
  // Keep this conservative: only treat common physical/social action verbs
  // as stage directions when the token is embedded in prose.
  return /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically)\s+)?(?:arches?|arching|glances?|glancing|looks?|looking|nods?|nodding|shrugs?|shrugging|sighs?|sighing|smiles?|smiling|grins?|grinning|frowns?|frowning|pinches?|pinching|winces?|wincing|grimaces?|grimacing|laughs?|laughing|chuckles?|chuckling|snickers?|snickering|snorts?|snorting|whispers?|whispering|murmurs?|murmuring|pauses?|pausing|hesitates?|hesitating|stares?|staring|glares?|glaring|gestures?|gesturing|points?|pointing|waves?|waving|blinks?|blinking|rolls?|rolling|shifts?|shifting|tilts?|tilting|crosses?|crossing|folds?|folding|leans?|leaning|turns?|turning|steps?|stepping|mutters?|muttering|scoffs?|scoffing|strokes?|stroking|rubs?|rubbing|scratches?|scratching|takes?|taking|taps?|tapping|clears?|clearing|swallows?|swallowing|coughs?|coughing|drums?|drumming|twirls?|twirling|pats?|patting|pushes?|pushing|touches?|touching|wipes?|wiping|sniffs?|sniffing|exhales?|exhaling|inhales?|inhaling|plucks?|plucking|ponders?|pondering|sets?|setting|squints?|squinting)\b/u.test(
    normalized
  );
}

function looksLikeInlineActionAtSentenceBoundary(before: string, after: string): boolean {
  const beforeTrimmed = before.trimEnd();
  const afterTrimmed = after.trimStart();
  const beforeEndsSentence = /(?:[.!?…]|\.{3}|—|–|:|;)$/.test(beforeTrimmed);
  const afterStartsSentenceish = afterTrimmed.length === 0 || /^[\p{Lu}\p{N}"“'‘(\[]/u.test(afterTrimmed);
  return beforeEndsSentence && afterStartsSentenceish;
}

const PARENTHETICAL_STAGE_START_RE =
  /^(?:the sound of|sound of|pauses?|pausing|takes?|taking|sips?|sipping|smiles?|smiling|grins?|grinning|frowns?|frowning|nods?|nodding|shrugs?|shrugging|sighs?|sighing|laughs?|laughing|chuckles?|chuckling|whispers?|whispering|murmurs?|murmuring|breathes?|breathing|inhales?|inhaling|exhales?|exhaling|glances?|glancing|looks?|looking|stares?|staring|glares?|glaring|leans?|leaning|tilts?|tilting|turns?|turning|gestures?|gesturing|points?|pointing|waves?|waving|with\s+|as\s+|while\s+|eyes?\s+|voice\s+|tone\s+)/u;

function looksLikeParentheticalStageDirection(
  inner: string,
  before: string,
  after: string
): boolean {
  const normalized = inner.trim().toLowerCase();
  if (!normalized || normalized.length > 220) return false;
  if (/\?|https?:\/\//u.test(normalized)) return false;
  if (looksLikeStageDirectionAction(normalized)) return true;
  if (PARENTHETICAL_STAGE_START_RE.test(normalized)) return true;
  // Treat standalone-ish parentheticals as stage cues when they sit between
  // sentence boundaries. This catches ambience-style notes like
  // "(The sound of rain in the background.)" that some models emit.
  return looksLikeInlineActionAtSentenceBoundary(before, after);
}

const LEADING_UNMARKED_STAGE_START_RE = new RegExp(
  [
    String.raw`^(?:(?:[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){0,3})(?:,\s+|\s+))?`,
    String.raw`(?:`,
    String.raw`(?:his|her|their|its)\s+(?:eyes?|gaze|breath(?:ing)?|jaw|mouth|shoulders?)\b`,
    String.raw`|eyes?\s+(?:narrow|narrowing|widen|widening|shift|shifting|glance|glancing|gaze|gazing|roll|rolling)\b`,
    String.raw`|(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically)\s+)?(?:arches?|arching|leans?|leaning|glances?|glancing|gazes?|gazing|glares?|glaring|stares?|staring|looks?|looking|nods?|nodding|shrugs?|shrugging|sighs?|sighing|smiles?|smiling|grins?|grinning|frowns?|frowning|pinches?|pinching|winces?|wincing|grimaces?|grimacing|laughs?|laughing|chuckles?|chuckling|snickers?|snickering|snorts?|snorting|blinks?|blinking|turns?|turning|shifts?|shifting|tilts?|tilting|pauses?|pausing|sips?|sipping|takes?|taking|picks?|picking|plucks?|plucking|ponders?|pondering|sets?|setting|squints?|squinting|strokes?|stroking|rubs?|rubbing|scratches?|scratching|taps?|tapping|clears?|clearing|swallows?|swallowing|coughs?|coughing|drums?|drumming|twirls?|twirling|pats?|patting|pushes?|pushing|touches?|touching|wipes?|wiping|sniffs?|sniffing|exhales?|exhaling|inhales?|inhaling)\b(?!\s+(?:like|are|is)\b)`,
    String.raw`)`,
  ].join(""),
  "iu"
);

const MARKDOWN_BOT_MENTION_PATTERN = String.raw`\[[^\]\n]+\]\(prism-bot:\/\/[^)\n]+\)`;
const UNMARKED_STAGE_ADDRESS_PREFIX_RE = new RegExp(
  String.raw`^(?:${MARKDOWN_BOT_MENTION_PATTERN}\s*,?\s*)`,
  "u"
);

const LEADING_UNMARKED_STAGE_SPOKEN_OPENER_RE =
  /\s+(?=(?:["“'‘])?(?:[A-Z][\p{L}'-]{1,24},|(?:I|I'm|I've|I'd|You|You're|You've|We|We're|A|That's|The|This|These|Those|But|Still|Anyway|Honestly|Listen|Look,|Well|Ah|Oh|Ar|Arr|Aye|Of|No offense|No,|Yes,|Okay|Sure|Mine|Yours|Consider|Imagine|Suppose|Notice|Think|Let's|Let us|Picture|Now|Yeah|Yup|Hey|Huh|Hmm|Actually|Me|True|False|Maybe|Perhaps|My|So|And|Because|If|When|Where|Why|How|What|Dodging)\b))/gu;

function normalizeUnmarkedStageAction(raw: string): string {
  return raw.replace(/[,.!?;:\s]+$/u, "").trim();
}

function splitUnmarkedAddressPrefix(text: string): {
  prefix: string;
  rest: string;
} {
  const match = text.match(UNMARKED_STAGE_ADDRESS_PREFIX_RE);
  if (!match) return { prefix: "", rest: text };
  const prefix = match[0] ?? "";
  return { prefix, rest: text.slice(prefix.length).trimStart() };
}

function looksLikeStandaloneUnmarkedStageAction(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length >= 8 &&
    trimmed.length <= 180 &&
    !/[?"]/u.test(trimmed) &&
    LEADING_UNMARKED_STAGE_START_RE.test(trimmed)
  );
}

function extractLeadingUnmarkedStageDirection(text: string): {
  action: string;
  mainText: string;
  revealAtDisplayLength: number;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const { prefix, rest } = splitUnmarkedAddressPrefix(trimmed);
  const startsLikeAction = LEADING_UNMARKED_STAGE_START_RE.test(rest);
  if (!startsLikeAction) return null;

  for (const match of rest.matchAll(LEADING_UNMARKED_STAGE_SPOKEN_OPENER_RE)) {
    const splitIndex = match.index ?? -1;
    const action = normalizeUnmarkedStageAction(rest.slice(0, splitIndex));
    if (splitIndex < 12 && !looksLikeStageDirectionAction(action)) continue;
    if (splitIndex < 4 || splitIndex > 180) continue;
    const spokenText = rest.slice(splitIndex).trim();
    const mainText = normalizeStageDirectionMainText(`${prefix}${spokenText}`);
    if (action.length > 0 && mainText.length > 0) {
      return {
        action,
        mainText,
        revealAtDisplayLength: getBotMentionDisplayLength(prefix),
      };
    }
  }
  if (looksLikeStandaloneUnmarkedStageAction(rest)) {
    return {
      action: normalizeUnmarkedStageAction(rest),
      mainText: "",
      revealAtDisplayLength: 0,
    };
  }
  return null;
}

function extractTrailingUnmarkedStageDirection(text: string): {
  action: string;
  mainText: string;
  revealAtDisplayLength: number;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const sentenceBreaks = Array.from(trimmed.matchAll(/[.!?…]\s+/gu));
  for (let index = sentenceBreaks.length - 1; index >= 0; index -= 1) {
    const match = sentenceBreaks[index]!;
    const tailStart = (match.index ?? 0) + match[0].length;
    const mainText = trimmed.slice(0, tailStart).trim();
    const tail = trimmed.slice(tailStart).trim();
    const { rest } = splitUnmarkedAddressPrefix(tail);
    if (!mainText || !rest) continue;
    if (looksLikeStandaloneUnmarkedStageAction(rest)) {
      return {
        action: normalizeUnmarkedStageAction(rest),
        mainText,
        revealAtDisplayLength: getBotMentionDisplayLength(mainText),
      };
    }
  }
  return null;
}

function normalizeStageDirectionMainText(raw: string): string {
  let mainText = raw.replace(/\*+/g, "");
  mainText = mainText.replace(/\s+/g, " ").trim();
  return mainText;
}

function parseStageDirectionsDetailed(text: string): {
  mainText: string;
  actions: string[];
  cues: StageDirectionCue[];
} {
  if (!text) return { mainText: "", actions: [], cues: [] };
  // Stage-direction tokens:
  // - `*action*` / `**action**` (canonical roleplay notation)
  // - `(action)` (fallback style some models emit)
  const re = /(\*+([^*\n]+?)\*+)|(\(([^()\n]+?)\))/g;
  const cues: StageDirectionCue[] = [];
  let spokenRaw = "";
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const token = match[0] ?? "";
    const isAsteriskToken = typeof match[2] === "string";
    const trimmed = String(isAsteriskToken ? match[2] : match[4] ?? "").trim();
    if (start > cursor) {
      spokenRaw += text.slice(cursor, start);
    }
    const before = text.slice(0, start);
    const after = text.slice(start + token.length);
    const hasSpokenBefore = /\p{L}|\p{N}/u.test(before);
    const hasSpokenAfter = /\p{L}|\p{N}/u.test(after);

    if (trimmed.length === 0) {
      cursor = start + token.length;
      continue;
    }

    if (isAsteriskToken) {
      if (
        hasSpokenBefore &&
        hasSpokenAfter &&
        !looksLikeStageDirectionAction(trimmed) &&
        !looksLikeInlineActionAtSentenceBoundary(before, after)
      ) {
        // Inline emphasis in ordinary prose.
        spokenRaw += trimmed;
      } else {
        const revealAtDisplayLength = getBotMentionDisplayLength(
          normalizeStageDirectionMainText(spokenRaw)
        );
        cues.push({ action: trimmed, revealAtDisplayLength });
      }
    } else if (looksLikeParentheticalStageDirection(trimmed, before, after)) {
      const revealAtDisplayLength = getBotMentionDisplayLength(
        normalizeStageDirectionMainText(spokenRaw)
      );
      cues.push({ action: trimmed, revealAtDisplayLength });
    } else {
      // Non-stage parentheticals are ordinary prose.
      spokenRaw += token;
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) {
    spokenRaw += text.slice(cursor);
  }
  let mainText = normalizeStageDirectionMainText(spokenRaw);
  if (cues.length === 0 && !text.includes("*")) {
    const unmarked =
      extractLeadingUnmarkedStageDirection(mainText) ??
      extractTrailingUnmarkedStageDirection(mainText);
    if (unmarked) {
      mainText = unmarked.mainText;
      cues.push({
        action: unmarked.action,
        revealAtDisplayLength: unmarked.revealAtDisplayLength,
      });
    }
  }
  return {
    mainText,
    actions: cues.map((cue) => cue.action),
    cues,
  };
}

/**
 * Splits a string at asterisk-delimited stage directions and returns the
 * spoken `mainText` plus the actions in order of appearance. The renderer
 * surfaces actions above the speaker's avatar instead of cluttering the
 * table line.
 *
 * The matcher is forgiving on purpose because LLMs from different families
 * use different roleplay conventions:
 *   - `*pours coffee*`         (canonical, what the prompt asks for)
 *   - `**pours coffee**`       (Markdown bold — many models default to this)
 *   - `*pours coffee* and...`  (leading action, then spoken line)
 *   - `eyes narrow... No offense` (unmarked leading physical action)
 *   - `*pours coffee` (no close) → orphan asterisks are still scrubbed so
 *     the table line never starts or ends with a stray `*`.
 *
 * Inline Markdown-style emphasis inside a sentence is NOT treated as an
 * action. It is unwrapped and kept in the spoken line:
 *   - `the *thought* that counts` → `the thought that counts`
 */
export function extractStageDirections(text: string): {
  mainText: string;
  actions: string[];
} {
  const parsed = parseStageDirectionsDetailed(text);
  return { mainText: parsed.mainText, actions: parsed.actions };
}

export function extractStageDirectionCues(text: string): StageDirectionCue[] {
  return parseStageDirectionsDetailed(text).cues;
}

/**
 * Visual length of a markdown string after bot mentions are reduced to their
 * display labels. Used to pace the Coffee typewriter so a long
 * `prism-bot://<uuid>` ID doesn't eat extra "typing time" while the rendered
 * chip is already shown — the cursor advances over the display name only.
 */
export function getBotMentionDisplayLength(text: string): number {
  const segments = tokenizeBotMentionSource(text);
  let total = 0;
  for (const seg of segments) {
    total += seg.kind === "mention" ? seg.displayName.length : seg.text.length;
  }
  return total;
}

/**
 * Splits a markdown string into ordered text + mention segments. Used by the
 * renderer to chip-up `[Name](prism-bot://id)` tokens while leaving plain
 * text untouched.
 */
export function tokenizeBotMentionSource(text: string): BotMentionSourceSegment[] {
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  const segments: BotMentionSourceSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({
        kind: "text",
        srcStart: last,
        srcEnd: start,
        text: text.slice(last, start),
        botId: "",
        displayName: "",
      });
    }
    const rawName = match[1] ?? "";
    const idEnc = match[2] ?? "";
    let id = idEnc;
    try {
      id = decodeURIComponent(idEnc);
    } catch {
      id = idEnc;
    }
    segments.push({
      kind: "mention",
      srcStart: start,
      srcEnd: start + match[0].length,
      text: match[0],
      botId: id,
      displayName: unescapeMarkdownLinkLabel(rawName),
    });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({
      kind: "text",
      srcStart: last,
      srcEnd: text.length,
      text: text.slice(last),
      botId: "",
      displayName: "",
    });
  }
  return segments;
}

export function findFirstBotMentionId(
  text: string,
  bots: readonly BotMentionPick[]
): string | null {
  if (!text || bots.length === 0) return null;
  const validBotIds = new Set(bots.map((bot) => bot.id));
  for (const segment of tokenizeBotMentionSource(text)) {
    if (segment.kind === "mention" && validBotIds.has(segment.botId)) {
      return segment.botId;
    }
  }
  return null;
}

export interface AtMentionToken {
  /** Absolute index of `@` in full string. */
  atIndex: number;
  /** Caret / exclusive end of the active token (same as query end). */
  endIndex: number;
  /** Text after `@` up to caret (may be empty, may include spaces). */
  query: string;
}

/**
 * Finds the active @-mention token on the current line when the caret is
 * immediately after the query (caret-based mention UX).
 */
export function findAtMentionTokenPlain(text: string, caret: number): AtMentionToken | null {
  if (caret < 0 || caret > text.length) return null;
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const lineSlice = text.slice(lineStart, caret);
  const atRel = lineSlice.lastIndexOf("@");
  if (atRel === -1) return null;
  const atIndex = lineStart + atRel;
  const query = text.slice(atIndex + 1, caret);
  if (query.includes("\n")) return null;
  return { atIndex, endIndex: caret, query };
}

export function filterBotsForMentionQuery(
  bots: readonly BotMentionPick[],
  query: string
): BotMentionPick[] {
  const q = query.trim().toLocaleLowerCase();
  const pool = bots.filter((b) => b.name.trim().length > 0);
  if (q.length === 0) return [...pool];
  return pool.filter((b) => b.name.toLocaleLowerCase().includes(q));
}

export function uniqueBotMatchingName(
  bots: readonly BotMentionPick[],
  fullName: string
): BotMentionPick | null {
  const needle = fullName.trim().toLocaleLowerCase();
  if (needle.length === 0) return null;
  const matches = bots.filter((b) => b.name.toLocaleLowerCase() === needle);
  return matches.length === 1 ? matches[0]! : null;
}

export type MentionTabAction =
  | { kind: "none" }
  | { kind: "stage2"; replacement: string; caret: number };

export type MentionPersonaSelectAction =
  | { kind: "none" }
  | {
      kind: "select-persona";
      bot: BotMentionPick;
      replacement: string;
      caret: number;
    };

/**
 * Plain-text Tab handler: when exactly one bot matches the `@` query, inserts
 * the markdown mention link in one step (same end state as the old two-tab flow).
 */
export function mentionTabPlainTextAction(
  text: string,
  caret: number,
  bots: readonly BotMentionPick[]
): MentionTabAction {
  const token = findAtMentionTokenPlain(text, caret);
  if (!token) return { kind: "none" };

  const filtered = filterBotsForMentionQuery(bots, token.query);

  if (filtered.length === 1) {
    const only = filtered[0]!;
    const mentionMd = formatBotMentionMarkdown(only);
    const replacement =
      text.slice(0, token.atIndex) + mentionMd + text.slice(token.endIndex);
    return { kind: "stage2", replacement, caret: token.atIndex + mentionMd.length };
  }

  return { kind: "none" };
}

/**
 * Tab completion for `@` mentions: single match commits markdown immediately;
 * when multiple bots match, inserts the markdown link for `highlightIndex`
 * (arrow keys move highlight first).
 */
export function composeMentionTabPlainTextAction(
  text: string,
  caret: number,
  bots: readonly BotMentionPick[],
  highlightedIndex: number
): MentionTabAction {
  const token = findAtMentionTokenPlain(text, caret);
  if (!token) return { kind: "none" };

  const filtered = filterBotsForMentionQuery(bots, token.query);
  if (filtered.length === 0) return { kind: "none" };

  if (filtered.length === 1) {
    return mentionTabPlainTextAction(text, caret, bots);
  }

  const hi = ((highlightedIndex % filtered.length) + filtered.length) % filtered.length;
  const pick = filtered[hi]!;
  const md = formatBotMentionMarkdown(pick);
  const replacement =
    text.slice(0, token.atIndex) + md + text.slice(token.endIndex);
  return {
    kind: "stage2",
    replacement,
    caret: token.atIndex + md.length,
  };
}

/**
 * Zen Persona picker action: commits the highlighted bot as UI state and removes
 * only the active `@...` token from the composer.
 */
export function composeMentionPersonaPlainTextAction(
  text: string,
  caret: number,
  bots: readonly BotMentionPick[],
  highlightedIndex: number
): MentionPersonaSelectAction {
  const token = findAtMentionTokenPlain(text, caret);
  if (!token) return { kind: "none" };

  const filtered = filterBotsForMentionQuery(bots, token.query);
  if (filtered.length === 0) return { kind: "none" };

  const hi = ((highlightedIndex % filtered.length) + filtered.length) % filtered.length;
  const bot = filtered[hi]!;
  const replacement = text.slice(0, token.atIndex) + text.slice(token.endIndex);
  return {
    kind: "select-persona",
    bot,
    replacement,
    caret: token.atIndex,
  };
}
