import type { Editor } from "@tiptap/react";
import {
  filterBotsForMentionQuery,
  formatBotMentionMarkdown,
  type BotMentionPick,
} from "./botMention";

export function editorInFenceLikeContext(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (n.type.name === "codeBlock") return true;
  }
  return false;
}

/**
 * Active `@…` mention token at the caret (same rules as plain-text helper).
 */
export function getAtMentionFromEditor(editor: Editor): {
  from: number;
  to: number;
  query: string;
} | null {
  const fromSel = editor.state.selection.from;
  if (editorInFenceLikeContext(editor, fromSel)) return null;

  const $pos = editor.state.doc.resolve(fromSel);
  if (!$pos.parent.isTextblock) return null;

  const blockStart = $pos.start();
  const textTo = editor.state.doc.textBetween(blockStart, fromSel, "\n", "\n");
  const lineStartInBlock = textTo.lastIndexOf("\n") + 1;
  const lineStart = blockStart + lineStartInBlock;
  const lineToCaret = textTo.slice(lineStartInBlock);
  const atRel = lineToCaret.lastIndexOf("@");
  if (atRel === -1) return null;

  const atPos = lineStart + atRel;
  const query = editor.state.doc.textBetween(atPos + 1, fromSel, "\0", "\0");
  if (query.includes("\n")) return null;

  const codeMark = editor.state.schema.marks.code;
  if (codeMark && editor.state.doc.rangeHasMark(atPos, fromSel, codeMark)) {
    return null;
  }

  return { from: atPos, to: fromSel, query };
}

/**
 * When exactly one bot matches the `@` token, replaces it with the markdown
 * mention link. Returns whether Tab was consumed (caller should preventDefault).
 */
export function applyMentionTabToEditor(
  editor: Editor,
  bots: readonly BotMentionPick[]
): boolean {
  const token = getAtMentionFromEditor(editor);
  if (!token) return false;

  const filtered = filterBotsForMentionQuery(bots, token.query);
  if (filtered.length !== 1) return false;

  const only = filtered[0]!;
  const md = formatBotMentionMarkdown(only);
  editor
    .chain()
    .focus()
    .deleteRange({ from: token.from, to: token.to })
    .insertContentAt(token.from, md, { contentType: "markdown" })
    .run();
  return true;
}

/** Tab completes @ mentions; multi-match inserts the highlighted candidate (arrow keys first). */
export function applyComposeMentionTabToEditor(
  editor: Editor,
  bots: readonly BotMentionPick[],
  highlightedIndex: number
): boolean {
  const token = getAtMentionFromEditor(editor);
  if (!token) return false;

  const filtered = filterBotsForMentionQuery(bots, token.query);
  if (filtered.length === 0) return false;

  if (filtered.length === 1) {
    return applyMentionTabToEditor(editor, bots);
  }

  const hi = ((highlightedIndex % filtered.length) + filtered.length) % filtered.length;
  const pick = filtered[hi]!;
  const md = formatBotMentionMarkdown(pick);
  editor
    .chain()
    .focus()
    .deleteRange({ from: token.from, to: token.to })
    .insertContentAt(token.from, md, { contentType: "markdown" })
    .run();
  return true;
}

export type MentionPersonaEditorAction =
  | { kind: "none" }
  | { kind: "select-persona"; bot: BotMentionPick };

/**
 * Zen Persona picker action: commits the highlighted bot as UI state and removes
 * only the active `@...` token from the rich editor.
 */
export function applyComposeMentionPersonaToEditor(
  editor: Editor,
  bots: readonly BotMentionPick[],
  highlightedIndex: number
): MentionPersonaEditorAction {
  const token = getAtMentionFromEditor(editor);
  if (!token) return { kind: "none" };

  const filtered = filterBotsForMentionQuery(bots, token.query);
  if (filtered.length === 0) return { kind: "none" };

  const hi = ((highlightedIndex % filtered.length) + filtered.length) % filtered.length;
  const bot = filtered[hi]!;
  editor
    .chain()
    .focus()
    .deleteRange({ from: token.from, to: token.to })
    .setTextSelection(token.from)
    .run();
  return { kind: "select-persona", bot };
}
