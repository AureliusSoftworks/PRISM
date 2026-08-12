import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  zenHomeDirectSelectionVisible,
  zenHomeDockState,
  zenHomeDropTargetContainsPoint,
} from "./zenHomeDock.ts";

describe("Zen Home dock-to-roam state", () => {
  it("keeps direct selection only while the Home is docked", () => {
    assert.equal(zenHomeDockState(false), "docked");
    assert.equal(zenHomeDockState(true), "roaming");
    assert.equal(
      zenHomeDirectSelectionVisible({
        dockState: "docked",
        botCardsVisible: true,
        hueLensVisible: false,
      }),
      true,
    );
    assert.equal(
      zenHomeDirectSelectionVisible({
        dockState: "roaming",
        botCardsVisible: true,
        hueLensVisible: true,
      }),
      false,
    );
  });

  it("requires the explicit title-card rectangle to dock a released bot", () => {
    const target = { left: 100, top: 80, right: 420, bottom: 260 };
    assert.equal(zenHomeDropTargetContainsPoint(target, { x: 100, y: 80 }), true);
    assert.equal(zenHomeDropTargetContainsPoint(target, { x: 420, y: 260 }), true);
    assert.equal(zenHomeDropTargetContainsPoint(target, { x: 99, y: 170 }), false);
    assert.equal(zenHomeDropTargetContainsPoint(target, { x: 260, y: 261 }), false);
  });
});
