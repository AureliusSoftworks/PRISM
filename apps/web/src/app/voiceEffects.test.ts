import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, botVoiceTextureForPreset } from "@localai/shared";
import {
  VOICE_LILT_DEPTH_CENTS,
  buildVoiceDamageSchedule,
  resolveElevenLabsVoiceEffectPlan,
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

describe("ElevenLabs-only effects", () => {
  it("keeps Clean transparent and gives every preset a distinct, level-controlled character", () => {
    const clean = resolveElevenLabsVoiceEffectPlan("clean");
    const radio = resolveElevenLabsVoiceEffectPlan("radio");
    const robot = resolveElevenLabsVoiceEffectPlan("robot");
    const echo = resolveElevenLabsVoiceEffectPlan("echo");
    const chorus = resolveElevenLabsVoiceEffectPlan("chorus");
    const deepSpace = resolveElevenLabsVoiceEffectPlan("deep-space");
    const processed = [radio, robot, echo, chorus, deepSpace];

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
    assert.ok(deepSpace.parallelVoices.some((voice) => voice.detuneCents <= -500));
    assert.ok(processed.every((plan) => plan.outputTrim < 0.8));
    assert.ok(processed.every((plan) => plan.drive === 0 && plan.bitDepth === 16));
    assert.equal(new Set(processed.map((plan) => JSON.stringify(plan))).size, processed.length);
  });

  it("keeps Chorus doubling bounded throughout long replies", () => {
    const chorus = resolveElevenLabsVoiceEffectPlan("chorus");
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

  it("does not let a stale asynchronous decode stop newer playback", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    const decodeAt = source.indexOf("await context.decodeAudioData");
    const currentGuardAt = source.indexOf(
      "if (args.isCurrent && !args.isCurrent()) return true;",
      decodeAt,
    );
    const stopAt = source.indexOf("stopRealtimeVoiceAudio();", decodeAt);
    assert.ok(decodeAt >= 0);
    assert.ok(currentGuardAt > decodeAt);
    assert.ok(stopAt > currentGuardAt);
  });
});

describe("voice performance", () => {
  it("gives Lilt an audible pitch contour while keeping neutral speech still", () => {
    assert.equal(voiceLiltDetuneCents(0, 0.3), 0);
    assert.ok(Math.abs(voiceLiltDetuneCents(1, 0.3)) > 100);
    assert.ok(Math.abs(voiceLiltDetuneCents(-1, 0.3)) > 100);
    assert.equal(VOICE_LILT_DEPTH_CENTS, 120);
  });
});
