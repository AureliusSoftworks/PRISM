import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  englishVoiceMediaElapsedMs,
  englishVoiceProfileSupportsStreaming,
  englishVoiceResponseSupportsChunkedStreaming,
  enqueueChunkedEnglishVoice,
  enqueueEnglishVoice,
  elevenLabsEffectForEngine,
  readEnglishVoiceSynthesisClip,
  parseEnglishVoiceWaveStreamChunk,
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
      /resolveEnglishClauseGap/u,
    );
    assert.match(
      source,
      /playEnglishClauseGap/u,
    );
    assert.match(
      source,
      /previousSpeechChunk/u,
    );
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

  it("honors an optional playback-validity guard before any audible start", () => {
    const source = readFileSync(new URL("./englishVoice.ts", import.meta.url), "utf8");
    assert.match(
      source,
      /export function enqueueEnglishVoice\([\s\S]*?isPlaybackStillValid\?: \(\) => boolean,/u,
    );
    assert.match(
      source,
      /async function playAudio\([\s\S]*?isPlaybackStillValid\?: \(\) => boolean,[\s\S]*?const playbackStillValid = \(\): boolean =>[\s\S]*?expectedGeneration === generation && \(isPlaybackStillValid\?\.\(\) \?\? true\);/u,
    );
    assert.match(
      source,
      /await playPreSpeechBreath\(\{[\s\S]*?isCurrent: playbackStillValid,/u,
    );
    assert.match(
      source,
      /played = await playRealtimeVoiceBytes\(\{[\s\S]*?isCurrent: playbackStillValid,/u,
    );
    assert.match(
      source,
      /await playBytesWithMedia\([\s\S]*?isPlaybackStillValid,/u,
    );
    assert.match(
      source,
      /async function playBytesWithMedia\([\s\S]*?if \(!playbackStillValid\(\)\) \{[\s\S]*?cancel\(\);[\s\S]*?return;/u,
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

  it("keeps local-only tone out of Premium streaming eligibility", () => {
    assert.equal(
      englishVoiceProfileSupportsStreaming(
        {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          elevenLabsEffect: "clean",
          voiceEffectExplicit: true,
        },
        true,
        "warm",
      ),
      true,
    );
    assert.equal(
      englishVoiceProfileSupportsStreaming(
        { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, pitch: 0.2 },
        false,
        "neutral",
      ),
      false,
    );
    assert.equal(
      englishVoiceProfileSupportsStreaming(
        {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          elevenLabsEffect: "chorus",
          voiceEffectExplicit: true,
        },
        true,
        "neutral",
      ),
      false,
    );
    assert.equal(
      englishVoiceProfileSupportsStreaming(
        {
          ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
          elevenLabsEffect: "chorus",
          voiceEffectExplicit: true,
        },
        false,
        "neutral",
      ),
      true,
    );
  });

  it("applies the same pitch transform to Local and Premium", () => {
    const profile = {
      v: 1 as const,
      baseVoiceId: "voice-1" as const,
      pitch: -0.75,
      warmth: 0,
      pace: 0.333,
      lilt: 0,
    };
    assert.equal(
      resolveEnglishVoicePlaybackDetuneCents(profile, "elevenlabs"),
      -487,
    );
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
      createGain() {
        return {
          gain: { value: 1 },
          connect() {
            return this;
          },
          disconnect() {},
        };
      }
      createMediaElementSource() {
        return {
          connect() {
            return this;
          },
          disconnect() {},
        };
      }
      get destination() {
        return {};
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

  it("reports forced media stops as cancellation rather than completed speech", async () => {
    const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let announcePlaying: (() => void) | null = null;
    const playing = new Promise<void>((resolve) => {
      announcePlaying = resolve;
    });
    class FakeAudioContext {
      state = "running";
      decodeAudioData(): Promise<AudioBuffer> {
        return Promise.reject(new Error("WebKit decode failed"));
      }
      createGain() {
        return {
          gain: { value: 1 },
          connect() {
            return this;
          },
          disconnect() {},
        };
      }
      createMediaElementSource() {
        return {
          connect() {
            return this;
          },
          disconnect() {},
        };
      }
      get destination() {
        return {};
      }
    }
    class FakeAudio {
      duration = 2;
      currentTime = 0.5;
      preload = "";
      volume = 1;
      preservesPitch = true;
      playbackRate = 1;
      src = "";
      private listeners = new Map<string, () => void>();

      addEventListener(name: string, listener: () => void): void {
        this.listeners.set(name, listener);
      }
      pause(): void {}
      removeAttribute(): void {}
      load(): void {}
      play(): Promise<void> {
        setTimeout(() => {
          this.listeners.get("playing")?.();
          announcePlaying?.();
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
    let endCount = 0;
    let cancelCount = 0;
    try {
      const playback = enqueueEnglishVoice(
        Uint8Array.from([0x49, 0x44, 0x33]).buffer,
        DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        "webkit-cancel",
        true,
        1,
        {
          onEnd: () => {
            endCount += 1;
          },
          onCancel: () => {
            cancelCount += 1;
          },
        },
        "elevenlabs",
      );
      await playing;
      stopEnglishVoice();
      await playback;
      assert.equal(endCount, 0);
      assert.equal(cancelCount, 1);
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

  it("plays progressive local chunks in order with one reveal lifecycle", async () => {
    const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let playCount = 0;
    class FakeAudio {
      duration = Number.NaN;
      currentTime = 0;
      preload = "";
      volume = 1;
      preservesPitch = true;
      playbackRate = 1;
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
      value: { clearInterval, clearTimeout, setInterval, setTimeout },
    });
    const streamBody = [
      {
        index: 0,
        characterCount: 6,
        text: "Hello.",
        audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
      },
      {
        index: 1,
        characterCount: 7,
        text: "Again.",
        audioBase64: Buffer.from([4, 5, 6]).toString("base64"),
      },
    ]
      .map((chunk) => JSON.stringify(chunk))
      .join("\n");
    const response = new Response(`${streamBody}\n`, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-prism-voice-stream": "wav-chunks-v1",
        "x-prism-voice-characters": "13",
        "x-prism-voice-engine": "builtin",
      },
    });
    let startCount = 0;
    let endCount = 0;
    const segmentTimings: Array<{
      startMs: number;
      endMs: number;
      heard: boolean;
    }> = [];
    try {
      await enqueueChunkedEnglishVoice(
        response,
        DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        "chunk-order",
        false,
        1,
        {
          onStart: () => {
            startCount += 1;
          },
          onEnd: () => {
            endCount += 1;
          },
          onSegmentTiming: (timing) => {
            segmentTimings.push(timing);
          },
        },
        "builtin",
        "neutral",
        1_000,
      );
      assert.equal(playCount, 2);
      assert.equal(startCount, 1);
      assert.equal(endCount, 1);
      assert.equal(segmentTimings.length, 2);
      assert.ok(segmentTimings.every((timing) => timing.heard));
      // Strong punctuation after the first chunk inserts a clause pause before
      // the next speech segment, even when decorative breaths are disabled.
      assert.ok(
        (segmentTimings[1]?.startMs ?? 0) >=
          (segmentTimings[0]?.endMs ?? 0) + 250,
      );
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
  it("recognizes and validates streamed local WAV chunks", () => {
    const response = new Response("", {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-prism-voice-stream": "wav-chunks-v1",
      },
    });
    assert.equal(englishVoiceResponseSupportsChunkedStreaming(response), true);
    const chunk = parseEnglishVoiceWaveStreamChunk(
      JSON.stringify({
        index: 0,
        characterCount: 12,
        audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
      }),
    );
    assert.equal(chunk.index, 0);
    assert.equal(chunk.characterCount, 12);
    assert.deepEqual([...new Uint8Array(chunk.bytes)], [1, 2, 3]);
    assert.throws(
      () => parseEnglishVoiceWaveStreamChunk('{"index":0}'),
      /invalid audio chunk/,
    );
  });

  it("recognizes Voice+ v2 vocal-action segments without network audio", () => {
    const response = new Response("", {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-prism-voice-stream": "wav-chunks-v2",
      },
    });
    assert.equal(englishVoiceResponseSupportsChunkedStreaming(response), true);
    const chunk = parseEnglishVoiceWaveStreamChunk(
      JSON.stringify({
        index: 0,
        kind: "vocal-action",
        characterCount: 0,
        action: "laugh",
        modifiers: ["nervous", "unsupported"],
        authoredText: "laughs nervously",
        sourceStart: 4,
        sourceEnd: 23,
      }),
    );
    assert.equal(chunk.kind, "vocal-action");
    assert.equal(chunk.action, "laugh");
    assert.deepEqual(chunk.modifiers, ["nervous"]);
    assert.equal(chunk.bytes.byteLength, 0);
  });

  it("keeps legacy binary audio compatible", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "content-type": "audio/wav",
        "x-prism-voice-engine": "builtin-provider-fallback",
        "x-prism-pronunciation-status": "applied",
        "x-prism-pronunciation-requested": "en-GB",
        "x-prism-pronunciation-source-locale": "en-US",
        "x-prism-pronunciation-base-locale": "en-GB",
        "x-prism-speechprint-status": "applied",
        "x-prism-speechprint-id": "indian-english",
        "x-prism-speechprint-strength": "balanced",
        "x-prism-speechprint-base-locale": "en-US",
        "x-prism-speechprint-ruleset": "2026.08.1",
        "x-prism-speechprint-sha256": "a".repeat(64),
      },
    });
    const clip = await readEnglishVoiceSynthesisClip(response);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [1, 2, 3]);
    assert.equal(clip.audioContentType, "audio/wav");
    assert.equal(clip.alignment, null);
    assert.equal(clip.engineUsed, "builtin-provider-fallback");
    assert.deepEqual(clip.resolvedPronunciation, {
      requestedBase: "en-GB",
      sourceLocale: "en-US",
      resolvedBaseLocale: "en-GB",
      status: "applied",
      reason: null,
    });
    assert.deepEqual(clip.resolvedSpeechprint, {
      requestedInfluence: "indian-english",
      appliedInfluence: "indian-english",
      strength: "balanced",
      baseLocale: "en-US",
      status: "applied",
      reason: null,
      rulesetVersion: "2026.08.1",
      rulesetSha256: "a".repeat(64),
    });
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
