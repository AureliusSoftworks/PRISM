import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_INTONATION_CONTOUR_DEFINITIONS,
  VOICE_INTONATION_CONTOUR_IDS,
  VOICE_INTONATION_FULL_DEPTH_SECONDS,
  voiceIntonationContourCentsAt,
  voiceIntonationContourForAccentDefinition,
  voiceIntonationDetuneCents,
  voiceIntonationPlanForProfile,
} from "@localai/shared";

describe("dialect intonation contours", () => {
  it("publishes well-formed monotone-progress envelopes", () => {
    assert.equal(
      VOICE_INTONATION_CONTOUR_DEFINITIONS.length,
      VOICE_INTONATION_CONTOUR_IDS.length,
    );
    for (const definition of VOICE_INTONATION_CONTOUR_DEFINITIONS) {
      assert.equal(definition.keyframes[0]?.progress, 0, definition.id);
      assert.equal(definition.keyframes.at(-1)?.progress, 1, definition.id);
      for (let index = 1; index < definition.keyframes.length; index += 1) {
        assert.ok(
          definition.keyframes[index]!.progress >
            definition.keyframes[index - 1]!.progress,
          definition.id,
        );
      }
      // Depths stay in the dialect-inflection band, never cartoon territory.
      for (const frame of definition.keyframes) {
        assert.ok(Math.abs(frame.cents) <= 100, definition.id);
      }
    }
  });

  it("derives each dialect's tune from the accent pin", () => {
    assert.equal(
      voiceIntonationContourForAccentDefinition("irish-english"),
      "rise-fall",
    );
    assert.equal(
      voiceIntonationContourForAccentDefinition("scottish-english"),
      "terminal-fall",
    );
    for (const southAsian of [
      "indian-english",
      "pakistani-english",
      "sri-lankan-english",
      "bengali-influenced-english",
    ]) {
      assert.equal(
        voiceIntonationContourForAccentDefinition(southAsian),
        "climbing-reset",
        southAsian,
      );
    }
    for (const rise of ["australian-english", "new-zealand-english"]) {
      assert.equal(
        voiceIntonationContourForAccentDefinition(rise),
        "terminal-rise",
        rise,
      );
    }
    // Accents without a distinctive published tune stay natural.
    for (const natural of [
      "american-english",
      "british-english",
      "cockney-english",
      "texas-english",
    ]) {
      assert.equal(
        voiceIntonationContourForAccentDefinition(natural),
        null,
        natural,
      );
    }
  });

  it("plans from the profile with strength-scaled depth and legacy fallback", () => {
    assert.deepEqual(
      voiceIntonationPlanForProfile({
        accentDefinitionId: "indian-english",
        speechprintStrength: "balanced",
      }),
      { contourId: "climbing-reset", scale: 1 },
    );
    assert.deepEqual(
      voiceIntonationPlanForProfile({
        speechprintInfluence: "irish-english",
        speechprintStrength: "strong",
      }),
      { contourId: "rise-fall", scale: 1.25 },
    );
    assert.equal(
      voiceIntonationPlanForProfile({
        accentDefinitionId: "irish-english",
        speechprintStrength: "light",
      })?.scale,
      0.65,
    );
    assert.equal(
      voiceIntonationPlanForProfile({ accentDefinitionId: "american-english" }),
      null,
    );
  });

  it("samples deterministically, lands terminal keyframes, and damps short phrases", () => {
    const plan = voiceIntonationPlanForProfile({
      accentDefinitionId: "indian-english",
      speechprintStrength: "balanced",
    });
    assert.equal(voiceIntonationDetuneCents(plan, 0, 4), -15);
    assert.equal(voiceIntonationDetuneCents(plan, 3.2, 4), 85);
    assert.equal(voiceIntonationDetuneCents(plan, 4, 4), 70);
    assert.equal(voiceIntonationContourCentsAt("terminal-fall", 1), -95);
    // A 0.6-second chunk gets half depth: the arc survives, the chirp doesn't.
    assert.equal(
      voiceIntonationDetuneCents(plan, 0.6, 0.6),
      70 * (0.6 / VOICE_INTONATION_FULL_DEPTH_SECONDS),
    );
    assert.equal(voiceIntonationDetuneCents(plan, 1, 0), 0);
    assert.equal(voiceIntonationDetuneCents(null, 1, 4), 0);
    // Elapsed time clamps into the phrase instead of extrapolating.
    assert.equal(voiceIntonationDetuneCents(plan, 9, 4), 70);
  });
});
