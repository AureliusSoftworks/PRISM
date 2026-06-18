import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const DEV_COMMAND_RE = /^\/[a-z0-9][a-z0-9-]*(?=\s|$)/iu;

interface PrismDevCommandHighlightOptions {
  /**
   * When provided, only exact command-name matches are decorated. This keeps
   * `/cle` plain while the user is still typing toward `/clear`.
   */
  commandNames: readonly string[] | null;
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

export function resolveLeadingDevCommandTextRanges(
  firstTextBlockText: string,
  options: { commandNames?: readonly string[] | null } = {}
): LeadingDevCommandTextRanges | null {
  const leadingWs = (firstTextBlockText.match(/^\s*/u)?.[0] ?? "").length;
  const tail = firstTextBlockText.slice(leadingWs);
  const commandMatch = DEV_COMMAND_RE.exec(tail);
  if (!commandMatch) return null;
  const commandName = commandMatch[0].slice(1).toLowerCase();
  if (options.commandNames) {
    const known = new Set(
      options.commandNames
        .map((name) => name.trim().replace(/^\/+/, "").toLowerCase())
        .filter(Boolean)
    );
    if (!known.has(commandName)) return null;
  }

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

export const PrismDevCommandHighlight = Extension.create<PrismDevCommandHighlightOptions>({
  name: "prismDevCommandHighlight",
  addOptions() {
    return {
      commandNames: null,
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
            if (!ranges) return DecorationSet.empty;
            const decorations: Decoration[] = [
              Decoration.inline(ranges.command.from, ranges.command.to, {
                class: "tiptapPrismDevCommandToken",
              }),
            ];
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
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
