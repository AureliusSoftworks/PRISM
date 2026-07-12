import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readEnglishVoiceSynthesisClip,
  resolveEnglishVoicePostProcessing,
} from "./englishVoice.ts";

describe("English voice post processing", () => {
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
      headers: { "content-type": "audio/wav" },
    });
    const clip = await readEnglishVoiceSynthesisClip(response);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [1, 2, 3]);
    assert.equal(clip.audioContentType, "audio/wav");
    assert.equal(clip.alignment, null);
  });

  it("decodes timed JSON audio and character alignment", async () => {
    const response = Response.json({
      ok: true,
      audioBase64: Buffer.from([4, 5, 6]).toString("base64"),
      audioContentType: "audio/mpeg",
      alignment: {
        characters: ["H", "i"],
        characterStartTimesSeconds: [0, 0.12],
        characterEndTimesSeconds: [0.12, 0.3],
      },
    });
    const clip = await readEnglishVoiceSynthesisClip(response);
    assert.deepEqual([...new Uint8Array(clip.bytes)], [4, 5, 6]);
    assert.deepEqual(clip.alignment?.characters, ["H", "i"]);
    assert.equal(clip.alignment?.characterEndTimesSeconds[1], 0.3);
  });
});
