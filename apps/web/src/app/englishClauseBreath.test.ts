import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRE_SPEECH_BREATH_URLS } from "./preSpeechBreath.ts";
import {
  ENGLISH_CLAUSE_PAUSE_MS,
  classifyEnglishClausePunctuation,
  resolveEnglishClauseGap,
} from "./englishClauseBreath.ts";

describe("english clause punctuation classification", () => {
  it("maps trailing marks into pause buckets", () => {
    assert.equal(classifyEnglishClausePunctuation("okay,"), "comma");
    assert.equal(classifyEnglishClausePunctuation("wait;"), "clause");
    assert.equal(classifyEnglishClausePunctuation("ready:"), "clause");
    assert.equal(classifyEnglishClausePunctuation("soft—"), "clause");
    assert.equal(classifyEnglishClausePunctuation("Done."), "strong");
    assert.equal(classifyEnglishClausePunctuation('Really?"'), "strong");
    assert.equal(classifyEnglishClausePunctuation("Wait…"), "strong");
    assert.equal(classifyEnglishClausePunctuation("mid cut"), "glue");
  });
});

describe("english clause gap planning", () => {
  it("always returns the matching pause floor", () => {
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello,",
      }).pauseMs,
      ENGLISH_CLAUSE_PAUSE_MS.comma,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello.",
      }).pauseMs,
      ENGLISH_CLAUSE_PAUSE_MS.strong,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello there",
      }).pauseMs,
      ENGLISH_CLAUSE_PAUSE_MS.glue,
    );
  });

  it("is deterministic and only chooses bundled breath assets", () => {
    const args = {
      seed: "episode-4:message-8",
      chunkIndex: 2,
      trailingText: "There is one part that matters most.",
    };
    const first = resolveEnglishClauseGap(args);
    assert.deepEqual(first, resolveEnglishClauseGap(args));
    if (first.breath) {
      assert.ok(
        (
          PRE_SPEECH_BREATH_URLS[first.breath.intensity] as readonly string[]
        ).includes(first.breath.url),
      );
      assert.ok(first.breath.gain > 0 && first.breath.gain < 0.7);
      assert.ok(first.breath.voiceOverlapMs >= 160);
    }
  });

  it("keeps decorative breaths sparse by punctuation kind", () => {
    const countFor = (trailingText: string) =>
      Array.from({ length: 1_000 }, (_, index) =>
        resolveEnglishClauseGap({
          seed: `sample-${index}`,
          chunkIndex: index % 7,
          trailingText,
        }),
      ).filter((gap) => gap.breath).length;

    const commaCount = countFor("Yes,");
    const strongCount = countFor("Yes.");
    const glueCount = countFor("Yes");
    assert.ok(
      commaCount >= 150 && commaCount <= 250,
      `comma breaths=${commaCount}`,
    );
    assert.ok(
      strongCount >= 340 && strongCount <= 460,
      `strong breaths=${strongCount}`,
    );
    assert.equal(glueCount, 0);
    assert.ok(strongCount > commaCount);
  });

  it("skips decorative breaths when effects are off or breath is authored", () => {
    assert.equal(
      resolveEnglishClauseGap({
        seed: "disabled",
        chunkIndex: 0,
        trailingText: "A careful answer follows.",
        enabled: false,
      }).breath,
      null,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "authored-full",
        chunkIndex: 0,
        trailingText: "A careful answer follows.",
        fullText: "[breathes deeply] A careful answer follows.",
      }).breath,
      null,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "authored-perf",
        chunkIndex: 0,
        trailingText: "A careful answer follows.",
        authoredPerformanceText: "*sighs* then continues",
      }).breath,
      null,
    );
  });
});
