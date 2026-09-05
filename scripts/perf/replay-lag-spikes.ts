/** Synthetic CPU exercise only: no account, server, provider, media, DOM, or GPU. */
import assert from "node:assert/strict";
import {
  buildReplaySceneCheckpointsV2,
  createReplaySceneSamplerV2,
  defaultReplaySceneV2,
  replaySceneAtV2,
  type ReplayManifestV2,
  type ReplayTimelineV1,
} from "../../packages/shared/src/replay.ts";
import { createCoffeeReplayVideoFrameSampler, coffeeReplayVideoFrameState } from "../../apps/web/src/app/coffeeReplayVideoFrame.ts";
import { copyReplayAudioChannels, interleaveReplayAudioChannels } from "../../apps/web/src/app/replayAudioPcm.ts";

const count = 5_000;
const samples = 240;
const participants: ReplayManifestV2["participants"] = Array.from({ length: 5 }, (_, index) => ({
  id: `bot-${index}`, name: `Fixture ${index}`, kind: "bot", role: "guest",
  color: "#33aaff", glyph: "star", seatIndex: index, visible: true,
}));
const manifest: ReplayManifestV2 = {
  v: 2, surface: "coffee", sourceId: "synthetic-only", title: "CPU fixture",
  createdAt: "2026-09-03T00:00:00Z", completedAt: null, privacyMode: "local",
  participants, utterances: [], initialScene: defaultReplaySceneV2(participants),
  direction: Array.from({ length: count }, (_, index) => ({
    sequence: index + 1, kind: "speech", atMs: index * 300, endMs: index * 300 + 600,
    sourceMessageId: `message-${index}`, payload: { speakerId: `bot-${index % 5}`, active: true, audible: true },
  })),
  visual: { theme: "dark", accentColor: "#33aaff", atmosphereImageUrl: null },
};
const messages = Array.from({ length: count }, (_, index) => ({ id: `message-${index}`, text: `Synthetic line ${index}` }));
const timeline: ReplayTimelineV1 = {
  v: 1, durationMs: count * 300 + 1_000,
  beats: manifest.direction.map((event, index) => ({
    id: `beat-${index}`, kind: "utterance", startMs: event.atMs, endMs: event.endMs!,
    utteranceId: null, sourceMessageId: event.sourceMessageId, speakerId: `bot-${index % 5}`,
    speakerName: `Fixture ${index % 5}`, text: messages[index]!.text, channel: "primary",
  })),
};
const frameArgs = { messages, timeline, displayLengthForMessage: (message: typeof messages[number]) => message.text.length };
const checkpoints = buildReplaySceneCheckpointsV2(manifest);
const prepareStart = performance.now();
const scene = createReplaySceneSamplerV2(manifest);
const frame = createCoffeeReplayVideoFrameSampler(frameArgs);
const preparationMs = performance.now() - prepareStart;
// Walk late recording frames plus backwards/forward seeks; both paths see the
// exact same timestamps, with compilation excluded but reported separately.
const times = Array.from({ length: samples }, (_, index) =>
  index % 30 === 0 ? (index * 7919) % timeline.durationMs : count * 240 + index * (1000 / 60),
);
function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (fraction: number) => Number((sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0).toFixed(3));
  return { samples: values.length, p50Ms: p(.5), p95Ms: p(.95), p99Ms: p(.99), maxMs: p(1), over16_7Ms: values.filter((value) => value > 16.7).length };
}
function measure(work: (at: number) => unknown) {
  for (const at of times.slice(0, 20)) work(at);
  return times.map((at) => { const start = performance.now(); work(at); return performance.now() - start; });
}
for (const at of times) {
  assert.deepEqual(scene(at), replaySceneAtV2(manifest, at, checkpoints));
  assert.deepEqual(frame(at), coffeeReplayVideoFrameState({ ...frameArgs, videoElapsedMs: at }));
}
const baseline = () => measure((at) => {
  replaySceneAtV2(manifest, at, checkpoints);
  coffeeReplayVideoFrameState({ ...frameArgs, videoElapsedMs: at });
});
const prepared = () => measure((at) => { scene(at); frame(at); });
// Alternate order to avoid reporting a single favorable warm-up sequence.
const baselineSamples = baseline();
const preparedSamples = prepared();
preparedSamples.push(...prepared());
baselineSamples.push(...baseline());
const pcm = [new Float32Array(48_000 * 8), new Float32Array(48_000 * 8)];
const buffer = { sampleRate: 48_000, numberOfChannels: 2, getChannelData: (channel: number) => pcm[channel]! };
const legacyPcm = measure(() => {
  const data = new Float32Array(pcm[0]!.length * 2);
  for (let index = 0; index < pcm[0]!.length; index++) {
    for (let channel = 0; channel < pcm.length; channel++) data[index * pcm.length + channel] = pcm[channel]![index]!;
  }
  return data;
});
const copyPcm = measure(() => copyReplayAudioChannels(buffer));
assert.equal(interleaveReplayAudioChannels(copyReplayAudioChannels(buffer)).length, pcm[0]!.length * 2);
console.log(JSON.stringify({
  kind: "synthetic CPU only; not browser frame pacing or 60 FPS proof",
  directionEvents: count, utteranceBeats: count, preparationMs: Number(preparationMs.toFixed(3)),
  beforeEquivalent: summarize(baselineSamples), afterPrepared: summarize(preparedSamples),
  pcm8SecondWindowBeforeMainThread: summarize(legacyPcm), pcm8SecondWindowAfterMainThreadCopies: summarize(copyPcm),
  note: "Worker interleaving/encoding, rendering, decode, paint, media timing and input latency require host QA. Baseline uses public one-shot replay projection plus per-frame frame-sampler preparation; source timestamps and output were compared exactly.",
}, null, 2));
