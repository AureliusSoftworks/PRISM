import { unescapeMarkdownLinkLabel } from "./botMention.ts";
import { findPrismBotMarkdownLinkAtCaret } from "./plainTextWordBackspace.ts";

/** Collapsed caret on a locked prism-bot markdown slice (label + `]`, or href). */
export function isCaretInPrismBotMarkdownLockedRegion(
  text: string,
  caret: number,
  selEnd: number
): boolean {
  if (caret !== selEnd) return false;
  const hit = findPrismBotMarkdownLinkAtCaret(text, caret);
  if (!hit) return false;
  if (hit.inHref) return true;
  return caret >= hit.labelStart && caret <= hit.labelEndExclusive;
}

/**
 * Block keys that would edit locked markdown for a prism-bot link (plain textarea).
 */
export function shouldBlockPlainTextKeyInPrismBotLockedRegion(
  text: string,
  caret: number,
  selEnd: number,
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "defaultPrevented" | "isComposing"
  >
): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (!isCaretInPrismBotMarkdownLockedRegion(text, caret, selEnd)) return false;
  if (event.key === "Backspace" || event.key === "Tab") return false;
  if (event.key.startsWith("Arrow")) return false;
  if (event.key === "Delete") return true;
  if (event.key === "Enter" && event.shiftKey) return true;
  if (event.key.length === 1 && event.key !== "\t") return true;
  if (event.key === " ") return true;
  return false;
}

/** Exclusive end offsets of each whitespace-delimited word in `display`. */
export function displayWordEndOffsets(display: string): number[] {
  const ends: number[] = [];
  let i = 0;
  while (i < display.length) {
    while (i < display.length && /\s/u.test(display[i]!)) {
      i += 1;
    }
    if (i >= display.length) break;
    while (i < display.length && !/\s/u.test(display[i]!)) {
      i += 1;
    }
    ends.push(i);
  }
  return ends;
}

/** Start offsets of each whitespace-delimited word in `display`. */
export function displayWordStartOffsets(display: string): number[] {
  const starts: number[] = [];
  let i = 0;
  while (i < display.length) {
    while (i < display.length && /\s/u.test(display[i]!)) {
      i += 1;
    }
    if (i >= display.length) break;
    starts.push(i);
    while (i < display.length && !/\s/u.test(display[i]!)) {
      i += 1;
    }
  }
  return starts;
}

export function displayOffsetToRawMiddle(
  rawMiddle: string,
  display: string,
  dOff: number
): number {
  if (dOff <= 0) return 0;
  if (dOff >= display.length) return rawMiddle.length;
  if (rawMiddle === display) return dOff;
  return Math.min(dOff, rawMiddle.length);
}

/**
 * Arrow Left/Right over `[label](prism-bot://…)` in a plain string: moves by
 * **word** inside the label, skips the href tail in one step, and hops over the
 * whole link when entering/leaving from outside.
 *
 * @returns new caret index, or `null` to use default movement.
 */
export function prismBotMarkdownArrowCaret(
  text: string,
  caret: number,
  dir: "left" | "right"
): number | null {
  let hit = findPrismBotMarkdownLinkAtCaret(text, caret);

  if (!hit && dir === "right" && caret + 1 <= text.length) {
    const h2 = findPrismBotMarkdownLinkAtCaret(text, caret + 1);
    if (h2 && !h2.inHref && caret + 1 === h2.labelStart) {
      hit = h2;
      const middle = text.slice(hit.labelStart, hit.labelEndExclusive);
      const display = unescapeMarkdownLinkLabel(middle);
      const ends = displayWordEndOffsets(display);
      const firstEnd = ends[0];
      if (firstEnd === undefined) return hit.wholeEndExclusive;
      return hit.labelStart + displayOffsetToRawMiddle(middle, display, firstEnd);
    }
  }

  if (!hit && dir === "left" && caret > 0) {
    const h2 = findPrismBotMarkdownLinkAtCaret(text, caret - 1);
    if (h2 && caret === h2.wholeEndExclusive) {
      const middle = text.slice(h2.labelStart, h2.labelEndExclusive);
      const display = unescapeMarkdownLinkLabel(middle);
      const starts = displayWordStartOffsets(display);
      const lastStart = starts.length > 0 ? starts[starts.length - 1]! : 0;
      return h2.labelStart + displayOffsetToRawMiddle(middle, display, lastStart);
    }
  }

  if (!hit) return null;

  if (hit.inHref) {
    if (dir === "right") return hit.wholeEndExclusive;
    return hit.labelEndExclusive;
  }

  const { wholeStart, wholeEndExclusive, labelStart, labelEndExclusive } = hit;
  const middle = text.slice(labelStart, labelEndExclusive);
  const display = unescapeMarkdownLinkLabel(middle);
  const rel = caret - labelStart;

  if (dir === "right") {
    if (rel >= middle.length) return wholeEndExclusive;
    const ends = displayWordEndOffsets(display);
    const nextEnd = ends.find((e) => e > rel);
    if (nextEnd !== undefined) {
      return labelStart + displayOffsetToRawMiddle(middle, display, nextEnd);
    }
    return wholeEndExclusive;
  }

  if (rel <= 0) return wholeStart;
  const starts = displayWordStartOffsets(display);
  const prevStart = [...starts].reverse().find((s) => s < rel);
  if (prevStart !== undefined) {
    return labelStart + displayOffsetToRawMiddle(middle, display, prevStart);
  }
  return wholeStart;
}
