import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryAccusationMatchesV2,
  debateMysteryClientSeatIdV2,
  debateMysteryCounselSeatsV2,
  debateMysteryDefendantSeatIdV2,
  debateMysteryTheoryAccusedSeatIdsV2,
  debateMysteryTheoryWithAccusedSeatIdsV2,
} from "./debateMysteryV2.ts";
import type { DebateMysteryTheoryV1 } from "./debateMystery.ts";

const legacyTheory: DebateMysteryTheoryV1 = {
  culpritSeatId: "suspect-1",
  accompliceSeatId: "suspect-2",
  method: "",
  motive: "",
  opportunity: "",
  evidenceIds: [],
  testimonyIds: [],
};

test("charge-agnostic accusations read legacy defendant aliases", () => {
  assert.deepEqual(
    debateMysteryTheoryAccusedSeatIdsV2(legacyTheory),
    ["suspect-1", "suspect-2"],
  );
});

test("new accusations write ordered defendants and legacy aliases together", () => {
  const theory = debateMysteryTheoryWithAccusedSeatIdsV2(
    legacyTheory,
    ["suspect-3", "suspect-4", "suspect-3"],
  );
  assert.deepEqual(theory.accusedSeatIds, ["suspect-3", "suspect-4"]);
  assert.equal(theory.culpritSeatId, "suspect-3");
  assert.equal(theory.accompliceSeatId, "suspect-4");
});

test("a legacy alias edit wins over stale explicit defendants", () => {
  assert.deepEqual(
    debateMysteryTheoryAccusedSeatIdsV2({
      ...legacyTheory,
      accusedSeatIds: ["suspect-1", "suspect-2"],
      culpritSeatId: "suspect-3",
      accompliceSeatId: null,
    }),
    ["suspect-3"],
  );
});

test("accusation correctness requires the exact responsible set in any order", () => {
  assert.equal(
    debateMysteryAccusationMatchesV2(
      ["suspect-4", "suspect-1"],
      ["suspect-1", "suspect-4"],
    ),
    true,
  );
  assert.equal(
    debateMysteryAccusationMatchesV2(["suspect-1"], ["suspect-1", "suspect-4"]),
    false,
  );
  assert.equal(
    debateMysteryAccusationMatchesV2(["suspect-1", "suspect-3"], ["suspect-1"]),
    false,
  );
});

test("counsel seat helpers keep the wire names player-relative", () => {
  const config = { prosecutorBotId: "bot-p", rivalDefenseBotId: "bot-d" };
  assert.deepEqual(debateMysteryCounselSeatsV2(config), {
    stance: "prosecution",
    playerCounselBotId: "bot-p",
    opposingCounselBotId: "bot-d",
    playerRoleLabel: "Prosecutor",
    opposingRoleLabel: "Defense Counsel",
    playerSideLabel: "Prosecution",
    opposingSideLabel: "Defense",
  });
  assert.deepEqual(debateMysteryCounselSeatsV2({ ...config, playerStance: "defense" }), {
    stance: "defense",
    playerCounselBotId: "bot-p",
    opposingCounselBotId: "bot-d",
    playerRoleLabel: "Defense Attorney",
    opposingRoleLabel: "Prosecutor",
    playerSideLabel: "Defense",
    opposingSideLabel: "Prosecution",
  });
});

test("the Defense client is the pinned defendant while prosecution tries the filed accused", () => {
  const theory = debateMysteryTheoryWithAccusedSeatIdsV2(legacyTheory, ["suspect-3"]);
  type DefendantState = Parameters<typeof debateMysteryDefendantSeatIdV2>[0];
  const prosecution = {
    config: { playerStance: "prosecution" },
    caseCharge: { defendantSeatId: "suspect-2" },
    theory,
  } as unknown as DefendantState;
  assert.equal(debateMysteryClientSeatIdV2(prosecution), null);
  assert.equal(debateMysteryDefendantSeatIdV2(prosecution), "suspect-3");
  const defense = { ...prosecution, config: { playerStance: "defense" } } as unknown as DefendantState;
  assert.equal(debateMysteryClientSeatIdV2(defense), "suspect-2");
  assert.equal(debateMysteryDefendantSeatIdV2(defense), "suspect-2");
  const unpinned = { ...defense, caseCharge: {} } as unknown as DefendantState;
  assert.equal(debateMysteryClientSeatIdV2(unpinned), null);
  assert.equal(debateMysteryDefendantSeatIdV2(unpinned), "suspect-3");
  assert.equal(debateMysteryDefendantSeatIdV2({ ...unpinned, theory: null }), null);
});
