import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  prismPlannedRoadmapApplets,
  prismPlayableHubApplets,
} from "./appletVersions.ts";

describe("applet version helpers", () => {
  it("keeps the hub focused on playable applets", () => {
    assert.deepEqual(
      prismPlayableHubApplets().map((applet) => applet.id),
      ["chat", "zen", "coffee", "story"]
    );
    assert.deepEqual(
      new Set(prismPlayableHubApplets().map((applet) => applet.status)),
      new Set(["active", "preview"])
    );
  });

  it("keeps planned applets out of the primary hub grid", () => {
    const plannedIds = prismPlannedRoadmapApplets().map((applet) => applet.id);

    assert.deepEqual(plannedIds, [
      "arena",
      "polling",
      "feed",
      "games",
      "gym",
      "slate",
      "pseudo",
      "surf",
    ]);
    for (const playable of prismPlayableHubApplets()) {
      assert.equal(plannedIds.includes(playable.id), false);
    }
  });
});
