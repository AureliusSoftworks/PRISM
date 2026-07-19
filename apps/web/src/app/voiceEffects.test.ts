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
    assert.match(source, /VoicePlaybackChannel = "primary" \| "reaction"/);
    assert.match(source, /stopRealtimeVoiceAudio\(channel\)/);
    assert.match(source, /channel === "reaction" \? 0\.62 : 1/);
    assert.match(source, /maxDurationMs/);
    assert.match(reactionSource, /args\.mode === "english"/u);
    assert.match(reactionSource, /buildBottishPlan/u);
    assert.match(reactionSource, /args\.mode === "babble"/u);
    assert.match(reactionSource, /channel: "reaction"/u);
    assert.match(reactionSource, /maxDurationMs: args\.plan\.interjectionAttempt \? 1_300 : 900/u);
    assert.match(pageSource, /settings\.voiceMode !== "english"[\s\S]{0,120}!plan\.spokenCue/u);
    assert.match(pageSource, /if \(!preparedInTime\) return false/u);
  });
});

describe("voice performance", () => {
  it("applies per-bot Voice Character shelves and gain before limiting", () => {
    const source = readFileSync(new URL("./voiceEffects.ts", import.meta.url), "utf8");
    assert.match(source, /lowShelf\.type = "lowshelf"/);
    assert.match(source, /highShelf\.type = "highshelf"/);
    assert.match(source, /lowShelf\.gain\.value = voiceCharacter\.lowShelfDb/);
    assert.match(source, /highShelf\.gain\.value = voiceCharacter\.highShelfDb/);
    assert.match(
      source,
      /elevenLabsEffect\.outputTrim \*\s*voiceCharacter\.gainMultiplier/,
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
