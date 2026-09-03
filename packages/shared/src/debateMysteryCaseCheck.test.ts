import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryAccusationMatchesV2,
  normalizeDebateMysteryFiledTheoryV2,
  type DebateWhodunnitFormatStateV2,
} from "./debateMysteryV2.ts";

const state = {
  config: { playerRole: "participant" },
  suspects: [{ seatId: "a" }, { seatId: "b" }, { seatId: "c" }],
  caseCharge: { incidentId: "public-incident", accusationPrompt: "Who took it?" },
  record: [
    { admitted: true, reference: { kind: "evidence", id: "e" } },
    { admitted: true, reference: { kind: "testimony", id: "t" } },
    { admitted: false, reference: { kind: "evidence", id: "sealed" } },
  ],
} as unknown as DebateWhodunnitFormatStateV2;

test("case check compares the entire accused set independent of order and duplicates", () => {
  assert.equal(debateMysteryAccusationMatchesV2(["a"], ["a"]), true);
  assert.equal(debateMysteryAccusationMatchesV2(["b"], ["a"]), false);
  assert.equal(debateMysteryAccusationMatchesV2(["b", "a", "a"], ["a", "b"]), true);
  assert.equal(debateMysteryAccusationMatchesV2(["a"], ["a", "b"]), false);
  assert.equal(debateMysteryAccusationMatchesV2(["a", "c"], ["a", "b"]), false);
});

test("both filing paths whitelist theory fields and admitted kind-specific references", () => {
  const normalized = normalizeDebateMysteryFiledTheoryV2({
    accusedSeatIds: ["a", "b"], method: "  A method  ", motive: "", opportunity: "",
    evidenceIds: ["e", "e", "t", "sealed", "unknown"], testimonyIds: ["t", "e"],
    incidentId: "forged", privateCase: "secret", hiddenPrompt: "secret",
  }, state);
  assert.deepEqual(normalized.accusedSeatIds, ["a", "b"]);
  assert.deepEqual(normalized.evidenceIds, ["e"]);
  assert.deepEqual(normalized.testimonyIds, ["t"]);
  assert.equal(normalized.incidentId, "public-incident");
  assert.equal(normalized.method, "A method");
  assert.doesNotMatch(JSON.stringify(normalized), /secret|sealed|forged|hiddenPrompt|privateCase/);
  const legacy = normalizeDebateMysteryFiledTheoryV2({ culpritSeatId: "a", evidenceIds: null }, state);
  assert.deepEqual(legacy.accusedSeatIds, ["a"]);
  assert.deepEqual(legacy.evidenceIds, []);
  assert.throws(() => normalizeDebateMysteryFiledTheoryV2(null, state), /theory/i);
  for (const accusedSeatIds of [[], ["unknown"], ["a", "unknown"], ["a", "b", "c"]]) {
    assert.throws(() => normalizeDebateMysteryFiledTheoryV2({ accusedSeatIds }, state), /one or two/);
  }
  assert.deepEqual(normalizeDebateMysteryFiledTheoryV2({ culpritSeatId: "a", testimonyIds: ["t"] },
    { ...state, config: { ...state.config, playerRole: "spectator" } }).testimonyIds, []);
});
