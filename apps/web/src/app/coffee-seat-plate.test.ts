import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_SEAT_ANGRY_BRACKET_GLYPH,
  COFFEE_SEAT_MOUTH_CHARACTERS_PER_PHASE,
  COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS,
  COFFEE_SEAT_SIP_PLATE_GLYPH,
  coffeeSeatCustomMouthCharacterForSip,
  coffeeSeatMouthShapeFromVisibleLength,
  coffeeSeatPlateGlyph,
  coffeeSeatSipFaceActive,
  coffeeSeatSipMouthOffsetX,
  coffeeSeatSipMouthOffsetY,
  resolveCoffeeSeatSipFacePresentation,
} from "./coffee-seat-plate.ts";

describe("coffeeSeatPlateGlyph", () => {
  it("holds each talking mouth frame across several revealed characters", () => {
    const speech = "Coffee should feel conversational.";
    const firstShape = coffeeSeatMouthShapeFromVisibleLength(1, speech);
    assert.equal(COFFEE_SEAT_MOUTH_CHARACTERS_PER_PHASE, 3);
    assert.equal(coffeeSeatMouthShapeFromVisibleLength(2, speech), firstShape);
    assert.equal(coffeeSeatMouthShapeFromVisibleLength(3, speech), firstShape);
  });

  it("uses phoneme-aware English visemes without changing robot rhythm", () => {
    assert.equal(coffeeSeatMouthShapeFromVisibleLength(1, "lamp", true), "at");
    assert.deepEqual(
      coffeeSeatPlateGlyph(
        "warm",
        coffeeSeatMouthShapeFromVisibleLength(1, "lamp", true),
      ),
      { text: ":@", rotateDeg: 90 },
    );
    assert.deepEqual(
      coffeeSeatPlateGlyph(
        "warm",
        coffeeSeatMouthShapeFromVisibleLength(1, "river", true),
      ),
      { text: ":o", rotateDeg: 90 },
    );
    assert.equal(
      coffeeSeatMouthShapeFromVisibleLength(1, "lamp", false),
      "speech-closed",
    );
  });

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

  it("keeps sad and angry closed-mouth faces distinct", () => {
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
    assert.equal(COFFEE_SEAT_ANGRY_BRACKET_GLYPH, ":[");
  });

  it("uses shared open-mouth shapes while speaking", () => {
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "speech-closed"), {
      text: ":|",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "dot"), {
      text: ":∙",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "at"), {
      text: ":@",
      rotateDeg: 90,
    });
    assert.deepEqual(coffeeSeatPlateGlyph("warm", "narrow"), {
      text: ":o",
      rotateDeg: 90,
    });
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
      text: ":⁎",
      rotateDeg: 90,
    });
  });

  it("lets custom mouths opt into the Coffee sip pucker", () => {
    assert.equal(
      coffeeSeatCustomMouthCharacterForSip({
        mouthCharacter: "△",
        coffeePuckerEnabled: true,
        sipActive: true,
      }),
      null,
    );
    assert.equal(
      coffeeSeatCustomMouthCharacterForSip({
        mouthCharacter: "△",
        coffeePuckerEnabled: false,
        sipActive: true,
      }),
      "△",
    );
    assert.equal(
      coffeeSeatCustomMouthCharacterForSip({
        mouthCharacter: "△",
        coffeePuckerEnabled: true,
        sipActive: false,
      }),
      "△",
    );
  });

  it("resolves explicit sips into one active presentation contract", () => {
    const presentation = resolveCoffeeSeatSipFacePresentation({
      sipInProgress: true,
      completedSipAnimationAgeMs: Number.POSITIVE_INFINITY,
      completedSipAnimationDurationMs: null,
      cupSipping: false,
      seatIsFirmlySeated: true,
      isSpeaking: false,
      cupSide: "left",
      faceScaleY: "1",
      seatHorizontalSide: -1,
    });

    assert.equal(presentation.active, true);
    assert.equal(presentation.reason, "explicit-sip");
    assert.deepEqual(presentation.glyph, COFFEE_SEAT_SIP_PLATE_GLYPH);
    assert.equal(presentation.mouthOffsetX, "0.17em");
    assert.equal(presentation.mouthOffsetY, "0.48em");
  });

  it("uses cup-visual sipping only when no explicit sip hold has decided the face", () => {
    assert.equal(
      resolveCoffeeSeatSipFacePresentation({
        sipInProgress: false,
        completedSipAnimationAgeMs: Number.POSITIVE_INFINITY,
        completedSipAnimationDurationMs: null,
        cupSipping: true,
        cupSide: "right",
        faceScaleY: "1",
        seatHorizontalSide: 1,
      }).reason,
      "cup-visual-sip",
    );
    assert.equal(
      resolveCoffeeSeatSipFacePresentation({
        sipInProgress: false,
        completedSipAnimationAgeMs: 790,
        completedSipAnimationDurationMs: 1000,
        cupSipping: true,
        cupSide: "right",
        faceScaleY: "1",
        seatHorizontalSide: 1,
      }).reason,
      "none",
    );
  });

  it("suppresses sip face presentation while speaking or before the seat is firm", () => {
    for (const blocked of [
      { seatIsFirmlySeated: false, isSpeaking: false },
      { seatIsFirmlySeated: true, isSpeaking: true },
    ]) {
      const presentation = resolveCoffeeSeatSipFacePresentation({
        sipInProgress: true,
        completedSipAnimationAgeMs: 0,
        completedSipAnimationDurationMs: 1000,
        cupSipping: true,
        cupSide: "left",
        faceScaleY: "1",
        seatHorizontalSide: -1,
        ...blocked,
      });
      assert.equal(presentation.active, false);
      assert.equal(presentation.reason, "none");
      assert.equal(presentation.glyph, null);
    }
  });

  it("keeps the sip face active whenever the cup visual is sipping", () => {
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: Number.POSITIVE_INFINITY,
        completedSipAnimationDurationMs: null,
        cupSipping: true,
      }),
      true,
    );
  });

  it("holds the sip face through most of the mug-up beat", () => {
    const durationMs = 1000;
    const releaseAtMs = durationMs * COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS;
    assert.equal(COFFEE_SEAT_SIP_FACE_ACTIVE_PROGRESS, 0.68);
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: releaseAtMs,
        completedSipAnimationDurationMs: durationMs,
      }),
      true,
    );
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: releaseAtMs + 1,
        completedSipAnimationDurationMs: durationMs,
      }),
      false,
    );
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: true,
        completedSipAnimationAgeMs: releaseAtMs,
        completedSipAnimationDurationMs: durationMs,
      }),
      true,
    );
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: true,
        completedSipAnimationAgeMs: 1000,
        completedSipAnimationDurationMs: 1000,
      }),
      false,
    );
  });

  it("still releases the sip face before the cup return", () => {
    assert.equal(
      coffeeSeatSipFaceActive({
        sipInProgress: false,
        completedSipAnimationAgeMs: 790,
        completedSipAnimationDurationMs: 1000,
        cupSipping: true,
      }),
      false,
    );
  });

  it("places the sip mouth on the correct side of the bot plate after face flipping", () => {
    for (const [cupSide, faceScaleY, seatHorizontalSide, expected] of [
      ["left", "1", -1, "0.48em"],
      ["right", "1", 1, "-0.48em"],
      ["left", "-1", -1, "-0.48em"],
      ["right", "-1", 1, "0.48em"],
    ] as const) {
      assert.equal(
        coffeeSeatSipMouthOffsetY({ cupSide, faceScaleY, seatHorizontalSide }),
        expected,
      );
      assert.equal(
        resolveCoffeeSeatSipFacePresentation({
          sipInProgress: true,
          completedSipAnimationAgeMs: 0,
          completedSipAnimationDurationMs: 1000,
          cupSipping: false,
          cupSide,
          faceScaleY,
          seatHorizontalSide,
        }).mouthOffsetY,
        expected,
      );
    }
  });

  it("drops the sip mouth toward the cup rim instead of lifting it away", () => {
    assert.equal(
      coffeeSeatSipMouthOffsetX({ seatHorizontalSide: -1 }),
      "0.17em",
    );
    assert.equal(
      coffeeSeatSipMouthOffsetX({ seatHorizontalSide: 1 }),
      "0.17em",
    );
    assert.equal(
      coffeeSeatSipMouthOffsetX({ seatHorizontalSide: 0 }),
      "0.13em",
    );
  });

  it("keeps center-band sip mouths on the cup side even when the top head flips gaze", () => {
    assert.equal(
      coffeeSeatSipMouthOffsetY({
        cupSide: "left",
        faceScaleY: "1",
        seatHorizontalSide: 0,
      }),
      "0.36em",
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({
        cupSide: "left",
        faceScaleY: "-1",
        seatHorizontalSide: 0,
      }),
      "0.36em",
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({
        cupSide: "right",
        faceScaleY: "1",
        seatHorizontalSide: 0,
      }),
      "-0.36em",
    );
    assert.equal(
      coffeeSeatSipMouthOffsetY({
        cupSide: "right",
        faceScaleY: "-1",
        seatHorizontalSide: 0,
      }),
      "-0.36em",
    );
  });
});
