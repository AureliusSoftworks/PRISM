import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  promptShortcutChipLabel,
  promptShortcutExpandedPromptFontCapPx,
  promptShortcutResolvedPromptText,
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

describe("promptShortcutExpandedPromptFontCapPx", () => {
  it("leaves short expanded prompts free to inherit large Zen type", () => {
    assert.equal(promptShortcutExpandedPromptFontCapPx("Tell me one luminous thing."), 34);
  });

  it("falls back safely for empty expanded prompts", () => {
    assert.equal(promptShortcutExpandedPromptFontCapPx(" \n\t "), 34);
  });

  it("softly caps medium expanded prompts", () => {
    const cap = promptShortcutExpandedPromptFontCapPx(
      "Give me three possible directions for this scene, each with a different emotional temperature and a concrete next action."
    );

    assert.ok(cap < 30);
    assert.ok(cap > 20);
  });

  it("caps long single-paragraph expanded prompts near reading size", () => {
    const cap = promptShortcutExpandedPromptFontCapPx(
      Array.from(
        { length: 12 },
        () => "Describe the space, the mood, the tactile details, and the decision waiting at the center."
      ).join(" ")
    );

    assert.ok(cap <= 17);
  });

  it("counts hard-line-heavy prompts as visually long", () => {
    const cap = promptShortcutExpandedPromptFontCapPx(
      [
        "Set the room tone.",
        "Name the hidden tension.",
        "Offer three possible doors.",
        "Choose one sensory anchor.",
        "End with a question.",
      ].join("\n")
    );

    assert.ok(cap < 25);
  });
});

describe("promptShortcutResolvedPromptText", () => {
  it("uses the concrete prompt stored after wildcard resolution", () => {
    assert.equal(
      promptShortcutResolvedPromptText(
        { resolvedPrompt: "Tell me about the luminous garden." },
        "/story {PLACE}"
      ),
      "Tell me about the luminous garden."
    );
  });

  it("falls back to the visible prompt when no resolved prompt is stored", () => {
    assert.equal(
      promptShortcutResolvedPromptText({ resolvedPrompt: "   " }, "  /story {PLACE}  "),
      "/story {PLACE}"
    );
  });
});
