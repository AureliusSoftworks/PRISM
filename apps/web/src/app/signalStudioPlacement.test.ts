import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOTCAST_DEFAULT_STUDIO_LAYOUT } from "@localai/shared";
import { signalStudioPlacementStyle } from "./signalStudioPlacement.ts";

describe("Signal studio placement parity", () => {
  it("projects normalized percentage geometry identically for every surface", () => {
    const authored = {
      ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
      hostBot: { x: 27.125, y: 58.75 },
      guestCup: { x: 74.5, y: 81.25 },
    };
    assert.deepEqual(signalStudioPlacementStyle(authored, "hostBot"), {
      left: "27.13%",
      top: "58.75%",
    });
    assert.deepEqual(signalStudioPlacementStyle(authored, "guestCup"), {
      left: "74.5%",
      top: "81.25%",
    });
  });

  it("normalizes missing geometry through the shared contract", () => {
    assert.deepEqual(
      signalStudioPlacementStyle(undefined, "hostBot"),
      signalStudioPlacementStyle(BOTCAST_DEFAULT_STUDIO_LAYOUT, "hostBot"),
    );
  });
});
