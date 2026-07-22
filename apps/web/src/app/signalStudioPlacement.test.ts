import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOTCAST_DEFAULT_STUDIO_LAYOUT } from "@localai/shared";
import {
  SIGNAL_STUDIO_ARTWORK_OVERSCAN_PERCENT,
  SIGNAL_STUDIO_FLOOR_GLOW_MAX_HEIGHT_PERCENT,
  SIGNAL_STUDIO_FLOOR_GLOW_MAX_WIDTH_PERCENT,
  SIGNAL_STUDIO_VOICE_MAX_PAN,
  signalStudioFloorGlowHandleStyle,
  signalStudioMaskedFloorGlowStyle,
  signalStudioOverscanCoordinate,
  signalStudioPlacementStyle,
  signalStudioVoicePan,
} from "./signalStudioPlacement.ts";

describe("Signal studio placement parity", () => {
  it("projects normalized percentage geometry identically for every surface", () => {
    const authored = {
      ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
      hostBot: { x: 27.125, y: 58.75 },
      guestCup: { x: 74.5, y: 81.25 },
      hostFloorGlow: { x: 90, y: 88.25 },
    };
    assert.deepEqual(signalStudioPlacementStyle(authored, "hostBot"), {
      left: "27.13%",
      top: "58.75%",
    });
    assert.deepEqual(signalStudioPlacementStyle(authored, "guestCup"), {
      left: "74.5%",
      top: "81.25%",
    });
    assert.deepEqual(signalStudioPlacementStyle(authored, "hostFloorGlow"), {
      left: "27.13%",
      top: "88.25%",
    });
  });

  it("normalizes missing geometry through the shared contract", () => {
    assert.deepEqual(
      signalStudioPlacementStyle(undefined, "hostBot"),
      signalStudioPlacementStyle(BOTCAST_DEFAULT_STUDIO_LAYOUT, "hostBot"),
    );
  });

  it("projects light emitters into the same overscanned canvas as the Studio artwork", () => {
    assert.equal(SIGNAL_STUDIO_ARTWORK_OVERSCAN_PERCENT, 5);
    assert.equal(signalStudioOverscanCoordinate(0), 4.5455);
    assert.equal(signalStudioOverscanCoordinate(50), 50);
    assert.equal(signalStudioOverscanCoordinate(100), 95.4545);
  });

  it("scales floor glows below today's maximum in editor and masked coordinates", () => {
    assert.equal(SIGNAL_STUDIO_FLOOR_GLOW_MAX_WIDTH_PERCENT, 26);
    assert.equal(SIGNAL_STUDIO_FLOOR_GLOW_MAX_HEIGHT_PERCENT, 8.5);
    assert.deepEqual(
      signalStudioFloorGlowHandleStyle(
        BOTCAST_DEFAULT_STUDIO_LAYOUT,
        "hostFloorGlow",
      ),
      { left: "18.5%", top: "84%", width: "26%", height: "8.5%" },
    );
    assert.deepEqual(
      signalStudioMaskedFloorGlowStyle(
        {
          ...BOTCAST_DEFAULT_STUDIO_LAYOUT,
          hostFloorGlow: { x: 18.5, y: 84, scale: 0.5 },
        },
        "hostFloorGlow",
      ),
      {
        left: "21.3636%",
        top: "80.9091%",
        width: "11.8182%",
        height: "3.8636%",
      },
    );
  });

  it("stages voices subtly from their saved seats", () => {
    assert.equal(
      signalStudioVoicePan(BOTCAST_DEFAULT_STUDIO_LAYOUT, "host"),
      -0.142,
    );
    assert.equal(
      signalStudioVoicePan(BOTCAST_DEFAULT_STUDIO_LAYOUT, "guest"),
      0.142,
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
