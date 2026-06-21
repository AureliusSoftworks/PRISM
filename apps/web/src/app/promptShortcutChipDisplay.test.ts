import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  promptShortcutChipLabel,
  promptShortcutVisualSizingText,
} from "./promptShortcutChipDisplay.ts";

describe("promptShortcutChipLabel", () => {
  it("keeps prompt shortcuts visibly slash-prefixed", () => {
    assert.equal(
      promptShortcutChipLabel({ invocation: "/daily-checkin", name: "fallback" }),
      "/daily-checkin"
    );
  });

  it("falls back to the stored prompt name with one leading slash", () => {
    assert.equal(
      promptShortcutChipLabel({ invocation: "   ", name: "/story-seed" }),
      "/story-seed"
    );
  });
});

describe("promptShortcutVisualSizingText", () => {
  it("uses the collapsed chip label instead of the resolved prompt body", () => {
    const promptShortcut = {
      invocation: "/big-prompt",
      name: "big-prompt",
      resolvedPrompt: "Line one\nLine two\nLine three",
    };

    assert.equal(promptShortcutVisualSizingText(promptShortcut), "/big-prompt");
  });
});
