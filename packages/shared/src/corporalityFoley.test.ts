import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCorporalityStockSfxPrompt,
  corporalityBinsForValue,
  corporalityNearestBin,
  corporalityStockClipPath,
  corporalityStockClipPathsForMix,
  inferCorporalityFromPersona,
  normalizeCorporality,
} from "./corporalityFoley.ts";
import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileV3,
  serializeBotAudioVoiceProfileV1,
} from "./audioVoice.ts";

describe("corporality Foley bins", () => {
  it("normalizes corporality to [0, 1]", () => {
    assert.equal(normalizeCorporality(-1), 0);
    assert.equal(normalizeCorporality(2), 1);
    assert.equal(normalizeCorporality("0.25"), 0.25);
    assert.equal(normalizeCorporality(undefined), 0.5);
  });

  it("crossfades only adjacent bins at edges and midpoints", () => {
    const artificial = corporalityBinsForValue(0);
    assert.equal(artificial.leftBin, "artificial");
    assert.equal(artificial.rightBin, "organic");
    assert.equal(artificial.leftGain, 1);
    assert.equal(artificial.rightGain, 0);

    const organic = corporalityBinsForValue(0.5);
    assert.equal(organic.leftBin, "artificial");
    assert.equal(organic.rightBin, "organic");
    assert.equal(organic.leftGain, 0);
    assert.equal(organic.rightGain, 1);

    const midArtOrganic = corporalityBinsForValue(0.25);
    assert.equal(midArtOrganic.leftBin, "artificial");
    assert.equal(midArtOrganic.rightBin, "organic");
    assert.ok(Math.abs(midArtOrganic.leftGain - 0.5) < 1e-9);
    assert.ok(Math.abs(midArtOrganic.rightGain - 0.5) < 1e-9);
    assert.ok(
      Math.abs(midArtOrganic.leftGain + midArtOrganic.rightGain - 1) < 1e-9,
    );

    const ethereal = corporalityBinsForValue(1);
    assert.equal(ethereal.leftBin, "organic");
    assert.equal(ethereal.rightBin, "ethereal");
    assert.equal(ethereal.leftGain, 0);
    assert.equal(ethereal.rightGain, 1);

    const midOrgEthereal = corporalityBinsForValue(0.75);
    assert.equal(midOrgEthereal.leftBin, "organic");
    assert.equal(midOrgEthereal.rightBin, "ethereal");
    assert.ok(Math.abs(midOrgEthereal.leftGain - 0.5) < 1e-9);
    assert.ok(Math.abs(midOrgEthereal.rightGain - 0.5) < 1e-9);
  });

  it("resolves nearest bin and stock clip paths", () => {
    assert.equal(corporalityNearestBin(0.1), "artificial");
    assert.equal(corporalityNearestBin(0.5), "organic");
    assert.equal(corporalityNearestBin(0.9), "ethereal");
    assert.equal(
      corporalityStockClipPath("organic", "fart", 0),
      "/audio/action-reactions/corporality/organic/fart-01.mp3",
    );
    assert.equal(
      corporalityStockClipPath("ethereal", "cough", 2),
      "/audio/action-reactions/corporality/ethereal/cough-03.mp3",
    );
    const mixPaths = corporalityStockClipPathsForMix({
      kind: "burp",
      corporality: 0.75,
      variantIndex: 1,
    });
    assert.ok(mixPaths);
    assert.match(mixPaths!.left, /organic\/burp-02\.mp3$/u);
    assert.match(mixPaths!.right, /ethereal\/burp-02\.mp3$/u);
    assert.equal(corporalityStockClipPathsForMix({
      kind: "laugh",
      corporality: 0.5,
      variantIndex: 0,
    }), null);
  });

  it("infers corporality from persona keywords", () => {
    assert.equal(
      inferCorporalityFromPersona("A chrome android with servo joints"),
      0.15,
    );
    assert.equal(
      inferCorporalityFromPersona("A wandering ghost of starlight"),
      0.85,
    );
    assert.equal(
      inferCorporalityFromPersona("A friendly human barista"),
      0.5,
    );
  });

  it("builds positive-only stock prompts", () => {
    const prompt = buildCorporalityStockSfxPrompt({
      bin: "artificial",
      kind: "fart",
      variantIndex: 0,
    });
    assert.match(prompt, /servo and metal/iu);
    assert.match(prompt, /comic fart/iu);
    assert.doesNotMatch(prompt, /\bno\b/iu);
  });

  it("round-trips corporality through voice profile normalize/serialize", () => {
    const v2 = normalizeBotAudioVoiceProfileV1({
      v: 2,
      corporality: 0.2,
    });
    assert.equal(v2.corporality, 0.2);

    const v3 = normalizeBotAudioVoiceProfileV3({
      v: 3,
      corporality: 0.8,
    });
    assert.equal(v3.corporality, 0.8);

    const parsed = JSON.parse(
      serializeBotAudioVoiceProfileV1({ corporality: 0.3 }),
    ) as { corporality?: number };
    assert.equal(parsed.corporality, 0.3);

    const missing = normalizeBotAudioVoiceProfileV1({});
    assert.equal(missing.corporality, 0.5);
  });
});
