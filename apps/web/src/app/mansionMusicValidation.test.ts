import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveMansionMusicIdentityV1 } from "@localai/shared";

import {
  analyzeMansionMusicPcmV1,
  type MansionMusicPcmV1,
} from "./mansionMusicValidation.ts";

const identity = deriveMansionMusicIdentityV1({
  title: "Blackwood House",
  houseStyleLabel: "Gothic manor",
  houseStylePromptContract: "Walnut halls",
});

function pcmFromBlocks(blockLevels: readonly number[]): MansionMusicPcmV1 {
  const sampleRate = 10_000;
  const blockFrames = 1_000;
  const samples = new Float32Array(blockLevels.length * blockFrames);
  for (let block = 0; block < blockLevels.length; block += 1) {
    samples.fill(blockLevels[block] ?? 0, block * blockFrames, (block + 1) * blockFrames);
  }
  return {
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

describe("mansion music decoded-candidate validation", () => {
  it("accepts a quiet-boundary composition with the required internal silence", () => {
    const blocks = Array.from({ length: 1_200 }, (_, index) => {
      if (index < 30 || index >= 1_170) return 0;
      return Math.floor(index / 10) % 2 === 0 ? 0.04 : 0;
    });
    const analysis = analyzeMansionMusicPcmV1(pcmFromBlocks(blocks), identity);
    assert.deepEqual(analysis.errors, []);
    assert.ok(analysis.loop);
    assert.equal(analysis.loop?.crossfadeMs, 1_500);
    assert.ok((analysis.loop?.silenceRatio ?? 0) >= 0.45);
    assert.ok((analysis.loop?.silenceRatio ?? 1) <= 0.65);
    assert.ok((analysis.loop?.loopEndMs ?? 0) - (analysis.loop?.loopStartMs ?? 0) >= 60_000);
  });

  it("recognizes low-energy intervals in a mastered candidate with an elevated noise floor", () => {
    const blocks = Array.from({ length: 1_200 }, (_, index) => {
      if (index < 30 || index >= 1_170) return 0.012;
      return Math.floor(index / 10) % 2 === 0 ? 0.08 : 0.012;
    });
    const analysis = analyzeMansionMusicPcmV1(pcmFromBlocks(blocks), identity);
    assert.deepEqual(analysis.errors, []);
    assert.ok(analysis.loop);
    assert.ok((analysis.loop?.silenceRatio ?? 0) >= 0.45);
    assert.ok((analysis.loop?.silenceRatio ?? 1) <= 0.65);
  });

  it("rejects a continuously busy candidate", () => {
    const analysis = analyzeMansionMusicPcmV1(
      pcmFromBlocks(Array.from({ length: 1_200 }, () => 0.04)),
      identity,
    );
    assert.equal(analysis.loop, null);
    assert.match(analysis.errors.join(" "), /quiet windows|silence ratio/iu);
  });

  it("explains an imbalanced candidate without exposing the storage contract", () => {
    const blocks = Array.from({ length: 1_200 }, (_, index) =>
      index < 30 || index >= 1_170 ? 0 : 0.04);
    const analysis = analyzeMansionMusicPcmV1(pcmFromBlocks(blocks), identity);
    assert.equal(analysis.loop, null);
    assert.match(analysis.errors.join(" "), /clearer balance of quiet intervals and instrumental phrases/iu);
    assert.doesNotMatch(analysis.errors.join(" "), /music loop silence ratio/iu);
  });

  it("rejects silence without audible instrumental content", () => {
    const analysis = analyzeMansionMusicPcmV1(
      pcmFromBlocks(Array.from({ length: 1_200 }, () => 0)),
      identity,
    );
    assert.equal(analysis.loop, null);
    assert.match(analysis.errors.join(" "), /audible instrumental content|silence ratio/iu);
  });

  it("rejects clipped candidates before preview", () => {
    const blocks = Array.from({ length: 1_200 }, (_, index) => {
      if (index < 30 || index >= 1_170) return 0;
      return Math.floor(index / 10) % 2 === 0 ? 1 : 0;
    });
    const analysis = analyzeMansionMusicPcmV1(pcmFromBlocks(blocks), identity);
    assert.equal(analysis.loop, null);
    assert.match(analysis.errors.join(" "), /peak is too high/u);
  });
});
