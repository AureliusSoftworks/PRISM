import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContextAwareImageUserPrompt } from "../assistant-sent-image.ts";

describe("buildContextAwareImageUserPrompt", () => {
  it("returns the raw caption when there is no conversation context", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "widescreen photo of the mountains at dawn",
      userMessage: "Can I see a picture?",
      contextLines: [],
    });
    assert.equal(out, "widescreen photo of the mountains at dawn");
  });

  it("injects recent context and subject-resolution guidance when context exists", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "a picture please",
      userMessage: "May I see what it looks like?",
      contextLines: [
        "Carl Jung: The serenity outside my window has been a source of inspiration.",
        "User: That sounds lovely. May I see a picture?",
      ],
    });
    assert.match(out, /Primary scene request: a picture please/);
    assert.match(out, /User's latest message: May I see what it looks like\?/);
    assert.match(out, /Instruction priority \(highest to lowest\)/);
    assert.match(out, /Recent user signal 1:/);
    assert.match(out, /Recent conversation context/);
    assert.match(out, /The serenity outside my window/);
    assert.match(out, /Do NOT include the speaking persona in-frame by default/i);
    assert.match(out, /follow the latest user request/i);
  });

  it("allows persona inclusion when the user explicitly asks for a portrait/selfie", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "portrait request",
      userMessage: "Please paint a portrait of you in Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint the city for you.",
        "User: Please paint a portrait of you in Florence.",
      ],
    });
    assert.match(out, /explicitly asked for the persona\/you to appear/i);
    assert.doesNotMatch(out, /Do NOT include the speaking persona in-frame by default/i);
  });

  it("adds scene-only composition lock for city/place requests", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "Please paint a picture of Florence at sunrise.",
      userMessage: "Show me Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint my home city.",
        "User: Please paint a picture of Florence.",
      ],
    });
    assert.match(out, /Composition constraint: this is a scene\/place request/i);
    assert.match(out, /Do not include human figures, faces, or character portraits/i);
  });

  it("does not force scene-only lock when user explicitly requests the persona", () => {
    const out = buildContextAwareImageUserPrompt({
      captionPrompt: "Please paint a portrait of you in Florence.",
      userMessage: "Show me you in Florence.",
      contextLines: [
        "Leonardo da Vinci: I can paint either the city or myself.",
        "User: Show me you in Florence.",
      ],
    });
    assert.doesNotMatch(out, /Composition constraint: this is a scene\/place request/i);
    assert.match(out, /explicitly asked for the persona\/you to appear/i);
  });
});
