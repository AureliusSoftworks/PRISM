"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Extension, type JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import {
  slatePlainTextToTiptapDocument,
  slateTiptapJsonToSectionDocument,
  slateTiptapDocumentToPlainText,
  slateWordCount,
  type SlateDocumentAnnotationV1,
  type SlateDocumentPosition,
  type SlateSectionDocumentV1,
} from "./slateManuscriptDocument";
import styles from "./slateManuscriptCanvas.module.css";

export interface SlateCanvasSelection {
  start: number;
  end: number;
  startPosition?: SlateDocumentPosition | null;
  endPosition?: SlateDocumentPosition | null;
}

interface SlateManuscriptCanvasProps {
  documentKey: string;
  value: string;
  document?: SlateSectionDocumentV1 | null;
  disabled?: boolean;
  placeholder: string;
  annotations?: readonly SlateDocumentAnnotationV1[];
  onChange: (
    value: string,
    document: SlateSectionDocumentV1,
    documentKey: string,
  ) => void;
  onSelectionChange: (selection: SlateCanvasSelection) => void;
  onLockSelection: () => void;
  onDiscussSelection?: () => void;
  onDirectSelection: () => void;
  onCreateNote?: (input: {
    body: string;
    selection: SlateCanvasSelection;
    blockId: string | null;
    startPosition: SlateDocumentPosition | null;
    endPosition: SlateDocumentPosition | null;
  }) => void;
  onResolveNote?: (annotationId: string) => void;
}

const SlateBlockAttributes = Extension.create({
  name: "slateBlockAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "horizontalRule"],
        attributes: {
          blockId: {
            default: null,
            rendered: false,
          },
          trailingSeparator: {
            default: "",
            rendered: false,
          },
        },
      },
    ];
  },
});

function editorPlainOffset(
  document: ProseMirrorNode,
  position: number,
): number {
  return document.textBetween(0, position, "\n\n", "***").length;
}

function editorPositionForPlainOffset(
  editor: Editor,
  target: number,
): number {
  const max = editor.state.doc.content.size;
  if (target <= 0) return 1;
  for (let position = 1; position <= max; position += 1) {
    if (editorPlainOffset(editor.state.doc, position) >= target) {
      return position;
    }
  }
  return max;
}

function slateBlockPosition(
  editor: Editor,
  position: number,
  affinity: SlateDocumentPosition["affinity"],
): SlateDocumentPosition | null {
  const resolved = editor.state.doc.resolve(position);
  const attrs = resolved.parent.attrs as Record<string, unknown>;
  const blockId = typeof attrs.blockId === "string" ? attrs.blockId : null;
  if (!blockId) return null;
  return {
    blockId,
    offset: editor.state.doc.textBetween(
      resolved.start(),
      position,
      "\n",
      "***",
    ).length,
    affinity,
  };
}

export function SlateManuscriptCanvas({
  documentKey,
  value,
  document,
  disabled = false,
  placeholder,
  annotations = [],
  onChange,
  onSelectionChange,
  onLockSelection,
  onDiscussSelection,
  onDirectSelection,
  onCreateNote,
  onResolveNote,
}: SlateManuscriptCanvasProps): React.JSX.Element {
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const documentRef = useRef<SlateSectionDocumentV1 | null | undefined>(
    document,
  );
  const activeDocumentKeyRef = useRef(documentKey);
  const lastProjectedTextRef = useRef(value);
  const lastProjectedDocumentRef = useRef(
    JSON.stringify(
      document ??
        slatePlainTextToTiptapDocument(value, documentKey),
    ),
  );
  const caretByDocumentRef = useRef(
    new Map<string, { from: number; to: number }>(),
  );
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findStatus, setFindStatus] = useState("");
  const [noteDraftOpen, setNoteDraftOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        link: false,
        orderedList: false,
      }),
      SlateBlockAttributes,
      Placeholder.configure({ placeholder }),
    ],
    content:
      (document ??
        slatePlainTextToTiptapDocument(value, documentKey)) as JSONContent,
    editorProps: {
      attributes: {
        class: styles.prose,
        spellcheck: "true",
        autocorrect: "on",
        autocapitalize: "sentences",
        role: "textbox",
        "aria-label": "Focused manuscript section",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const nextDocument = slateTiptapJsonToSectionDocument(
        activeEditor.getJSON() as unknown as {
          type?: string;
          content?: import("./slateManuscriptDocument").SlateDocumentNodeV1[];
        },
        activeDocumentKeyRef.current,
        documentRef.current,
      );
      const next = slateTiptapDocumentToPlainText(nextDocument);
      lastProjectedTextRef.current = next;
      lastProjectedDocumentRef.current = JSON.stringify(nextDocument);
      documentRef.current = nextDocument;
      onChangeRef.current(
        next,
        nextDocument,
        activeDocumentKeyRef.current,
      );
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      const { from, to } = activeEditor.state.selection;
      caretByDocumentRef.current.set(activeDocumentKeyRef.current, { from, to });
      onSelectionChangeRef.current({
        start: editorPlainOffset(activeEditor.state.doc, from),
        end: editorPlainOffset(activeEditor.state.doc, to),
        startPosition: slateBlockPosition(activeEditor, from, "forward"),
        endPosition: slateBlockPosition(activeEditor, to, "backward"),
      });
    },
  });

  const editorState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      hasSelection: current ? !current.state.selection.empty : false,
    }),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const incomingDocument =
      document ?? slatePlainTextToTiptapDocument(value, documentKey);
    const incomingFingerprint = JSON.stringify(incomingDocument);
    const previousKey = activeDocumentKeyRef.current;
    if (previousKey !== documentKey) {
      const { from, to } = editor.state.selection;
      caretByDocumentRef.current.set(previousKey, { from, to });
      activeDocumentKeyRef.current = documentKey;
      documentRef.current = document;
      lastProjectedTextRef.current = value;
      lastProjectedDocumentRef.current = incomingFingerprint;
      editor.commands.setContent(
        incomingDocument as JSONContent,
        { emitUpdate: false },
      );
      const saved = caretByDocumentRef.current.get(documentKey);
      if (saved) {
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.max(1, Math.min(max, saved.from)),
          to: Math.max(1, Math.min(max, saved.to)),
        });
      } else {
        editor.commands.setTextSelection(1);
      }
      return;
    }
    if (
      (value !== lastProjectedTextRef.current ||
        incomingFingerprint !== lastProjectedDocumentRef.current) &&
      !editor.isFocused
    ) {
      const caretOffset = {
        from: editorPlainOffset(
          editor.state.doc,
          editor.state.selection.from,
        ),
        to: editorPlainOffset(editor.state.doc, editor.state.selection.to),
      };
      documentRef.current = document;
      lastProjectedTextRef.current = value;
      lastProjectedDocumentRef.current = incomingFingerprint;
      editor.commands.setContent(
        incomingDocument as JSONContent,
        { emitUpdate: false },
      );
      editor.commands.setTextSelection({
        from: editorPositionForPlainOffset(editor, caretOffset.from),
        to: editorPositionForPlainOffset(editor, caretOffset.to),
      });
    }
  }, [document, documentKey, editor, value]);

  const wordCount = useMemo(() => slateWordCount(value), [value]);

  const findNext = useCallback(() => {
    if (!editor || !findText) return;
    const prose = slateTiptapDocumentToPlainText(
      slateTiptapJsonToSectionDocument(
        editor.getJSON() as unknown as {
          type?: string;
          content?: import("./slateManuscriptDocument").SlateDocumentNodeV1[];
        },
        activeDocumentKeyRef.current,
        documentRef.current,
      ),
    );
    const currentOffset = editorPlainOffset(
      editor.state.doc,
      editor.state.selection.to,
    );
    const afterCaret = prose.indexOf(findText, currentOffset);
    const index = afterCaret >= 0 ? afterCaret : prose.indexOf(findText);
    if (index < 0) {
      setFindStatus("No match");
      return;
    }
    const from = editorPositionForPlainOffset(editor, index);
    const to = editorPositionForPlainOffset(editor, index + findText.length);
    editor.chain().focus().setTextSelection({ from, to }).run();
    setFindStatus(`${index + 1} of ${prose.length}`);
  }, [editor, findText]);

  const replaceCurrent = useCallback(() => {
    if (!editor || editor.state.selection.empty || !findText) return;
    const selected = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      "\n\n",
      "***",
    );
    if (selected !== findText) {
      findNext();
      return;
    }
    editor.chain().focus().insertContent(replaceText).run();
    setFindStatus("Replaced");
  }, [editor, findNext, findText, replaceText]);

  const saveNote = useCallback(() => {
    if (
      !editor ||
      editor.state.selection.empty ||
      !noteDraft.trim() ||
      !onCreateNote
    ) {
      return;
    }
    const { from, to } = editor.state.selection;
    const startPosition = slateBlockPosition(editor, from, "forward");
    const endPosition = slateBlockPosition(editor, to, "backward");
    onCreateNote({
      body: noteDraft.trim(),
      selection: {
        start: editorPlainOffset(editor.state.doc, from),
        end: editorPlainOffset(editor.state.doc, to),
      },
      blockId: startPosition?.blockId ?? null,
      startPosition,
      endPosition,
    });
    setNoteDraft("");
    setNoteDraftOpen(false);
  }, [editor, noteDraft, onCreateNote]);

  return (
    <section
      className={styles.canvas}
      data-slate-rich-canvas="true"
      data-tutorial-target="slate-manuscript"
    >
      <div className={styles.toolbar} aria-label="Manuscript formatting">
        <div>
          <button
            type="button"
            data-active={editorState?.bold ? "true" : undefined}
            disabled={!editor}
            aria-label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            type="button"
            data-active={editorState?.italic ? "true" : undefined}
            disabled={!editor}
            aria-label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            disabled={!editor}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            Scene break
          </button>
          <button
            type="button"
            aria-expanded={findOpen}
            onClick={() => setFindOpen((current) => !current)}
          >
            Find
          </button>
        </div>
        <span>
          {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>

      {findOpen ? (
        <div className={styles.findBar}>
          <label>
            <span>Find</span>
            <input
              value={findText}
              autoFocus
              onChange={(event) => {
                setFindText(event.target.value);
                setFindStatus("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  findNext();
                }
                if (event.key === "Escape") setFindOpen(false);
              }}
            />
          </label>
          <label>
            <span>Replace</span>
            <input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
            />
          </label>
          <button type="button" disabled={!findText} onClick={findNext}>
            Next
          </button>
          <button
            type="button"
            disabled={!findText || !editorState?.hasSelection}
            onClick={replaceCurrent}
          >
            Replace
          </button>
          <small role="status">{findStatus}</small>
        </div>
      ) : null}

      <div className={styles.editorHost}>
        <EditorContent editor={editor} />
        {editor ? (
          <BubbleMenu
            editor={editor}
            className={styles.selectionMenu}
            shouldShow={({ editor: activeEditor }) =>
              !activeEditor.state.selection.empty
            }
          >
            <button type="button" onClick={onDirectSelection}>
              Direct
            </button>
            <button type="button" onClick={onLockSelection}>
              Lock
            </button>
            <button
              type="button"
              onClick={() => setNoteDraftOpen((current) => !current)}
            >
              Note
            </button>
            {onDiscussSelection ? (
              <button
                type="button"
                data-tutorial-target="slate-discuss-selection"
                onClick={onDiscussSelection}
              >
                Discuss
              </button>
            ) : null}
          </BubbleMenu>
        ) : null}
      </div>

      {noteDraftOpen ? (
        <form
          className={styles.noteComposer}
          onSubmit={(event) => {
            event.preventDefault();
            saveNote();
          }}
        >
          <label>
            <span>Personal note</span>
            <input
              value={noteDraft}
              autoFocus
              placeholder="What do you want to remember here?"
              onChange={(event) => setNoteDraft(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!noteDraft.trim()}>
            Save note
          </button>
        </form>
      ) : null}

      {annotations.length > 0 ? (
        <div className={styles.notes}>
          <button
            type="button"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((current) => !current)}
          >
            {annotations.length} personal{" "}
            {annotations.length === 1 ? "note" : "notes"}
          </button>
          {notesOpen ? (
            <div>
              {annotations.map((note) => (
                <article key={note.id}>
                  <blockquote>
                    {value.slice(note.anchor.start, note.anchor.end)}
                  </blockquote>
                  <p>{note.body}</p>
                  <button
                    type="button"
                    aria-label="Resolve personal note"
                    disabled={!onResolveNote}
                    onClick={() => onResolveNote?.(note.id)}
                  >
                    Resolve
                  </button>
                </article>
              ))}
              <small>
                Notes are anchored to this section and stay separate from prose.
              </small>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
