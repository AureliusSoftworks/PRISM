import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promptShortcutModelChoiceForSurface } from "./promptShortcutModelRouting.ts";

describe("prompt shortcut model routing", () => {
  it("follows the active header model in Zen/Chat", () => {
    assert.equal(promptShortcutModelChoiceForSurface("chat", "llama3.2"), "auto");
  });

  it("retains the Command Center run model in Sandbox", () => {
    assert.equal(
      promptShortcutModelChoiceForSurface("sandbox", "openai:gpt-5.6-terra"),
      "openai:gpt-5.6-terra"
    );
  });

  it("normalizes an empty Sandbox choice to Auto", () => {
    assert.equal(promptShortcutModelChoiceForSurface("sandbox", "  "), "auto");
  });
});
