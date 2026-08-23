import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpeechActivityWindows,
  buildSpeechActivityWindowsFromTextCadence,
  speechActivityAtMs,
  SPEECH_ACTIVITY_ATTACK_MS,
  TEXT_CADENCE_POST_REST_LEAD_IN_MS,
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
    const windows = buildSpeechActivityWindowsFromTextCadence(
      "Hello there",
      1_200,
    );
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

  it("uses decoded Premium onset without stretching provider activity", () => {
    const windows = buildSpeechActivityWindows(
      {
        characters: ["m", "a"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.2, 0.5],
        audioTimelineOffsetSeconds: 0.3,
      },
      1_200,
    );
    assert.equal(windows?.[0]?.startMs, 300);
    assert.equal(speechActivityAtMs(windows, 299), false);
    assert.equal(speechActivityAtMs(windows, 300), true);
  });

  it("does not attack across a provider pause into remaining silence", () => {
    const windows = buildSpeechActivityWindows(phraseAlignment, 1_000);
    assert.ok(windows);
    assert.ok(windows!.length >= 2);
    const secondStart = windows![1]!.startMs;
    // True onset of "There" is 580ms — attack must not open lips before that.
    assert.equal(secondStart, 580);
    assert.ok(secondStart > 580 - SPEECH_ACTIVITY_ATTACK_MS);
    assert.equal(speechActivityAtMs(windows, secondStart - 1), false);
    assert.equal(speechActivityAtMs(windows, secondStart), true);
  });

  it("holds idle after a text-cadence rest before the next voiced beat", () => {
    const windows = buildSpeechActivityWindowsFromTextCadence(
      "Hello. There.",
      2_000,
    );
    assert.ok(windows);
    assert.ok(windows!.length >= 2);
    const firstEnd = windows![0]!.endMs;
    const secondStart = windows![1]!.startMs;
    assert.ok(secondStart - firstEnd >= TEXT_CADENCE_POST_REST_LEAD_IN_MS);
    assert.equal(speechActivityAtMs(windows, secondStart - 1), false);
  });
});
