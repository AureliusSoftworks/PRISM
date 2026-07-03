import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveCanvasBotMarqueeSelection,
  resolveInactiveCanvasBotMarqueeSelection,
} from "./botCanvasMarqueeSelection.ts";

function ids(set: ReadonlySet<string>): string[] {
  return Array.from(set).sort();
}

describe("bot canvas marquee selection", () => {
  it("replaces the current selection for plain marquee drags", () => {
    const selected = resolveCanvasBotMarqueeSelection({
      mode: "replace",
      baseSelectedBotIds: new Set(["bot-a", "bot-b"]),
      hitBotIds: ["bot-c", "bot-d"],
    });

    assert.deepEqual(ids(selected), ["bot-c", "bot-d"]);
  });

  it("adds unselected hit bots during Shift marquee drags", () => {
    const selected = resolveCanvasBotMarqueeSelection({
      mode: "toggle",
      baseSelectedBotIds: new Set(["bot-a"]),
      hitBotIds: ["bot-b"],
    });

    assert.deepEqual(ids(selected), ["bot-a", "bot-b"]);
  });

  it("removes already-selected hit bots during Shift marquee drags", () => {
    const selected = resolveCanvasBotMarqueeSelection({
      mode: "toggle",
      baseSelectedBotIds: new Set(["bot-a", "bot-b"]),
      hitBotIds: ["bot-b"],
    });

    assert.deepEqual(ids(selected), ["bot-a"]);
  });

  it("adds and removes mixed hit bots against the drag-start selection", () => {
    const selected = resolveCanvasBotMarqueeSelection({
      mode: "toggle",
      baseSelectedBotIds: new Set(["bot-a", "bot-b"]),
      hitBotIds: ["bot-b", "bot-c", "bot-c"],
    });

    assert.deepEqual(ids(selected), ["bot-a", "bot-c"]);
  });

  it("preserves selection for inactive Shift marquee attempts", () => {
    const selected = resolveInactiveCanvasBotMarqueeSelection(
      "toggle",
      new Set(["bot-a", "bot-b"])
    );

    assert.deepEqual(ids(selected), ["bot-a", "bot-b"]);
  });
});
