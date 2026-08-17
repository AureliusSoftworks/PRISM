import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import {
  debateArchivedJuryRecordIsCopyable,
  debateEventIsJuryComment,
  debateHeardJuryCommentEvents,
  debateJuryCommentEvents,
  debateLatestPendingJuryComment,
  formatDebateJuryRecord,
} from "./debateJuryRecord.ts";

const sidebarComment = {
  version: 1,
  id: "jury-thought-1",
  sequence: 3,
  phase: "opening",
  stepKey: "jury_sidebar_2",
  kind: "jury_deliberation",
  speakerKind: "juror",
  speakerBotId: "juror-1",
  sideId: null,
  content: "That evidence changes the shape of the claim.",
  sourceIds: [],
  createdAt: "2026-07-30T01:02:03.000Z",
} as DebateEventV1;

const formalComment = {
  ...sidebarComment,
  id: "jury-formal-1",
  sequence: 7,
  stepKey: "jury_deliberation_0",
  content: "I still find the defense more coherent.",
} as DebateEventV1;

const publicSpeech = {
  ...sidebarComment,
  id: "speech-1",
  sequence: 2,
  stepKey: "opening_for",
  kind: "speech",
  speakerKind: "advocate",
  speakerBotId: "for",
} as DebateEventV1;

function session(overrides: Partial<DebateSessionV1> = {}): DebateSessionV1 {
  return {
    id: "debate-1",
    playerRole: "spectator",
    motion: {
      motion: "Resolved: the claim stands.",
      forSide: { label: "For", brief: "" },
      againstSide: { label: "Against", brief: "" },
    },
    jury: {
      enabled: true,
      phase: "waiting",
      jurors: [{ id: "juror-1", name: "Avery" }],
    },
    events: [publicSpeech, sidebarComment, formalComment],
    evidence: {
      version: 1,
      notes: "",
      frozenAt: null,
      sources: [],
      exhibits: [
        {
          id: "exhibit-4",
          adjective: "stretchy",
          object: "mozzarella",
          title: "Stretchy string of melted mozzarella",
          observation: "Still warm.",
          emoji: "🧀",
          visualKind: "emoji",
          imageId: null,
          createdBy: "prism",
        },
      ],
    },
    ...overrides,
  } as DebateSessionV1;
}

describe("Debate Jury record", () => {
  it("keeps completed Judge and Spectator Jury records copyable from the archive", () => {
    assert.equal(
      debateArchivedJuryRecordIsCopyable({
        status: "completed",
        juryEnabled: true,
        playerRole: "judge",
      }),
      true,
    );
    assert.equal(
      debateArchivedJuryRecordIsCopyable({
        status: "completed",
        juryEnabled: true,
        playerRole: "spectator",
      }),
      true,
    );
    assert.equal(
      debateArchivedJuryRecordIsCopyable({
        status: "completed",
        juryEnabled: true,
        playerRole: "participant",
      }),
      false,
    );
    assert.equal(
      debateArchivedJuryRecordIsCopyable({
        status: "live",
        juryEnabled: true,
        playerRole: "judge",
      }),
      false,
    );
    assert.equal(
      debateArchivedJuryRecordIsCopyable({
        status: "completed",
        juryEnabled: false,
        playerRole: "judge",
      }),
      false,
    );
  });

  it("separates juror comments from public-floor events", () => {
    assert.equal(debateEventIsJuryComment(sidebarComment), true);
    assert.equal(debateEventIsJuryComment(publicSpeech), false);
    assert.deepEqual(
      debateJuryCommentEvents(session()).map((event) => event.id),
      ["jury-thought-1", "jury-formal-1"],
    );
  });

  it("only lists Jury comments the player has already heard", () => {
    const current = session();
    assert.deepEqual(debateHeardJuryCommentEvents(current, null), []);
    assert.deepEqual(
      debateHeardJuryCommentEvents(current, 3).map((event) => event.id),
      ["jury-thought-1"],
    );
    assert.deepEqual(
      debateHeardJuryCommentEvents(current, 7).map((event) => event.id),
      ["jury-thought-1", "jury-formal-1"],
    );
    assert.deepEqual(
      debateHeardJuryCommentEvents(current, null, { revealAll: true }).map(
        (event) => event.id,
      ),
      ["jury-thought-1", "jury-formal-1"],
    );
  });

  it("offers only the latest unplayed between-turn thought", () => {
    const current = session({ events: [sidebarComment] });
    assert.equal(
      debateLatestPendingJuryComment(current, new Set())?.id,
      "jury-thought-1",
    );
    assert.equal(
      debateLatestPendingJuryComment(current, new Set(["jury-thought-1"])),
      null,
    );
    assert.equal(
      debateLatestPendingJuryComment(
        session({ playerRole: "participant", events: [sidebarComment] }),
        new Set(),
      ),
      null,
    );
  });

  it("formats a separate timestamped record without public speech", () => {
    const record = formatDebateJuryRecord(session());
    assert.match(record, /# PRISM Debate — Jury Record/u);
    assert.match(
      record,
      /\[2026-07-30T01:02:03\.000Z\] Avery · Between-turn thought/u,
    );
    assert.match(record, /Avery · Jury deliberation/u);
    assert.doesNotMatch(record, /speech-1/u);
    assert.equal(
      formatDebateJuryRecord(session({ playerRole: "participant" })),
      "Jury record sealed for participants.",
    );
  });

  it("resolves exhibit markers to titles in the Jury record", () => {
    const record = formatDebateJuryRecord(
      session({
        events: [
          {
            ...sidebarComment,
            content:
              "Sol clarified that [[exhibit:exhibit-4]] really does support browning.",
          } as DebateEventV1,
        ],
      }),
    );
    assert.match(record, /stretchy string of melted mozzarella/u);
    assert.doesNotMatch(record, /\[\[exhibit:exhibit-4\]\]/u);
  });
});
