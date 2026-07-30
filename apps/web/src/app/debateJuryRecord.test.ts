import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import {
  debateArchivedJuryRecordIsCopyable,
  debateEventIsJuryComment,
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
});
