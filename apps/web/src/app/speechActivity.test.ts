import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpeechActivityWindows,
  buildSpeechActivityWindowsFromTextCadence,
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

  it("idles through punctuation rests when only text cadence is available", () => {
    const windows = buildSpeechActivityWindowsFromTextCadence(
      "Hello. There.",
      2_000,
    );
    assert.ok(windows);
    assert.ok(windows!.length >= 2);
    // Mid-sentence period rest should silence the mouth.
    const firstEnd = windows![0]!.endMs;
    const secondStart = windows![1]!.startMs;
    assert.ok(secondStart > firstEnd);
    const pauseMs = Math.round((firstEnd + secondStart) / 2);
    assert.equal(speechActivityAtMs(windows, pauseMs), false);
    // After the local TTS lead-in pad, the first word should voice.
    assert.equal(speechActivityAtMs(windows, windows![0]!.startMs + 20), true);
  });

  it("keeps the mouth idle through the local TTS lead-in pad", () => {
    const windows = buildSpeechActivityWindowsFromTextCadence("Hello there", 1_200);
    assert.ok(windows);
    assert.ok((windows![0]?.startMs ?? 0) >= 100);
    assert.equal(speechActivityAtMs(windows, 40), false);
  });

  it("does not pull the first provider phoneme onset early with attack", () => {
    const windows = buildSpeechActivityWindows(
      {
        characters: ["H", "i"],
        characterStartTimesSeconds: [0.12, 0.2],
        characterEndTimesSeconds: [0.2, 0.35],
      },
      350,
    );
    assert.equal(windows?.[0]?.startMs, 120);
    assert.equal(speechActivityAtMs(windows, 60), false);
    assert.equal(speechActivityAtMs(windows, 130), true);
  });
});
