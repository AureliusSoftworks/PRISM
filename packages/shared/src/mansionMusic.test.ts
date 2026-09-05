import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANSION_MUSIC_REFRACT_LENSES_V1,
  deriveMansionMusicIdentityV1,
  mansionMusicLensDirectionV1,
  normalizeMansionMusicIdentityV1,
  validateMansionMusicIdentityV1,
  validateMansionMusicLoopV1,
} from "./mansionMusic.ts";

describe("mansion music identity", () => {
  const houses = [
    ["Asterion Observatory", "Deep-space observatory", "Orbital airlocks and a blue giant"],
    ["Blackwood House", "1890s Gothic Revival", "Rain, walnut, patina, and old windows"],
    ["Banyan House", "Grounded expedition manor", "Monsoon beside one banyan"],
  ] as const;

  it("derives distinct, safe instrumental identities for each mansion family", () => {
    const identities = houses.map(([title, label, promptContract]) =>
      deriveMansionMusicIdentityV1({ title, houseStyleLabel: label, houseStylePromptContract: promptContract }));
    assert.deepEqual(identities.map((entry) => entry.noirSubgenre), [
      "orbital noir",
      "Gothic chamber noir",
      "botanical chamber noir",
    ]);
    for (const identity of identities) {
      assert.deepEqual(validateMansionMusicIdentityV1(identity), []);
      assert.equal(identity.instrumental, true);
      assert.equal(identity.soundSources, "instruments_only");
      assert.equal(identity.speechSafe, true);
      assert.equal(identity.semanticAudioPolicy, "non_semantic_music_only");
      assert.deepEqual(identity.silenceRatio, { min: 0.45, max: 0.65 });
      assert.deepEqual(identity.phraseDurationSeconds, { min: 6, max: 14 });
      assert.deepEqual(identity.quietIntervalSeconds, { min: 8, max: 24 });
      assert.deepEqual(identity.loopBoundary, {
        quietWindowSeconds: 2,
        searchWindowSeconds: 8,
        crossfadeSeconds: 1.5,
      });
      assert.ok(identity.intensityCeiling <= 0.25);
      assert.ok((identity.foregroundRiskCeiling ?? 1) <= 0.18);
      assert.doesNotMatch(identity.instrumentation.join(" "), /\brain\b|\bwind\b|\bhull\b|\bmachinery\b|\bfireplace\b|\bwindow\b|\binsect\b|\bwildlife\b|jungle ambience/iu);
    }
    assert.deepEqual(identities.map((identity) => identity.instrumentation), [
      ["soft ethereal synthesizer pads", "glassy vibraphone", "celesta", "restrained low synthesizer pulse", "occasional bass clarinet"],
      ["felt piano", "bass clarinet", "muted cornet", "upright bass", "sparse brushed drums", "quiet chamber strings"],
      ["light bongos", "occasional woody marimba", "upright bass", "rare muted brass", "glass harmonics"],
    ]);
  });

  it("clamps imported identities to the sealed safety envelope", () => {
    const fallback = deriveMansionMusicIdentityV1({
      title: "Blackwood House",
      houseStyleLabel: "Gothic",
      houseStylePromptContract: "Storm-lit walnut halls",
    });
    const normalized = normalizeMansionMusicIdentityV1({
      ...fallback,
      tempoBpm: { min: -20, max: 500 },
      density: { min: -1, max: 4 },
      intensityCeiling: 1,
      acousticElectronicBalance: 2,
      instrumental: false,
      semanticAudioPolicy: "invent_clues",
    }, fallback);
    assert.deepEqual(normalized.tempoBpm, { min: 40, max: 140 });
    assert.deepEqual(normalized.density, { min: 0, max: 1 });
    assert.equal(normalized.intensityCeiling, 0.3);
    assert.equal(normalized.acousticElectronicBalance, 1);
    assert.equal(normalized.instrumental, true);
    assert.equal(normalized.soundSources, "instruments_only");
    assert.equal(normalized.semanticAudioPolicy, "non_semantic_music_only");
    assert.deepEqual(normalized.silenceRatio, { min: 0.45, max: 0.65 });
    assert.deepEqual(normalized.phraseDurationSeconds, { min: 6, max: 14 });
    assert.deepEqual(normalized.quietIntervalSeconds, { min: 8, max: 24 });
  });

  it("keeps obsolete Refract metadata readable for legacy packages", () => {
    const identity = deriveMansionMusicIdentityV1({
      title: "Asterion Observatory",
      houseStyleLabel: "Orbital observatory",
      houseStylePromptContract: "Blue giant, glass, and hull resonance",
    });
    assert.deepEqual(MANSION_MUSIC_REFRACT_LENSES_V1, ["shadow", "pulse", "atmosphere"]);
    for (const lens of MANSION_MUSIC_REFRACT_LENSES_V1) {
      const direction = mansionMusicLensDirectionV1(identity, lens);
      assert.match(direction, new RegExp(lens, "iu"));
      assert.doesNotMatch(direction, /genre|vocal|character|weapon|clue|copyright/iu);
    }
    assert.match(mansionMusicLensDirectionV1(identity, "shadow"), /same mansion instrumentation/u);
    assert.match(mansionMusicLensDirectionV1(identity, "pulse"), /46-62 BPM/u);
    assert.match(mansionMusicLensDirectionV1(identity, "atmosphere"), /non-semantic instrumental texture/u);
  });

  it("validates the accepted silence ratio and equal-power loop contract", () => {
    const identity = deriveMansionMusicIdentityV1({
      title: "Blackwood House",
      houseStyleLabel: "Gothic",
      houseStylePromptContract: "Walnut halls",
    });
    assert.deepEqual(validateMansionMusicLoopV1({
      version: 1,
      loopStartMs: 1_000,
      loopEndMs: 119_000,
      crossfadeMs: 1_500,
      silenceRatio: 0.52,
    }, 120_000, identity), []);
    assert.match(validateMansionMusicLoopV1({
      version: 1,
      loopStartMs: 0,
      loopEndMs: 120_000,
      crossfadeMs: 500,
      silenceRatio: 0.2,
    }, 120_000, identity).join(" "), /crossfade|silence ratio/iu);
  });
});
