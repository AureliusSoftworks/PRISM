import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 } from "@localai/shared";
import {
  clearLocalVocalActionCache,
  localVocalActionWave,
} from "./localVocalActions.ts";

const segment = {
  kind: "vocal-action" as const,
  action: "laugh" as const,
  modifiers: ["nervous" as const],
  authoredText: "laughs nervously",
  sourceStart: 0,
  sourceEnd: 19,
};

describe("commercial-safe local vocal action bank", () => {
  it("renders deterministic PCM without external assets", () => {
    clearLocalVocalActionCache();
    const first = new Uint8Array(
      localVocalActionWave({
        segment,
        profile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        seed: "turn-1",
      }),
    );
    const second = new Uint8Array(
      localVocalActionWave({
        segment,
        profile: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        seed: "turn-1",
      }),
    );
    assert.equal(new TextDecoder().decode(first.slice(0, 4)), "RIFF");
    assert.ok(first.byteLength > 10_000);
    assert.deepEqual(first, second);
    assert.ok(first.slice(44).some((value) => value !== 0));
  });

  it("shapes variants by portable identity", () => {
    const first = new Uint8Array(
      localVocalActionWave({
        segment,
        profile: { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, baseVoiceId: "voice-1" },
        seed: "turn-2",
      }),
    );
    const second = new Uint8Array(
      localVocalActionWave({
        segment,
        profile: { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, baseVoiceId: "voice-17" },
        seed: "turn-2",
      }),
    );
    assert.notDeepEqual(first.slice(44, 512), second.slice(44, 512));
  });
});
