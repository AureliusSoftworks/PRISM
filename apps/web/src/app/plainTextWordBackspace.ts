import {
  escapeMarkdownLinkLabel,
  findAtMentionTokenPlain,
  PRISM_BOT_MARKDOWN_LINK_RE,
  unescapeMarkdownLinkLabel,
} from "./botMention.ts";

/** Non-whitespace run (word chunk inside a tagged mention). */
const WORD_CHAR = /[^\s]/u;

/**
 * Word-level delete inside a **short substring** (active `@query` or markdown label).
 * See {@link applyTaggedMentionWordBackspace} for when this runs.
 *
 * @returns `null` to fall back to single-character deletion.
 */
export function applyPlainTextWordBackspace(
  value: string,
  selStart: number,
  selEnd: number
): { value: string; caret: number } | null {
  if (selStart !== selEnd) return null;
  const caret = selStart;
  if (caret <= 0) return null;

  if (
    caret < value.length &&
    /\s/u.test(value[caret - 1]!) &&
    WORD_CHAR.test(value[caret]!)
  ) {
    let end = caret;
    while (end < value.length && WORD_CHAR.test(value[end]!)) {
      end += 1;
    }
    if (end === caret) return null;
    return { value: value.slice(0, caret) + value.slice(end), caret };
  }

  let left = caret;
  while (left > 0 && /\s/u.test(value[left - 1]!)) {
    left -= 1;
  }
  while (left > 0 && WORD_CHAR.test(value[left - 1]!)) {
    left -= 1;
  }
  if (left === caret) return null;
  return { value: value.slice(0, left) + value.slice(caret), caret: left };
}

/**
 * Committed `[label](prism-bot://…)` when the caret touches the link: the
 * bracket label, the `](…)` href tail, or the closing `)` (exclusive end).
 */
export function findPrismBotMarkdownLinkAtCaret(
  text: string,
  caret: number
): {
  wholeStart: number;
  wholeEndExclusive: number;
  labelStart: number;
  labelEndExclusive: number;
  inHref: boolean;
} | null {
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, PRISM_BOT_MARKDOWN_LINK_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const labelEscaped = m[1] ?? "";
    const matchIndex = m.index;
    const labelStart = matchIndex + 1;
    const labelEndExclusive = labelStart + labelEscaped.length;
    const wholeEndExclusive = matchIndex + (m[0]?.length ?? 0);
    if (caret >= labelStart && caret <= labelEndExclusive) {
      return {
        wholeStart: matchIndex,
        wholeEndExclusive,
        labelStart,
        labelEndExclusive,
        inHref: false,
      };
    }
    if (caret > labelEndExclusive && caret < wholeEndExclusive) {
      return {
        wholeStart: matchIndex,
        wholeEndExclusive,
        labelStart,
        labelEndExclusive,
        inHref: true,
      };
    }
  }
  return null;
}

/**
 * Word-level Backspace **only** while editing a tagged bot:
 * - the in-flight `@…` line tail (from `@` through end of line — so multi-word
 *   display names after the caret still participate in word-wise edits), or
 * - the **link label** inside `[label](prism-bot://…)` (committed mention).
 *   With **two or more** words, one Backspace removes the **last word** first.
 *   When only **one** word remains and the caret is at the **end** of that word,
 *   one Backspace removes the **entire** `[label](prism-bot://…)` segment (no
 *   letter-by-letter step-through).
 *
 * Everywhere else returns `null` so the browser keeps normal one-character Backspace.
 */
export function applyTaggedMentionWordBackspace(
  value: string,
  selStart: number,
  selEnd: number
): { value: string; caret: number } | null {
  if (selStart !== selEnd) return null;
  const caret = selStart;

  const atTok = findAtMentionTokenPlain(value, caret);
  if (atTok && caret > atTok.atIndex) {
    const qStart = atTok.atIndex + 1;
    const lineEnd = value.indexOf("\n", atTok.atIndex + 1);
    const qEnd = lineEnd === -1 ? value.length : lineEnd;
    const segment = value.slice(qStart, qEnd);
    const rel = caret - qStart;
    if (rel < 0 || rel > segment.length) return null;
    const applied = applyPlainTextWordBackspace(segment, rel, rel);
    if (!applied) return null;
    return {
      value: value.slice(0, qStart) + applied.value + value.slice(qEnd),
      caret: qStart + applied.caret,
    };
  }

  const labelHit = findPrismBotMarkdownLinkAtCaret(value, caret);
  if (labelHit && !labelHit.inHref) {
    const { wholeStart, wholeEndExclusive, labelStart, labelEndExclusive } = labelHit;
    const middle = value.slice(labelStart, labelEndExclusive);
    const rel = caret - labelStart;
    const middleTrimEnd = middle.trimEnd();
    const displayLabel = unescapeMarkdownLinkLabel(middleTrimEnd);
    const words = displayLabel.split(/\s+/).filter(Boolean);
    const caretAtOrPastLabelContentEnd = rel >= middleTrimEnd.length;

    if (words.length === 1) {
      if (!caretAtOrPastLabelContentEnd) return null;
      return {
        value: value.slice(0, wholeStart) + value.slice(wholeEndExclusive),
        caret: wholeStart,
      };
    }

    const applied = applyPlainTextWordBackspace(middle, rel, rel);
    if (!applied) return null;
    const trimmed = applied.value.trimEnd();
    if (trimmed.length === 0) {
      return {
        value: value.slice(0, wholeStart) + value.slice(wholeEndExclusive),
        caret: wholeStart,
      };
    }
    const escaped = escapeMarkdownLinkLabel(unescapeMarkdownLinkLabel(trimmed));
    return {
      value: value.slice(0, labelStart) + escaped + value.slice(labelEndExclusive),
      caret: labelStart + escaped.length,
    };
  }

  return null;
}
