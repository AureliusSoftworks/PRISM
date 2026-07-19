import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPrismSceneAudioStopSequence } from "./scene-audio-stop-sequence.ts";

describe("PRISM scene audio lifecycle", () => {
  it("halts every registered audio source at a scene boundary", () => {
    const stopped: string[] = [];

    runPrismSceneAudioStopSequence([
      () => stopped.push("voice"),
      () => stopped.push("reaction"),
      () => stopped.push("foley"),
      () => stopped.push("intro"),
    ]);

    assert.deepEqual(stopped, ["voice", "reaction", "foley", "intro"]);
  });

  it("continues cleanup when an already-disposed backend throws", () => {
    const stopped: string[] = [];

    runPrismSceneAudioStopSequence([
      () => stopped.push("first"),
      () => {
        throw new Error("already closed");
      },
      () => stopped.push("last"),
    ]);

    assert.deepEqual(stopped, ["first", "last"]);
  });
});
