import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../debate-mystery-v2.ts", import.meta.url),
  "utf8",
);
const packageSource = readFileSync(
  new URL("../debate-mystery-whodunnit-package.ts", import.meta.url),
  "utf8",
);

test("Case Forge freezes and binds deterministic incident composition privately", () => {
  assert.match(source, /composeMysteryIncidentPlanV1\(\{/u);
  assert.match(source, /validateMysteryIncidentPlanV1\(\{/u);
  assert.match(source, /bindMysteryIncidentPlanV1\(\{/u);
  assert.match(source, /publicCharge: mysteryPublicChargeV1\(args\.incidentPlan\)/u);
  assert.match(source, /sealedResponsibleSeatIds: \[\.\.\.args\.incidentPlan\.primary\.responsibleSeatIds\]/u);
  assert.match(source, /mysteryIncidentPlanRequiresAccompliceV1\(incidentPlan\)\s*\? 1/u);
  assert.match(source, /applyMysteryIncidentPlanToFoundationV2/u);
  assert.match(source, /reachableEvidenceIndexes/u);
  assert.match(packageSource, /FORBIDDEN_PUBLIC_KEYS[\s\S]*"sealedResponsibleSeatIds"[\s\S]*"responsibleSeatIds"[\s\S]*"incidentPlan"/u);
});

test("Theory and Court consume a charge-agnostic multi-defendant filing", () => {
  assert.match(source, /debateMysteryTheoryAccusedSeatIdsV2\(request\.theory\)/u);
  assert.match(source, /Accuse at least one person before filing the charge/u);
  assert.match(source, /defendantVerdicts = accusedSeatIds\.map/u);
  assert.match(source, /accusationCorrect: debateMysteryAccusationMatchesV2/u);
  assert.match(source, /defendantSeatId,/u);
});
