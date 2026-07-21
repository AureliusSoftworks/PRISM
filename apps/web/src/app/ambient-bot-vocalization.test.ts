import assert from "node:assert/strict";
import test from "node:test";
import { ambientBotVocalizationMouthShapeAtElapsedMs } from "./ambient-bot-vocalization.ts";

test("prerecorded bot vocalizations drive bounded nonverbal mouth patterns", () => {
  for (const kind of [
    "throat-clear",
    "mouth-sound",
    "lip-smack",
    "soft-sigh",
    "soft-inhale",
  ] as const) {
    const cue = { kind, durationMs: 1_000 };
    const frames = new Set(
      Array.from({ length: 9 }, (_, index) =>
        ambientBotVocalizationMouthShapeAtElapsedMs(cue, index * 110),
      ),
    );
    assert.ok(frames.size >= 3, `${kind} should visibly articulate`);
    assert.equal(
      ambientBotVocalizationMouthShapeAtElapsedMs(cue, -1),
      "closed",
    );
    assert.equal(
      ambientBotVocalizationMouthShapeAtElapsedMs(cue, cue.durationMs),
      "closed",
    );
  }
});
