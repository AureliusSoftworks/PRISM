import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copyReplayAudioChannels, interleaveReplayAudioChannels } from "./replayAudioPcm.ts";

test("worker PCM preserves every stereo sample and leaves the source buffer attached", () => {
  const left = new Float32Array([0, -0, 0.25, -0.75, 1, -1]);
  const right = new Float32Array([-1, 1, -0.125, 0.375, -0, 0]);
  const original = [left.slice(), right.slice()];
  const copies = copyReplayAudioChannels({
    sampleRate: 48_000, numberOfChannels: 2,
    getChannelData: (channel) => [left, right][channel]!,
  });
  const transferred = structuredClone(copies, { transfer: copies });
  assert.equal(copies[0]!.byteLength, 0);
  assert.deepEqual(left, original[0]);
  assert.deepEqual(right, original[1]);
  const expected = new Float32Array(left.length * 2);
  for (let frame = 0; frame < left.length; frame++) {
    expected[frame * 2] = left[frame]!;
    expected[frame * 2 + 1] = right[frame]!;
  }
  assert.deepEqual(interleaveReplayAudioChannels(transferred), expected);
});

test("PCM rejects unsupported rates/channels and mismatched windows", () => {
  assert.throws(() => copyReplayAudioChannels({ sampleRate: 44_100, numberOfChannels: 2, getChannelData: () => new Float32Array(0) }), /48 kHz stereo/u);
  assert.throws(() => interleaveReplayAudioChannels([new ArrayBuffer(4), new ArrayBuffer(8)]), /equal-length stereo/u);
  assert.throws(() => interleaveReplayAudioChannels([]), /equal-length stereo/u);
});

test("production transfer uses worker interleaving and unchanged sample-clock timestamps", () => {
  const ui = readFileSync(new URL("./replayRenderAudio.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("./replayAudioEncoder.worker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /for \(let frame|interleaved/u);
  assert.match(ui, /const channels = copyReplayAudioChannels\(audioBuffer\)/u);
  assert.match(ui, /timestamp: timestampFrames \/ 48_000/u);
  assert.match(ui, /timestampFrames \+= frameCount/u);
  assert.match(worker, /interleaveReplayAudioChannels\(message\.channels\)/u);
  assert.match(worker, /timestamp: message\.timestamp/u);
});
