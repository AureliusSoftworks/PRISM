import assert from "node:assert/strict";
import test from "node:test";
import { mysteryCourtPresentedRecordKeysV1, mysteryPresentedRecordKeysV1 } from "./debateMysteryPresented.ts";

const entry = (nodeId: string) => ({ nodeId }) as never;

test("marks items shown to this suspect from the action log and the Present prompts", () => {
  const keys = mysteryPresentedRecordKeysV1({
    publicActions: [
      { action: "present_to_suspect", suspectSeatId: "suspect-1", record: { kind: "evidence", id: "silver-key" } } as never,
      { action: "present_to_suspect", suspectSeatId: "suspect-2", record: { kind: "evidence", id: "frayed-thread" } } as never,
      { action: "talk", suspectSeatId: "suspect-1", topicNodeId: "talk-suspect-1-a" } as never,
    ],
    dialogueHistory: [
      entry("present-suspect-1-evidence-unknown-poison"),
      entry("present-response-suspect-1-evidence-unknown-poison"),
      entry("present-gate-suspect-1-testimony-lois-alibi"),
      entry("present-suspect-1-evidence-stained-glass-record"),
      entry("present-suspect-1-default"),
      entry("present-suspect-3-evidence-frayed-thread"),
    ],
  }, "suspect-1");
  assert.deepEqual(
    [...keys].sort(),
    ["evidence:silver-key", "evidence:stained-glass", "evidence:unknown-poison", "testimony:lois-alibi"],
  );
});

test("names no item without a suspect at hand", () => {
  assert.equal(mysteryPresentedRecordKeysV1({ publicActions: [], dialogueHistory: [entry("present-suspect-1-evidence-x")] }, null).size, 0);
});

test("marks items already put to the witness against the statement at hand", () => {
  const keys = mysteryCourtPresentedRecordKeysV1({
    publicActions: [
      { action: "object_statement", statementId: "st-2", record: { kind: "evidence", id: "silver-key" } } as never,
      { action: "present_record", statementId: "st-2", record: { kind: "testimony", id: "lois-1" } } as never,
      { action: "object_statement", statementId: "st-1", record: { kind: "evidence", id: "frayed-thread" } } as never,
    ],
  }, "st-2");
  assert.deepEqual([...keys].sort(), ["evidence:silver-key", "testimony:lois-1"]);
  assert.equal(mysteryCourtPresentedRecordKeysV1({ publicActions: [] }, null).size, 0);
});
