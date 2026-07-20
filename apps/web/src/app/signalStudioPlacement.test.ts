import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOTCAST_DEFAULT_STUDIO_LAYOUT } from "@localai/shared";
import {
  SIGNAL_STUDIO_VOICE_MAX_PAN,
  signalStudioPlacementStyle,
  signalStudioVoicePan,
} from "./signalStudioPlacement.ts";

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

  it("stages voices subtly from their saved seats", () => {
    assert.equal(
      signalStudioVoicePan(BOTCAST_DEFAULT_STUDIO_LAYOUT, "host"),
      -0.124,
    );
    assert.equal(
      signalStudioVoicePan(BOTCAST_DEFAULT_STUDIO_LAYOUT, "guest"),
      0.124,
    );
    assert.equal(
      signalStudioVoicePan(
        {
          ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
          hostBot: { x: 50, y: 64 },
          guestBot: { x: 90, y: 64 },
        },
        "host",
      ),
      0,
    );
    assert.equal(
      signalStudioVoicePan(
        {
          ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
          hostBot: { x: 10, y: 64 },
          guestBot: { x: 90, y: 64 },
        },
        "guest",
      ),
      SIGNAL_STUDIO_VOICE_MAX_PAN,
    );
  });
});
