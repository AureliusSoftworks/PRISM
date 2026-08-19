import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("rich composer focus stability", () => {
  it("keeps TipTap useEditor deps free of unstable parent shortcut resolvers", () => {
    const desktopStart = pageSource.indexOf(
      "const DesktopMarkdownComposer = forwardRef<",
    );
    const desktopEnd = pageSource.indexOf(
      "const ComposerInput = forwardRef<",
      desktopStart,
    );
    assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
    const desktopSource = pageSource.slice(desktopStart, desktopEnd);

    // Parent draft sync re-renders the shell often (Coffee table especially).
    // TipTap destroys the editor when useEditor deps change by identity, which
    // unfocuses the composer after each emitted keystroke.
    assert.match(
      desktopSource,
      /const resolveShortcutPickToTextRef = useRef\(resolveShortcutPickToText\);/,
    );
    assert.match(
      desktopSource,
      /resolveShortcutPickToTextRef\.current = resolveShortcutPickToText;/,
    );
    const applyStart = desktopSource.indexOf(
      "const applyComposerCommandPickInEditor = useCallback(",
    );
    const applyEnd = desktopSource.indexOf(
      "const resolveEditorComposerChipActivation = useCallback(",
      applyStart,
    );
    assert.ok(applyStart >= 0 && applyEnd > applyStart);
    const applySource = desktopSource.slice(applyStart, applyEnd);
    assert.match(
      applySource,
      /resolveShortcutPickToTextRef\.current\?\.\(command\)/,
    );
    assert.match(applySource, /,\s*\[\],\s*\);\s*$/);
    assert.doesNotMatch(
      applySource,
      /resolveShortcutPickToText\?\.\(command\)/,
    );
    assert.doesNotMatch(applySource, /\[resolveShortcutPickToText\]/);
  });

  it("never recreates the editor for a placeholder change, and reseeds from the live draft", () => {
    const desktopStart = pageSource.indexOf(
      "const DesktopMarkdownComposer = forwardRef<",
    );
    const desktopEnd = pageSource.indexOf(
      "const ComposerInput = forwardRef<",
      desktopStart,
    );
    assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
    const desktopSource = pageSource.slice(desktopStart, desktopEnd);

    // Coffee flips coffeeComposerPlaceholder mid-session (waiting for a seat,
    // then joined). If placeholder sits in the useEditor deps, TipTap destroys
    // the editor and remounts it with the parent's debounced value, dropping
    // every keystroke typed inside the sync window.
    assert.match(
      desktopSource,
      /const placeholderRef = useRef\(placeholder\);/,
    );
    assert.match(desktopSource, /placeholderRef\.current = placeholder;/);
    assert.match(
      desktopSource,
      /Placeholder\.configure\(\{ placeholder: \(\) => placeholderRef\.current \}\)/,
    );

    const editorStart = desktopSource.indexOf("const editor = useEditor(");
    const editorEnd = desktopSource.indexOf(
      "const mentionBotsByIdForTipTap = useMemo(",
      editorStart,
    );
    assert.ok(editorStart >= 0 && editorEnd > editorStart);
    const editorSource = desktopSource.slice(editorStart, editorEnd);
    assert.doesNotMatch(editorSource, /^\s*placeholder,\s*$/m);

    // Any other dep can still change mid-typing, so recreation must seed from
    // the newest markdown this composer holds rather than the lagging prop.
    assert.match(
      editorSource,
      /content: pendingValueRef\.current \?\? lastEmittedRef\.current,/,
    );
    assert.doesNotMatch(editorSource, /content: value,/);
  });
});
