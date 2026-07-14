import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canvasBackgroundShouldZoomOutFocusedBot,
  canvasBotDirectoryIsInteractive,
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

  it("zooms a focused empty Chat canvas back out to all bots", () => {
    assert.equal(canvasBackgroundShouldZoomOutFocusedBot({
      view: "chat",
      conversationMessageCount: 0,
      focusedBotId: "bot-a",
      pendingIncognito: false,
      canZoomOutToAllBots: true,
    }), true);
  });

  it("keeps active, private, and unfocused canvases in place", () => {
    const base = {
      view: "chat" as const,
      conversationMessageCount: 0,
      focusedBotId: "bot-a",
      pendingIncognito: false,
      canZoomOutToAllBots: true,
    };

    assert.equal(canvasBackgroundShouldZoomOutFocusedBot({
      ...base,
      conversationMessageCount: 1,
    }), false);
    assert.equal(canvasBackgroundShouldZoomOutFocusedBot({
      ...base,
      pendingIncognito: true,
    }), false);
    assert.equal(canvasBackgroundShouldZoomOutFocusedBot({
      ...base,
      focusedBotId: null,
    }), false);
  });
});
