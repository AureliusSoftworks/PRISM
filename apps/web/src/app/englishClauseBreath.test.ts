import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGLISH_CLAUSE_PAUSE_MS,
  ENGLISH_FORCED_CLAUSE_PACING_ENABLED,
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
  it("keeps forced mid-stream pacing off so Kokoro stays continuous", () => {
    assert.equal(ENGLISH_FORCED_CLAUSE_PACING_ENABLED, false);
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello,",
      }).pauseMs,
      0,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello.",
      }).pauseMs,
      0,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello there",
      }).pauseMs,
      0,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello,",
        pacingProfile: {
          v: 1,
          ownerKind: "bot",
          ownerId: "bot-1",
          commaMs: 260,
          clauseMs: 310,
          strongMs: 480,
          calibratedAt: "2026-08-04T12:00:00.000Z",
          source: "elevenlabs-timestamps",
        },
      }).pauseMs,
      0,
    );
  });

  it("still exposes legacy pause floors for archaeology", () => {
    assert.equal(ENGLISH_CLAUSE_PAUSE_MS.comma, 140);
    assert.equal(ENGLISH_CLAUSE_PAUSE_MS.strong, 300);
    assert.equal(ENGLISH_CLAUSE_PAUSE_MS.glue, 60);
  });

  it("never plans decorative breaths while forced pacing is off", () => {
    for (const trailingText of ["Yes,", "Yes.", "Yes"]) {
      assert.equal(
        resolveEnglishClauseGap({
          seed: "sample",
          chunkIndex: 0,
          trailingText,
        }).breath,
        null,
      );
    }
  });
});
