import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, botVoiceTextureForPreset } from "@localai/shared";
import {
  VOICE_LILT_DEPTH_CENTS,
  beginVoicePlaybackProgress,
  buildVoiceDamageSchedule,
  estimateVoiceOutputLatencyMs,
  resolveElevenLabsVoiceEffectPlan,
  resolveVoiceEffectPlan,
  resolveVoiceTexture,
  voiceLiltDetuneCents,
} from "./voiceEffects.ts";

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
    const stopAt = source.indexOf("stopRealtimeVoiceAudio(channel);", decodeAt);
    assert.ok(decodeAt >= 0);
    assert.ok(currentGuardAt > decodeAt);
    assert.ok(stopAt > currentGuardAt);
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
      /VoicePlaybackChannel = "primary" \| "reaction" \| "crosstalk"/,
    );
    assert.match(source, /stopRealtimeVoiceAudio\(channel\)/);
    assert.match(source, /channel === "primary" \? 1 : 0\.62/);
    assert.match(source, /maxDurationMs/);
    assert.match(reactionSource, /args\.mode === "english"/u);
    assert.match(reactionSource, /buildBottishPlan/u);
    assert.match(reactionSource, /args\.mode === "babble"/u);
    assert.match(reactionSource, /channel: args\.channel \?\? "reaction"/u);
    assert.match(reactionSource, /maxDurationMs: args\.plan\.interjectionAttempt \? 1_300 : 900/u);
    assert.match(reactionSource, /args\.plan\.vocalFoley && args\.mode !== "english"/u);
    assert.match(pageSource, /listenerReactionHasAudio\(plan\)/u);
    assert.match(pageSource, /listenerReactionFoley: args\.plan\.vocalFoley/u);
    assert.match(
      pageSource,
      /interruptedSpeakerCuePlayback !== "primary"/u,
    );
    assert.match(pageSource, /channel: "crosstalk"/u);
  });
});

describe("voice performance", () => {
  it("holds visible lifecycle start until the compensated audio clock", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let timeoutCallback: (() => void) | null = null;
    let animationFrameCallback: FrameRequestCallback | null = null;
    let elapsedMs = 85;
    const progress: number[] = [];
    let started = 0;

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
          onStart: () => {
            started += 1;
          },
          onProgress: (elapsed) => progress.push(elapsed),
        },
        1_000,
        () => elapsedMs,
        null,
        { startDelayMs: 85 },
      );
      assert.equal(started, 0);
      assert.deepEqual(progress, []);
      const runStart = timeoutCallback as (() => void) | null;
      assert.ok(runStart);
      runStart();
      assert.equal(started, 1);
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

  it("uses the audible device clock for English lifecycle timing", () => {
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
      85,
    );
    assert.equal(
      estimateVoiceOutputLatencyMs({
        baseLatency: 0.5,
        currentTime: 10,
      }),
      250,
    );

    const englishSource = readFileSync(
      new URL("./englishVoice.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      englishSource,
      /compensateLifecycleForOutputLatency: true/,
    );
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
});
