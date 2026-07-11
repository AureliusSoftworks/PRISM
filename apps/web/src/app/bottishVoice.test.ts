import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBottishPlan, encodeBottishPlanWave } from "./bottishVoice.ts";

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

  it("maps pitch, pace, warmth, lilt, and base voice into audible plan changes", () => {
    const base = buildBottishPlan("Testing voice controls.", neutral, "same");
    const changed = buildBottishPlan(
      "Testing voice controls.",
      { v: 1, baseVoiceId: "voice-4", pitch: 0.8, warmth: 0.7, pace: 0.6, lilt: 0.9 },
      "same"
    );
    assert.notEqual(changed.notes[0]?.frequencyHz, base.notes[0]?.frequencyHz);
    assert.notEqual(changed.notes[0]?.lowpassHz, base.notes[0]?.lowpassHz);
    assert.notEqual(changed.notes[1]?.frequencyHz, base.notes[1]?.frequencyHz);
    assert.ok(changed.durationMs < base.durationMs);
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
  });

  it("renders a playable PCM wave for the media fallback", () => {
    const plan = buildBottishPlan("Hello there.", neutral, "media-fallback");
    const wave = encodeBottishPlanWave(plan);
    const view = new DataView(wave);
    assert.equal(String.fromCharCode(...new Uint8Array(wave, 0, 4)), "RIFF");
    assert.equal(view.getUint32(24, true), 24_000);
    assert.ok(new Int16Array(wave, 44).some((sample) => sample !== 0));
  });

  it("caps extremely long replies", () => {
    const plan = buildBottishPlan("a".repeat(5000), neutral, "long");
    assert.equal(plan.notes.length, 420);
  });
});
