import type { Editor } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { findPrismBotLinkTextRange } from "./botMentionTipTapBackspace";
import {
  displayOffsetToRawMiddle,
  displayWordEndOffsets,
  displayWordStartOffsets,
} from "./prismBotMarkdownNav";

/** Collapsed caret lies on marked prism-bot text (not past the mark's end). */
export function isCollapsedCaretInsidePrismBotLink(
  state: EditorState,
  caret: number
): boolean {
  const span = findPrismBotLinkTextRange(state, caret);
  return Boolean(span && caret >= span.from && caret < span.to);
}

/**
 * Block keys that would **insert or replace** text inside a prism-bot mention.
 */
export function shouldBlockPrintableInPrismBotLink(
  editor: Editor,
  event: KeyboardEvent
): boolean {
  if (event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing) return false;
  if (event.key === "Backspace" || event.key === "Tab") {
    return false;
  }
  if (event.key.startsWith("Arrow")) return false;
  const { state } = editor;
  const sel = state.selection;
  if (!sel.empty) return false;
  if (!isCollapsedCaretInsidePrismBotLink(state, sel.from)) return false;
  if (event.key === "Delete") return true;
  if (event.key === "Enter" && event.shiftKey) return true;
  if (event.key.length === 1 && event.key !== "\t") return true;
  if (event.key === " ") return true;
  return false;
}

/**
 * Arrow Left/Right: move by **word** inside the link, or jump over the whole
 * mention when crossing its boundary.
 */
export function applyPrismBotLinkArrowKey(editor: Editor, dir: "left" | "right"): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (!sel.empty) return false;
  const caret = sel.from;

  let span = findPrismBotLinkTextRange(state, caret);
  let mode: "inside" | "before" | "after" | "none" = "none";
  if (span) {
    if (caret >= span.from && caret < span.to) mode = "inside";
    else if (caret === span.to) mode = "after";
  }
  if (!span && dir === "right" && caret + 1 <= state.doc.content.size) {
    const s2 = findPrismBotLinkTextRange(state, caret + 1);
    if (s2 && caret === s2.from - 1) {
      span = s2;
      mode = "before";
    }
  }
  if (!span) return false;

  const label = state.doc.textBetween(span.from, span.to, "", "");
  const display = label;

  if (mode === "before" && dir === "right") {
    const ends = displayWordEndOffsets(display);
    const firstEnd = ends[0];
    const nextPos =
      firstEnd === undefined
        ? span.to
        : span.from + displayOffsetToRawMiddle(label, display, firstEnd);
    editor.chain().focus().setTextSelection(nextPos).run();
    return true;
  }

  if (mode === "after" && dir === "left") {
    const starts = displayWordStartOffsets(display);
    const lastStart = starts.length > 0 ? starts[starts.length - 1]! : 0;
    const pos = span.from + displayOffsetToRawMiddle(label, display, lastStart);
    editor.chain().focus().setTextSelection(pos).run();
    return true;
  }

  if (mode !== "inside") return false;

  const rel = caret - span.from;

  if (dir === "right") {
    if (rel >= label.length) {
      editor.chain().focus().setTextSelection(span.to).run();
      return true;
    }
    const ends = displayWordEndOffsets(display);
    const nextEnd = ends.find((e) => e > rel);
    const nextPos =
      nextEnd === undefined
        ? span.to
        : span.from + displayOffsetToRawMiddle(label, display, nextEnd);
    editor.chain().focus().setTextSelection(nextPos).run();
    return true;
  }

  if (rel <= 0) {
    editor.chain().focus().setTextSelection(span.from - 1).run();
    return true;
  }
  const starts = displayWordStartOffsets(display);
  const prevStart = [...starts].reverse().find((s) => s < rel);
  const nextPos =
    prevStart === undefined
      ? span.from - 1
      : span.from + displayOffsetToRawMiddle(label, display, prevStart);
  editor.chain().focus().setTextSelection(nextPos).run();
  return true;
}
