import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_VOICE_PREVIEW_LINE,
  inferVoicePreviewLine,
  normalizeVoicePreviewLine,
  voicePreviewLineSoundsLikeAudioCheck,
} from "../voice-preview-line.ts";

describe("voice preview lines", () => {
  it("cleans a quoted one-line response", () => {
    assert.equal(normalizeVoicePreviewLine('“Testing, testing—prepare for domination!”'), "Testing, testing—prepare for domination!");
  });

  it("asks the auxiliary provider for a persona-specific line without diagnostic language", async () => {
    let prompt = "";
    const line = await inferVoicePreviewLine({
      name: "local",
      async generateResponse(messages) {
        prompt = messages.map((message) => message.content).join("\n");
        return "The Krabby Patty formula will be mine, right after this extremely legal lunch break.";
      },
      async embedText() { return []; },
    }, { botName: "Plankton", systemPrompt: "A tiny theatrical villain." });
    assert.match(prompt, /Give Plankton one fresh line that immediately showcases who they are/);
    assert.match(prompt, /tiny theatrical villain/);
    assert.match(prompt, /persona-specific detail/);
    assert.match(prompt, /10 to 18 words/);
    assert.doesNotMatch(prompt, /do a microphone check/iu);
    assert.match(prompt, /Never mention microphones, audio, voices/iu);
    assert.equal(line, "The Krabby Patty formula will be mine, right after this extremely legal lunch break.");
  });

  it("recognizes old diagnostic preview lines so they can be regenerated", () => {
    assert.equal(voicePreviewLineSoundsLikeAudioCheck("Mic check complete."), true);
    assert.equal(voicePreviewLineSoundsLikeAudioCheck("Testing, one, two!"), true);
    assert.equal(voicePreviewLineSoundsLikeAudioCheck("Audio check passed."), true);
    assert.equal(
      voicePreviewLineSoundsLikeAudioCheck(
        "Could you check to make sure my microphone sounds good, please?"
      ),
      true
    );
    assert.equal(voicePreviewLineSoundsLikeAudioCheck("My cape has its own dramatic entrance."), false);
  });

  it("rejects diagnostic language even when the provider ignores the prompt", async () => {
    const line = await inferVoicePreviewLine({
      name: "local",
      async generateResponse() {
        return "Could you check whether my microphone sounds good?";
      },
      async embedText() { return []; },
    }, { botName: "Harry Potter", systemPrompt: "A young wizard facing dark forces." });
    assert.equal(line, DEFAULT_VOICE_PREVIEW_LINE);
  });

  it("falls back when generation fails", async () => {
    const line = await inferVoicePreviewLine({
      name: "local",
      async generateResponse() { throw new Error("offline"); },
      async embedText() { return []; },
    }, { botName: "Test" });
    assert.equal(line, DEFAULT_VOICE_PREVIEW_LINE);
  });
});
