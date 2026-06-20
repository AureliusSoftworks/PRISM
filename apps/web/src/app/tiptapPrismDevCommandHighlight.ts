import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const DEV_COMMAND_RE = /^\/[a-z0-9][a-z0-9-]*(?=\s|$)/iu;
const PROMPT_SHORTCUT_RE = /(^|[\s([{])\/([a-z0-9][a-z0-9-]*)(?=\s|$|[.,;:!?)}\]])/giu;
const WILDCARD_DECK_RE = /(^|[\s([{])!([a-z0-9][a-z0-9_-]*)(?=\s|$|[.,;:!?)}\]])/giu;
const TRUE_WILDCARD_SLOT_RE = /\{([A-Z][A-Z0-9_ ]{1,63})\}/g;

export interface PendingWildcardSlotDecoration {
  from: number;
  to: number;
  key: string;
  text?: string;
}

interface PrismDevCommandHighlightOptions {
  /**
   * When provided, only exact command-name matches are decorated. This keeps
   * `/cle` plain while the user is still typing toward `/clear`.
   */
  commandNames: readonly string[] | null;
  /**
   * User-created prompt shortcuts. These are decorated inline and can have
   * normal text before or after them.
   */
  promptNames: readonly string[] | null;
  /** User-created wildcard decks. These are decorated inline after `!`. */
  wildcardNames: readonly string[] | null;
  /** Temporary rich-composer hardcoded wildcard generations. */
  pendingWildcardSlots: (() => readonly PendingWildcardSlotDecoration[]) | null;
}

interface DevCommandHighlightRanges {
  command: { from: number; to: number };
  quotedStrings: Array<{ from: number; to: number }>;
  actionTokens: Array<{ from: number; to: number }>;
  argument?: { from: number; to: number };
}

export interface LeadingDevCommandTextRanges {
  commandStart: number;
  commandEnd: number;
  quotedStringRanges: Array<{ start: number; end: number }>;
  actionTokenRanges: Array<{ start: number; end: number }>;
  argumentStart?: number;
  argumentEnd?: number;
}

export interface PromptShortcutTextRange {
  start: number;
  end: number;
  name: string;
}

function normalizedKnownNames(names: readonly string[] | null | undefined): Set<string> | null {
  if (!names) return null;
  return new Set(
    names
      .map((name) => name.trim().replace(/^[!/]+/, "").toLowerCase())
      .filter(Boolean)
  );
}

function normalizeTrueWildcardSlotName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[{}]/g, "")
    .replace(/[-_\s]+/g, "_")
    .toUpperCase();
}

export function resolveLeadingDevCommandTextRanges(
  firstTextBlockText: string,
  options: { commandNames?: readonly string[] | null } = {}
): LeadingDevCommandTextRanges | null {
  const leadingWs = (firstTextBlockText.match(/^\s*/u)?.[0] ?? "").length;
  const tail = firstTextBlockText.slice(leadingWs);
  const commandMatch = DEV_COMMAND_RE.exec(tail);
  if (!commandMatch) return null;
  const commandName = commandMatch[0].slice(1).toLowerCase();
  const known = normalizedKnownNames(options.commandNames);
  if (known && !known.has(commandName)) return null;

  const commandStart = leadingWs;
  const commandEnd = commandStart + commandMatch[0].length;
  const text = firstTextBlockText;
  const quotedStringRanges: Array<{ start: number; end: number }> = [];
  let cursor = commandEnd;
  const len = text.length;
  const consumeWhitespace = () => {
    while (cursor < len && /[\t ]/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
  };
  consumeWhitespace();
  while (cursor < len && (text[cursor] === "\"" || text[cursor] === "*")) {
    if (text[cursor] === "\"") {
      const rangeStart = cursor;
      cursor += 1;
      let closed = false;
      while (cursor < len) {
        const ch = text[cursor] ?? "";
        if (ch === "\\") {
          if (cursor + 1 < len) {
            cursor += 2;
            continue;
          }
          cursor += 1;
          continue;
        }
        if (ch === "\"") {
          closed = true;
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (!closed) break;
      quotedStringRanges.push({ start: rangeStart, end: cursor });
    } else {
      let end = cursor + 1;
      while (end < len && text[end] !== "*") {
        end += 1;
      }
      if (end >= len) break;
      cursor = end + 1;
    }
    consumeWhitespace();
    if (text[cursor] !== "+") break;
    cursor += 1;
    consumeWhitespace();
  }

  const tailAfterStrings = text.slice(cursor);
  const expressionText = text.slice(commandEnd, cursor);
  const actionTokenRanges: Array<{ start: number; end: number }> = [];
  const actionTokenRe = /\*[^*\n]+\*/gu;
  for (const match of expressionText.matchAll(actionTokenRe)) {
    const token = match[0] ?? "";
    const relStart = match.index ?? -1;
    if (token.length === 0 || relStart < 0) continue;
    actionTokenRanges.push({
      start: commandEnd + relStart,
      end: commandEnd + relStart + token.length,
    });
  }
  const argMatch =
    /^[\t ]*(?:--wait|--load|-load)(?:[\t ]+[0-9]*(?:\.[0-9]*)?)?/u.exec(tailAfterStrings);
  const argumentLeadingWs = (tailAfterStrings.match(/^[\t ]*/u)?.[0] ?? "").length;
  const argumentStart =
    argMatch && argMatch[0].length > argumentLeadingWs
      ? cursor + argumentLeadingWs
      : undefined;
  const argumentEnd =
    typeof argumentStart === "number" && argMatch
      ? cursor + argMatch[0].length
      : undefined;
  return {
    commandStart,
    commandEnd,
    quotedStringRanges,
    actionTokenRanges,
    ...(typeof argumentStart === "number" && typeof argumentEnd === "number"
      ? { argumentStart, argumentEnd }
      : {}),
  };
}

export function resolvePromptShortcutTextRanges(
  text: string,
  options: { promptNames?: readonly string[] | null } = {}
): PromptShortcutTextRange[] {
  const known = normalizedKnownNames(options.promptNames);
  if (known && known.size === 0) return [];
  const ranges: PromptShortcutTextRange[] = [];
  for (const match of text.matchAll(PROMPT_SHORTCUT_RE)) {
    const raw = match[0] ?? "";
    const name = (match[2] ?? "").trim().toLowerCase();
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0 || !name) continue;
    if (known && !known.has(name)) continue;
    const delimiterLength = raw.startsWith("/") ? 0 : 1;
    const start = matchIndex + delimiterLength;
    ranges.push({
      start,
      end: start + 1 + name.length,
      name,
    });
  }
  return ranges;
}

export function resolveWildcardDeckTextRanges(
  text: string,
  options: { wildcardNames?: readonly string[] | null } = {}
): PromptShortcutTextRange[] {
  const known = normalizedKnownNames(options.wildcardNames);
  if (known && known.size === 0) return [];
  const ranges: PromptShortcutTextRange[] = [];
  for (const match of text.matchAll(WILDCARD_DECK_RE)) {
    const raw = match[0] ?? "";
    const name = (match[2] ?? "").trim().toLowerCase();
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0 || !name) continue;
    if (known && !known.has(name)) continue;
    const delimiterLength = raw.startsWith("!") ? 0 : 1;
    const start = matchIndex + delimiterLength;
    ranges.push({
      start,
      end: start + 1 + name.length,
      name,
    });
  }
  return ranges;
}

export function resolvePendingWildcardSlotTextRanges(
  text: string,
  options: { pendingWildcardSlotNames?: readonly string[] | null } = {}
): PromptShortcutTextRange[] {
  const known = normalizedKnownNames(
    options.pendingWildcardSlotNames?.map(normalizeTrueWildcardSlotName) ?? null
  );
  if (known && known.size === 0) return [];
  const ranges: PromptShortcutTextRange[] = [];
  for (const match of text.matchAll(TRUE_WILDCARD_SLOT_RE)) {
    const rawName = match[1] ?? "";
    const name = normalizeTrueWildcardSlotName(rawName);
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0 || !name) continue;
    if (known && !known.has(name.toLowerCase())) continue;
    ranges.push({
      start: matchIndex,
      end: matchIndex + (match[0]?.length ?? 0),
      name,
    });
  }
  return ranges;
}

export function hasLeadingDevCommand(doc: ProseMirrorNode): boolean {
  return findLeadingDevCommandRanges(doc) !== null;
}

function findLeadingDevCommandRanges(
  doc: ProseMirrorNode,
  commandNames?: readonly string[] | null
): DevCommandHighlightRanges | null {
  let firstTextBlockText = "";
  let firstTextBlockPos = -1;
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!node.isTextblock) return true;
    firstTextBlockText = node.textContent;
    firstTextBlockPos = pos;
    return false;
  });
  if (firstTextBlockPos < 0) return null;
  const textRanges = resolveLeadingDevCommandTextRanges(firstTextBlockText, {
    commandNames,
  });
  if (!textRanges) return null;
  const commandFrom = firstTextBlockPos + 1 + textRanges.commandStart;
  const commandTo = firstTextBlockPos + 1 + textRanges.commandEnd;
  const quotedStrings = textRanges.quotedStringRanges
    .filter((range) => range.end > range.start)
    .map((range) => ({
      from: firstTextBlockPos + 1 + range.start,
      to: firstTextBlockPos + 1 + range.end,
    }));
  const actionTokens = textRanges.actionTokenRanges
    .filter((range) => range.end > range.start)
    .map((range) => ({
      from: firstTextBlockPos + 1 + range.start,
      to: firstTextBlockPos + 1 + range.end,
    }));
  const argument =
    typeof textRanges.argumentStart === "number" &&
    typeof textRanges.argumentEnd === "number" &&
    textRanges.argumentEnd > textRanges.argumentStart
      ? {
          from: firstTextBlockPos + 1 + textRanges.argumentStart,
          to: firstTextBlockPos + 1 + textRanges.argumentEnd,
        }
      : undefined;
  return {
    command: { from: commandFrom, to: commandTo },
    quotedStrings,
    actionTokens,
    argument,
  };
}

export function findLeadingDevCommandTokenRange(
  doc: ProseMirrorNode,
  commandNames?: readonly string[] | null
): { from: number; to: number } | null {
  return findLeadingDevCommandRanges(doc, commandNames)?.command ?? null;
}

export function findPromptShortcutTokenRanges(
  doc: ProseMirrorNode,
  promptNames?: readonly string[] | null
): Array<{ from: number; to: number; name: string }> {
  const ranges: Array<{ from: number; to: number; name: string }> = [];
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!node.isTextblock) return true;
    const textRanges = resolvePromptShortcutTextRanges(node.textContent, {
      promptNames,
    });
    for (const range of textRanges) {
      ranges.push({
        from: pos + 1 + range.start,
        to: pos + 1 + range.end,
        name: range.name,
      });
    }
    return true;
  });
  return ranges;
}

export function findWildcardDeckTokenRanges(
  doc: ProseMirrorNode,
  wildcardNames?: readonly string[] | null
): Array<{ from: number; to: number; name: string }> {
  const ranges: Array<{ from: number; to: number; name: string }> = [];
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!node.isTextblock) return true;
    const textRanges = resolveWildcardDeckTextRanges(node.textContent, {
      wildcardNames,
    });
    for (const range of textRanges) {
      ranges.push({
        from: pos + 1 + range.start,
        to: pos + 1 + range.end,
        name: range.name,
      });
    }
    return true;
  });
  return ranges;
}

function normalizePendingWildcardSlotRanges(
  doc: ProseMirrorNode,
  pendingSlots: readonly PendingWildcardSlotDecoration[] | null | undefined
): PendingWildcardSlotDecoration[] {
  if (!pendingSlots || pendingSlots.length === 0) return [];
  const ranges: PendingWildcardSlotDecoration[] = [];
  for (const pending of pendingSlots) {
    const from = Math.floor(pending.from);
    const to = Math.floor(pending.to);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to <= from ||
      to > doc.content.size
    ) {
      continue;
    }
    const key = normalizeTrueWildcardSlotName(pending.key);
    if (!key) continue;
    const text = doc.textBetween(from, to, "\n", "\n");
    const expected = pending.text ?? `{${key.replace(/_/g, " ")}}`;
    if (text !== expected) continue;
    ranges.push({ from, to, key });
  }
  return ranges;
}

export const PrismDevCommandHighlight = Extension.create<PrismDevCommandHighlightOptions>({
  name: "prismDevCommandHighlight",
  addOptions() {
    return {
      commandNames: null,
      promptNames: null,
      wildcardNames: null,
      pendingWildcardSlots: null,
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const ranges = findLeadingDevCommandRanges(
              state.doc,
              this.options.commandNames
            );
            const promptRanges = findPromptShortcutTokenRanges(
              state.doc,
              this.options.promptNames
            );
            const wildcardRanges = findWildcardDeckTokenRanges(
              state.doc,
              this.options.wildcardNames
            );
            const pendingWildcardRanges = normalizePendingWildcardSlotRanges(
              state.doc,
              this.options.pendingWildcardSlots?.() ?? null
            );
            const decorations: Decoration[] = [];
            if (ranges) {
              decorations.push(
                Decoration.inline(ranges.command.from, ranges.command.from + 1, {
                  class: "tiptapPrismSlashChipPrefix",
                })
              );
              decorations.push(
                Decoration.inline(ranges.command.from + 1, ranges.command.to, {
                  class: "tiptapPrismDevCommandToken",
                })
              );
              for (const quotedString of ranges.quotedStrings) {
                decorations.push(
                  Decoration.inline(quotedString.from, quotedString.to, {
                    class: "tiptapPrismDevCommandQuotedToken",
                  })
                );
              }
              for (const actionToken of ranges.actionTokens) {
                decorations.push(
                  Decoration.inline(actionToken.from, actionToken.to, {
                    class: "tiptapPrismDevCommandActionToken",
                  })
                );
              }
              if (ranges.argument && ranges.argument.to > ranges.argument.from) {
                decorations.push(
                  Decoration.inline(ranges.argument.from, ranges.argument.to, {
                    class: "tiptapPrismDevCommandArgumentToken",
                  })
                );
              }
            }
            for (const promptRange of promptRanges) {
              decorations.push(
                Decoration.inline(promptRange.from, promptRange.from + 1, {
                  class: "tiptapPrismSlashChipPrefix",
                })
              );
              decorations.push(
                Decoration.inline(promptRange.from + 1, promptRange.to, {
                  class: "tiptapPrismPromptShortcutToken",
                })
              );
            }
            for (const wildcardRange of wildcardRanges) {
              decorations.push(
                Decoration.inline(wildcardRange.from, wildcardRange.from + 1, {
                  class: "tiptapPrismWildcardDeckPrefix",
                })
              );
              decorations.push(
                Decoration.inline(wildcardRange.from + 1, wildcardRange.to, {
                  class: "tiptapPrismWildcardDeckToken",
                })
              );
            }
            for (const pendingRange of pendingWildcardRanges) {
              decorations.push(
                Decoration.inline(pendingRange.from, pendingRange.to, {
                  class: "tiptapPrismPendingWildcardSlotToken",
                  "data-prism-wildcard-slot": pendingRange.key,
                })
              );
            }
            if (decorations.length === 0) return DecorationSet.empty;
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
