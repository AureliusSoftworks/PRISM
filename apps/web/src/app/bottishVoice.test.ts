import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBottishPlan } from "./bottishVoice.ts";

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

  it("caps extremely long replies", () => {
    const plan = buildBottishPlan("a".repeat(5000), neutral, "long");
    assert.equal(plan.notes.length, 420);
  });
});
