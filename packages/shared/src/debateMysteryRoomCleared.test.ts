import assert from "node:assert/strict";
import test from "node:test";

import {
  debateMysteryNodeCarriesCaseOutcomeV2,
  debateMysteryRoomClearedV2,
} from "./debateMysteryV2.ts";

const mutations = (overrides: Partial<{ discoverIds: string[]; unlockTopicIds: string[]; admitRecordIds: string[]; acquireItemIds: string[] }> = {}) => ({
  discoverIds: [], unlockTopicIds: [], admitRecordIds: [], choices: [], ...overrides,
});

test("only nodes that change the case carry an outcome", () => {
  assert.equal(debateMysteryNodeCarriesCaseOutcomeV2({ mutations: mutations() }), false);
  assert.equal(debateMysteryNodeCarriesCaseOutcomeV2({ mutations: mutations({ admitRecordIds: ["evidence:key"] }) }), true);
  assert.equal(debateMysteryNodeCarriesCaseOutcomeV2({ mutations: mutations({ discoverIds: ["d1"] }) }), true);
  assert.equal(debateMysteryNodeCarriesCaseOutcomeV2({ mutations: mutations({ unlockTopicIds: ["t1"] }) }), true);
  assert.equal(debateMysteryNodeCarriesCaseOutcomeV2({ mutations: mutations({ acquireItemIds: ["kit1"] }) }), true);
});

test("a room clears once its clue-bearing points are examined, whatever else remains", () => {
  const clueIds = new Set(["safe", "letter"]);
  const hotspots = [
    { id: "safe", examined: true },
    { id: "letter", examined: false },
    { id: "vase", examined: false },
  ];
  assert.equal(debateMysteryRoomClearedV2({ hotspots, clueHotspotIds: clueIds }), false);
  assert.equal(
    debateMysteryRoomClearedV2({ hotspots: hotspots.map((h) => h.id === "letter" ? { ...h, examined: true } : h), clueHotspotIds: clueIds }),
    true,
    "the vase never needs a click",
  );
});

test("a room with no clue-bearing points clears after one look, and an empty room is trivially clear", () => {
  const none = new Set<string>();
  assert.equal(debateMysteryRoomClearedV2({ hotspots: [{ id: "vase", examined: false }], clueHotspotIds: none }), false);
  assert.equal(debateMysteryRoomClearedV2({ hotspots: [{ id: "vase", examined: true }, { id: "rug", examined: false }], clueHotspotIds: none }), true);
  assert.equal(debateMysteryRoomClearedV2({ hotspots: [], clueHotspotIds: none }), true);
});
