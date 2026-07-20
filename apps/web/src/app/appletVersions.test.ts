import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_POWER_ECHO_MODE_POLICY,
  BOT_POWER_CANDOR_MODE_POLICY,
  BOT_POWER_HEARING_REPEAT_MODE_POLICY,
  BOT_POWER_INTERRUPTION_MODE_POLICY,
  BOT_POWER_GHOST_MODE_POLICY,
  BOT_POWER_MUTE_MODE_POLICY,
  BOT_POWER_RESPONSE_BUDGET_MODE_POLICY,
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
    assert.equal(PRISM_APPLETS.chat.version, "1.9");
    assert.equal(PRISM_APPLETS.zen.version, "1.8");
    assert.equal(PRISM_APPLETS.coffee.version, "2.2");
    assert.equal(PRISM_APPLETS.botcast.version, "1.7");
    assert.equal(PRISM_APPLETS.botcast.name, "Signal");
    assert.equal(PRISM_APPLETS.story.version, "0.6");
    assert.equal(PRISM_APPLETS.slate.version, "0.7");
    assert.equal(PRISM_APPLETS.slate.status, "preview");
    assert.equal(prismAppletVersionLabel("chat"), "v1.9");
    assert.equal(prismAppletVersionLabel("zen"), "v1.8");
    assert.equal(prismAppletVersionLabel("coffee"), "v2.2");
    assert.equal(prismAppletVersionLabel("botcast"), "v1.7");
    assert.equal(prismAppletVersionLabel("story"), "v0.6");
    assert.equal(prismAppletVersionLabel("slate"), "v0.7");
  });

  it("requires every bot-embodying future applet to enforce hard mute before activation", () => {
    assert.deepEqual(Object.keys(BOT_POWER_MUTE_MODE_POLICY), Object.keys(PRISM_APPLETS));
    for (const applet of Object.values(PRISM_APPLETS)) {
      const policy = BOT_POWER_MUTE_MODE_POLICY[applet.id];
      if (applet.status === "planned") {
        assert.equal(policy, "required_before_activation");
      } else if (applet.id !== "slate") {
        assert.equal(policy, "enforced");
      }
    }
  });

  it("requires every bot-embodying future applet to enforce addressed-speech echo before activation", () => {
    assert.deepEqual(Object.keys(BOT_POWER_ECHO_MODE_POLICY), Object.keys(PRISM_APPLETS));
    for (const applet of Object.values(PRISM_APPLETS)) {
      const policy = BOT_POWER_ECHO_MODE_POLICY[applet.id];
      if (applet.status === "planned") {
        assert.equal(policy, "required_before_activation");
      } else if (applet.id !== "slate") {
        assert.equal(policy, "enforced");
      }
    }
  });

  it("declares an exhaustive candor policy for every current and planned applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_CANDOR_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_CANDOR_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
      arena: "deferred",
      polling: "deferred",
      coffee: "direct",
      botcast: "direct",
      feed: "deferred",
      games: "deferred",
      story: "adapted",
      gym: "deferred",
      slate: "irrelevant",
      pseudo: "deferred",
      surf: "deferred",
    });
  });

  it("declares an exhaustive ghost-Power policy for every current and planned applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_GHOST_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_GHOST_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      arena: "deferred",
      polling: "deferred",
      coffee: "direct",
      botcast: "direct",
      feed: "deferred",
      games: "deferred",
      story: "adapted",
      gym: "deferred",
      slate: "irrelevant",
      pseudo: "deferred",
      surf: "deferred",
    });
  });

  it("declares how every applet applies response budgets", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_RESPONSE_BUDGET_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_RESPONSE_BUDGET_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      arena: "deferred",
      polling: "deferred",
      coffee: "adapted",
      botcast: "adapted",
      feed: "deferred",
      games: "deferred",
      story: "adapted",
      gym: "deferred",
      slate: "irrelevant",
      pseudo: "deferred",
      surf: "deferred",
    });
  });

  it("declares how every applet handles hard-of-hearing repetition and mood", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_HEARING_REPEAT_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_HEARING_REPEAT_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
      arena: "required_before_activation",
      polling: "required_before_activation",
      coffee: "enforced",
      botcast: "adapted",
      feed: "required_before_activation",
      games: "required_before_activation",
      story: "cue",
      gym: "required_before_activation",
      slate: "not_applicable",
      pseudo: "required_before_activation",
      surf: "required_before_activation",
    });
  });

  it("declares how every applet adapts live interruption Powers", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_INTERRUPTION_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_INTERRUPTION_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
      arena: "deferred",
      polling: "deferred",
      coffee: "direct",
      botcast: "adapted",
      feed: "deferred",
      games: "deferred",
      story: "adapted",
      gym: "deferred",
      slate: "irrelevant",
      pseudo: "deferred",
      surf: "deferred",
    });
  });
});
