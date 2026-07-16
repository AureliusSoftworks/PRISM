import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  elevenLabsEffectForEngine,
  readEnglishVoiceSynthesisClip,
  resolveEnglishVoicePostProcessing,
} from "./englishVoice.ts";

describe("English voice post processing", () => {
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

  it("applies profile effects only when ElevenLabs actually supplied the clip", () => {
    const profile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      elevenLabsEffect: "robot" as const,
    };
    assert.equal(elevenLabsEffectForEngine(profile, "elevenlabs"), "robot");
    assert.equal(elevenLabsEffectForEngine(profile, "builtin"), "clean");
    assert.equal(
      elevenLabsEffectForEngine(profile, "builtin-provider-fallback"),
      "clean"
    );
    assert.equal(elevenLabsEffectForEngine(profile, null), "clean");
  });
});
