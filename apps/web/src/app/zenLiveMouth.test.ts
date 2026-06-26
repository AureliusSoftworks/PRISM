import assert from "node:assert/strict";
import test from "node:test";

import {
  zenLiveBotMouthOpenFromRevealProgress,
  zenLiveBotMouthShapeFromRevealProgress,
} from "./zenLiveMouth.ts";

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

test("Zen live mouth alternates neutral and open speech frames", () => {
  const input = {
    tokens: ["Hello", " ", "neighbor"],
    visibleTokenCount: 3,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };

  assert.equal(zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_000 }), false);
  assert.equal(zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_120 }), true);
  assert.equal(zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_240 }), false);
  assert.equal(zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_360 }), true);
});

test("Zen live mouth separates simple open shapes with neutral frames", () => {
  const input = {
    tokens: ["Hello", " ", "neighbor"],
    visibleTokenCount: 3,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  const shapes = collectZenLiveMouthShapes(input, 6);

  assert.equal(shapes[0], "closed");
  assert.notEqual(shapes[1], "closed");
  assert.equal(shapes[2], "closed");
  assert.notEqual(shapes[3], "closed");
  assert.equal(shapes[4], "closed");
  assert.notEqual(shapes[5], "closed");
});

test("Zen live mouth occasionally uses organic rounded flourishes", () => {
  const input = {
    tokens: ["Gentle", " ", "words", " ", "can", " ", "shape", " ", "a", " ", "room"],
    visibleTokenCount: 11,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  const shapes = collectZenLiveMouthShapes(input, 80);
  const roundIndex = shapes.indexOf("open-round");

  assert.notEqual(roundIndex, -1);
  assert.equal(shapes[roundIndex - 2], "closed");
  assert.notEqual(shapes[roundIndex - 1], "closed");
  assert.notEqual(shapes[roundIndex + 1], "closed");
});

test("Zen live mouth avoids repeated neutral frames and long open runs", () => {
  const input = {
    tokens: ["A", " ", "long", " ", "reply", " ", "keeps", " ", "moving"],
    visibleTokenCount: 9,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  const shapes = collectZenLiveMouthShapes(input, 120);
  let openRun = 0;

  for (let index = 0; index < shapes.length; index += 1) {
    if (shapes[index] === "closed") {
      assert.notEqual(shapes[index + 1], "closed");
      openRun = 0;
      continue;
    }
    openRun += 1;
    assert.ok(openRun <= 3);
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
      lateShape === "open-small" ||
      lateShape === "open-wide" ||
      lateShape === "open-round"
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
