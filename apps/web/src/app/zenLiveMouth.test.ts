import assert from "node:assert/strict";
import test from "node:test";

import {
  crtSpeechMouthShapeAtTextCursor,
  normalizeCrtSpeechText,
  zenLiveBotMouthOpenFromRevealProgress,
  zenLiveBotMouthShapeForTalkingState,
  zenLiveBotMouthShapeFromSpeechPhase,
  zenLiveBotMouthShapeFromRevealProgress,
  zenLiveBotMouthShapeFromVisibleTextProgress,
} from "./zenLiveMouth.ts";

test("talking closed beats bypass mood-specific idle mouths", () => {
  assert.equal(
    zenLiveBotMouthShapeForTalkingState({
      mouthShape: "closed",
      isTalking: true,
    }),
    "speech-closed",
  );
  assert.equal(
    zenLiveBotMouthShapeForTalkingState({
      mouthShape: "closed",
      isTalking: false,
    }),
    "closed",
  );
  assert.equal(
    zenLiveBotMouthShapeForTalkingState({
      mouthShape: "open-wide",
      isTalking: true,
    }),
    "open-wide",
  );
});

function collectZenLiveMouthShapes(
  input: Omit<
    Parameters<typeof zenLiveBotMouthShapeFromRevealProgress>[0],
    "nowMs"
  >,
  phaseCount: number
) {
  return Array.from({ length: phaseCount }, (_, index) =>
    zenLiveBotMouthShapeFromRevealProgress({
      ...input,
      nowMs: input.firstSeenAtMs + input.startDelayMs + input.phaseMs! * index,
    })
  );
}

test("CRT speech maps English letters onto distinct abrupt viseme frames", () => {
  const text = "may fit a round clock";
  const at = (character: string) =>
    crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: text.indexOf(character) });

  assert.equal(at("m"), "speech-closed");
  assert.equal(at("i"), "narrow");
  assert.equal(at("a"), "open-wide");
  assert.equal(at("u"), "open-round");
  assert.equal(at("c"), "open-small");
});

test("CRT speech gives digraphs precedence over individual letters", () => {
  for (const [text, cursorIndex, expected] of [
    ["thin", 0, "narrow"],
    ["ship", 0, "narrow"],
    ["chip", 0, "narrow"],
    ["phone", 0, "narrow"],
    ["green", 2, "narrow"],
    ["food", 1, "open-round"],
    ["out", 0, "open-round"],
    ["owl", 0, "open-round"],
    ["queen", 0, "open-round"],
    ["what", 0, "open-round"],
    ["ahead", 0, "open-wide"],
  ] as const) {
    assert.equal(crtSpeechMouthShapeAtTextCursor({ text, cursorIndex }), expected);
    assert.equal(crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: cursorIndex + 1 }), expected);
  }
});

test("CRT speech normalizes case and accented Latin letters", () => {
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "É", cursorIndex: 0 }),
    "narrow"
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "Á", cursorIndex: 0 }),
    "open-wide"
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "Ü", cursorIndex: 0 }),
    "open-round"
  );
});

test("CRT speech restores the mood mouth for whitespace and punctuation", () => {
  for (const text of [" ", ",", ".", "!", "?", "—", "🙂"]) {
    assert.equal(crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: 0 }), "closed");
  }
});

test("CRT speech clamps invalid cursors and handles empty input", () => {
  assert.equal(crtSpeechMouthShapeAtTextCursor({ text: "", cursorIndex: 4 }), "closed");
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "map", cursorIndex: Number.NaN }),
    "speech-closed"
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "map", cursorIndex: 99 }),
    "speech-closed"
  );
});

test("CRT speech uses a deterministic non-Latin fallback", () => {
  const first = crtSpeechMouthShapeAtTextCursor({ text: "界", cursorIndex: 0 });
  const second = crtSpeechMouthShapeAtTextCursor({ text: "界", cursorIndex: 0 });
  assert.equal(first, second);
  assert.notEqual(first, "closed");
  assert.notEqual(first, "speech-closed");
});

test("Coffee-visible progress advances the transition graph every character", () => {
  const text = "Maybe Bob will choose a round blue moon.";
  const shapes = Array.from({ length: 12 }, (_, index) =>
    zenLiveBotMouthShapeFromVisibleTextProgress({
      text,
      visibleLength: index + 1,
    }),
  );
  assert.equal(shapes[0], "speech-closed");
  for (let index = 1; index < shapes.length; index += 1) {
    assert.notEqual(shapes[index], shapes[index - 1]);
  }
});

test("Zen live mouth stays bounded for late phases in long replies", () => {
  const input = {
    tokens: Array.from({ length: 240 }, (_, index) => (index % 2 === 0 ? "word" : " ")),
    visibleTokenCount: 240,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  const lateShape = zenLiveBotMouthShapeFromRevealProgress({
    ...input,
    nowMs: 1_000 + 120 * 50_000,
  });

  assert.ok(
      lateShape === "closed" ||
      lateShape === "speech-closed" ||
      lateShape === "dot" ||
      lateShape === "narrow" ||
      lateShape === "open-small" ||
      lateShape === "open-wide" ||
      lateShape === "open-round" ||
      lateShape === "at"
  );
});

test("Zen live mouth waits until spoken content is visible", () => {
  assert.equal(
    zenLiveBotMouthOpenFromRevealProgress({
      tokens: [" ", "..."],
      visibleTokenCount: 2,
      nowMs: 1_200,
      firstSeenAtMs: 1_000,
      startDelayMs: 0,
    }),
    null
  );
  assert.equal(
    zenLiveBotMouthOpenFromRevealProgress({
      tokens: ["Hello"],
      visibleTokenCount: 1,
      nowMs: 1_050,
      firstSeenAtMs: 1_000,
      startDelayMs: 120,
    }),
    null
  );
});

test("Zen live mouth walks the currently revealed word at the CRT phase cadence", () => {
  const input = {
    tokens: ["Maybe "],
    visibleTokenCount: 1,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  const shapes = collectZenLiveMouthShapes(input, 6);

  assert.equal(shapes[0], "speech-closed");
  for (let index = 1; index < shapes.length; index += 1) {
    assert.notEqual(shapes[index], shapes[index - 1]);
  }
  assert.equal(zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_000 }), false);
});

test("speech normalization removes code, URLs, and markdown targets", () => {
  assert.equal(
    normalizeCrtSpeechText(
      "Say `hidden()` [Mira](prism-bot://bot-1) https://example.com ```secret``` now"
    ).replace(/\s+/gu, " ").trim(),
    "Say Mira now"
  );
});

test("Zen live mouth follows the shape-aware transition graph", () => {
  const shapes = Array.from({ length: 512 }, (_, phaseIndex) =>
    zenLiveBotMouthShapeFromSpeechPhase({
      speechSeedText: "Coffee can reuse the Zen mouth rhythm",
      phaseIndex,
    })
  );
  const allowedTransitions = {
    "speech-closed": ["open-wide", "open-small", "dot"],
    narrow: ["open-small", "open-wide", "dot"],
    dot: ["speech-closed", "open-small"],
    "open-small": ["speech-closed", "open-wide", "open-round"],
    "open-wide": ["narrow", "open-small", "open-round"],
    "open-round": ["open-small", "open-wide", "at"],
    at: ["open-round"],
  } as const;

  assert.equal(shapes[0], "speech-closed");
  let consecutiveOpenShapes = 0;
  for (let index = 1; index < shapes.length; index += 1) {
    const previous = shapes[index - 1]!;
    const current = shapes[index]!;
    assert.notEqual(previous, "closed");
    const choices =
      allowedTransitions[previous as keyof typeof allowedTransitions];
    assert.ok(
      (choices as readonly string[]).includes(current),
      `Invalid mouth transition ${previous} → ${current}`,
    );
    assert.notEqual(current, previous);
    if (current === "dot") {
      assert.ok(previous === "speech-closed" || previous === "narrow");
    }
    if (previous === "dot") {
      assert.ok(current === "speech-closed" || current === "open-small");
    }
    if (current === "at" || previous === "at") {
      assert.ok(current === "open-round" || previous === "open-round");
    }
    const currentIsOpen =
      current === "open-small" ||
      current === "open-wide" ||
      current === "open-round" ||
      current === "at";
    consecutiveOpenShapes = currentIsOpen ? consecutiveOpenShapes + 1 : 0;
    assert.ok(consecutiveOpenShapes <= 5);
  }
  for (const expectedShape of Object.keys(allowedTransitions)) {
    assert.ok(shapes.includes(expectedShape as (typeof shapes)[number]));
  }
  assert.deepEqual(
    shapes,
    Array.from({ length: 512 }, (_, phaseIndex) =>
      zenLiveBotMouthShapeFromSpeechPhase({
        speechSeedText: "Coffee can reuse the Zen mouth rhythm",
        phaseIndex,
      }),
    ),
  );
});
