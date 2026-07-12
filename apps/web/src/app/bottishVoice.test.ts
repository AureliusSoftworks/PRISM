import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildBottishPlan,
  encodeBottishPlanWave,
  fitBottishPlanToDuration,
} from "./bottishVoice.ts";

const neutral = {
  v: 1 as const,
  baseVoiceId: "voice-1" as const,
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
};

describe("Bottish speech plan", () => {
  it("is deterministic for a message and profile", () => {
    assert.deepEqual(
      buildBottishPlan("Hello, bot!", neutral, "message-1"),
      buildBottishPlan("Hello, bot!", neutral, "message-1")
    );
  });

  it("maps pitch, lilt, tone, and base voice into audible plan changes", () => {
    const base = buildBottishPlan("Testing voice controls.", neutral, "same");
    const changed = buildBottishPlan(
      "Testing voice controls.",
      {
        v: 1,
        baseVoiceId: "voice-4",
        pitch: 0.8,
        warmth: 0,
        pace: 0,
        lilt: 0.9,
        signal: 1,
      },
      "same"
    );
    assert.notEqual(changed.notes[0]?.frequencyHz, base.notes[0]?.frequencyHz);
    assert.notEqual(changed.notes[1]?.frequencyHz, base.notes[1]?.frequencyHz);
    assert.notEqual(changed.notes[0]?.waveform, base.notes[0]?.waveform);
  });

  it("ignores legacy Pace and Warmth values", () => {
    const base = buildBottishPlan("Testing removed controls.", neutral, "same");
    const legacyValues = buildBottishPlan(
      "Testing removed controls.",
      { ...neutral, pace: 1, warmth: -1 },
      "same"
    );
    assert.deepEqual(legacyValues, base);
  });

  it("keeps the neutral mix bright and clearly audible", () => {
    const plan = buildBottishPlan("Hello, bot!", neutral, "audibility");
    assert.ok((plan.notes[0]?.gain ?? 0) >= 0.25);
    assert.ok((plan.notes[0]?.lowpassHz ?? 0) >= 6000);
  });

  it("uses Signal to move Bottish from organic tones to synthetic edges", () => {
    const organic = buildBottishPlan("Signal check", { ...neutral, signal: -1 }, "signal");
    const synthetic = buildBottishPlan("Signal check", { ...neutral, signal: 1 }, "signal");
    assert.equal(organic.notes[0]?.waveform, "sine");
    assert.equal(synthetic.notes[0]?.waveform, "square");
    assert.ok((synthetic.notes[0]?.lowpassHz ?? 0) > (organic.notes[0]?.lowpassHz ?? 0));
    assert.ok(
      (synthetic.notes[0]?.lowpassHz ?? 0) - (organic.notes[0]?.lowpassHz ?? 0) >= 4000
    );
  });

  it("renders a playable PCM wave for the media fallback", () => {
    const plan = buildBottishPlan("Hello there.", neutral, "media-fallback");
    const wave = encodeBottishPlanWave(plan);
    const view = new DataView(wave);
    assert.equal(String.fromCharCode(...new Uint8Array(wave, 0, 4)), "RIFF");
    assert.equal(view.getUint32(24, true), 24_000);
    assert.ok(new Int16Array(wave, 44).some((sample) => sample !== 0));
  });

  it("pre-authorizes and reuses media fallback playback", () => {
    const source = readFileSync(new URL("./bottishVoice.ts", import.meta.url), "utf8");
    assert.match(source, /export async function prepareBottishVoice\(\)[\s\S]*?beginMediaUnlock\(\);/);
    assert.match(source, /const audio = preparedMedia \?\? new Audio\(\)/);
    assert.match(source, /releaseActiveMedia\(!error\)/);
  });

  it("caps extremely long replies", () => {
    const plan = buildBottishPlan("a".repeat(5000), neutral, "long");
    assert.equal(plan.notes.length, 420);
  });

  it("fits Bottish to the visible streaming window", () => {
    const original = buildBottishPlan("A streamed reply with several words.", neutral, "stream");
    const fitted = fitBottishPlanToDuration(original, 640);
    assert.equal(fitted.durationMs, 640);
    assert.equal(fitted.notes.length, original.notes.length);
    assert.equal(fitted.notes[0]?.frequencyHz, original.notes[0]?.frequencyHz);
    assert.ok((fitted.notes.at(-1)?.startMs ?? 0) < fitted.durationMs);
  });

  it("keeps the natural duration when no streaming window is supplied", () => {
    const original = buildBottishPlan("Natural preview timing.", neutral, "preview");
    assert.equal(fitBottishPlanToDuration(original, undefined), original);
  });

  it("carries character timing for audio-driven text reveal", () => {
    const plan = buildBottishPlan("Hi, bot!", neutral, "aligned");
    assert.equal(plan.alignment.characters.join(""), "Hi, bot!");
    assert.equal(plan.alignment.characterStartTimesSeconds.length, 8);
    assert.equal(
      plan.alignment.characterEndTimesSeconds.every((end, index) =>
        end >= (plan.alignment.characterStartTimesSeconds[index] ?? 0)
      ),
      true
    );
  });
});
