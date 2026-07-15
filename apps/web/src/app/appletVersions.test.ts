import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_APPLETS,
  prismAppletVersionLabel,
  prismPlannedRoadmapApplets,
  prismTopLevelSwitcherApplets,
} from "./appletVersions.ts";

describe("applet version helpers", () => {
  it("keeps the app switcher focused on usable top-level applets", () => {
    assert.deepEqual(
      prismTopLevelSwitcherApplets().map((applet) => applet.id),
      ["chat", "coffee", "botcast", "slate"]
    );
    assert.deepEqual(
      new Set(prismTopLevelSwitcherApplets().map((applet) => applet.status)),
      new Set(["active", "preview"])
    );
  });

  it("keeps planned applets and non-switcher previews out of release navigation", () => {
    const plannedIds = prismPlannedRoadmapApplets().map((applet) => applet.id);
    const switcherIds = prismTopLevelSwitcherApplets().map((applet) => applet.id);

    assert.deepEqual(plannedIds, [
      "arena",
      "polling",
      "feed",
      "games",
      "gym",
      "pseudo",
      "surf",
    ]);
    assert.equal(switcherIds.includes("zen"), false);
    assert.equal(switcherIds.includes("story"), false);
    assert.equal(switcherIds.some((id) => plannedIds.includes(id)), false);
  });

  it("tracks the current visual applet versions for release provenance", () => {
    assert.equal(PRISM_APPLETS.chat.version, "1.2");
    assert.equal(PRISM_APPLETS.zen.version, "1.1");
    assert.equal(PRISM_APPLETS.coffee.version, "1.3");
    assert.equal(PRISM_APPLETS.botcast.version, "2.0");
    assert.equal(PRISM_APPLETS.botcast.name, "Signal");
    assert.equal(PRISM_APPLETS.slate.version, "0.3");
    assert.equal(PRISM_APPLETS.slate.status, "preview");
    assert.equal(prismAppletVersionLabel("chat"), "v1.2");
    assert.equal(prismAppletVersionLabel("zen"), "v1.1");
    assert.equal(prismAppletVersionLabel("coffee"), "v1.3");
    assert.equal(prismAppletVersionLabel("botcast"), "v2.0");
    assert.equal(prismAppletVersionLabel("slate"), "v0.3");
  });
});
