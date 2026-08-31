import assert from "node:assert/strict";
import test from "node:test";

import {
  debateMysteryCaseFileObservationsV2,
  debateMysteryNewCaseFileUpdateV2,
  debateMysteryNewAcquisitionV2,
} from "./debateMysteryCaseFile.ts";

test("projects only publicly consequential Examine dialogue into room-attributed Case File observations", () => {
  assert.deepEqual(debateMysteryCaseFileObservationsV2({
    rooms: [
      { id: "room-1", name: "Foyer" },
      { id: "room-1-east", name: "East Hall" },
    ],
    dialogueHistory: [{
      nodeId: "examine-room-1-east-console-detail",
      lineId: null,
      delivery: "text_only",
      visibleText: "  A brass key bears the code 4-1-9.  ",
      speakerSeatId: null,
      speakerBotId: null,
      speakerKind: "player",
      caseFileRelevant: true,
      occurredAt: "2026-08-30T22:00:00.000Z",
    }, {
      nodeId: "examine-room-1-east-curtain",
      lineId: null,
      delivery: "text_only",
      visibleText: "The velvet is dusty but otherwise unremarkable.",
      speakerSeatId: null,
      speakerBotId: null,
      speakerKind: "player",
      caseFileRelevant: false,
      occurredAt: "2026-08-30T22:00:30.000Z",
    }, {
      nodeId: "talk-suspect-1-alibi",
      lineId: "line-talk",
      visibleText: "I was elsewhere.",
      speakerSeatId: "suspect-1",
      speakerBotId: "bot-1",
      speakerKind: "bot",
      occurredAt: "2026-08-30T22:01:00.000Z",
    }],
  }), [{
    id: "examine-room-1-east-console-detail:2026-08-30T22:00:00.000Z",
    occurredAt: "2026-08-30T22:00:00.000Z",
    roomId: "room-1-east",
    roomName: "East Hall",
    text: "A brass key bears the code 4-1-9.",
  }]);
});

test("does not create an Observation Log update for an ambient Examine result", () => {
  const observation = {
    nodeId: "examine-foyer-console",
    lineId: null,
    delivery: "text_only" as const,
    visibleText: "A brass key bears the code 4-1-9.",
    speakerSeatId: null,
    speakerBotId: null,
    speakerKind: "player" as const,
    occurredAt: "2026-08-30T22:00:00.000Z",
  };
  assert.deepEqual(debateMysteryNewCaseFileUpdateV2({
    previousDialogueHistory: [],
    previousCaseKit: [],
    previousRecord: [],
    nextDialogueHistory: [observation],
    nextCaseKit: [],
    nextRecord: [],
    rooms: [{ id: "foyer", name: "Foyer" }],
  }), null);
});

test("creates an Observation Log update when public hotspot metadata marks the consequence", () => {
  const observation = {
    nodeId: "examine-foyer-console",
    lineId: null,
    delivery: "text_only" as const,
    visibleText: "A brass key bears the code 4-1-9.",
    speakerSeatId: null,
    speakerBotId: null,
    speakerKind: "player" as const,
    caseFileRelevant: true,
    occurredAt: "2026-08-30T22:00:00.000Z",
  };
  assert.deepEqual(debateMysteryNewCaseFileUpdateV2({
    previousDialogueHistory: [],
    previousCaseKit: [],
    previousRecord: [],
    nextDialogueHistory: [observation],
    nextCaseKit: [],
    nextRecord: [],
    rooms: [{ id: "foyer", name: "Foyer" }],
  }), {
    kind: "observation",
    observation: {
      id: "examine-foyer-console:2026-08-30T22:00:00.000Z",
      occurredAt: "2026-08-30T22:00:00.000Z",
      roomId: "foyer",
      roomName: "Foyer",
      text: "A brass key bears the code 4-1-9.",
    },
  });
});

test("prioritizes a newly acquired Case Kit item, then newly admitted evidence", () => {
  const key = {
    id: "access-key",
    title: "Brass key",
    description: "A numbered tag hangs from its bow.",
    emoji: "🗝️",
    kind: "key" as const,
    usable: true,
    locked: false,
    sourceRoomId: "foyer",
    acquiredAt: "2026-08-30T22:00:00.000Z",
  };
  const evidence = {
    reference: { kind: "evidence" as const, id: "evidence-1" },
    title: "Numbered tag",
    description: "The written sequence is preserved.",
    emoji: "🏷️",
    admitted: true,
    updatedAt: "2026-08-30T22:00:00.000Z",
  };
  assert.deepEqual(debateMysteryNewAcquisitionV2({
    previousCaseKit: [],
    previousRecord: [],
    nextCaseKit: [key],
    nextRecord: [evidence],
  }), { kind: "case_kit", item: key });
  assert.deepEqual(debateMysteryNewAcquisitionV2({
    previousCaseKit: [key],
    previousRecord: [],
    nextCaseKit: [key],
    nextRecord: [evidence],
  }), { kind: "record", item: evidence });
});
