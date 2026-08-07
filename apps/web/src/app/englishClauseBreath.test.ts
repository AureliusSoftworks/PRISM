import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
  it("uses no injected pause without a bot English pacing profile", () => {
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

  it("honors the bot's calibrated English pacing profile", () => {
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
      260,
    );
    assert.equal(
      resolveEnglishClauseGap({
        seed: "a",
        chunkIndex: 0,
        trailingText: "hello.",
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
