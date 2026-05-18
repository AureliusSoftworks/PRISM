import type { Editor } from "@tiptap/react";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { applyPlainTextWordBackspace } from "./plainTextWordBackspace";

function hrefIsPrismBot(href: unknown): href is string {
  return typeof href === "string" && href.toLowerCase().startsWith("prism-bot:");
}

/**
 * Returns the doc range `[from, to)` of the contiguous `link` mark with the
 * same `href` covering `fromCaret - 1` (the character Backspace would remove).
 */
export function findPrismBotLinkTextRange(
  state: EditorState,
  fromCaret: number
): { from: number; to: number; linkAttrs: Record<string, unknown> } | null {
  const linkType = state.schema.marks.link;
  if (!linkType || fromCaret < 0 || fromCaret > state.doc.content.size) {
    return null;
  }
  const docSize = state.doc.content.size;
  const probes =
    fromCaret >= 1 ? [fromCaret - 1, fromCaret] : [fromCaret];
  for (const probe of probes) {
    if (probe < 0 || probe > docSize) continue;
    const $p = state.doc.resolve(probe);
    const linkMark = linkType.isInSet($p.marks()) as Mark | undefined;
    if (!linkMark || !hrefIsPrismBot(linkMark.attrs.href)) continue;
    const href = linkMark.attrs.href as string;

    let from = probe;
    let to = probe + 1;
    while (from > 0) {
      const $ = state.doc.resolve(from - 1);
      const m = linkType.isInSet($.marks()) as Mark | undefined;
      if (!m || m.attrs.href !== href) break;
      from -= 1;
    }
    while (to < docSize) {
      const $ = state.doc.resolve(to);
      const m = linkType.isInSet($.marks()) as Mark | undefined;
      if (!m || m.attrs.href !== href) break;
      to += 1;
    }
    return { from, to, linkAttrs: { ...linkMark.attrs } };
  }
  return null;
}

/**
 * Word-wise Backspace inside a `prism-bot://` link: multi-word labels drop the
 * trailing word first. When only one word remains and the caret is at the end
 * of that word, one Backspace removes the whole mention (no per-letter phase).
 *
 * @returns true when the key event should be treated as handled.
 */
export function applyPrismBotLinkBackspace(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (!sel.empty) return false;
  const caret = sel.from;
  if (caret < 1) return false;

  const span = findPrismBotLinkTextRange(state, caret);
  if (!span) return false;

  const { from, to, linkAttrs } = span;
  const label = state.doc.textBetween(from, to, "", "");
  const rel = caret - from;
  const labelTrimEnd = label.trimEnd();
  const words = labelTrimEnd.split(/\s+/).filter(Boolean);
  const caretAtOrPastLabelContentEnd = rel >= labelTrimEnd.length;

  if (words.length === 1) {
    if (!caretAtOrPastLabelContentEnd) return false;
    editor.chain().focus().deleteRange({ from, to }).run();
    return true;
  }

  const applied = applyPlainTextWordBackspace(label, rel, rel);
  if (!applied) return false;

  const next = applied.value.trimEnd();
  if (next.length === 0) {
    editor.chain().focus().deleteRange({ from, to }).run();
    return true;
  }

  editor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContentAt(from, {
      type: "text",
      text: next,
      marks: [{ type: "link", attrs: linkAttrs }],
    })
    .setTextSelection(from + next.length)
    .run();
  return true;
}
