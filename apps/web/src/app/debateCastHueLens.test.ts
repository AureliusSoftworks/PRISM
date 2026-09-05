import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_CAST_LENS_PRISM_HUES,
  debateCastHueFromLensSlider,
  debateCastHueFromLensSliderInput,
  debateCastLensSliderFromHue,
  debateCastLensSliderInputValue,
} from "./debateCastHueLens.ts";

function circularDistance(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

describe("debateCastHueLens", () => {
  it("maps the top of the lens to P and the bottom to M", () => {
    assert.equal(
      debateCastHueFromLensSlider(0),
      DEBATE_CAST_LENS_PRISM_HUES[0],
    );
    assert.equal(
      debateCastHueFromLensSlider(359),
      DEBATE_CAST_LENS_PRISM_HUES[4],
    );
  });

  it("maps each equal band to its PRISM letter hue", () => {
    const bandCenters = [0.1, 0.3, 0.5, 0.7, 0.9].map((fraction) =>
      Math.round(fraction * 359),
    );
    for (let i = 0; i < bandCenters.length; i += 1) {
      assert.equal(
        debateCastHueFromLensSlider(bandCenters[i]!),
        DEBATE_CAST_LENS_PRISM_HUES[i]!,
        `band ${i} should map to PRISM hue ${DEBATE_CAST_LENS_PRISM_HUES[i]}`,
      );
    }
  });

  it("round-trips PRISM family hues without flipping the spectrum", () => {
    for (let i = 0; i < DEBATE_CAST_LENS_PRISM_HUES.length; i += 1) {
      const hue = DEBATE_CAST_LENS_PRISM_HUES[i]!;
      const slider = debateCastLensSliderFromHue(hue);
      assert.equal(debateCastHueFromLensSlider(slider), hue);
      assert.ok(
        circularDistance(slider, (i + 0.5) * (360 / 5)) < 2,
        `family ${i} should restore near its band center`,
      );
    }
  });

  it("flips the native vertical input so P stays at the top of the track", () => {
    const pink = DEBATE_CAST_LENS_PRISM_HUES[0]!;
    const violet = DEBATE_CAST_LENS_PRISM_HUES[4]!;
    assert.ok(debateCastLensSliderInputValue(pink) > 300);
    assert.ok(debateCastLensSliderInputValue(violet) < 60);
    assert.equal(debateCastHueFromLensSliderInput(359), pink);
    assert.equal(debateCastHueFromLensSliderInput(0), violet);
  });
});
