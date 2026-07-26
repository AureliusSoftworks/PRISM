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
      /botWithIdentityShapeshiftPresentation\(\s*bot,\s*latestIdentityShapeshiftStateForBot\(detail\?\.messages, bot\.id\)/u,
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
