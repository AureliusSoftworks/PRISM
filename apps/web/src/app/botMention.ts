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
  /\[((?:[^\]]|\\.)*)\]\(\s*prism-bot:\/\/([^)\s]+)\s*\)/gi;

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
