import assert from "node:assert/strict";
import test from "node:test";
import type { DebateMysteryActionRequestV2, DebateWhodunnitFormatStateV2 } from "@localai/shared";
import { mysteryPublicActionV1 } from "../debate-mystery-public-action.ts";

test("public action ledger retains accepted outcomes without copying request or private metadata", () => {
  const before = {
    playPhase: "investigation", roomView: "room", currentRoomId: "study", rooms: [{ id: "study", visited: true, hotspots: [{ id: "desk", examined: false }] }],
    record: [], caseKit: [], dialogueHistory: [{ visibleText: "Earlier public line" }],
  } as unknown as DebateWhodunnitFormatStateV2;
  const after = {
    ...before,
    rooms: [{ id: "study", visited: true, hotspots: [{ id: "desk", examined: true }] }],
    record: [{ admitted: true, reference: { kind: "evidence", id: "public-letter" } }, { admitted: false, reference: { kind: "evidence", id: "hidden-letter" } }],
    caseKit: [{ id: "public-key" }],
    dialogueHistory: [...before.dialogueHistory, { visibleText: "Accepted examination" }],
    privateCase: "PRIVATE-CASE",
  } as unknown as DebateWhodunnitFormatStateV2;
  const request = {
    action: "examine", roomId: "study", hotspotId: "desk", privatePrompt: "PRIVATE-PROMPT", privateCase: "PRIVATE-REQUEST",
  } as unknown as DebateMysteryActionRequestV2;
  const result = mysteryPublicActionV1({ id: "event-id", occurredAt: "2026-09-03T00:00:00Z", revision: 4, request, before, after });
  assert.equal(result.id, "event-id");
  assert.equal(result.roomId, "study");
  assert.equal(result.hotspotId, "desk");
  assert.equal(result.roomViewAfter, "room");
  assert.deepEqual(result.dialogueIndexes, [1]);
  assert.deepEqual(result.admittedRecords, [{ kind: "evidence", id: "public-letter" }]);
  assert.deepEqual(result.acquiredItemIds, ["public-key"]);
  assert.equal(result.revisionAfter, 5);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|hidden-letter|privatePrompt|privateCase/);

  const injectedCheck = mysteryPublicActionV1({
    id: "check", occurredAt: "2026-09-03T00:00:01Z", revision: 5, before, after,
    request: {
      action: "check_case", roomId: "PRIVATE-ROOM", hotspotId: "PRIVATE-HOTSPOT",
      suspectSeatId: "PRIVATE-SEAT", topicNodeId: "PRIVATE-TOPIC", statementId: "PRIVATE-STATEMENT",
      record: { kind: "evidence", id: "hidden-letter" },
    } as unknown as DebateMysteryActionRequestV2,
  });
  assert.equal(injectedCheck.roomId, "study", "retains only the actual public room context");
  assert.equal(injectedCheck.record, undefined);
  assert.doesNotMatch(JSON.stringify(injectedCheck), /PRIVATE|hidden-letter/);
});
