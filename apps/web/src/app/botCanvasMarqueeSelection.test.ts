import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveCanvasBotMarqueeSelection,
  resolveInactiveCanvasBotMarqueeSelection,
} from "./botCanvasMarqueeSelection.ts";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8"
);

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

  it("starts marquee gestures from the canvas capture phase before child clicks", () => {
    assert.match(
      pageSource,
      /const handleMessagesSurfacePointerDownCapture = useCallback/
    );
    assert.match(
      pageSource,
      /const marqueeStarted = handleCanvasBotMarqueePointerDown\(event\);/
    );
    assert.match(
      pageSource,
      /if \(!marqueeStarted\) \{\s*handleZenCanvasSpeedNudgePointerDown\(event\);/
    );
    assert.equal(
      pageSource.match(/onPointerDownCapture=\{handleMessagesSurfacePointerDownCapture\}/g)
        ?.length,
      2
    );
    assert.doesNotMatch(pageSource, /onPointerDown=\{handleCanvasBotMarqueePointerDown\}/);
  });

  it("lets plain bot-card presses fall through to the card click handler", () => {
    assert.match(
      pageSource,
      /const botTileMarqueeGesture =\s*startsOnBotTile && event\.shiftKey && !event\.ctrlKey && !event\.metaKey;/
    );
    assert.match(
      pageSource,
      /if \(startsOnBotTile && !botTileMarqueeGesture\) \{\s*return false;\s*\}/
    );
    assert.match(
      pageSource,
      /if \(blockedInteractiveTarget && !botTileMarqueeGesture && !allowPickerFrameDrag\)/
    );
  });

  it("keeps mouse and keyboard dense bot-card activation as direct selection", () => {
    assert.equal(
      pageSource.match(
        /const clickShouldSelectDirectly =\s*e\.detail === 0 \|\| lastBotPickerPointerTypeRef\.current !== "touch";/g
      )?.length,
      2
    );
    assert.equal(
      pageSource.match(
        /const shouldRelocateHue =\s*!clickShouldSelectDirectly &&\s*!emptyStateSearchActive &&\s*botHasFilterableColor\(b\) &&\s*!hueFilterActive &&\s*pickerUsesHueNavigation\(geom, viewportWidth\);/g
      )?.length,
      2
    );
    assert.doesNotMatch(pageSource, /const isDesktopMousePixelClick/);
  });
});
