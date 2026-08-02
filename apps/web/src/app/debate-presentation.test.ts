import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_EVIDENCE_LINK_PREFIX,
  DEBATE_SOURCE_LINK_PREFIX,
  DEBATE_UTTERANCE_PACE_BOOST,
  debateActiveDurationLabel,
  debateAudioEnabled,
  debateEvidenceFromMarkdownHref,
  debateEventSpokenLineDurationMs,
  debateGavelAudioEnabled,
  debateLiveElapsedDurationMs,
  debateMarkdownSource,
  debateGalleryReactingIndices,
  debateGalleryReaction,
  debateRevealDurationMs,
  debateSourceFromMarkdownHref,
  debateTranscriptIsAtLive,
  debateTurnClockState,
  debateTurnOwnerBotId,
  debateUtterancePaceBoost,
  debateVisibleContentAtProgress,
  formatDebateElapsedDuration,
  formatDebateSpokenDuration,
} from "./debatePresentation.ts";

const evidence = {
  version: 1 as const,
  notes: "",
  frozenAt: "2026-07-28T00:00:00.000Z",
  sources: [
    {
      id: "frozen-1",
      title: "Frozen source",
      url: "https://example.com/source",
      snippet: "Evidence.",
      publishedAt: null,
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      adjective: "Rusty",
      object: "spoon",
      title: "Rusty spoon",
      observation: "The handle is bent.",
      emoji: "🥄",
      visualKind: "emoji" as const,
      imageId: null,
      createdBy: "player" as const,
    },
  ],
};

describe("Debate live presentation", () => {
  it("uses a calmer bounded reveal cadence", () => {
    assert.equal(debateRevealDurationMs(""), 0);
    assert.equal(debateRevealDurationMs("Short."), 1_400);
    assert.equal(
      debateRevealDurationMs(
        Array.from({ length: 100 }, (_, index) => `word${index}`).join(" "),
      ),
      33_000,
    );
    assert.equal(
      debateRevealDurationMs(
        Array.from({ length: 1_000 }, (_, index) => `word${index}`).join(" "),
      ),
      60_000,
    );
  });

  it("formats completed proceeding runtime as a rounded active duration", () => {
    assert.equal(debateActiveDurationLabel(1_400), "~1 min active");
    assert.equal(debateActiveDurationLabel(754_000), "~13 min active");
  });

  it("maps the public floor clock onto actual speech presentation progress", () => {
    const event = {
      version: 1 as const,
      id: "timed-speech",
      sequence: 2,
      phase: "opening" as const,
      stepKey: "opening_for",
      kind: "speech" as const,
      speakerKind: "advocate" as const,
      speakerBotId: "for",
      sideId: "for" as const,
      content: "A deliberately long opening.",
      sourceIds: [],
      timing: {
        limitMs: 20_000,
        estimatedDurationMs: 25_000,
        overtimeMs: 5_000,
        status: "overtime" as const,
      },
      createdAt: "2026-07-29T00:00:00.000Z",
    };
    assert.deepEqual(
      debateTurnClockState(event, {
        elapsedMs: 4_000,
        durationMs: 5_000,
      }),
      {
        elapsedMs: 20_000,
        limitMs: 20_000,
        progress: 1,
        remainingMs: 0,
        status: "running",
        timing: event.timing,
      },
    );
    assert.equal(
      debateTurnClockState(event, {
        elapsedMs: 4_500,
        durationMs: 5_000,
      })?.status,
      "overtime",
    );
    assert.equal(
      debateTurnClockState({ ...event, timing: undefined }, null),
      null,
    );
  });

  it("keeps a setting-independent duration for every spoken line", () => {
    const event = {
      version: 1 as const,
      id: "spoken-line",
      sequence: 3,
      phase: "opening" as const,
      stepKey: "moderator_intro",
      kind: "intro" as const,
      speakerKind: "moderator" as const,
      speakerBotId: "moderator",
      sideId: null,
      content: "Short.",
      sourceIds: [],
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    assert.equal(debateEventSpokenLineDurationMs(event), 1_400);
    assert.equal(formatDebateSpokenDuration(1_400), "0:01.4");
    assert.equal(
      debateEventSpokenLineDurationMs({
        ...event,
        speakerKind: "system",
      }),
      null,
    );
    assert.equal(
      debateEventSpokenLineDurationMs({ ...event, kind: "silence" }),
      null,
    );
  });

  it("tracks one overall live Debate clock and removes explicit recesses", () => {
    const event = {
      version: 1 as const,
      id: "opening",
      sequence: 1,
      phase: "opening" as const,
      stepKey: "moderator_intro",
      kind: "intro" as const,
      speakerKind: "moderator" as const,
      speakerBotId: "moderator",
      sideId: null,
      content: "The Debate begins.",
      sourceIds: [],
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    const session = {
      status: "live" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:50.000Z",
      completedAt: null,
      events: [
        event,
        {
          ...event,
          id: "pause",
          sequence: 2,
          stepKey: "pause",
          createdAt: "2026-08-01T00:00:10.000Z",
        },
        {
          ...event,
          id: "resume",
          sequence: 3,
          stepKey: "resume",
          createdAt: "2026-08-01T00:00:30.000Z",
        },
      ],
    };
    const nowMs = Date.parse("2026-08-01T00:00:50.000Z");
    assert.equal(debateLiveElapsedDurationMs(session, nowMs), 30_000);
    assert.equal(formatDebateElapsedDuration(30_000), "0:30");
    assert.equal(formatDebateElapsedDuration(3_723_000), "1:02:03");
    assert.equal(
      debateLiveElapsedDurationMs(
        {
          ...session,
          status: "paused",
          events: session.events.slice(0, 2),
        },
        nowMs,
      ),
      10_000,
    );
    assert.equal(
      debateLiveElapsedDurationMs(
        {
          ...session,
          status: "paused",
          events: [event],
          pausedAt: "2026-08-01T00:00:10.000Z",
          pausedDurationMs: 0,
        },
        nowMs,
      ),
      10_000,
    );
    assert.equal(
      debateLiveElapsedDurationMs(
        {
          ...session,
          events: [event],
          pausedAt: null,
          pausedDurationMs: 20_000,
        },
        nowMs,
      ),
      30_000,
    );
  });

  it("keeps Debate audio independent from optional voice effects", () => {
    assert.equal(
      debateAudioEnabled({ voiceMode: "english", voiceVolume: 0.8 }),
      true,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "bottish", voiceVolume: 0.8 }),
      true,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "mute", voiceVolume: 0.8 }),
      false,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "english", voiceVolume: 0 }),
      false,
    );
    assert.equal(debateGavelAudioEnabled(0.8), true);
    assert.equal(debateGavelAudioEnabled(0), false);
  });

  it("reveals a safe public prefix without splitting source markers", () => {
    const content =
      "A complete first clause. A sourced point [[source:frozen-1]] follows.";
    assert.equal(debateVisibleContentAtProgress(content, 0), "");
    assert.equal(debateVisibleContentAtProgress(content, 1), content);
    const partial = debateVisibleContentAtProgress(content, 0.68);
    assert.equal(partial.includes("[[source:"), false);
    assert.ok(content.startsWith(partial));
  });

  it("recognizes an exact live transcript clamp", () => {
    assert.equal(
      debateTranscriptIsAtLive({
        scrollHeight: 1_000,
        scrollTop: 600,
        clientHeight: 400,
      }),
      true,
    );
    assert.equal(
      debateTranscriptIsAtLive({
        scrollHeight: 1_000,
        scrollTop: 560,
        clientHeight: 400,
      }),
      false,
    );
  });

  it("tracks turn ownership independently from speech animation", () => {
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: "for-bot",
        presenting: false,
        presentationSpeakerBotId: null,
      }),
      "for-bot",
    );
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: null,
        presenting: true,
        presentationSpeakerBotId: "moderator-bot",
      }),
      "moderator-bot",
    );
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: null,
        presenting: false,
        presentationSpeakerBotId: "stale-prose-speaker",
      }),
      null,
    );
  });

  it("turns validated source and exhibit markers into custom Markdown links", () => {
    const markdown = debateMarkdownSource(
      "**Claim.** [[source:frozen-1]] [[exhibit:exhibit-1]] [[source:invented]]",
      evidence,
    );
    assert.equal(
      markdown,
      `**Claim.** [frozen-1](${DEBATE_EVIDENCE_LINK_PREFIX}frozen-1) [exhibit-1](${DEBATE_EVIDENCE_LINK_PREFIX}exhibit-1) `,
    );
    assert.equal(
      debateSourceFromMarkdownHref(
        `${DEBATE_SOURCE_LINK_PREFIX}frozen-1`,
        evidence,
      )?.title,
      "Frozen source",
    );
    assert.equal(
      debateSourceFromMarkdownHref(
        `${DEBATE_EVIDENCE_LINK_PREFIX}invented`,
        evidence,
      ),
      null,
    );
    assert.equal(
      debateEvidenceFromMarkdownHref(
        `${DEBATE_EVIDENCE_LINK_PREFIX}exhibit-1`,
        evidence,
      )?.kind,
      "exhibit",
    );
  });

  it("derives restrained clause-level gallery reactions", () => {
    assert.equal(
      debateGalleryReaction("That point is supported. [[source:frozen-1]]"),
      "evidence",
    );
    assert.equal(
      debateGalleryReaction("I concede that premise."),
      "concession",
    );
    assert.equal(
      debateGalleryReaction("But does that answer the harm?"),
      "question",
    );
    const seats = debateGalleryReactingIndices("One clause.", 3);
    assert.ok(seats.length >= 1 && seats.length <= 2);
    assert.ok(seats.every((index) => index >= 0 && index < 7));
  });

  it("boosts advocate pace when the turn clock is late or overtime", () => {
    assert.equal(
      debateUtterancePaceBoost({
        limitMs: 10_000,
        estimatedDurationMs: 4_000,
        overtimeMs: 0,
        status: "within_limit",
      }),
      0,
    );
    assert.equal(
      debateUtterancePaceBoost({
        limitMs: 10_000,
        estimatedDurationMs: 9_000,
        overtimeMs: 0,
        status: "within_limit",
      }),
      DEBATE_UTTERANCE_PACE_BOOST,
    );
    assert.equal(
      debateUtterancePaceBoost({
        limitMs: 10_000,
        estimatedDurationMs: 4_000,
        overtimeMs: 500,
        status: "overtime",
      }),
      DEBATE_UTTERANCE_PACE_BOOST,
    );
    assert.equal(
      debateUtterancePaceBoost(
        {
          limitMs: 10_000,
          estimatedDurationMs: 4_000,
          overtimeMs: 0,
          status: "within_limit",
        },
        0.85,
      ),
      DEBATE_UTTERANCE_PACE_BOOST,
    );
  });
});
