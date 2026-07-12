import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_VOICE_PREVIEW_LINE, inferVoicePreviewLine, normalizeVoicePreviewLine } from "../voice-preview-line.ts";

describe("voice preview lines", () => {
  it("cleans a quoted one-line response", () => {
    assert.equal(normalizeVoicePreviewLine('“Testing, testing—prepare for domination!”'), "Testing, testing—prepare for domination!");
  });

  it("asks the auxiliary provider for an in-character microphone check", async () => {
    let prompt = "";
    const line = await inferVoicePreviewLine({
      name: "local",
      async generateResponse(messages) {
        prompt = messages.map((message) => message.content).join("\n");
        return "The formula is working. Testing, one, two!";
      },
      async embedText() { return []; },
    }, { botName: "Plankton", systemPrompt: "A tiny theatrical villain." });
    assert.match(prompt, /What would Plankton say/);
    assert.match(prompt, /tiny theatrical villain/);
    assert.match(prompt, /about 12 words/);
    assert.equal(line, "The formula is working. Testing, one, two!");
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
