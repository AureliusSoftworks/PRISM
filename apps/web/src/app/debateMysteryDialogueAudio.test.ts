import assert from "node:assert/strict";
import test from "node:test";

import { cancelWhodunnitDialogueAudioImmediately } from "./debateMysteryDialogueAudio.ts";

function fakeDialogueMedia() {
  return {
    paused: false,
    volume: 0.8,
    currentTime: 3.2,
    pauses: 0,
    loads: 0,
    removed: [] as string[],
    pause() { this.pauses += 1; this.paused = true; },
    load() { this.loads += 1; },
    removeAttribute(name: string) { this.removed.push(name); },
  };
}

test("immediately cancels generated and synthetic Whodunnit dialogue on skip", () => {
  const media = fakeDialogueMedia();
  let syntheticCancellations = 0;
  let outputCleanups = 0;

  cancelWhodunnitDialogueAudioImmediately({
    media: media as unknown as HTMLMediaElement,
    outputCleanup: () => { outputCleanups += 1; },
    cancelSyntheticVoice: () => { syntheticCancellations += 1; },
  });

  assert.equal(syntheticCancellations, 1);
  assert.equal(media.pauses, 1);
  assert.equal(media.paused, true);
  assert.equal(media.currentTime, 0);
  assert.deepEqual(media.removed, ["src"]);
  assert.equal(media.loads, 1);
  assert.equal(outputCleanups, 1);
});

test("cancels Bottish and releases a routed output without generated media", () => {
  let syntheticCancellations = 0;
  let outputCleanups = 0;

  cancelWhodunnitDialogueAudioImmediately({
    media: null,
    outputCleanup: () => { outputCleanups += 1; },
    cancelSyntheticVoice: () => { syntheticCancellations += 1; },
  });

  assert.equal(syntheticCancellations, 1);
  assert.equal(outputCleanups, 1);
});
