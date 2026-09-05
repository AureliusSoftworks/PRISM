import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_SCHEMA_VERSION,
  type BotPresenceBeatV1,
  type DebateEventV1,
} from "@localai/shared";
import { debateTranscriptTimelineEntries } from "./debateTranscriptTimeline.ts";

function event(id: string, createdAt: string): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id,
    sequence: Number(id.slice(1)),
    phase: "rebuttal",
    stepKey: "rebuttal_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "speaker",
    sideId: "for",
    content: `Speech ${id}`,
    sourceIds: [],
    createdAt,
  };
}

function beat(args: {
  id: string;
  responseId: string;
  createdAt: string;
  completion: BotPresenceBeatV1["completion"];
  heardCharacterCount: number;
}): BotPresenceBeatV1 {
  return {
    v: 1,
    id: args.id,
    surface: "debate",
    sessionId: "session",
    responseId: args.responseId,
    speaker: { botId: "speaker", name: "Georgia O'Keeffe" },
    trigger: "waiting",
    source: "default",
    text: "Let's see…",
    heardCharacterCount: args.heardCharacterCount,
    completion: args.completion,
    playbackStartedAtMs: 1,
    playbackEndedAtMs: args.completion === "playing" ? null : 2,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  };
}

describe("Debate transcript timeline", () => {
  it("keeps heard vocal cues in chronological flow instead of pinning them last", () => {
    const entries = debateTranscriptTimelineEntries({
      events: [
        event("e1", "2026-08-10T12:00:00.000Z"),
        event("e2", "2026-08-10T12:00:02.000Z"),
      ],
      presenceBeats: [
        beat({
          id: "beat-middle",
          responseId: "response-middle",
          createdAt: "2026-08-10T12:00:01.000Z",
          completion: "completed",
          heardCharacterCount: 10,
        }),
      ],
    });

    assert.deepEqual(
      entries.map((entry) => `${entry.kind}:${entry.id}`),
      ["event:e1", "vocal-cue:beat-middle", "event:e2"],
    );
  });

  it("shows a current cue but withholds unheard or not-yet-reached history", () => {
    const entries = debateTranscriptTimelineEntries({
      events: [event("e1", "2026-08-10T12:00:00.000Z")],
      presenceBeats: [
        beat({
          id: "beat-failed",
          responseId: "response-failed",
          createdAt: "2026-08-10T11:59:59.000Z",
          completion: "failed",
          heardCharacterCount: 0,
        }),
        beat({
          id: "beat-future",
          responseId: "response-future",
          createdAt: "2026-08-10T12:00:03.000Z",
          completion: "completed",
          heardCharacterCount: 10,
        }),
        beat({
          id: "beat-current",
          responseId: "response-current",
          createdAt: "2026-08-10T12:00:04.000Z",
          completion: "playing",
          heardCharacterCount: 0,
        }),
      ],
      currentResponseId: "response-current",
    });

    assert.deepEqual(
      entries.map((entry) => `${entry.kind}:${entry.id}`),
      ["event:e1", "vocal-cue:beat-current"],
    );
  });
});
