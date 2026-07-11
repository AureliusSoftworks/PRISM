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

  it("arms bot-card presses for drag without capturing ordinary clicks", () => {
    assert.match(
      pageSource,
      /const botTileMarqueeGesture = startsOnBotTile;/
    );
    assert.match(
      pageSource,
      /if \(blockedInteractiveTarget && !botTileMarqueeGesture && !allowPickerFrameDrag\)/
    );
    const pointerDownStart = pageSource.indexOf(
      "const handleCanvasBotMarqueePointerDown = useCallback"
    );
    const pointerMoveStart = pageSource.indexOf(
      "const handleCanvasBotMarqueePointerMove = useCallback"
    );
    const pointerEndStart = pageSource.indexOf(
      "const handleCanvasBotMarqueePointerEnd = useCallback"
    );
    const pointerDownSource = pageSource.slice(pointerDownStart, pointerMoveStart);
    const pointerMoveSource = pageSource.slice(pointerMoveStart, pointerEndStart);
    assert.doesNotMatch(pointerDownSource, /setPointerCapture/);
    assert.match(
      pointerMoveSource,
      /if \(Math\.hypot\(dx, dy\) < BOT_MARQUEE_DRAG_THRESHOLD_PX\) return true;\s*drag\.active = true;\s*try \{\s*drag\.frame\.setPointerCapture\(event\.pointerId\);/
    );
  });

  it("keeps every completed bot-card activation as direct selection", () => {
    assert.equal(
      pageSource.match(
        /if \(isDesktopMousePixelClick\) \{\s*focusHueLensOnBot\(b\);\s*\}\s*commitEmptyStateBotSelection\(b\.id\);/g
      )?.length,
      2
    );
    assert.equal(
      pageSource.match(
        /const isDesktopMousePixelClick =\s*geom\.compactPixelGrid &&\s*e\.detail > 0 &&\s*lastBotPickerPointerTypeRef\.current === "mouse";/g
      )?.length,
      2
    );
    assert.doesNotMatch(pageSource, /const shouldRelocateHue/);
  });
});
