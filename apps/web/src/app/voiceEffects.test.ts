import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, botVoiceTextureForPreset } from "@localai/shared";
import {
  LIVE_INTERVIEW_VOICE_LEVELER,
  VOICE_COMPLETED_OVERLAP_TAIL_MS,
  VOICE_LILT_DEPTH_CENTS,
  PRISM_LIVE_VOICE_PROGRESS_INTERVAL_MS,
  beginVoicePlaybackProgress,
  buildVoiceDamageSchedule,
  decodedVoiceSpeechActivityStartMs,
  estimateVoiceOutputLatencyMs,
  resolveElevenLabsVoiceEffectPlan,
  resolveVoiceEffectPlan,
  resolveVoiceTexture,
  voicePlaybackPresentationDurationMs,
  voicePlaybackAlignmentWithDecodedSpeechStart,
  voiceReleaseGainAt,
  voiceLiltDetuneCents,
} from "./voiceEffects.ts";
import {
  SIGNAL_LISTENER_REACTION_VOICE_GAIN,
  signalListenerReactionVoiceGain,
} from "./listenerReactionVoice.ts";

describe("voice textures", () => {
  it("treats retired CRT texture profiles as clean", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      volume: 1.2,
      texture: { ...botVoiceTextureForPreset("crt-speaker"), amount: 0.5 },
    };
    assert.deepEqual(resolveVoiceTexture(profile), {
      bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
    });
    assert.deepEqual(resolveVoiceTexture(profile, false), {
      bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
    });
  });

  it("treats retired Lo-Fi and Tape profiles as clean", () => {
    for (const preset of ["lofi", "tape"] as const) {
      assert.deepEqual(resolveVoiceTexture({
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        texture: botVoiceTextureForPreset(preset),
      }), {
        bandwidth: 1, noise: 0, instability: 0, distortion: 0, damage: 0,
      });
    }
  });

  it("builds deterministic seeded damage schedules", () => {
    const first = buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7);
    assert.deepEqual(first, buildVoiceDamageSchedule("message-1:bot-2", 4200, 0.7));
    assert.notDeepEqual(first, buildVoiceDamageSchedule("message-2:bot-2", 4200, 0.7));
    assert.ok(first.every((event) => event.atMs >= 0 && event.atMs < 4200));
  });
});

describe("engine-agnostic voice effects", () => {
  it("uses an equal-power release curve for interrupted primary speech", () => {
    assert.equal(voiceReleaseGainAt(0.8, 0), 0.8);
    assert.ok(voiceReleaseGainAt(0.8, 0.5) > 0.5);
    assert.ok(voiceReleaseGainAt(0.8, 1) < 0.000_001);
  });

  it("releases every foreground reaction channel through the same fade", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /export function releaseReactionVoiceAudio\(fadeOutMs = 160\): void \{\s*releaseRealtimeVoiceAudio\("reaction", fadeOutMs\);\s*releaseRealtimeVoiceAudio\("crosstalk", fadeOutMs\);/u,
    );
  });

  it("keeps ordinary Signal listener words at half gain without lowering interruption crosstalk", () => {
    assert.equal(SIGNAL_LISTENER_REACTION_VOICE_GAIN, 0.5);
    assert.equal(signalListenerReactionVoiceGain({ spokenCue: "Hmm." }), 0.5);
    assert.equal(
      signalListenerReactionVoiceGain({
        spokenCue: "Hold on.",
        interjectionAttempt: true,
      }),
      1,
    );
    assert.equal(signalListenerReactionVoiceGain({}), 1);
  });

  it("ducks an active primary voice on the audio clock without stopping it", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const start = source.indexOf("export function scheduleRealtimeVoiceDuck");
    const end = source.indexOf("export function stopReactionVoiceAudio", start);
    const duck = source.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(duck, /activeVoiceChannels\[args\.channel \?\? "primary"\]/u);
    assert.match(duck, /holdMs = Math\.max\(0, Math\.min\(1_200/u);
    assert.match(duck, /resumeFadeMs = Math\.max\([\s\S]{0,80}Math\.min\(320/u);
    assert.match(duck, /linearRampToValueAtTime\(nominalGain \* duckGain/u);
    assert.match(duck, /linearRampToValueAtTime\(nominalGain, resumeEndAt\)/u);
    assert.doesNotMatch(duck, /stopRealtimeVoiceAudio|source\.stop|pause\(/u);
  });

  it("uses zero-copy worker PCM with media fallback and a 10 Hz lifecycle on live performance surfaces", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const workletStart = source.indexOf(
      "async function playWorkletLivePerformanceVoice",
    );
    const mediaStart = source.indexOf(
      "async function playLivePerformanceVoice",
      workletStart,
    );
    const realtimeStart = source.indexOf(
      "export async function playRealtimeVoiceBytes",
      mediaStart,
    );
    const worklet = source.slice(workletStart, mediaStart);
    const media = source.slice(mediaStart, realtimeStart);
    const processor = readFileSync(
      new URL(
        "../../public/worklets/prism-live-voice-playback.js",
        import.meta.url,
      ),
      "utf8",
    );

    assert.equal(PRISM_LIVE_VOICE_PROGRESS_INTERVAL_MS, 100);
    assert.match(
      source,
      /document\.body\?\.dataset\.prismLivePerformanceActive === "true"/u,
    );
    assert.match(
      source,
      /livePerformanceTimer = window\.setInterval\([\s\S]{0,120}PRISM_LIVE_VOICE_PROGRESS_INTERVAL_MS/u,
    );
    assert.match(
      source,
      /if \(livePerformanceBudget\) \{[\s\S]{0,180}liveVoicePlaybackWorkletAvailable/u,
    );
    assert.match(source, /decodeLiveVoicePcmOwned\(args\.bytes\)/u);
    assert.match(worklet, /new AudioWorkletNode\(/u);
    assert.match(worklet, /node\.port\.postMessage\([\s\S]{0,500}channelBuffers/u);
    assert.doesNotMatch(
      worklet,
      /new Blob|createMediaElementSource|context\.createBuffer\(/u,
    );
    assert.match(media, /new Blob\(\[args\.bytes\]/u);
    assert.match(media, /context\.createMediaElementSource\(audio\)/u);
    assert.match(media, /context\.createGain\(\)/u);
    assert.match(media, /context\.createStereoPanner\(\)/u);
    assert.doesNotMatch(
      media,
      /audio\.load\(\)/u,
      "live voice cleanup must not force synchronous decoder teardown",
    );
    assert.doesNotMatch(
      worklet,
      /formantCorrection|analyzePrismPitchCorrection|connectRoomAcoustics|createVoiceLightMeter/u,
    );
    assert.match(
      processor,
      /registerProcessor\("prism-live-voice-playback"/u,
    );
    assert.match(processor, /this\.channels = message\.channels\.map/u);
    assert.match(processor, /this\.sourcePosition \+= this\.sourceStep/u);
    const ownedDecodeAt = source.indexOf(
      "await decodeLiveVoicePcmOwned(args.bytes)",
      realtimeStart,
    );
    const workletPlaybackAt = source.indexOf(
      "await playWorkletLivePerformanceVoice",
      ownedDecodeAt,
    );
    const liveMediaAt = source.indexOf(
      "await playLivePerformanceVoice",
      workletPlaybackAt,
    );
    assert.ok(ownedDecodeAt > realtimeStart);
    assert.ok(workletPlaybackAt > ownedDecodeAt);
    assert.ok(liveMediaAt > workletPlaybackAt);
  });

  it("levels every live Signal playback path before applying authored voice gain", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const workletStart = source.indexOf(
      "async function playWorkletLivePerformanceVoice",
    );
    const mediaStart = source.indexOf(
      "async function playLivePerformanceVoice",
      workletStart,
    );
    const decodedStart = source.indexOf(
      "async function playDecodedLivePerformanceVoice",
      mediaStart,
    );
    const realtimeStart = source.indexOf(
      "export async function playRealtimeVoiceBytes",
      decodedStart,
    );
    const livePaths = [
      source.slice(workletStart, mediaStart),
      source.slice(mediaStart, decodedStart),
      source.slice(decodedStart, realtimeStart),
    ];

    assert.deepEqual(LIVE_INTERVIEW_VOICE_LEVELER, {
      thresholdDb: -30,
      kneeDb: 18,
      ratio: 4.5,
      attackSeconds: 0.008,
      releaseSeconds: 0.18,
      makeupGain: 1.6,
      limiterThresholdDb: -2,
      limiterRatio: 20,
    });
    assert.ok(workletStart >= 0 && mediaStart > workletStart);
    assert.ok(decodedStart > mediaStart && realtimeStart > decodedStart);
    for (const livePath of livePaths) {
      assert.match(livePath, /loudnessNormalization === "interview"/u);
      assert.match(livePath, /connectLiveInterviewVoiceLeveler/u);
      assert.match(
        livePath,
        /connectLiveInterviewVoiceLeveler[\s\S]{0,180}\(leveler\?\.output \?\? (?:node|source)\)\.connect\(outputGain\)/u,
      );
    }
  });

  it("uses the portable profile effect when a playback lane does not override it", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /args\.voiceEffect \?\? args\.elevenLabsEffect \?\? profile\.elevenLabsEffect/u,
    );
  });

  it("keeps Clean transparent and gives every preset a distinct, level-controlled character", () => {
    const clean = resolveVoiceEffectPlan("clean");
    const radio = resolveVoiceEffectPlan("radio");
    const robot = resolveVoiceEffectPlan("robot");
    const echo = resolveVoiceEffectPlan("echo");
    const chorus = resolveVoiceEffectPlan("chorus");
    const resonance = resolveVoiceEffectPlan("resonance");
    const deepSpace = resolveVoiceEffectPlan("deep-space");
    const processed = [radio, robot, echo, chorus, resonance, deepSpace];

    assert.equal(clean.drive, 0);
    assert.equal(clean.parallelVoices.length, 0);
    assert.equal(clean.outputTrim, 1);
    assert.ok(radio.highpassHz > clean.highpassHz);
    assert.ok(radio.lowpassHz < clean.lowpassHz);
    assert.ok(radio.noiseGain > 0);
    assert.ok(robot.modulationDepth > 0);
    assert.ok(robot.parallelVoices.some((voice) => voice.detuneCents < 0));
    assert.equal(echo.parallelVoices.length, 2);
    assert.equal(chorus.parallelVoices.length, 2);
    assert.deepEqual(chorus.pitchCorrection, {
      strength: 0.25,
      maxCorrectionCents: 40,
      glideSeconds: 0.1,
    });
    assert.ok(
      [clean, radio, robot, echo, resonance, deepSpace].every(
        (plan) => plan.pitchCorrection === undefined,
      ),
    );
    assert.ok(resonance.parallelVoices.some((voice) => voice.detuneCents <= -300));
    assert.ok(
      resonance.parallelVoices.some(
        (voice) => (voice.delayModulationFrequencyHz ?? 0) > 0,
      ),
    );
    assert.ok(resonance.dryGain > chorus.dryGain);
    assert.ok(resonance.lowpassHz < chorus.lowpassHz);
    assert.ok(deepSpace.parallelVoices.some((voice) => voice.detuneCents <= -500));
    assert.ok(processed.every((plan) => plan.outputTrim < 0.8));
    assert.ok(processed.every((plan) => plan.drive === 0 && plan.bitDepth === 16));
    assert.equal(new Set(processed.map((plan) => JSON.stringify(plan))).size, processed.length);
    assert.deepEqual(resolveElevenLabsVoiceEffectPlan("chorus"), chorus);
    assert.deepEqual(resolveElevenLabsVoiceEffectPlan("resonance"), resonance);
  });

  it("keeps the Prism doubling bounded throughout long replies", () => {
    const chorus = resolveVoiceEffectPlan("chorus");
    for (const voice of chorus.parallelVoices) {
      const modulationDepthSeconds = Math.abs(
        voice.delayModulationDepthSeconds ?? 0
      );
      assert.equal(voice.detuneCents, 0);
      assert.ok((voice.delayModulationFrequencyHz ?? 0) > 0);
      assert.ok(modulationDepthSeconds > 0);
      assert.ok(voice.delaySeconds - modulationDepthSeconds >= 0);
      assert.ok(voice.delaySeconds + modulationDepthSeconds <= 0.03);
    }
  });

  it("analyzes the decoded carrier locally only for effects with pitch correction", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(source, /voiceEffect\.pitchCorrection\s*\?\s*analyzePrismPitchCorrection/u);
    assert.match(source, /samples: decoded\.getChannelData\(0\)/u);
    assert.match(source, /voicePitchCorrectionCentsAt\(pitchCorrectionPoints/u);
  });

  it("does not let a stale asynchronous decode stop newer playback", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const decodeAt = source.indexOf("await context.decodeAudioData");
    const currentGuardAt = source.indexOf(
      "if (args.isCurrent && !args.isCurrent()) return true;",
      decodeAt,
    );
    const stopAt = source.indexOf(
      "stopRealtimeVoiceAudio(channel, { preserveCompletedTails: true });",
      decodeAt,
    );
    assert.ok(decodeAt >= 0);
    assert.ok(currentGuardAt > decodeAt);
    assert.ok(stopAt > currentGuardAt);
  });

  it("lets a completed final phoneme overlap the next natural voice", () => {
    const source = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(VOICE_COMPLETED_OVERLAP_TAIL_MS, 320);
    assert.match(
      source,
      /stopRealtimeVoiceAudio\(channel, \{ preserveCompletedTails: true \}\)/u,
    );
    assert.match(
      source,
      /completedVoiceTailStops\[channel\]\.add\(stopCompletedTail\)[\s\S]*?VOICE_COMPLETED_OVERLAP_TAIL_MS/u,
    );
    assert.match(
      source,
      /if \(speechStart\.stopAt !== null\) \{\s*speechStart\.source\.stop\(speechStart\.stopAt\)/u,
    );
    assert.match(
      source,
      /if \(!options\.preserveCompletedTails\) \{[\s\S]*?stopTail\(\)/u,
    );
    assert.match(
      pageSource,
      /function handoffVoicePlaybackPreservingPreparedMode[\s\S]*?preserveCompletedTails: true/u,
    );
    assert.match(
      pageSource,
      /const playBotcastUtterance[\s\S]*?handoffVoicePlaybackPreservingPreparedMode\(voiceSelection\.voiceMode\)/u,
    );
  });

  it("announces pre-speech presence before breath foley reaches the master", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /args\.onStart\?\.\(\);\s*source\.start\(startedAt(?:,\s*0,\s*playbackDurationSeconds)?\)/u,
    );
    assert.match(englishSource, /onStart: lifecycle\?\.onPresenceStart/u);
    assert.match(bottishSource, /onStart: lifecycle\?\.onPresenceStart/u);
  });

  it("meters final voice character before room acoustics across realtime and media paths", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    const mediaSource = readFileSync(
      new URL("./replayAudioMasterCapture.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /outputGain[\s\S]{0,180}\.connect\(limiter\)/u);
    assert.match(source, /limiter\.connect\(lightMeter\.node\)/u);
    assert.match(
      source,
      /connectRoomAcoustics\(\{[\s\S]{0,160}input: lightMeter\?\.node \?\? limiter/u,
    );
    assert.match(source, /active\.lightMeter\?\.stop\(\)/u);
    for (const fallbackSource of [englishSource, bottishSource]) {
      assert.match(fallbackSource, /lifecycle\?\.onLevel \|\| lifecycle\?\.voiceLightTarget/u);
      assert.match(fallbackSource, /routeAudioElementToPrismOutput\(audio, \{ onLevel \}\)/u);
      assert.match(
        fallbackSource,
        /audio\.addEventListener\("playing",[\s\S]{0,100}onLevel\(0\.22\)/u,
      );
      assert.match(fallbackSource, /mediaOutputCleanup\.set\(audio,[\s\S]{0,120}onLevel\(0\)/u);
    }
    assert.match(mediaSource, /createVoiceLightMeter\(context, options\.onLevel\)/u);
    assert.match(mediaSource, /lightMeter\?\.stop\(\)/u);
    assert.match(mediaSource, /options\.onLevel\?\.\(0\)/u);
  });

  it("keeps listener reactions on an independent, quieter, time-bounded channel", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const reactionSource = readFileSync(
      new URL("./listenerReactionVoice.ts", import.meta.url),
      "utf8",
    );
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(
      source,
      /\| "primary"\s*\| "handoff"\s*\| "presence"\s*\| "reaction"\s*\| "crosstalk"/,
    );
    assert.match(
      source,
      /export function stopRealtimeVoiceAudio\([\s\S]{0,260}releaseRealtimeVoiceAudio\(channel, options\.fadeOutMs \?\? 160\)/u,
    );
    assert.match(
      source,
      /channel === "primary" \|\| channel === "handoff" \? 1 : 0\.62/,
    );
    assert.match(source, /maxDurationMs/);
    assert.match(reactionSource, /args\.mode === "english"/u);
    assert.match(reactionSource, /buildBottishPlan/u);
    assert.match(reactionSource, /args\.mode === "babble"/u);
    assert.match(reactionSource, /channel: args\.channel \?\? "reaction"/u);
    assert.match(reactionSource, /maxDurationMs: args\.plan\.interjectionAttempt \? 2_400 : 2_000/u);
    assert.match(reactionSource, /args\.plan\.vocalFoley && args\.mode !== "english"/u);
    assert.match(
      reactionSource,
      /INTERRUPTED_SPEAKER_RETORT_PAUSE_MS = 850/u,
    );
    assert.match(
      reactionSource,
      /waitForReactionVoiceStart\(args\.startDelayMs \?\? 0, args\.signal\)/u,
    );
    assert.match(pageSource, /listenerReactionHasAudio\(plan\)/u);
    assert.match(pageSource, /signalListenerReactionPlanForPlaybackV1\(/u);
    assert.match(
      pageSource,
      /const clip = pending \? await pending : null/u,
    );
    assert.match(
      pageSource,
      /if \(playbackPlan\.interjectionAttempt\) \{\s*listenerReactionVoiceClipCacheRef\.current\.delete\(key\)/u,
    );
    assert.match(
      pageSource,
      /interruptedSpeakerCuePlayback !== "primary"/u,
    );
    assert.match(pageSource, /channel: "crosstalk"/u);
    assert.match(source, /VOICE_PLAYBACK_TAIL_FLUSH_MS = 120/u);
    assert.match(source, /Math\.max\(lifecycleOutputLatencyMs, tailFlushMs\)/u);
    assert.match(source, /scheduledStartAtPerformanceMs/u);
    assert.match(
      source,
      /args\.scheduledStartAtPerformanceMs - performance\.now\(\)/u,
    );
    assert.match(
      source,
      /startDelayMs: scheduledStartDelayMs \+ lifecycleOutputLatencyMs/u,
    );
    assert.match(source, /args\.lifecycle\?\.onCancel\?\.\(\)/u);
    assert.match(
      reactionSource,
      /compensateLifecycleForOutputLatency: true/u,
    );
  });
});

describe("voice performance", () => {
  it("derives a rigid Premium mouth zero point from decoded speech activity", () => {
    const samples = new Float32Array(1_000);
    samples.fill(0.2, 300);
    const decodedStartMs = decodedVoiceSpeechActivityStartMs({
      channels: [samples],
      sampleRate: 1_000,
    });
    assert.equal(decodedStartMs, 300);

    const alignment = voicePlaybackAlignmentWithDecodedSpeechStart(
      {
        characters: ["m", "a"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.2, 0.5],
      },
      decodedStartMs,
    );
    assert.equal(alignment?.audioTimelineOffsetSeconds, 0.3);
    assert.deepEqual(alignment?.characterStartTimesSeconds, [0, 0.2]);
    assert.deepEqual(alignment?.characterEndTimesSeconds, [0.2, 0.5]);
  });

  it("does not stretch the audible articulation clock across graph drain", () => {
    assert.equal(voicePlaybackPresentationDurationMs(1_000, 120), 1_000);
    assert.equal(voicePlaybackPresentationDurationMs(1_000, 0), 1_000);
    assert.equal(voicePlaybackPresentationDurationMs(1_000), 1_000);
  });

  it("holds visible lifecycle start until the compensated audio clock", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let timeoutCallback: (() => void) | null = null;
    let animationFrameCallback: FrameRequestCallback | null = null;
    let elapsedMs = 85;
    const progress: number[] = [];
    let started = 0;
    let startedDurationMs: number | null = null;
    const alignment = {
      characters: ["H", "i"],
      characterStartTimesSeconds: [0, 0.4],
      characterEndTimesSeconds: [0.4, 1],
    };
    let startedAlignment: typeof alignment | null | undefined;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setTimeout: (callback: () => void) => {
          timeoutCallback = callback;
          return 1;
        },
        clearTimeout: () => {
          timeoutCallback = null;
        },
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          animationFrameCallback = callback;
          return 2;
        },
        cancelAnimationFrame: () => {
          animationFrameCallback = null;
        },
      },
    });

    try {
      const controller = beginVoicePlaybackProgress(
        {
          onStart: (durationMs, receivedAlignment) => {
            started += 1;
            startedDurationMs = durationMs;
            startedAlignment = receivedAlignment;
          },
          onProgress: (elapsed) => progress.push(elapsed),
        },
        1_000,
        () => elapsedMs,
        alignment,
        { startDelayMs: 85 },
      );
      assert.equal(started, 0);
      assert.deepEqual(progress, []);
      const runStart = timeoutCallback as (() => void) | null;
      assert.ok(runStart);
      runStart();
      assert.equal(started, 1);
      assert.equal(startedDurationMs, 1_000);
      assert.equal(startedAlignment, alignment);
      assert.deepEqual(progress, [0]);

      elapsedMs = 135;
      const runFrame = animationFrameCallback as FrameRequestCallback | null;
      assert.ok(runFrame);
      runFrame(0);
      assert.deepEqual(progress, [0, 50]);

      controller.finish();
      assert.equal(progress.at(-1), 1_000);
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("keeps the final mouth pose stable until graph drain", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let animationFrameCallback: FrameRequestCallback | null = null;
    let elapsedMs = 1_120;
    const progress: Array<{ durationMs: number; elapsedMs: number }> = [];

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          animationFrameCallback = callback;
          return 1;
        },
        cancelAnimationFrame: () => {
          animationFrameCallback = null;
        },
      },
    });

    try {
      const controller = beginVoicePlaybackProgress(
        {
          onProgress: (elapsed, duration) =>
            progress.push({ durationMs: duration, elapsedMs: elapsed }),
        },
        1_000,
        () => elapsedMs,
        null,
        { holdAtEndUntilFinish: true },
      );
      assert.deepEqual(progress, [{ durationMs: 1_000, elapsedMs: 0 }]);

      const runFrame = animationFrameCallback as FrameRequestCallback | null;
      assert.ok(runFrame);
      runFrame(0);
      assert.deepEqual(progress.at(-1), {
        durationMs: 1_000,
        elapsedMs: 999,
      });

      elapsedMs = 1_240;
      controller.finish();
      assert.deepEqual(progress.at(-1), {
        durationMs: 1_000,
        elapsedMs: 1_000,
      });
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("uses the audible device clock for every realtime primary voice mode", () => {
    assert.equal(
      estimateVoiceOutputLatencyMs(
        {
          baseLatency: 0.006,
          currentTime: 10,
          outputLatency: 0.085,
          getOutputTimestamp: () => ({
            contextTime: 9.88,
            performanceTime: 1_000,
          }),
        },
        1_000,
      ),
      120,
    );
    assert.equal(
      estimateVoiceOutputLatencyMs({
        baseLatency: 0.006,
        currentTime: 10,
        outputLatency: 0.085,
      }),
      91,
    );
    assert.equal(
      estimateVoiceOutputLatencyMs({
        baseLatency: 0.5,
        currentTime: 10,
      }),
      500,
    );

    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      englishSource,
      /compensateLifecycleForOutputLatency: true/,
    );
    assert.equal(
      englishSource.match(/startDelayMs: englishMediaOutputLatencyMs\(\)/g)
        ?.length,
      2,
    );
    assert.equal(
      englishSource.match(/naturalEndTimer = window\.setTimeout/g)?.length,
      2,
    );
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    assert.equal(
      bottishSource.match(/compensateLifecycleForOutputLatency: true/g)?.length,
      2,
    );
  });

  it("anchors realtime scheduling after async worklet setup", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const workletReadyAt = source.indexOf(
      "const FormantCorrectionNode = await formantCorrectionNodeConstructor(context);",
    );
    const playbackClockAt = source.indexOf(
      "const playbackClockStartedAt = context.currentTime;",
      workletReadyAt,
    );

    assert.ok(workletReadyAt >= 0);
    assert.ok(
      playbackClockAt > workletReadyAt,
      "source scheduling must read the live audio clock after asynchronous worklet setup",
    );
    assert.match(source, /const articulationDurationMs = Math\.min\(/u);
    assert.match(
      source,
      /voicePlaybackPresentationDurationMs\(articulationDurationMs\)/u,
    );
    assert.match(
      source,
      /beginVoicePlaybackProgress\([\s\S]{0,160}lifecycleArticulationDurationMs[\s\S]{0,300}holdAtEndUntilFinish: true/u,
    );
    assert.match(source, /Math\.max\(lifecycleOutputLatencyMs, tailFlushMs\)/u);
  });

  it("does not start media-backed voice lifecycle from an accepted play request", () => {
    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    const bottishSource = readFileSync(
      new URL("./bottishVoice.ts", import.meta.url),
      "utf8",
    );
    for (const source of [englishSource, bottishSource]) {
      assert.match(
        source,
        /audio\.addEventListener\("playing", beginAudiblePlayback, \{ once: true \}\)/,
      );
      assert.match(source, /void audio\.play\(\)\.then\(\s*\(\) => undefined,/);
    }
  });

  it("applies per-bot Voice Character shelves and gain before limiting", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(source, /lowShelf\.type = "lowshelf"/);
    assert.match(source, /highShelf\.type = "highshelf"/);
    assert.match(source, /lowShelf\.gain\.value = voiceCharacter\.lowShelfDb/);
    assert.match(source, /highShelf\.gain\.value = voiceCharacter\.highShelfDb/);
    assert.match(
      source,
      /voiceEffect\.outputTrim \*\s*voiceCharacter\.gainMultiplier/,
    );
    assert.match(
      source,
      /outputGain\.connect\(lowShelf\)\.connect\(highShelf\)\.connect\(limiter\)/,
    );
  });

  it("gives Lilt an audible pitch contour while keeping neutral speech still", () => {
    assert.equal(voiceLiltDetuneCents(0, 0.3), 0);
    assert.ok(Math.abs(voiceLiltDetuneCents(1, 0.3)) > 100);
    assert.ok(Math.abs(voiceLiltDetuneCents(-1, 0.3)) > 100);
    assert.equal(VOICE_LILT_DEPTH_CENTS, 120);
  });

  it("owns canonical audible handoffs on a full-level channel separate from crosstalk", () => {
    const source = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /\| "handoff"/u);
    assert.match(source, /handoff:\s*\{[\s\S]{0,260}releaseTimer: null/u);
    assert.match(
      source,
      /channel === "primary" \|\| channel === "handoff" \? 0\.88 : 0\.62/u,
    );
  });
});
