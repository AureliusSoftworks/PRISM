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
  if (!text) return { mainText: "", actions: [] };
  // 1+ leading asterisks, non-asterisk content (lazy), 1+ trailing asterisks.
  const re = /\*+([^*\n]+?)\*+/g;
  const actions: string[] = [];
  let mainText = text.replace(re, (match, inner, offset, fullText) => {
    const trimmed = String(inner).trim();
    const before = fullText.slice(0, offset);
    const after = fullText.slice(offset + String(match).length);
    const hasSpokenBefore = /\p{L}|\p{N}/u.test(before);
    const hasSpokenAfter = /\p{L}|\p{N}/u.test(after);

    // A block embedded between words is most likely accidental Markdown
    // emphasis, not a stage direction. Keep its content so prose like
    // "the *thought* that counts" never becomes "the that counts".
    if (hasSpokenBefore && hasSpokenAfter) {
      return trimmed;
    }

    if (trimmed.length > 0) actions.push(trimmed);
    return "";
  });
  // Final scrub: any leftover asterisks are malformed (e.g. the bot opened
  // an action and never closed it). Drop them so they never leak as a
  // visible `*` artifact at the start/end of the spoken line.
  mainText = mainText.replace(/\*+/g, "");
  mainText = mainText.replace(/\s+/g, " ").trim();
  return { mainText, actions };
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
