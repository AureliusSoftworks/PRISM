import assert from "node:assert/strict";
import test from "node:test";

import { resolveDebateMysteryConfigV2 } from "./debateMysteryV2.ts";

const base = {
  version: 2 as const,
  preset: "custom" as const,
  difficulty: "casual" as const,
  artMode: "bundled" as const,
  trialType: "bench" as const,
  inspiration: "",
  nonce: "custom-room-floor",
  suspectBotIds: ["suspect-1", "suspect-2", "suspect-3", "suspect-4"],
  prosecutorBotId: "prosecutor",
  rivalDefenseBotId: "defense",
  jurorBotIds: [],
};

test("V2 setup clamps invalid custom room counts before compilation", () => {
  assert.equal(resolveDebateMysteryConfigV2({ ...base, totalRooms: 0 }).totalRooms, 5);
  assert.equal(resolveDebateMysteryConfigV2({ ...base, totalRooms: 99 }).totalRooms, 18);
  assert.equal(
    resolveDebateMysteryConfigV2({
      ...base,
      totalRooms: 5,
      suspectBotIds: [
        ...base.suspectBotIds,
        "suspect-5",
        "suspect-6",
        "suspect-7",
        "suspect-8",
      ],
    }).totalRooms,
    9,
  );
});
