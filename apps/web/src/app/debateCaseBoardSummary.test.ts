import assert from "node:assert/strict";
import test from "node:test";

import {
  composeDebateRoundSummary,
  debateCaseBoardChronological,
  debateCaseBoardRoundKey,
  debateRoundSummaryShouldHydrate,
  debateRoundSummarySourceCards,
  formatDebateCaseBoardTranscript,
  DEBATE_CASE_BOARD_TRANSCRIPT_EMPTY,
} from "./debateCaseBoardSummary.ts";
import type {
  DebateCaseCardV1,
  DebateSessionV1,
} from "@localai/shared";

function stubSession(
  overrides: Partial<DebateSessionV1> & {
    formatState: DebateSessionV1["formatState"];
    events?: DebateSessionV1["events"];
    caseBoard?: DebateCaseCardV1[];
  },
): DebateSessionV1 {
  return {
    id: "debate-1",
    status: "active",
    stepKey: "opening_for",
    format: "forum",
    formatVersion: 1,
    formality: "casual",
    motion: {
      title: "Hot dogs vs hamburgers",
      motion: "Hot dogs vs hamburgers deserve equal cookout respect.",
      forSide: { id: "for", label: "Hot Dog Holds the Crown" },
      againstSide: { id: "against", label: "Hamburger Takes the Crown" },
    },
    events: overrides.events ?? [],
    caseBoard: overrides.caseBoard ?? [],
    ...overrides,
  } as DebateSessionV1;
}

test("round key stays stable within a round and advances between rounds", () => {
  const opening = stubSession({
    stepKey: "opening_against",
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 1,
      rebuttalRoundTarget: 2,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "Two exchanges.",
    },
  });
  assert.equal(debateCaseBoardRoundKey(opening), "forum:opening");

  const rebuttal1 = stubSession({
    stepKey: "rebuttal_for",
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 1,
      rebuttalRoundTarget: 2,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "Two exchanges.",
    },
  });
  assert.equal(debateCaseBoardRoundKey(rebuttal1), "forum:rebuttal:1");

  const rebuttal2 = stubSession({
    stepKey: "rebuttal_against",
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 2,
      rebuttalRoundTarget: 2,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "Two exchanges.",
    },
  });
  assert.equal(debateCaseBoardRoundKey(rebuttal2), "forum:rebuttal:2");
  assert.notEqual(
    debateCaseBoardRoundKey(rebuttal1),
    debateCaseBoardRoundKey(rebuttal2),
  );
});

test("orders case cards by source-event sequence for the SMS stream", () => {
  const cards: DebateCaseCardV1[] = [
    {
      id: "b",
      sideId: "against",
      summary: "Second claim.",
      status: "active",
      sourceIds: [],
      createdEventId: "e2",
      updatedAt: "2026-01-01T00:00:02Z",
    },
    {
      id: "a",
      sideId: "for",
      summary: "First claim.",
      status: "challenged",
      sourceIds: [],
      createdEventId: "e1",
      updatedAt: "2026-01-01T00:00:01Z",
    },
  ];
  const session = stubSession({
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 1,
      rebuttalRoundTarget: 1,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "One exchange.",
    },
    events: [
      {
        version: 1,
        id: "e1",
        sequence: 1,
        phase: "rebuttal",
        stepKey: "rebuttal_for",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: "for-bot",
        sideId: "for",
        content: "First claim.",
        sourceIds: [],
        createdAt: "2026-01-01T00:00:01Z",
      },
      {
        version: 1,
        id: "e2",
        sequence: 2,
        phase: "rebuttal",
        stepKey: "rebuttal_against",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: "against-bot",
        sideId: "against",
        content: "Second claim.",
        sourceIds: [],
        createdAt: "2026-01-01T00:00:02Z",
      },
    ] as DebateSessionV1["events"],
  });
  assert.deepEqual(
    debateCaseBoardChronological(session, cards).map((card) => card.id),
    ["a", "b"],
  );
});

test("hydrates summary from session board when gated board is empty", () => {
  const cards: DebateCaseCardV1[] = [
    {
      id: "a",
      sideId: "for",
      summary: "Dogs travel better.",
      status: "active",
      sourceIds: [],
      createdEventId: "e1",
      updatedAt: "2026-01-01T00:00:01Z",
    },
  ];
  const session = stubSession({
    stepKey: "rebuttal_for",
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 3,
      rebuttalRoundTarget: 3,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "Three exchanges.",
    },
    caseBoard: cards,
    events: [
      {
        version: 1,
        id: "e1",
        sequence: 1,
        phase: "rebuttal",
        stepKey: "rebuttal_for",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: "for-bot",
        sideId: "for",
        content: "Dogs travel better.",
        sourceIds: [],
        createdAt: "2026-01-01T00:00:01Z",
      },
    ] as DebateSessionV1["events"],
  });
  assert.equal(debateCaseBoardRoundKey(session), "forum:rebuttal:3");
  assert.equal(debateRoundSummaryShouldHydrate("forum:rebuttal:3"), true);
  assert.equal(debateRoundSummaryShouldHydrate("forum:opening"), false);
  const sourced = debateRoundSummarySourceCards(session, []);
  assert.equal(sourced.length, 1);
  const summary = composeDebateRoundSummary({ session, cards: sourced });
  assert.match(summary, /Dogs travel better/iu);
  assert.doesNotMatch(summary, /has not finished a round yet/u);
});

test("empty sealed case board uses silence-aware summary copy", () => {
  const session = stubSession({
    status: "completed",
    stepKey: "completed",
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 3,
      rebuttalRoundTarget: 3,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "Three exchanges.",
    },
    caseBoard: [],
    events: [],
  });
  const summary = composeDebateRoundSummary({ session, cards: [] });
  assert.match(summary, /No claims were heard/iu);
  assert.doesNotMatch(summary, /has not finished a round yet/u);
});

test("composes at most five summary sentences from the case board", () => {
  const cards: DebateCaseCardV1[] = Array.from({ length: 7 }, (_, index) => ({
    id: `c${index}`,
    sideId: index % 2 === 0 ? "for" : "against",
    summary: `Claim number ${index + 1} about the motion`,
    status: index === 6 ? "active" : "challenged",
    sourceIds: [],
    createdEventId: `e${index}`,
    updatedAt: `2026-01-01T00:00:0${index}Z`,
  }));
  const session = stubSession({
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 1,
      rebuttalRoundTarget: 1,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "One exchange.",
    },
    events: cards.map((card, index) => ({
      version: 1,
      id: card.createdEventId,
      sequence: index + 1,
      phase: "rebuttal" as const,
      stepKey: card.sideId === "for" ? "rebuttal_for" : "rebuttal_against",
      kind: "speech",
      speakerKind: "advocate",
      speakerBotId: card.sideId === "for" ? "for-bot" : "against-bot",
      sideId: card.sideId,
      content: card.summary,
      sourceIds: [],
      createdAt: card.updatedAt,
    })) as DebateSessionV1["events"],
  });
  const summary = composeDebateRoundSummary({ session, cards });
  const sentenceCount = summary.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  assert.ok(sentenceCount <= 5);
  assert.match(summary, /Hot Dog Holds the Crown/u);
  assert.match(summary, /Hamburger Takes the Crown/u);
  assert.doesNotMatch(summary, /claim number 1 /iu);
  assert.match(summary, /claim number 7/iu);
});

test("formats a plain-text Living Case Board clipboard transcript", () => {
  const cards: DebateCaseCardV1[] = [
    {
      id: "c1",
      sideId: "for",
      summary: "Dogs travel better on the go.",
      status: "active",
      sourceIds: ["src-a"],
      createdEventId: "e1",
      updatedAt: "2026-01-01T00:00:01Z",
    },
    {
      id: "c2",
      sideId: "against",
      summary: "Burgers feed a crowd.",
      status: "challenged",
      sourceIds: [],
      createdEventId: "e2",
      updatedAt: "2026-01-01T00:00:02Z",
    },
  ];
  const session = stubSession({
    formatState: {
      version: 1,
      format: "forum",
      rebuttalRound: 1,
      rebuttalRoundTarget: 1,
      rebuttalRoundMode: "fixed",
      rebuttalRoundRationale: "One exchange.",
    },
    events: [
      {
        version: 1,
        id: "e1",
        sequence: 1,
        phase: "rebuttal",
        stepKey: "rebuttal_for",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: "for-bot",
        sideId: "for",
        content: cards[0]!.summary,
        sourceIds: ["src-a"],
        createdAt: "2026-01-01T00:00:01Z",
      },
      {
        version: 1,
        id: "e2",
        sequence: 2,
        phase: "rebuttal",
        stepKey: "rebuttal_against",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: "against-bot",
        sideId: "against",
        content: cards[1]!.summary,
        sourceIds: [],
        createdAt: "2026-01-01T00:00:02Z",
      },
    ] as DebateSessionV1["events"],
  });
  const empty = formatDebateCaseBoardTranscript({ session, cards: [] });
  assert.match(empty, /Living Case Board/u);
  assert.match(empty, new RegExp(DEBATE_CASE_BOARD_TRANSCRIPT_EMPTY, "u"));

  const text = formatDebateCaseBoardTranscript({ session, cards });
  assert.match(text, /Hot Dog Holds the Crown · active/u);
  assert.match(text, /Dogs travel better on the go\./u);
  assert.match(text, /Exhibits: src-a/u);
  assert.match(text, /Hamburger Takes the Crown · challenged/u);
  assert.match(text, /Burgers feed a crowd\./u);
  assert.match(text, /Hot dogs vs hamburgers/u);
});
