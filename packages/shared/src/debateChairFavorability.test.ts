import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "./debate.ts";
import { debateChairFavorabilityAtPlayhead } from "./debateChairFavorability.ts";

function speech(
  id: string,
  sequence: number,
  sideId: "for" | "against",
  extras: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id,
    sequence,
    phase: "opening",
    stepKey: sideId === "for" ? "opening_for" : "opening_against",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: sideId === "for" ? "bot-for" : "bot-against",
    sideId,
    content:
      "This chamber already has the facts, and the other side has not answered them.",
    sourceIds: [],
    createdAt: "2026-08-16T12:00:00.000Z",
    ...extras,
  };
}

describe("debateChairFavorabilityAtPlayhead", () => {
  it("stays centered before any heard playhead", () => {
    assert.deepEqual(
      debateChairFavorabilityAtPlayhead({
        events: [speech("for-1", 1, "for")],
        playheadEventId: null,
      }),
      { total: 0, latestReason: null },
    );
  });

  it("ignores the whole record when the playhead is unknown", () => {
    assert.deepEqual(
      debateChairFavorabilityAtPlayhead({
        events: [speech("for-1", 1, "for", { sourceIds: ["ex-1"] })],
        playheadEventId: "missing",
      }),
      { total: 0, latestReason: null },
    );
  });

  it("leans For when the heard advocate cites evidence", () => {
    const result = debateChairFavorabilityAtPlayhead({
      events: [speech("for-1", 1, "for", { sourceIds: ["ex-1"] })],
      playheadEventId: "for-1",
    });
    assert.ok(result.total > 0);
    assert.match(result.latestReason ?? "", /Cited evidence/u);
  });

  it("leans Against when the heard advocate cites evidence", () => {
    const result = debateChairFavorabilityAtPlayhead({
      events: [speech("against-1", 1, "against", { sourceIds: ["ex-1"] })],
      playheadEventId: "against-1",
    });
    assert.ok(result.total < 0);
    assert.match(result.latestReason ?? "", /Cited evidence/u);
  });

  it("does not let bake-ahead speeches past the playhead move the needle", () => {
    const heardOnly = debateChairFavorabilityAtPlayhead({
      events: [
        speech("for-1", 1, "for", { sourceIds: ["ex-1"] }),
        speech("against-1", 2, "against", { sourceIds: ["ex-2"] }),
      ],
      playheadEventId: "for-1",
    });
    const both = debateChairFavorabilityAtPlayhead({
      events: [
        speech("for-1", 1, "for", { sourceIds: ["ex-1"] }),
        speech("against-1", 2, "against", { sourceIds: ["ex-2"] }),
      ],
      playheadEventId: "against-1",
    });
    assert.ok(heardOnly.total > 0);
    assert.ok(both.total < heardOnly.total);
  });

  it("penalizes overtime on the speaking side", () => {
    const clean = debateChairFavorabilityAtPlayhead({
      events: [speech("for-1", 1, "for")],
      playheadEventId: "for-1",
    });
    const overtime = debateChairFavorabilityAtPlayhead({
      events: [
        speech("for-1", 1, "for", {
          timing: {
            limitMs: 8_000,
            estimatedDurationMs: 12_000,
            overtimeMs: 4_000,
            status: "overtime",
          },
        }),
      ],
      playheadEventId: "for-1",
    });
    assert.ok(overtime.total < clean.total);
    assert.match(overtime.latestReason ?? "", /Overtime/u);
  });

  it("treats an impressed room as a For gain", () => {
    const quiet = debateChairFavorabilityAtPlayhead({
      events: [speech("for-1", 1, "for")],
      playheadEventId: "for-1",
    });
    const impressed = debateChairFavorabilityAtPlayhead({
      events: [
        speech("for-1", 1, "for", {
          audienceReaction: {
            kind: "impressed",
            intensity: 3,
            source: "director",
          },
        }),
      ],
      playheadEventId: "for-1",
    });
    assert.ok(impressed.total > quiet.total);
    assert.match(impressed.latestReason ?? "", /impressed/u);
  });

  it("weights closing more than opening", () => {
    const opening = debateChairFavorabilityAtPlayhead({
      events: [speech("for-1", 1, "for", { sourceIds: ["ex-1"] })],
      playheadEventId: "for-1",
    });
    const closing = debateChairFavorabilityAtPlayhead({
      events: [
        speech("for-1", 1, "for", {
          phase: "closing",
          stepKey: "closing_for",
          sourceIds: ["ex-1"],
        }),
      ],
      playheadEventId: "for-1",
    });
    assert.ok(closing.total > opening.total);
  });
});
