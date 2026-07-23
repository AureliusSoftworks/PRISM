import assert from "node:assert/strict";
import test from "node:test";

import {
  BOTTISH_MOUTH_PHASE_MS,
  bottishMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtElapsedMs,
  crtSpeechMouthShapeAtTextCursor,
  crtSpeechMouthShapeFromVisibleTextProgress,
  englishCrtVisemeTimeline,
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
  phaseCount: number,
) {
  return Array.from({ length: phaseCount }, (_, index) =>
    zenLiveBotMouthShapeFromRevealProgress({
      ...input,
      nowMs: input.firstSeenAtMs + input.startDelayMs + input.phaseMs! * index,
    }),
  );
}

test("CRT speech maps core English phoneme groups onto distinct visemes", () => {
  const text = "may fit a loud river clock";
  const at = (character: string) =>
    crtSpeechMouthShapeAtTextCursor({
      text,
      cursorIndex: text.indexOf(character),
    });

  assert.equal(at("m"), "speech-closed");
  assert.equal(at("f"), "dot");
  assert.equal(at("i"), "narrow");
  assert.equal(at("a"), "open-wide");
  assert.equal(at("u"), "dot");
  assert.equal(at("l"), "at");
  assert.equal(at("r"), "narrow");
  assert.equal(at("c"), "open-round");
});

test("English CRT vowel sounds use the intended ASCII mouth sizes", () => {
  for (const [text, expected] of [
    ["ooh", "dot"],
    ["oh", "open-small"],
    ["uh", "open-small"],
    ["aw", "open-round"],
    ["eh", "open-wide"],
  ] as const) {
    assert.equal(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: 0 }),
      expected,
    );
  }
});

test("English CRT covers common ambiguous vowel spellings", () => {
  for (const [text, cursorIndex, expected] of [
    ["book", 1, "open-small"],
    ["food", 1, "dot"],
    ["head", 1, "open-wide"],
    ["heat", 1, "narrow"],
    ["piece", 1, "narrow"],
    ["pie", 1, "open-wide"],
    ["key", 1, "narrow"],
    ["they", 2, "open-wide"],
    ["snow", 2, "open-small"],
    ["cow", 1, "open-wide"],
    ["eight", 0, "open-wide"],
    ["books", 1, "open-small"],
    ["headed", 1, "open-wide"],
    ["loved", 1, "open-small"],
  ] as const) {
    assert.equal(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex }),
      expected,
      `${text} at ${cursorIndex}`,
    );
  }
});

test("English CRT exception words avoid their misleading written vowels", () => {
  const vowelShapes = (text: string) =>
    englishCrtVisemeTimeline(text)
      .filter((beat) => beat.kind === "vowel")
      .map((beat) => beat.shape);

  assert.ok(vowelShapes("the").includes("open-small"));
  assert.ok(vowelShapes("one").includes("open-small"));
  assert.ok(vowelShapes("two").includes("dot"));
  assert.ok(vowelShapes("people").includes("narrow"));
  assert.ok(vowelShapes("could").includes("open-small"));
  assert.ok(vowelShapes("through").includes("dot"));
  assert.ok(vowelShapes("thought").includes("open-round"));
  assert.ok(vowelShapes("said").includes("open-wide"));
});

test("English CRT visemes expose the intended mouth glyph vocabulary", () => {
  assert.equal(
    crtSpeechMouthShapeFromVisibleTextProgress({
      text: "lamp",
      visibleLength: 1,
    }),
    "at",
  );
  assert.equal(
    crtSpeechMouthShapeFromVisibleTextProgress({
      text: "river",
      visibleLength: 1,
    }),
    "narrow",
  );
  assert.equal(
    crtSpeechMouthShapeFromVisibleTextProgress({
      text: "map",
      visibleLength: 1,
    }),
    "speech-closed",
  );
  assert.equal(
    crtSpeechMouthShapeFromVisibleTextProgress({
      text: "face",
      visibleLength: 1,
    }),
    "dot",
  );
});

test("English preview visemes hold vowels longer than consonants", () => {
  const text = "lamp";
  const at = (elapsedMs: number) =>
    crtSpeechMouthShapeAtElapsedMs({
      text,
      elapsedMs,
      durationMs: 1_000,
    });
  assert.equal(at(0), "at");
  assert.equal(at(300), "open-wide");
  assert.equal(at(550), "open-wide");
  assert.equal(at(700), "speech-closed");
});

test("English preview visemes follow provider character timings", () => {
  const alignment = {
    characters: ["m", "a", "p"],
    characterStartTimesSeconds: [0, 0.08, 0.72],
    characterEndTimesSeconds: [0.08, 0.72, 1],
  };
  const at = (elapsedMs: number) =>
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "map",
      elapsedMs,
      durationMs: 2_000,
      alignment,
    });

  assert.equal(at(40), "speech-closed");
  assert.equal(at(500), "open-wide");
  assert.equal(at(1_300), "open-wide");
  assert.equal(at(1_700), "speech-closed");
  assert.equal(at(2_000), "closed");
});

test("aligned preview visemes fall back when provider timing is malformed", () => {
  assert.equal(
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "map",
      elapsedMs: 500,
      durationMs: 1_000,
      alignment: {
        characters: ["m", "a", "p"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.2, 0.8, 1],
      },
    }),
    crtSpeechMouthShapeAtElapsedMs({
      text: "map",
      elapsedMs: 500,
      durationMs: 1_000,
    }),
  );
});

test("aligned preview visemes close for lead-in silence and real timing gaps", () => {
  const alignment = {
    characters: ["m", "a"],
    characterStartTimesSeconds: [0.2, 0.6],
    characterEndTimesSeconds: [0.4, 0.9],
  };
  const at = (elapsedMs: number) =>
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "ma",
      elapsedMs,
      durationMs: 900,
      alignment,
    });

  assert.equal(at(100), "closed");
  assert.equal(at(300), "speech-closed");
  assert.equal(at(500), "closed");
  assert.equal(at(700), "open-wide");
  assert.equal(at(900), "closed");
});

test("aligned preview visemes accept chunked and overlapping provider timing", () => {
  assert.equal(
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "the",
      elapsedMs: 350,
      durationMs: 500,
      alignment: {
        characters: ["th", "e"],
        characterStartTimesSeconds: [0, 0.2],
        characterEndTimesSeconds: [0.3, 0.5],
      },
    }),
    "open-small",
  );
  assert.equal(
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "ma",
      elapsedMs: 150,
      durationMs: 400,
      alignment: {
        characters: ["m", "a"],
        characterStartTimesSeconds: [0, 0.1],
        characterEndTimesSeconds: [0.4, 0.2],
      },
    }),
    "open-wide",
  );
  for (const [elapsedMs, expected] of [
    [100, "speech-closed"],
    [500, "open-wide"],
    [900, "speech-closed"],
  ] as const) {
    assert.equal(
      crtSpeechMouthShapeAtAlignedElapsedMs({
        text: "map",
        elapsedMs,
        durationMs: 1_000,
        alignment: {
          characters: ["map"],
          characterStartTimesSeconds: [0],
          characterEndTimesSeconds: [1],
        },
      }),
      expected,
    );
  }
});

test("aligned preview completes diphthongs inside one timed character", () => {
  const alignment = {
    characters: ["f", "a", "c", "e"],
    characterStartTimesSeconds: [0, 0.1, 0.7, 0.85],
    characterEndTimesSeconds: [0.1, 0.7, 0.85, 1],
  };
  const at = (elapsedMs: number) =>
    crtSpeechMouthShapeAtAlignedElapsedMs({
      text: "face",
      elapsedMs,
      durationMs: 1_000,
      alignment,
    });

  assert.equal(at(250), "open-wide");
  assert.equal(at(600), "narrow");
});

test("unaligned preview visemes close when playback reaches its end", () => {
  assert.equal(
    crtSpeechMouthShapeAtElapsedMs({
      text: "hello",
      elapsedMs: 1_000,
      durationMs: 1_000,
    }),
    "closed",
  );
  assert.equal(
    crtSpeechMouthShapeAtElapsedMs({
      text: "hello",
      elapsedMs: 5_000,
      durationMs: 1_000,
    }),
    "closed",
  );
});

test("Bottish holds readable poses across rapid synthesized notes", () => {
  const alignment = {
    characters: ["b", "o", "t", "t", "i"],
    characterStartTimesSeconds: [0, 0.08, 0.16, 0.24, 0.32],
    characterEndTimesSeconds: [0.07, 0.15, 0.23, 0.31, 0.39],
  };
  const at = (elapsedMs: number) =>
    bottishMouthShapeAtAlignedElapsedMs({
      text: "botti",
      elapsedMs,
      durationMs: 390,
      alignment,
    });

  assert.equal(BOTTISH_MOUTH_PHASE_MS, 240);
  assert.equal(at(20), at(140));
  assert.notEqual(at(140), at(260));
  assert.equal(at(75), "closed");
  assert.equal(at(390), "closed");
});

test("English viseme timelines give vowels more time than closures", () => {
  const beats = englishCrtVisemeTimeline("map");
  const vowel = beats.find((beat) => beat.kind === "vowel");
  const consonants = beats.filter((beat) => beat.kind === "consonant");
  assert.ok(vowel);
  assert.ok(consonants.length > 0);
  for (const consonant of consonants) {
    assert.ok(vowel.durationUnits > consonant.durationUnits);
  }
});

test("English diphthongs transition through their opening and closing shapes", () => {
  const nonRestShapes = (text: string) =>
    englishCrtVisemeTimeline(text)
      .filter((beat) => beat.kind !== "rest")
      .map((beat) => beat.shape);
  assert.equal(
    nonRestShapes("day").join(" "),
    "open-wide open-wide narrow",
  );
  assert.equal(
    nonRestShapes("out").join(" "),
    "open-wide dot open-small",
  );
  assert.equal(
    nonRestShapes("boy").join(" "),
    "speech-closed open-round narrow",
  );
});

test("CRT speech gives consonant and vowel graphemes precedence", () => {
  for (const [text, cursorIndex, expected] of [
    ["thin", 0, "at"],
    ["ship", 0, "narrow"],
    ["chip", 0, "narrow"],
    ["phone", 0, "dot"],
    ["green", 2, "narrow"],
    ["food", 1, "dot"],
    ["queen", 0, "dot"],
    ["what", 0, "dot"],
    ["ahead", 0, "open-round"],
  ] as const) {
    assert.equal(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex }),
      expected,
    );
    assert.equal(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: cursorIndex + 1 }),
      expected,
    );
  }
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "out", cursorIndex: 0 }),
    "open-wide",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "out", cursorIndex: 1 }),
    "dot",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "owl", cursorIndex: 0 }),
    "open-wide",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "owl", cursorIndex: 1 }),
    "dot",
  );
});

test("neutral consonants anticipate the next vowel without overriding closures", () => {
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "cat", cursorIndex: 0 }),
    "open-wide",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "ship", cursorIndex: 0 }),
    "narrow",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "map", cursorIndex: 0 }),
    "speech-closed",
  );
});

test("punctuation rests longer than spaces and closes the mouth", () => {
  const beats = englishCrtVisemeTimeline("hi, you!");
  const space = beats.find((beat) => beat.sourceStart === 3);
  const comma = beats.find((beat) => beat.sourceStart === 2);
  const terminal = beats.find((beat) => beat.sourceStart === 7);
  assert.equal(space?.shape, "closed");
  assert.equal(comma?.shape, "closed");
  assert.equal(terminal?.shape, "closed");
  assert.ok((comma?.durationUnits ?? 0) > (space?.durationUnits ?? 0));
  assert.ok((terminal?.durationUnits ?? 0) > (comma?.durationUnits ?? 0));
});

test("apostrophes do not insert fake pauses into contractions", () => {
  const text = "we’re sure Jared's ready";
  const beats = englishCrtVisemeTimeline(text);
  const apostropheIndexes = Array.from(text)
    .map((character, index) => (/['’]/u.test(character) ? index : -1))
    .filter((index) => index >= 0);

  for (const apostropheIndex of apostropheIndexes) {
    assert.equal(
      beats.some(
        (beat) =>
          beat.kind === "rest" &&
          beat.sourceStart <= apostropheIndex &&
          beat.sourceEnd > apostropheIndex,
      ),
      false,
    );
    assert.notEqual(
      crtSpeechMouthShapeAtTextCursor({
        text,
        cursorIndex: apostropheIndex,
      }),
      "closed",
    );
  }
  assert.ok(
    englishCrtVisemeTimeline("we're")
      .filter((beat) => beat.kind === "vowel")
      .some((beat) => beat.shape === "narrow"),
  );
  assert.ok(
    englishCrtVisemeTimeline("won't")
      .filter((beat) => beat.kind === "vowel")
      .some((beat) => beat.shape === "open-small"),
  );
});

test("silent English letters inherit a neighboring spoken mouth pose", () => {
  for (const [text, cursorIndex] of [
    ["knight", 0],
    ["write", 0],
    ["lamb", 3],
    ["though", 4],
  ] as const) {
    assert.notEqual(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex }),
      "closed",
      `${text} at ${cursorIndex}`,
    );
  }
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "cough", cursorIndex: 3 }),
    "dot",
  );
});

test("numbers expand into deterministic spoken viseme timelines", () => {
  const first = englishCrtVisemeTimeline("42");
  const second = englishCrtVisemeTimeline("42");
  assert.deepEqual(first, second);
  assert.ok(first.length > 2);
  assert.ok(first.every((beat) => beat.sourceStart === 0 || beat.sourceStart === 1));
  assert.ok(first.some((beat) => beat.shape === "dot"));
  assert.ok(first.some((beat) => beat.shape === "open-round"));
});

test("CRT speech normalizes case and accented Latin letters", () => {
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "É", cursorIndex: 0 }),
    "open-wide",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "Á", cursorIndex: 0 }),
    "open-wide",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "flüte", cursorIndex: 2 }),
    "dot",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({
      text: "e\u0301lan",
      cursorIndex: 2,
    }),
    "at",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "Æon", cursorIndex: 0 }),
    "open-wide",
  );
});

test("CRT speech restores the mood mouth for whitespace and punctuation", () => {
  for (const text of [" ", ",", ".", "!", "?", "—", "🙂"]) {
    assert.equal(
      crtSpeechMouthShapeAtTextCursor({ text, cursorIndex: 0 }),
      "closed",
    );
  }
});

test("CRT speech clamps invalid cursors and handles empty input", () => {
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "", cursorIndex: 4 }),
    "closed",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "map", cursorIndex: Number.NaN }),
    "speech-closed",
  );
  assert.equal(
    crtSpeechMouthShapeAtTextCursor({ text: "map", cursorIndex: 99 }),
    "speech-closed",
  );
});

test("CRT speech uses a deterministic non-Latin fallback", () => {
  const first = crtSpeechMouthShapeAtTextCursor({ text: "界", cursorIndex: 0 });
  const second = crtSpeechMouthShapeAtTextCursor({
    text: "界",
    cursorIndex: 0,
  });
  assert.equal(first, second);
  assert.notEqual(first, "closed");
  assert.notEqual(first, "speech-closed");
});

test("English CRT stays total and source-safe for adversarial text", () => {
  const allowedShapes = new Set([
    "at",
    "closed",
    "dot",
    "narrow",
    "open-round",
    "open-small",
    "open-wide",
    "speech-closed",
  ]);
  for (const text of [
    "",
    "\u0301",
    "İ Æsir Straße œuvre",
    "we’re co-operating… right?",
    "👩🏽‍💻 says: “42!”",
    "strengths ".repeat(200),
  ]) {
    const sourceLength = Array.from(text).length;
    const beats = englishCrtVisemeTimeline(text);
    for (const beat of beats) {
      assert.ok(allowedShapes.has(beat.shape));
      assert.ok(Number.isFinite(beat.durationUnits));
      assert.ok(beat.durationUnits > 0);
      assert.ok(beat.sourceStart >= 0);
      assert.ok(beat.sourceEnd > beat.sourceStart);
      assert.ok(beat.sourceEnd <= sourceLength);
    }
    for (const cursorIndex of [
      -100,
      0,
      sourceLength / 2,
      sourceLength + 100,
      Number.NaN,
    ]) {
      assert.ok(
        allowedShapes.has(
          crtSpeechMouthShapeAtTextCursor({
            text,
            cursorIndex,
            cursorProgress: Number.NaN,
          }),
        ),
      );
    }
  }
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
    tokens: Array.from({ length: 240 }, (_, index) =>
      index % 2 === 0 ? "word" : " ",
    ),
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
      lateShape === "at",
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
    null,
  );
  assert.equal(
    zenLiveBotMouthOpenFromRevealProgress({
      tokens: ["Hello"],
      visibleTokenCount: 1,
      nowMs: 1_050,
      firstSeenAtMs: 1_000,
      startDelayMs: 120,
    }),
    null,
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
  assert.equal(
    zenLiveBotMouthOpenFromRevealProgress({ ...input, nowMs: 1_000 }),
    false,
  );
});

test("English Zen speech follows phoneme timing while robot speech keeps its transition rhythm", () => {
  const input = {
    tokens: ["lamp "],
    visibleTokenCount: 1,
    firstSeenAtMs: 1_000,
    startDelayMs: 0,
    phaseMs: 120,
  };
  assert.equal(
    zenLiveBotMouthShapeFromRevealProgress({
      ...input,
      nowMs: 1_000,
      phonemeAware: true,
    }),
    "at",
  );
  assert.equal(
    zenLiveBotMouthShapeFromRevealProgress({
      ...input,
      nowMs: 1_120,
      phonemeAware: true,
    }),
    "open-wide",
  );
  assert.equal(
    zenLiveBotMouthShapeFromRevealProgress({
      ...input,
      nowMs: 1_000,
    }),
    "speech-closed",
  );
});

test("speech normalization removes code, URLs, and markdown targets", () => {
  assert.equal(
    normalizeCrtSpeechText(
      "Say `hidden()` [Mira](prism-bot://bot-1) https://example.com ```secret``` now",
    )
      .replace(/\s+/gu, " ")
      .trim(),
    "Say Mira now",
  );
});

test("Zen live mouth follows the shape-aware transition graph", () => {
  const shapes = Array.from({ length: 512 }, (_, phaseIndex) =>
    zenLiveBotMouthShapeFromSpeechPhase({
      speechSeedText: "Coffee can reuse the Zen mouth rhythm",
      phaseIndex,
    }),
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
