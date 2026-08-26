import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assembleVoiceSyncLabPcmCaptureResult } from "./voiceSyncLabPcmCapture.ts";
import {
  VOICE_SYNC_LAB_ENGINE_OPTIONS,
  VOICE_SYNC_LAB_STRESS_CORPUS,
  analyzeVoiceSyncLabPcm,
  analyzeVoiceSyncLabInterruption,
  buildVoiceSyncLabTrace,
  createVoiceSyncLabSyntheticCalibrationWav,
  encodeVoiceSyncLabPcmWave,
  estimateVoiceSyncLabPerceptualMetrics,
  loadVoiceSyncLabCapabilities,
  parseVoiceSyncLabAlignment,
  parseVoiceSyncLabPcmWave,
  resolveVoiceSyncLabAlignment,
  synthesizeVoiceSyncLabClip,
  type VoiceSyncLabPcm,
} from "./voiceSyncLabAudio.ts";

function pcm(args: {
  channels: Float32Array[];
  sampleRate?: number;
}): VoiceSyncLabPcm {
  const sampleRate = args.sampleRate ?? 24_000;
  const frameCount = args.channels[0]?.length ?? 0;
  return {
    container: "decoded",
    encoding: "float",
    sampleRate,
    channelCount: args.channels.length,
    bitsPerSample: null,
    frameCount,
    durationMs: (frameCount / sampleRate) * 1_000,
    channels: args.channels,
  };
}

function base64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

test("PCM WAV parser round-trips channel data and duration", () => {
  const source = pcm({
    sampleRate: 8_000,
    channels: [
      Float32Array.from([-1, -0.5, 0, 0.5, 1]),
      Float32Array.from([1, 0.5, 0, -0.5, -1]),
    ],
  });
  const parsed = parseVoiceSyncLabPcmWave(encodeVoiceSyncLabPcmWave(source));
  assert.equal(parsed.sampleRate, 8_000);
  assert.equal(parsed.channelCount, 2);
  assert.equal(parsed.frameCount, 5);
  assert.equal(parsed.bitsPerSample, 16);
  assert.ok(Math.abs((parsed.channels[0]?.[1] ?? 0) + 0.5) < 0.001);
  assert.ok(Math.abs((parsed.channels[1]?.[3] ?? 0) + 0.5) < 0.001);
  assert.equal(parsed.durationMs, 0.625);
});

test("PCM activity preserves antiphase stereo energy", () => {
  const left = new Float32Array(2_400).fill(0.22);
  const right = new Float32Array(2_400).fill(-0.22);
  const analysis = analyzeVoiceSyncLabPcm(
    pcm({ channels: [left, right], sampleRate: 24_000 }),
    { activityRmsThreshold: 0.05 },
  );
  assert.equal(analysis.activity.length, 1);
  assert.equal(analysis.activity[0]?.startFrame, 0);
  assert.equal(analysis.activity[0]?.endFrame, 2_400);
  assert.ok((analysis.activity[0]?.rms ?? 0) > 0.21);
  assert.ok((analysis.waveform[0]?.peak ?? 0) > 0.21);
});

test("silent PCM has no false activity", () => {
  const analysis = analyzeVoiceSyncLabPcm(
    pcm({ channels: [new Float32Array(4_800)] }),
  );
  assert.deepEqual(analysis.activity, []);
  assert.ok(analysis.waveform.every((bucket) => !bucket.active));
});

test("alignment parsing rejects reordered or mismatched timing", () => {
  assert.equal(
    parseVoiceSyncLabAlignment({
      characters: ["a", "b"],
      characterStartTimesSeconds: [0.2, 0.1],
      characterEndTimesSeconds: [0.3, 0.4],
    }),
    null,
  );
  assert.equal(
    parseVoiceSyncLabAlignment({
      characters: ["a"],
      characterStartTimesSeconds: [0],
      characterEndTimesSeconds: [],
    }),
    null,
  );
});

test("character timing is partial while local/System/Babble stay unaligned", () => {
  const alignment = {
    characters: ["p", "a"],
    characterStartTimesSeconds: [0, 0.1],
    characterEndTimesSeconds: [0.1, 0.3],
  };
  assert.equal(
    resolveVoiceSyncLabAlignment({
      requestedEngine: "elevenlabs",
      engineUsed: "elevenlabs",
      alignment,
    }).status,
    "partial",
  );
  assert.equal(
    resolveVoiceSyncLabAlignment({
      requestedEngine: "bottish",
      engineUsed: "bottish",
      alignment,
    }).status,
    "partial",
  );
  for (const requestedEngine of [
    "local-auto",
    "local-instant",
    "local-voice-plus",
    "system",
    "babble",
  ] as const) {
    const resolved = resolveVoiceSyncLabAlignment({
      requestedEngine,
      engineUsed: "builtin",
      alignment,
    });
    assert.equal(resolved.status, "unaligned");
    assert.equal(resolved.alignment, null);
  }
});

test("real synthesis adapter requests alignment and preserves exact raw WAV", async () => {
  const wave = encodeVoiceSyncLabPcmWave(
    pcm({ channels: [new Float32Array(480).fill(0.1)] }),
  );
  let body: Record<string, unknown> = {};
  const clip = await synthesizeVoiceSyncLabClip({
    utteranceId: "local-fixture",
    text: "Keep source and spoken truth separate.",
    engine: "local-instant",
    fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          ok: true,
          audioBase64: base64(wave),
          audioContentType: "audio/wav",
          alignment: null,
          normalizedAlignment: null,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-prism-audio-content-type": "audio/wav",
            "x-prism-local-voice-engine": "instant",
            "x-prism-voice-engine": "builtin",
          },
        },
      );
    }) as typeof fetch,
  });
  assert.equal(body?.includeAlignment, true);
  assert.equal(body?.streamChunks, false);
  assert.equal((body?.profile as { localEnginePreference?: string }).localEnginePreference, "instant");
  assert.equal(clip.engineUsed, "builtin");
  assert.equal(clip.localEngine, "instant");
  assert.equal(clip.alignmentStatus, "unaligned");
  assert.equal(clip.spokenTextStatus, "unavailable");
  assert.equal(clip.spokenText, "");
  assert.deepEqual(
    Buffer.from(clip.rawWavBytes ?? new ArrayBuffer(0)),
    Buffer.from(wave),
  );
  assert.equal(clip.sourcePcm?.frameCount, 480);
});

test("ElevenLabs response uses authoritative returned characters without claiming phonemes", async () => {
  const wave = encodeVoiceSyncLabPcmWave(
    pcm({ channels: [new Float32Array(480).fill(0.1)] }),
  );
  const alignment = {
    characters: ["H", "i"],
    characterStartTimesSeconds: [0, 0.04],
    characterEndTimesSeconds: [0.04, 0.08],
  };
  const clip = await synthesizeVoiceSyncLabClip({
    text: "Submitted text may differ.",
    engine: "elevenlabs",
    fetcher: (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          audioBase64: base64(wave),
          audioContentType: "audio/wav",
          alignment,
        }),
        {
          headers: {
            "content-type": "application/json",
            "x-prism-voice-engine": "elevenlabs",
          },
        },
      )) as typeof fetch,
  });
  assert.equal(clip.alignmentStatus, "partial");
  assert.equal(clip.alignmentOrigin, "provider");
  assert.equal(clip.spokenText, "Hi");
  assert.equal(clip.spokenTextStatus, "alignment");
});

test("Bottish preserves the exact synthesis seed for production replay", async () => {
  const clip = await synthesizeVoiceSyncLabClip({
    utteranceId: "bottish-fixture",
    text: "Pack it.",
    engine: "bottish",
    seed: "exact-bottish-seed",
  });
  assert.equal(clip.seed, "exact-bottish-seed");
  assert.equal(clip.alignmentStatus, "partial");
  assert.equal(clip.bottishPlan?.alignment.characters.join(""), clip.spokenText);
});

test("trace stays on raw PCM while perceptual deltas remain a labeled estimate", async () => {
  const wave = encodeVoiceSyncLabPcmWave(
    pcm({ channels: [new Float32Array(100).fill(0.2)], sampleRate: 1_000 }),
  );
  const alignment = {
    characters: ["a"],
    characterStartTimesSeconds: [0],
    characterEndTimesSeconds: [0.1],
  };
  const clip = await synthesizeVoiceSyncLabClip({
    utteranceId: "trace-fixture",
    text: "a",
    engine: "elevenlabs",
    fetcher: (async () =>
      new Response(
        JSON.stringify({
          audioBase64: base64(wave),
          audioContentType: "audio/wav",
          alignment,
        }),
        {
          headers: {
            "content-type": "application/json",
            "x-prism-voice-engine": "elevenlabs",
          },
        },
      )) as typeof fetch,
  });
  const channel = new Float32Array(1_000);
  channel.fill(0.2, 100, 500);
  const capture = assembleVoiceSyncLabPcmCaptureResult({
    captureKind: "audio-worklet",
    sampleRate: 1_000,
    channelCount: 1,
    frameZeroContextFrame: 0,
    captureStopContextFrame: 1_000,
    quanta: [{
      sequence: 0,
      contextStartFrame: 0,
      contextStartTime: 0,
      frameCount: 1_000,
      channels: [channel],
    }],
    markerTimes: [],
    deviceLatency: {
      baseLatencyMs: 10,
      outputLatencyMs: 20,
      estimatedTotalMs: 30,
      appliedToPcm: false,
      physicalLoopbackIncluded: false,
    },
  });
  const events = [
    {
      kind: "start" as const,
      contextTime: 0.13,
      captureFrame: 130,
      elapsedMs: 0,
      durationMs: 400,
      mouthShape: "open-wide" as const,
    },
    {
      kind: "end" as const,
      contextTime: 0.53,
      captureFrame: 530,
      elapsedMs: 400,
      durationMs: 400,
      mouthShape: "closed" as const,
    },
  ];
  const mouthTransitions = [
    {
      contextTime: 0.13,
      captureFrame: 130,
      from: null,
      to: "open-wide" as const,
      open: true,
    },
    {
      contextTime: 0.53,
      captureFrame: 530,
      from: "open-wide" as const,
      to: "closed" as const,
      open: false,
    },
  ];
  const raw = buildVoiceSyncLabTrace({
    clip,
    capture,
    events,
    mouthTransitions,
  });
  const perceptual = estimateVoiceSyncLabPerceptualMetrics({
    trace: raw,
    deviceLatencyEstimateMs: 30,
  });
  assert.equal(raw.speechSpans[0]?.startFrame, 100);
  assert.equal(raw.metrics.onsetDeltaFrames, 30);
  assert.equal(perceptual.onsetDeltaFrames, 0);
  assert.equal(perceptual.physicalLoopbackMeasured, false);
  assert.equal(raw.alignmentStatus, "partial");
  assert.equal(raw.characterSpans[0]?.origin, "provider");
  assert.equal(raw.visemeSpans[0]?.origin, "heuristic");
  assert.equal(raw.phonemeSpans.length, 0);
  assert.equal(raw.frameCount, capture.frameCount);
  assert.equal(capture.deviceLatency.appliedToPcm, false);
  assert.equal(capture.channels[0]?.[100], Math.fround(0.2));
});

test("production playback source contract reuses seed, final-bus tap, tail, and stop paths", () => {
  const source = readFileSync(new URL("./voiceSyncLabAudio.ts", import.meta.url), "utf8");
  assert.match(source, /startVoiceSyncLabPcmCapture\(\{ channelCount: 2 \}\)/u);
  assert.match(source, /await delayMs\(VOICE_COMPLETED_OVERLAP_TAIL_MS\)/u);
  assert.match(source, /enqueueBottishVoice\([\s\S]*?args\.clip\.seed/u);
  assert.match(source, /enqueueBabbleVoice\([\s\S]*?args\.clip\.seed/u);
  assert.match(source, /enqueueEnglishVoice\([\s\S]*?args\.clip\.seed/u);
  assert.match(source, /shh: \(\) => stopPlayback\("shh"\)/u);
  assert.match(source, /teardownEnglishVoiceImmediately\(\{ preservePreparedMedia: true \}\)/u);
  assert.match(source, /teardownBottishVoiceImmediately\(\{ preservePreparedMedia: true \}\)/u);
});

test("Shh audit requires immediate cutoff, mouth closure, and post-cut silence", () => {
  const audit = analyzeVoiceSyncLabInterruption({
    sampleRate: 1_000,
    frameCount: 900,
    activity: [{ startFrame: 100, endFrame: 505, peak: 0.5, rms: 0.2 }],
    shhFrame: 500,
    minimumObservedSilenceMs: 80,
    mouthTransitions: [{ captureFrame: 503, to: "closed" }],
  });
  assert.equal(audit.cutoffDeltaFrames, 5);
  assert.equal(audit.observedPostCutSilenceFrames, 395);
  assert.equal(audit.postCutSilenceObserved, true);
  assert.equal(audit.cutoffToleranceFrames, 10);
  assert.equal(audit.immediateCutoffObserved, true);
  assert.equal(audit.mouthCloseDeltaFrames, 3);
  assert.equal(audit.mouthClosedImmediately, true);
});

test("Shh audit rejects a delayed cutoff even when later silence is observed", () => {
  const audit = analyzeVoiceSyncLabInterruption({
    sampleRate: 1_000,
    frameCount: 900,
    activity: [{ startFrame: 100, endFrame: 700, peak: 0.5, rms: 0.2 }],
    shhFrame: 500,
    minimumObservedSilenceMs: 80,
    mouthTransitions: [{ captureFrame: 520, to: "closed" }],
  });
  assert.equal(audit.postCutSilenceObserved, true);
  assert.equal(audit.cutoffDeltaFrames, 200);
  assert.equal(audit.immediateCutoffObserved, false);
  assert.equal(audit.mouthClosedImmediately, false);
});

test("capability loader exposes installed System voices and engine health", async () => {
  const capabilities = await loadVoiceSyncLabCapabilities({
    fetcher: (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          capabilities: {
            builtinEnglish: {
              platform: "darwin",
              operatingSystemVoicesEnabled: false,
              voices: [{ name: "Alex", locale: "en_US" }],
            },
            local: {
              engines: [
                { id: "instant", name: "Instant", available: true, qualified: true },
              ],
            },
            elevenLabs: { configured: true },
          },
        }),
      )) as typeof fetch,
  });
  assert.equal(capabilities.systemVoiceAvailable, true);
  assert.deepEqual(capabilities.systemVoices, [
    { name: "Alex", locale: "en_US", label: "Alex (en-US)" },
  ]);
  assert.equal(capabilities.localEngines[0]?.id, "instant");
  assert.equal(capabilities.elevenLabsConfigured, true);
});

test("synthetic /p/ /æ/ /k/ calibration WAV is deterministic and labeled", () => {
  const first = createVoiceSyncLabSyntheticCalibrationWav();
  const second = createVoiceSyncLabSyntheticCalibrationWav();
  assert.equal(first.kind, "synthetic-calibration");
  assert.equal(first.label, "/p/ /æ/ /k/");
  assert.deepEqual(Buffer.from(first.bytes), Buffer.from(second.bytes));
  assert.equal(parseVoiceSyncLabPcmWave(first.bytes).frameCount, first.pcm.frameCount);
  assert.deepEqual(first.phonemeSpans.map((span) => span.phoneme), ["/p/", "/æ/", "/k/"]);
  for (const span of first.phonemeSpans) {
    assert.equal(
      first.mouthTransitions.some(
        (transition) => transition.atFrame === span.endFrame && !transition.open,
      ),
      true,
    );
  }
});

test("stress corpus and engine menu cover cutoff and all production voice lanes", () => {
  assert.ok(
    VOICE_SYNC_LAB_STRESS_CORPUS.some((entry) =>
      entry.tags.some((tag) => tag === "shh"),
    ),
  );
  assert.deepEqual(
    VOICE_SYNC_LAB_ENGINE_OPTIONS.map((entry) => entry.id),
    [
      "local-auto",
      "local-instant",
      "local-voice-plus",
      "system",
      "elevenlabs",
      "babble",
      "bottish",
    ],
  );
});
