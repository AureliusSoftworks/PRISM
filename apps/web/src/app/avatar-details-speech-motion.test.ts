import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AVATAR_DETAILS_CANVAS_SIZE } from "./avatar-details.ts";
import { avatarDetailsSpeechMotionOrigin } from "./avatar-details-speech-motion.ts";

function speechPixels(bounds: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(
    AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE * 4,
  );
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      rgba[(y * AVATAR_DETAILS_CANVAS_SIZE + x) * 4 + 3] = 255;
    }
  }
  return rgba;
}

describe("Avatar Details Speech ink motion", () => {
  it("centers every motion on the complete authored Speech item", () => {
    const origin = avatarDetailsSpeechMotionOrigin(
      speechPixels({ left: 40, top: 70, right: 80, bottom: 74 }),
    );

    assert.deepEqual(origin, {
      xPct: (60.5 / AVATAR_DETAILS_CANVAS_SIZE) * 100,
      yPct: (72.5 / AVATAR_DETAILS_CANVAS_SIZE) * 100,
    });
  });

  it("returns no origin when the Speech layer is empty", () => {
    assert.equal(
      avatarDetailsSpeechMotionOrigin(
        new Uint8ClampedArray(
          AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE * 4,
        ),
      ),
      null,
    );
  });
});
