import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBabbleSpeechText, normalizeBabbleSeed } from "../babble-text.ts";

const spokenTokens = (value: string): string[] =>
  Array.from(value.matchAll(/[\p{L}\p{M}\p{N}]+/gu), (match) => match[0]!.toLocaleLowerCase());

describe("Babble speech text", () => {
  it("is deterministic for the same utterance seed and changes with another seed", () => {
    const first = buildBabbleSpeechText({ text: "Hello, curious robot!", seed: "message-1" });
    assert.equal(first, buildBabbleSpeechText({ text: "Hello, curious robot!", seed: "message-1" }));
    assert.notEqual(first, buildBabbleSpeechText({ text: "Hello, curious robot!", seed: "message-2" }));
  });

  it("preserves punctuation and spacing while replacing every spoken token", () => {
    const source = "Hello, robot 42 — are you awake?";
    const babble = buildBabbleSpeechText({ text: source, seed: "cadence" });
    assert.equal(
      source.replace(/[\p{L}\p{M}\p{N}]+/gu, ""),
      babble.replace(/[\p{L}\p{M}\p{N}]+/gu, "").replaceAll("-", "")
    );
    const original = new Set(spokenTokens(source));
    assert.equal(spokenTokens(babble).some((token) => original.has(token)), false);
  });

  it("handles Unicode and numbers without leaking source words", () => {
    const source = "Café déjà vu, unit 9000.";
    const babble = buildBabbleSpeechText({ text: source, seed: "unicode" });
    assert.equal(babble.includes("Café"), false);
    assert.equal(babble.includes("9000"), false);
    assert.match(babble, /[,\.]/u);
  });

  it("never turns isolated letters into spoken letter names", () => {
    const babble = buildBabbleSpeechText({
      text: "A B C X Y Z. x y z?",
      seed: "no-letter-names",
    }).toLocaleLowerCase();
    const letterNames = new Set([
      "a", "ay", "bee", "cee", "see", "dee", "e", "ee", "eff", "gee",
      "aitch", "eye", "jay", "kay", "el", "em", "en", "oh", "pee",
      "cue", "queue", "ar", "ess", "tee", "you", "vee", "doubleyou",
      "ex", "why", "zee", "zed",
    ]);
    assert.equal(spokenTokens(babble).some((token) => letterNames.has(token)), false);
    assert.doesNotMatch(babble, /\b[abcxyz]\b/u);
  });

  it("emits only safe pronounceable pseudo-syllables", () => {
    const babble = buildBabbleSpeechText({
      text: "A comprehensive safety check for every generated syllable.",
      seed: "safe-syllables",
    }).toLocaleLowerCase();
    assert.match(babble, /^[a-z\s,.!?-]+$/u);
    assert.doesNotMatch(babble, /cunt|dick|fuck|kike|nazi|rape|shit|slut/u);
    assert.ok(spokenTokens(babble).every((token) => /^(?:(?:br?|ch|dr?|f|gr?|j|kl?|kr|m|n|pr?|r|sh?|tr?|v|zh?|z)(?:a|ae|e|ee|i|o|oo|u|oi)(?:k|n|p|r|s|t|x|z)?)+$/u.test(token)));
  });

  it("bounds seeds and output length", () => {
    assert.equal(normalizeBabbleSeed(" x ", "fallback"), "x");
    assert.equal(normalizeBabbleSeed("x".repeat(500), "fallback").length, 160);
    assert.ok(buildBabbleSpeechText({ text: "robot ".repeat(1200), seed: "long" }).length <= 4000);
  });
});
