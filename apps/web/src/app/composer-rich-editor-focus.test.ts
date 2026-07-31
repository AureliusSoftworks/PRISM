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
});
