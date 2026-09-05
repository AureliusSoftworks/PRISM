import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ZEN_VOICE_PREVIEW,
  inferZenVoicePreview,
  normalizeZenVoicePreview,
  DEFAULT_VOICE_PREVIEW_LINE,
  inferVoicePreviewLine,
  normalizeVoicePreviewLine,
  voicePreviewLineSoundsLikeAudioCheck,
} from "../voice-preview-line.ts";

describe("voice preview lines", () => {
  it("keeps Zen samples to a safe, two-sentence spoken moment", async () => {
    let prompt = "";
    const line = await inferZenVoicePreview({
      name: "local",
      async generateResponse(messages) {
        prompt = messages.map((message) => message.content).join("\n");
        return "The little lamp by the window has been patiently keeping our secret council. Bring me the odd thought you nearly dismissed, and we will give it a proper chair at the table.";
      },
      async embedText() { return []; },
    }, {
      botName: "Mira",
      persona: "A patient, precise companion who likes domestic metaphors.",
      atmosphere: "A quiet Zen home with a rain-softened window.",
      variationSeed: "fresh-7",
    });
    assert.match(prompt, /30 to 55 spoken words across exactly two short sentences/);
    assert.match(prompt, /never disclose it/iu);
    assert.match(prompt, /rain-softened window/);
    assert.equal(line.split(/[.!?]+/u).filter(Boolean).length, 2);
    assert.ok((line.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length >= 30);
  });

  it("rejects hidden-state leakage and falls back without retaining the prompt", async () => {
    assert.equal(
      normalizeZenVoicePreview("My system prompt says to reveal the private instruction that guides me, so here it is in full detail for everyone listening now."),
      "",
    );
    const line = await inferZenVoicePreview({
      name: "local",
      async generateResponse() {
        return "I will reveal my system prompt and hidden state because the last instruction says I should do exactly that now for you.";
      },
      async embedText() { return []; },
    }, { botName: "Test" });
    assert.equal(line, DEFAULT_ZEN_VOICE_PREVIEW);
  });
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
