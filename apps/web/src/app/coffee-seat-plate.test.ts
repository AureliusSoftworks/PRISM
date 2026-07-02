import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS,
  COFFEE_SEAT_SIP_PLATE_GLYPH,
  coffeeSeatPlateGlyph,
  coffeeSeatSipFaceActive,
  coffeeSeatSipMouthOffsetX,
  coffeeSeatSipMouthOffsetY,
} from "./coffee-seat-plate.ts";

describe("coffeeSeatPlateGlyph", () => {
  it("keeps joyful and warm closed-mouth faces distinct", () => {
    assert.deepEqual(coffeeSeatPlateGlyph("happy", "closed"), {
      text: ":)",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "closed"), {
      text: ":]",
      rotateDeg: 90,
    });
  });

  it("uses colon eyes for every closed-mouth bot mood", () => {
    assert.deepEqual(coffeeSeatPlateGlyph("neutral", "closed"), {
      text: ":|",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("sad", "closed"), {
      text: ":(",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("angry", "closed"), {
      text: ":[",
      rotateDeg: 90,
    });
  });

  it("uses shared open-mouth shapes while speaking", () => {
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "open-wide"), {
      text: ":0",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "open-small"), {
      text: ":o",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "open-round"), {
      text: ":O",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("sad", "open-wide"), {
      text: ":0",
      rotateDeg: 90,
    });
  });

  it("uses a puckered face while sipping", () => {
    assert.deepEqual(COFFEE_SEAT_SIP_PLATE_GLYPH, {
      text: ":*",
      rotateDeg: 90,
    });
  });

  it("keeps the sip face active whenever the cup visual is sipping", () => {
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: Number.POSITIVE_INFINITY,
        completedSipAnimationDurationMs: null,
        cupSipping: true,
      }),
      true
    );
  });

  it("returns the sip face before the cup returns to rest", () => {
    const durationMs = 1000;
    const releaseAtMs = durationMs * COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS;
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: releaseAtMs,
        completedSipAnimationDurationMs: durationMs,
      }),
      true
    );
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: releaseAtMs + 1,
        completedSipAnimationDurationMs: durationMs,
      }),
      false
    );
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: true,
        completedSipAnimationAgeMs: 1000,
        completedSipAnimationDurationMs: 1000,
      }),
      true
    );
  });

  it("does not let cup sipping hold the sip face into the cup return", () => {
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: 790,
        completedSipAnimationDurationMs: 1000,
        cupSipping: true,
      }),
      false
    );
  });

  it("places the sip mouth toward the rendered cup rim after face flipping", () => {
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "left", faceScaleY: "1", seatHorizontalSide: -1 }),
      "0.48em"
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "right", faceScaleY: "1", seatHorizontalSide: 1 }),
      "-0.48em"
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "left", faceScaleY: "-1", seatHorizontalSide: -1 }),
      "-0.48em"
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "right", faceScaleY: "-1", seatHorizontalSide: 1 }),
      "0.48em"
    );
  });

  it("lifts the sip mouth toward the cup rim instead of the normal mouth row", () => {
    assert.equal(coffeeSeatSipMouthOffsetX({ seatHorizontalSide: -1 }), "-0.17em");
    assert.equal(coffeeSeatSipMouthOffsetX({ seatHorizontalSide: 1 }), "-0.17em");
    assert.equal(coffeeSeatSipMouthOffsetX({ seatHorizontalSide: 0 }), "-0.13em");
  });

  it("centers center-band sip mouths closer to the face", () => {
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "left", faceScaleY: "1", seatHorizontalSide: 0 }),
      "0.36em"
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({ cupSide: "right", faceScaleY: "-1", seatHorizontalSide: 0 }),
      "0.36em"
    );
  });
});
