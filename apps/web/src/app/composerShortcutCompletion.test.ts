import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composerShortcutInsertionText,
  composerShortcutQueryExactlyMatchesCommand,
  composerShortcutTokenExactlyMatchesAnyCommand,
} from "./composerShortcutCompletion.ts";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

const draftReply = {
  name: "draft-reply",
  aliases: ["dr"],
};

function pageSection(startNeedle: string, endNeedle: string): string {
  const start = pageSource.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing start needle: ${startNeedle}`);
  const end = pageSource.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Missing end needle: ${endNeedle}`);
  return pageSource.slice(start, end);
}

describe("composer shortcut exact completion matching", () => {
  it("matches a fully typed command name", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft-reply", draftReply), true);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("/draft-reply", draftReply), true);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("!draft-reply", draftReply), true);
  });

  it("matches aliases so typed aliases can send on Enter", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("dr", draftReply), true);
  });

  it("does not match punctuation-only aliases because ? opens the tool picker", () => {
    const help = { name: "help", aliases: ["?"] };
    assert.equal(composerShortcutQueryExactlyMatchesCommand("?", help), false);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("/?", help), false);
  });

  it("does not match partial command names", () => {
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft", draftReply), false);
    assert.equal(composerShortcutQueryExactlyMatchesCommand("draft-repl", draftReply), false);
  });

  it("checks the currently available shortcut menu items", () => {
    assert.equal(
      composerShortcutTokenExactlyMatchesAnyCommand(
        { query: "clear" },
        [
          { name: "draft-reply", aliases: ["dr"] },
          { name: "clear", aliases: ["cls"] },
        ]
      ),
      true
    );
  });
});

describe("composer shortcut insertion text", () => {
  it("keeps built-in wildcard completion literal in the composer", () => {
    assert.equal(
      composerShortcutInsertionText({
        id: "wildcard-slot:NOUN",
        name: "NOUN",
        command: "{NOUN}",
      }),
      "{NOUN} "
    );
  });

  it("keeps custom wildcard deck completion literal in the composer", () => {
    assert.equal(
      composerShortcutInsertionText({
        id: "wildcard:weather",
        name: "weather",
      }),
      "!weather "
    );
  });

  it("keeps ordinary command completion slash-prefixed", () => {
    assert.equal(
      composerShortcutInsertionText({
        id: "builtin:/clear",
        name: "clear",
      }),
      "/clear "
    );
  });

  it("keeps tool completion question-mark-prefixed", () => {
    assert.equal(
      composerShortcutInsertionText({
        id: "tool:web-search",
        name: "web-search",
      }),
      "?web-search "
    );
  });
});

describe("composer send key policy", () => {
  it("keeps Enter as submit and Shift+Enter as newline across composer inputs", () => {
    const richCaptureSource = pageSection(
      "const handleRichEditorKeyDownCapture = useCallback",
      "const composeFormForTheme"
    );
    assert.match(richCaptureSource, /shouldSubmitComposerOnEnter\(\{/);
    assert.match(richCaptureSource, /isComposing: event\.nativeEvent\.isComposing/);
    assert.match(
      richCaptureSource,
      /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*form\?\.requestSubmit\(\);/
    );
    assert.doesNotMatch(richCaptureSource, /splitListItem|liftListItem|insideMarkdownList/);

    const richEditorKeyDownSource = pageSection(
      "handleKeyDown: (view, event) => {",
      "onUpdate: ({ editor: ed }) => {"
    );
    assert.match(
      richEditorKeyDownSource,
      /event\.key !== "Enter"[\s\S]*shouldAcceptComposerShortcutCompletionKey/
    );
    assert.match(richEditorKeyDownSource, /shouldSubmitComposerOnEnter\(\{/);
    assert.match(richEditorKeyDownSource, /isComposing: event\.isComposing/);
    assert.match(richEditorKeyDownSource, /event\.key === "Tab"[\s\S]*mentionUiRef/);
    assert.doesNotMatch(
      richEditorKeyDownSource,
      /event\.key === "Tab" \|\| event\.key === "Enter"|splitListItem|liftListItem|editorComposerShortcutExactlyMatchesAnyCommand/
    );

    const textareaKeyDownSource = pageSection(
      "ref={textareaRef}",
      "onFocus={(event) => {"
    );
    assert.match(
      textareaKeyDownSource,
      /event\.key !== "Enter"[\s\S]*shouldAcceptComposerShortcutCompletionKey/
    );
    assert.match(textareaKeyDownSource, /event\.key === "Tab"[\s\S]*taMentionRef/);
    assert.doesNotMatch(
      textareaKeyDownSource,
      /event\.key === "Tab" \|\| event\.key === "Enter"|textareaComposerShortcutExactlyMatchesAnyCommand/
    );

    assert.match(
      pageSource,
      /shouldSubmitComposerOnEnter\(\{[\s\S]*?isComposing: e\.nativeEvent\.isComposing/,
    );
    assert.match(pageSource, /enterKeyHint="send"/);
  });
});
