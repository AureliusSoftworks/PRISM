import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBottishSpeechText, normalizeBottishSeed } from "../bottish-text.ts";

const spokenTokens = (value: string): string[] =>
  Array.from(value.matchAll(/[\p{L}\p{M}\p{N}]+/gu), (match) => match[0]!.toLocaleLowerCase());

describe("Bottish speech text", () => {
  it("is deterministic for the same utterance seed and changes with another seed", () => {
    const first = buildBottishSpeechText({ text: "Hello, curious robot!", seed: "message-1" });
    assert.equal(first, buildBottishSpeechText({ text: "Hello, curious robot!", seed: "message-1" }));
    assert.notEqual(first, buildBottishSpeechText({ text: "Hello, curious robot!", seed: "message-2" }));
  });

  it("preserves punctuation and spacing while replacing every spoken token", () => {
    const source = "Hello, robot 42 — are you awake?";
    const bottish = buildBottishSpeechText({ text: source, seed: "cadence" });
    assert.equal(
      source.replace(/[\p{L}\p{M}\p{N}]+/gu, ""),
      bottish.replace(/[\p{L}\p{M}\p{N}]+/gu, "").replaceAll("-", "")
    );
    const original = new Set(spokenTokens(source));
    assert.equal(spokenTokens(bottish).some((token) => original.has(token)), false);
  });

  it("handles Unicode and numbers without leaking source words", () => {
    const source = "Café déjà vu, unit 9000.";
    const bottish = buildBottishSpeechText({ text: source, seed: "unicode" });
    assert.equal(bottish.includes("Café"), false);
    assert.equal(bottish.includes("9000"), false);
    assert.match(bottish, /[,\.]/u);
  });

  it("emits only safe pronounceable pseudo-syllables", () => {
    const bottish = buildBottishSpeechText({
      text: "A comprehensive safety check for every generated syllable.",
      seed: "safe-syllables",
      tone: 1,
    }).toLocaleLowerCase();
    assert.match(bottish, /^[a-z\s,.!?-]+$/u);
    assert.doesNotMatch(bottish, /cunt|dick|fuck|kike|nazi|rape|shit|slut/u);
    assert.ok(spokenTokens(bottish).every((token) => /^(?:br?|ch|dr?|f|gr?|j|kl?|kr|m|n|pr?|r|sh?|tr?|v|zh?|z)(?:a|ae|e|ee|i|o|oo|u|oi)(?:k|n|p|r|s|t|x|z)?$/u.test(token)));
  });

  it("uses tone to make synthetic delivery more segmented", () => {
    const organic = buildBottishSpeechText({ text: "Conversational machinery", seed: "tone", tone: -1 });
    const synthetic = buildBottishSpeechText({ text: "Conversational machinery", seed: "tone", tone: 1 });
    assert.equal(organic.includes("-"), false);
    assert.equal(synthetic.includes("-"), true);
  });

  it("bounds seeds and output length", () => {
    assert.equal(normalizeBottishSeed(" x ", "fallback"), "x");
    assert.equal(normalizeBottishSeed("x".repeat(500), "fallback").length, 160);
    assert.ok(buildBottishSpeechText({ text: "robot ".repeat(1200), seed: "long" }).length <= 4000);
  });
});
