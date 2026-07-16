import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpeechActivityWindows,
  speechActivityAtMs,
} from "./speechActivity.ts";

const phraseAlignment = {
  characters: Array.from("Hi. There"),
  characterStartTimesSeconds: [0, 0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9],
  characterEndTimesSeconds: [0.08, 0.16, 0.35, 0.58, 0.66, 0.74, 0.82, 0.9, 1],
};

describe("speech activity windows", () => {
  it("rests through provider-timed phrase pauses", () => {
    const windows = buildSpeechActivityWindows(phraseAlignment, 1_000);
    assert.equal(speechActivityAtMs(windows, 100), true);
    assert.equal(speechActivityAtMs(windows, 400), false);
    assert.equal(speechActivityAtMs(windows, 620), true);
  });

  it("scales activity to the actual post-processed playback duration", () => {
    const windows = buildSpeechActivityWindows(phraseAlignment, 2_000);
    assert.equal(speechActivityAtMs(windows, 200), true);
    assert.equal(speechActivityAtMs(windows, 800), false);
    assert.equal(speechActivityAtMs(windows, 1_240), true);
  });

  it("keeps legacy timing behavior when alignment is unavailable", () => {
    assert.equal(buildSpeechActivityWindows(null, 1_000), null);
    assert.equal(speechActivityAtMs(null, 400), null);
  });
});
