import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  applyComposerGhostCompletion,
  type ComposerGhostSuggestion,
  resolveComposerGhostCompletion,
} from "./composerGhostAutocomplete.ts";
import { isCollapsedCaretInsidePrismBotLink } from "./botMentionTipTapArrow.ts";

type ComposerGhostEnabled = boolean | (() => boolean);

interface ComposerGhostAutocompleteOptions {
  enabled: ComposerGhostEnabled;
  lexicon: readonly string[];
}

function resolveEnabled(value: ComposerGhostEnabled): boolean {
  return typeof value === "function" ? value() : value;
}

export function resolveEditorComposerGhostCompletion(
  state: EditorState,
  lexicon: readonly string[]
): ComposerGhostSuggestion | null {
  if (!state.selection.empty) return null;
  if (isCollapsedCaretInsidePrismBotLink(state, state.selection.from)) return null;

  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  return resolveComposerGhostCompletion({
    text,
    selectionStart: $from.parentOffset,
    selectionEnd: $from.parentOffset,
    lexicon,
  });
}

export function applyEditorComposerGhostCompletion(
  editor: Editor,
  lexicon: readonly string[]
): boolean {
  const suggestion = resolveEditorComposerGhostCompletion(editor.state, lexicon);
  if (!suggestion) return false;
  const parentText = editor.state.selection.$from.parent.textBetween(
    0,
    editor.state.selection.$from.parent.content.size,
    "\n",
    "\n"
  );
  if (!applyComposerGhostCompletion(parentText, suggestion)) return false;
  editor.chain().focus().insertContent(suggestion.suffix).run();
  return true;
}

export const ComposerGhostAutocomplete =
  Extension.create<ComposerGhostAutocompleteOptions>({
    name: "composerGhostAutocomplete",

    addOptions() {
      return {
        enabled: true,
        lexicon: [],
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: (state) => {
              if (!resolveEnabled(this.options.enabled)) return DecorationSet.empty;
              const suggestion = resolveEditorComposerGhostCompletion(
                state,
                this.options.lexicon
              );
              if (!suggestion) return DecorationSet.empty;
              const element = document.createElement("span");
              element.className = "tiptapComposerGhostSuffix";
              element.setAttribute("aria-hidden", "true");
              element.setAttribute("contenteditable", "false");
              element.textContent = suggestion.suffix;
              return DecorationSet.create(state.doc, [
                Decoration.widget(state.selection.from, element, {
                  key: `composer-ghost-${state.selection.from}-${suggestion.suffix}`,
                  side: 1,
                }),
              ]);
            },
          },
        }),
      ];
    },
  });
