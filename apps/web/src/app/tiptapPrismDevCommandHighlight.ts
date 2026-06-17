import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface PrismDevCommandHighlightSpec {
  name: string;
  arguments?: readonly string[];
}

export interface PrismDevCommandHighlightOptions {
  commands?: readonly PrismDevCommandHighlightSpec[];
}

const BUILT_IN_COMMAND_HIGHLIGHT_SPECS: readonly PrismDevCommandHighlightSpec[] = [
  { name: "dev" },
  { name: "echo", arguments: ["wait", "load"] },
  { name: "forget" },
  { name: "help" },
  { name: "clear" },
];

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

function normalizeCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

function normalizeCommandArgumentName(value: string): string {
  return value.trim().replace(/^[-/]+/, "").toLowerCase();
}

function buildCommandSpecLookup(
  options?: PrismDevCommandHighlightOptions
): Map<string, Set<string>> {
  const specs = [
    ...BUILT_IN_COMMAND_HIGHLIGHT_SPECS,
    ...(options?.commands ?? []),
  ];
  const lookup = new Map<string, Set<string>>();
  for (const spec of specs) {
    const name = normalizeCommandName(spec.name);
    if (!name) continue;
    const existing = lookup.get(name) ?? new Set<string>();
    for (const arg of spec.arguments ?? []) {
      const normalizedArg = normalizeCommandArgumentName(arg);
      if (normalizedArg) existing.add(normalizedArg);
    }
    lookup.set(name, existing);
  }
  return lookup;
}

function resolveKnownCommand(
  tail: string,
  options?: PrismDevCommandHighlightOptions
): { commandText: string; argumentNames: ReadonlySet<string> } | null {
  const match = /^\/([^\s/]+)(?=\s|$)/u.exec(tail);
  if (!match) return null;
  const commandText = match[0] ?? "";
  const name = normalizeCommandName(match[1] ?? "");
  if (!name) return null;
  const spec = buildCommandSpecLookup(options).get(name);
  if (!spec) return null;
  return { commandText, argumentNames: spec };
}

function resolveKnownArgumentRange(
  text: string,
  startCursor: number,
  argumentNames: ReadonlySet<string>
): { start: number; end: number } | null {
  if (argumentNames.size === 0) return null;
  let scan = startCursor;
  let argumentStart: number | undefined;
  let argumentEnd: number | undefined;
  while (scan < text.length) {
    const tail = text.slice(scan);
    const leadingWs = /^[\t ]*/u.exec(tail)?.[0].length ?? 0;
    const flagStart = scan + leadingWs;
    const flagMatch = /^--?([A-Za-z0-9][A-Za-z0-9-]*)/u.exec(text.slice(flagStart));
    if (!flagMatch) break;
    const key = normalizeCommandArgumentName(flagMatch[1] ?? "");
    if (!argumentNames.has(key)) break;
    let flagEnd = flagStart + (flagMatch[0]?.length ?? 0);
    if (key === "wait" || key === "load") {
      const numericValueMatch = /^[\t ]+[0-9]+(?:\.[0-9]+)?/u.exec(text.slice(flagEnd));
      if (numericValueMatch) {
        flagEnd += numericValueMatch[0].length;
      }
    }
    argumentStart ??= flagStart;
    argumentEnd = flagEnd;
    scan = flagEnd;
  }
  return typeof argumentStart === "number" && typeof argumentEnd === "number"
    ? { start: argumentStart, end: argumentEnd }
    : null;
}

export function resolveLeadingDevCommandTextRanges(
  firstTextBlockText: string,
  options?: PrismDevCommandHighlightOptions
): LeadingDevCommandTextRanges | null {
  const leadingWs = (firstTextBlockText.match(/^\s*/u)?.[0] ?? "").length;
  const tail = firstTextBlockText.slice(leadingWs);
  const commandMatch = resolveKnownCommand(tail, options);
  if (!commandMatch) return null;

  const commandStart = leadingWs;
  const commandEnd = commandStart + commandMatch.commandText.length;
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
  const argumentRange = resolveKnownArgumentRange(
    firstTextBlockText,
    cursor,
    commandMatch.argumentNames
  );
  return {
    commandStart,
    commandEnd,
    quotedStringRanges,
    actionTokenRanges,
    ...(argumentRange
      ? { argumentStart: argumentRange.start, argumentEnd: argumentRange.end }
      : {}),
  };
}

export function hasLeadingDevCommand(
  doc: ProseMirrorNode,
  options?: PrismDevCommandHighlightOptions
): boolean {
  return findLeadingDevCommandRanges(doc, options) !== null;
}

function findLeadingDevCommandRanges(
  doc: ProseMirrorNode,
  options?: PrismDevCommandHighlightOptions
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
  const textRanges = resolveLeadingDevCommandTextRanges(firstTextBlockText, options);
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

export const PrismDevCommandHighlight = Extension.create<PrismDevCommandHighlightOptions>({
  name: "prismDevCommandHighlight",
  addOptions(): PrismDevCommandHighlightOptions {
    return {
      commands: [],
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const ranges = findLeadingDevCommandRanges(state.doc, this.options);
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
