import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canvasBotClickTogglesBatchSelection,
  canvasBotDirectoryIsInteractive,
  canvasBotMenuDismissalSuppressesCardActivation,
  canvasBotSelectionAfterPlainActivation,
  clampCanvasBotBatchMenuAnchor,
  focusedCanvasBotId,
  resolveCanvasBotBatchMenuSelection,
  resolveCanvasBotTileActivation,
  resolveCanvasBotMarqueeSelection,
  resolveInactiveCanvasBotMarqueeSelection,
} from "./botCanvasMarqueeSelection.ts";

function ids(set: ReadonlySet<string>): string[] {
  return Array.from(set).sort();
}

describe("bot canvas marquee selection", () => {
  it("treats Shift card presses as selection-only interactions", () => {
    assert.equal(canvasBotClickTogglesBatchSelection({ shiftKey: true }), true);
    assert.equal(canvasBotClickTogglesBatchSelection({ shiftKey: false }), false);
  });

  it("resolves batch mode on a normal card activation", () => {
    assert.deepEqual(ids(canvasBotSelectionAfterPlainActivation()), []);
  });

  it("suppresses the card activation used to dismiss a batch menu", () => {
    assert.equal(canvasBotMenuDismissalSuppressesCardActivation(true), true);
    assert.equal(canvasBotMenuDismissalSuppressesCardActivation(false), false);
  });

  it("opens global batch actions only for two available selected bots", () => {
    assert.deepEqual(
      resolveCanvasBotBatchMenuSelection({
        selectedBotIds: ["bot-a", "missing", "bot-b", "bot-a"],
        availableBotIds: ["bot-a", "bot-b"],
      }),
      ["bot-a", "bot-b"],
    );
    assert.deepEqual(
      resolveCanvasBotBatchMenuSelection({
        selectedBotIds: ["bot-a"],
        availableBotIds: ["bot-a", "bot-b"],
      }),
      [],
    );
  });

  it("keeps the global batch anchor inside the viewport", () => {
    assert.deepEqual(
      clampCanvasBotBatchMenuAnchor({
        x: 900,
        y: -12,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
      { x: 800, y: 0 },
    );
  });

  it("gives fresh Chat canvas focus exclusively to the active Zen persona", () => {
    assert.equal(
      focusedCanvasBotId({
        view: "chat",
        sandboxGridSelectedBotId: "previous-bot",
        zenPersonaBotId: "next-bot",
      }),
      "next-bot",
    );
  });

  it("keeps Sandbox canvas focus on its explicit grid selection", () => {
    assert.equal(
      focusedCanvasBotId({
        view: "sandbox",
        sandboxGridSelectedBotId: "sandbox-bot",
        zenPersonaBotId: "zen-bot",
      }),
      "sandbox-bot",
    );
  });

  it("unfocuses only when the focused bot is activated again in the empty Chat overview", () => {
    const base = {
      view: "chat" as const,
      conversationMessageCount: 0,
      focusedBotId: "bot-a",
      botId: "bot-a",
    };

    assert.equal(resolveCanvasBotTileActivation(base), "unfocus");
    assert.equal(
      resolveCanvasBotTileActivation({ ...base, botId: "bot-b" }),
      "focus",
    );
    assert.equal(
      resolveCanvasBotTileActivation({
        ...base,
        conversationMessageCount: 1,
      }),
      "focus",
    );
    assert.equal(
      resolveCanvasBotTileActivation({ ...base, view: "sandbox" }),
      "focus",
    );
  });

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

  it("adds an inactive Shift-pressed tile when the click is swallowed", () => {
    const selected = resolveInactiveCanvasBotMarqueeSelection(
      "toggle",
      new Set(["bot-a"]),
      "bot-b"
    );

    assert.deepEqual(ids(selected), ["bot-a", "bot-b"]);
  });

  it("removes an inactive Shift-pressed tile already in the selection", () => {
    const selected = resolveInactiveCanvasBotMarqueeSelection(
      "toggle",
      new Set(["bot-a", "bot-b"]),
      "bot-b"
    );

    assert.deepEqual(ids(selected), ["bot-a"]);
  });

  it("keeps Chat marquee interactive for both fresh and hydrated empty conversations", () => {
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "chat",
      conversationMessageCount: null,
      pendingReplyVisible: false,
    }), true);
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "chat",
      conversationMessageCount: 0,
      pendingReplyVisible: false,
    }), true);
  });

  it("disables marquee for active replies and nonempty conversations", () => {
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "chat",
      conversationMessageCount: 1,
      pendingReplyVisible: false,
    }), false);
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "chat",
      conversationMessageCount: 0,
      pendingReplyVisible: true,
    }), false);
  });

  it("keeps Sandbox marquee scoped to its true empty state", () => {
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "sandbox",
      conversationMessageCount: null,
      pendingReplyVisible: false,
    }), true);
    assert.equal(canvasBotDirectoryIsInteractive({
      view: "sandbox",
      conversationMessageCount: 0,
      pendingReplyVisible: false,
    }), false);
  });

});
