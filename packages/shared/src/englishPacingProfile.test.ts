import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGLISH_PACING_CALIBRATE_SCRIPT,
  ENGLISH_PACING_PAUSE_MS_BOUNDS,
  extractEnglishPacingPauseMedians,
  normalizeEnglishPacingProfileV1,
} from "./englishPacingProfile.ts";

describe("english pacing profile extract", () => {
  it("keeps a punctuated calibrate script with all pause classes", () => {
    assert.match(ENGLISH_PACING_CALIBRATE_SCRIPT, /,/u);
    assert.match(ENGLISH_PACING_CALIBRATE_SCRIPT, /:/u);
    assert.match(ENGLISH_PACING_CALIBRATE_SCRIPT, /\./u);
    assert.match(ENGLISH_PACING_CALIBRATE_SCRIPT, /\?/u);
    assert.match(ENGLISH_PACING_CALIBRATE_SCRIPT, /—/u);
  });

  it("extracts median pauses by punctuation class from character timings", () => {
    // "A, B. C;" with deliberate gaps after each mark.
    const characters = Array.from("A, B. C;");
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0;
    for (const character of characters) {
      starts.push(cursor);
      if (character === ",") {
        ends.push(cursor + 0.05);
        cursor += 0.05 + 0.2; // 200ms comma gap
      } else if (character === ".") {
        ends.push(cursor + 0.05);
        cursor += 0.05 + 0.35; // 350ms strong gap
      } else if (character === ";") {
        ends.push(cursor + 0.05);
        cursor += 0.05 + 0.28; // unused trailing
      } else if (character === " ") {
        ends.push(cursor);
      } else {
        ends.push(cursor + 0.08);
        cursor += 0.08;
      }
    }
    // Rebuild with explicit next-spoken starts after gaps.
    const rebuiltStarts = [...starts];
    const rebuiltEnds = [...ends];
    // Force known gaps: after "," (index 1) next letter "B" at +200ms
    const commaIndex = characters.indexOf(",");
    const afterComma = characters.findIndex(
      (ch, i) => i > commaIndex && /[A-Za-z]/u.test(ch),
    );
    rebuiltEnds[commaIndex] = 0.1;
    rebuiltStarts[afterComma] = 0.1 + 0.2;
    const periodIndex = characters.indexOf(".");
    const afterPeriod = characters.findIndex(
      (ch, i) => i > periodIndex && /[A-Za-z]/u.test(ch),
    );
    rebuiltEnds[periodIndex] = 0.5;
    rebuiltStarts[afterPeriod] = 0.5 + 0.35;

    const result = extractEnglishPacingPauseMedians({
      characters,
      characterStartTimesSeconds: rebuiltStarts,
      characterEndTimesSeconds: rebuiltEnds,
    });
    assert.equal(result.commaMs, 200);
    assert.equal(result.strongMs, 350);
    assert.ok(result.sampleCounts.comma >= 1);
    assert.ok(result.sampleCounts.strong >= 1);
  });

  it("clamps and normalizes stored profiles", () => {
    const profile = normalizeEnglishPacingProfileV1({
      v: 1,
      ownerKind: "bot",
      ownerId: "bot-1",
      commaMs: 10,
      clauseMs: 9000,
      strongMs: 400,
      calibratedAt: "2026-08-04T00:00:00.000Z",
      source: "elevenlabs-timestamps",
    });
    assert.ok(profile);
    assert.equal(profile.commaMs, ENGLISH_PACING_PAUSE_MS_BOUNDS.comma.min);
    assert.equal(profile.clauseMs, ENGLISH_PACING_PAUSE_MS_BOUNDS.clause.max);
    assert.equal(profile.strongMs, 400);
  });
});
