import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Shapeshifter Chat/Zen presentation", () => {
  it("reads sticky identityShapeshift for Chat/Zen face and voice", () => {
    assert.match(pageSource, /identityShapeshift\?: BotIdentityShapeshiftStateV1/u);
    assert.match(pageSource, /function resolveAssistantMessageAudioVoiceProfile\(/u);
    assert.match(pageSource, /function botWithIdentityShapeshiftPresentation\(/u);
    assert.match(pageSource, /function latestIdentityShapeshiftStateForBot\(/u);
    assert.match(
      pageSource,
      /latestIdentityShapeshiftStateForBot\(detail\?\.messages, bot\.id\)[\s\S]*botWithIdentityShapeshiftPresentation\(\s*bot,\s*zenLivePresenceIdentityShapeshiftState/u,
    );
    assert.match(
      pageSource,
      /color:\s*state\.targetColor[\s\S]*glyph:[\s\S]*state\.targetGlyph[\s\S]*authored_audio_voice_profile:\s*state\.targetVoice[\s\S]*voicePreset:\s*state\.targetVoicePreset[\s\S]*frameMaterialSeed:[\s\S]*state\.targetFrameMaterialSeed/u,
    );
    assert.match(
      pageSource,
      /resolveAssistantMessageAudioVoiceProfile\(\{\s*message,\s*messageBot,/u,
    );
    assert.match(
      pageSource,
      /resolveAssistantMessageAudioVoiceProfile\(\{\s*message: latestAssistantMessage,\s*messageBot,/u,
    );
  });
});
