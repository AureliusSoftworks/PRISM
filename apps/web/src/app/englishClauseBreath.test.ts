import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KOKORO_DEFAULT_CLAUSE_PAUSE_MS,
  classifyEnglishClausePunctuation,
  remainingEnglishClausePauseMs,
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
  it("uses no injected pause for untagged Premium/system-style playback", () => {
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
  });

  it("uses conservative defaults only for server-tagged Kokoro punctuation", () => {
    assert.deepEqual(KOKORO_DEFAULT_CLAUSE_PAUSE_MS, {
      comma: 80,
      clause: 120,
      strong: 180,
      glue: 0,
    });
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello,",
        kokoroPunctuationPacing: true,
      }).pauseMs,
      80,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello.",
        kokoroPunctuationPacing: true,
      }).pauseMs,
      180,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "token fallback",
        kokoroPunctuationPacing: true,
      }).pauseMs,
      0,
    );
  });

  it("lets the bot's calibrated English pacing profile override Kokoro defaults", () => {
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello,",
        kokoroPunctuationPacing: true,
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
      260,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello.",
        kokoroPunctuationPacing: true,
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
      480,
    );
  });

  it("never plans decorative breaths while odds stay at zero", () => {
    for (const trailingText of ["Yes,", "Yes.", "Yes"]) {
      assert.equal(
        resolveEnglishClauseGap({
          seed: "sample",
          chunkIndex: 0,
          trailingText,
          pacingProfile: {
            v: 1,
            ownerKind: "bot",
            ownerId: "bot-1",
            commaMs: 200,
            clauseMs: 250,
            strongMs: 400,
            calibratedAt: "2026-08-04T12:00:00.000Z",
            source: "elevenlabs-timestamps",
          },
        }).breath,
        null,
      );
    }
  });
});

describe("english clause pause remainder", () => {
  it("does not stack a planned pause on silence the listener already heard", () => {
    assert.equal(remainingEnglishClausePauseMs(300, 0), 300);
    assert.equal(remainingEnglishClausePauseMs(300, 120), 180);
    assert.equal(remainingEnglishClausePauseMs(300, 480), 0);
    assert.equal(remainingEnglishClausePauseMs(180, Number.NaN), 180);
  });
});
