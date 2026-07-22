import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  englishVoiceMediaElapsedMs,
  enqueueEnglishVoice,
  elevenLabsEffectForEngine,
  readEnglishVoiceSynthesisClip,
  resolveEnglishVoicePlaybackDetuneCents,
  resolveEnglishVoicePostProcessing,
  scaleEnglishVoiceAlignmentForPlayback,
  stopEnglishVoice,
  voiceEffectForPlayback,
} from "./englishVoice.ts";

describe("English voice post processing", () => {
  it("derives visible playback progress from the media clock at the active tempo", () => {
    assert.equal(englishVoiceMediaElapsedMs(0.62, 1.24), 500);
    assert.equal(englishVoiceMediaElapsedMs(Number.NaN, 1), 0);
    assert.equal(englishVoiceMediaElapsedMs(0.5, 0), 500);
  });

  it("preserves gesture-authorized fallback media across passive preparation", () => {
    const source = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /export async function prepareEnglishVoice\(\)[\s\S]*?if \(preparedMedia\)[\s\S]*?return;[\s\S]*?beginMediaUnlock\(\);/
    );
    assert.match(
      source,
      /export function stopEnglishVoice\([\s\S]*?preservePreparedMedia[\s\S]*?if \(!options\.preservePreparedMedia\) releasePreparedMedia\(\)/
    );
    assert.match(
      source,
      /isCurrent: \(\) => expectedGeneration === generation/,
    );
  });

  it("maps pitch and warmth without changing portable profile semantics", () => {
    assert.deepEqual(
      resolveEnglishVoicePostProcessing({
        v: 1,
        baseVoiceId: "voice-5",
        pitch: 0.5,
        warmth: 0.5,
        pace: 0,
        lilt: 0,
      }),
      { detuneCents: 325, lowpassHz: 13000, gain: 0.94 }
    );
  });

  it("keeps neutral speech spectrally transparent", () => {
    const processing = resolveEnglishVoicePostProcessing({
      v: 1,
      baseVoiceId: "voice-1",
      pitch: 0,
      warmth: 0,
      pace: 0,
      lilt: 0,
    });
    assert.equal(processing.lowpassHz, 16000);
  });

  it("keeps English pitch independent from Pace in every engine", () => {
    const profile = {
      v: 1 as const,
      baseVoiceId: "voice-1" as const,
      pitch: -0.75,
      warmth: 0,
      pace: 0.333,
      lilt: 0,
    };
    assert.equal(resolveEnglishVoicePlaybackDetuneCents(profile, "elevenlabs"), -487);
    assert.equal(resolveEnglishVoicePlaybackDetuneCents(profile, "builtin"), -487);
  });

  it("scales provider alignment to the local Pace clock without using Pitch", () => {
    const alignment = {
      characters: ["H", "i"],
      characterStartTimesSeconds: [0, 0.5],
      characterEndTimesSeconds: [0.5, 1],
    };
    const profile = {
      v: 1 as const,
      baseVoiceId: "voice-1" as const,
      pitch: -1,
      warmth: 0,
      pace: 1,
      lilt: 1,
    };
    const scaled = scaleEnglishVoiceAlignmentForPlayback(
      alignment,
      profile,
      "guarded",
    );
    assert.equal(scaled?.characterEndTimesSeconds[1], 1 / 1.24);
    assert.deepEqual(scaled?.characters, alignment.characters);
  });

  it("falls back to gesture-authorized media when Web Audio rejects provider MP3 bytes", async () => {
    const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let playCount = 0;
    class FakeAudioContext {
      state = "running";
      decodeAudioData(): Promise<AudioBuffer> {
        return Promise.reject(new Error("WebKit decode failed"));
      }
    }
    class FakeAudio {
      duration = Number.NaN;
      currentTime = 0;
      preload = "";
      volume = 1;
      preservesPitch = true;
      src = "";
      private listeners = new Map<string, () => void>();

      addEventListener(name: string, listener: () => void): void {
        this.listeners.set(name, listener);
      }
      pause(): void {}
      removeAttribute(): void {}
      load(): void {}
      play(): Promise<void> {
        playCount += 1;
        setTimeout(() => {
          this.listeners.get("playing")?.();
          this.listeners.get("ended")?.();
        }, 0);
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: FakeAudio,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        AudioContext: FakeAudioContext,
        clearInterval,
        clearTimeout,
        setInterval,
        setTimeout,
      },
    });
    let started = false;
    let ended = false;
    try {
      await enqueueEnglishVoice(
        Uint8Array.from([0x49, 0x44, 0x33]).buffer,
        DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        "webkit-fallback",
        true,
        1,
        {
          onStart: () => {
            started = true;
          },
          onEnd: () => {
            ended = true;
          },
        },
        "elevenlabs",
      );
      assert.equal(playCount, 1);
      assert.equal(started, true);
      assert.equal(ended, true);
    } finally {
      stopEnglishVoice();
      if (originalAudio) {
        Object.defineProperty(globalThis, "Audio", originalAudio);
      } else {
        Reflect.deleteProperty(globalThis, "Audio");
      }
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});

describe("English voice synthesis responses", () => {
  it("keeps legacy binary audio compatible", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "content-type": "audio/wav",
        "x-prism-voice-engine": "builtin-provider-fallback",
      },
    });
    const clip = await readEnglishVoiceSynthesisClip(response);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [1, 2, 3]);
    assert.equal(clip.audioContentType, "audio/wav");
    assert.equal(clip.alignment, null);
    assert.equal(clip.engineUsed, "builtin-provider-fallback");
  });

  it("decodes timed JSON audio and character alignment", async () => {
    const response = Response.json(
      {
        ok: true,
        audioBase64: Buffer.from([4, 5, 6]).toString("base64"),
        audioContentType: "audio/mpeg",
        alignment: {
          characters: ["H", "i"],
          characterStartTimesSeconds: [0, 0.12],
          characterEndTimesSeconds: [0.12, 0.3],
        },
      },
      { headers: { "x-prism-voice-engine": "elevenlabs" } }
    );
    const clip = await readEnglishVoiceSynthesisClip(response);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [4, 5, 6]);
    assert.deepEqual(clip.alignment?.characters, ["H", "i"]);
    assert.equal(clip.alignment?.characterEndTimesSeconds[1], 0.3);
    assert.equal(clip.engineUsed, "elevenlabs");
  });

  it("applies the saved profile effect regardless of the English engine", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsEffect: "robot" as const,
    };
    assert.equal(voiceEffectForPlayback(profile), "robot");
    assert.equal(elevenLabsEffectForEngine(profile, "elevenlabs"), "robot");
    assert.equal(elevenLabsEffectForEngine(profile, "builtin"), "robot");
    assert.equal(
      elevenLabsEffectForEngine(profile, "builtin-provider-fallback"),
      "robot"
    );
    assert.equal(elevenLabsEffectForEngine(profile, null), "robot");
  });
});
