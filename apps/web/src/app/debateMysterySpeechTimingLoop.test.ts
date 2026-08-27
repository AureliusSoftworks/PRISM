import assert from "node:assert/strict";
import test from "node:test";

import { createWhodunnitSpeechTimingLoop } from "./debateMysterySpeechTimingLoop.ts";

test("keeps Whodunnit speech timing on one bounded animation loop", () => {
  let nextFrameId = 0;
  const pending = new Map<number, (now: number) => void>();
  const published: boolean[] = [];
  const loop = createWhodunnitSpeechTimingLoop({
    requestFrame: (callback) => {
      const frameId = ++nextFrameId;
      pending.set(frameId, callback);
      return frameId;
    },
    cancelFrame: (frameId) => {
      pending.delete(frameId);
    },
    onFrame: (_now, publish) => {
      published.push(publish);
      return true;
    },
  });

  loop.start();
  loop.start();
  loop.start();
  assert.equal(pending.size, 1);

  const runFrame = (now: number): ((at: number) => void) => {
    const entry = pending.entries().next().value as [number, (at: number) => void];
    pending.delete(entry[0]);
    entry[1](now);
    assert.equal(pending.size, 1);
    return entry[1];
  };
  runFrame(0);
  runFrame(16);
  const lateFrame = runFrame(50);
  assert.deepEqual(published, [true, false, true]);

  loop.stop();
  assert.equal(pending.size, 0);
  loop.start();
  lateFrame(66);
  assert.equal(pending.size, 0);
  assert.deepEqual(published, [true, false, true]);
});
