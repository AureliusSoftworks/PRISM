import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_APPLETS,
  prismAppletVersionLabel,
  prismPlannedRoadmapApplets,
  prismTopLevelSwitcherApplets,
} from "./appletVersions.ts";

describe("applet version helpers", () => {
  it("keeps the app switcher focused on active top-level applets", () => {
    assert.deepEqual(
      prismTopLevelSwitcherApplets().map((applet) => applet.id),
      ["chat", "coffee"]
    );
    assert.deepEqual(
      new Set(prismTopLevelSwitcherApplets().map((applet) => applet.status)),
      new Set(["active"])
    );
  });

  it("keeps planned and preview applets out of release navigation", () => {
    const plannedIds = prismPlannedRoadmapApplets().map((applet) => applet.id);
    const switcherIds = prismTopLevelSwitcherApplets().map((applet) => applet.id);

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
    assert.equal(switcherIds.includes("zen"), false);
    assert.equal(switcherIds.includes("story"), false);
    assert.equal(switcherIds.some((id) => plannedIds.includes(id)), false);
  });

  it("tracks the current visual applet versions for release provenance", () => {
    assert.equal(PRISM_APPLETS.chat.version, "0.8");
    assert.equal(PRISM_APPLETS.zen.version, "0.7");
    assert.equal(PRISM_APPLETS.coffee.version, "0.9");
    assert.equal(prismAppletVersionLabel("chat"), "v0.8");
    assert.equal(prismAppletVersionLabel("zen"), "v0.7");
    assert.equal(prismAppletVersionLabel("coffee"), "v0.9");
  });
});
