import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_POWER_ADDRESSED_FANDOM_MODE_POLICY,
  BOT_POWER_AVATAR_SCALE_MODE_POLICY,
  BOT_POWER_AVATAR_VISIBILITY_MODE_POLICY,
  BOT_POWER_CANDOR_MODE_POLICY,
  BOT_POWER_DESIGNATION_MODE_POLICY,
  BOT_POWER_ETERNAL_INTRODUCTION_MODE_POLICY,
  BOT_POWER_HEARING_REPEAT_MODE_POLICY,
  BOT_POWER_IDENTITY_MIRROR_MODE_POLICY,
  BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY,
  BOT_POWER_INTERRUPTION_MODE_POLICY,
  BOT_POWER_GHOST_MODE_POLICY,
  BOT_POWER_MUTE_MODE_POLICY,
  BOT_POWER_MOOD_BOOST_MODE_POLICY,
  BOT_POWER_MOOD_DRAIN_MODE_POLICY,
  BOT_POWER_THEME_COMPOUND_MODE_POLICY,
  BOT_POWER_RESPONSE_BUDGET_MODE_POLICY,
  BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY,
  BOT_POWER_SPECTRAL_PERCEPTION_MODE_POLICY,
  BOT_POWER_VOICE_PRESENCE_MODE_POLICY,
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
      "story",
      "gym",
      "pseudo",
      "surf",
    ]);
    assert.equal(switcherIds.includes("zen"), false);
    assert.equal(switcherIds.includes("story"), false);
    assert.equal(switcherIds.some((id) => plannedIds.includes(id)), false);
  });

  it("tracks the current visual applet versions for release provenance", () => {
    assert.equal(PRISM_APPLETS.chat.version, "1.29");
    assert.equal(PRISM_APPLETS.zen.version, "1.28");
    assert.equal(PRISM_APPLETS.coffee.version, "2.28");
    assert.equal(PRISM_APPLETS.botcast.version, "1.54");
    assert.equal(PRISM_APPLETS.botcast.name, "Signal");
    assert.equal(PRISM_APPLETS.story.version, "0.26");
    assert.equal(PRISM_APPLETS.story.status, "planned");
    assert.equal(PRISM_APPLETS.slate.version, "0.7");
    assert.equal(PRISM_APPLETS.slate.status, "preview");
    assert.equal(prismAppletVersionLabel("chat"), "v1.29");
    assert.equal(prismAppletVersionLabel("zen"), "v1.28");
    assert.equal(prismAppletVersionLabel("coffee"), "v2.28");
    assert.equal(prismAppletVersionLabel("botcast"), "v1.54");
    assert.equal(prismAppletVersionLabel("story"), "v0.26");
    assert.equal(prismAppletVersionLabel("slate"), "v0.7");
  });

  it("declares holder-scoped bot-naming support for every applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_DESIGNATION_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_DESIGNATION_MODE_POLICY, {
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

  it("declares participant and observer perception for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_SPECTRAL_PERCEPTION_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_SPECTRAL_PERCEPTION_MODE_POLICY, {
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

  it("declares current-speaker short-term amnesia support for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_ETERNAL_INTRODUCTION_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_ETERNAL_INTRODUCTION_MODE_POLICY, {
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

  it("declares addressed mood-boost behavior for every current and planned applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_MOOD_BOOST_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_MOOD_BOOST_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
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

  it("declares direct-addresser mood-drain behavior for every applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_MOOD_DRAIN_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_MOOD_DRAIN_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
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

  it("declares resolved-theme compound behavior for every applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_THEME_COMPOUND_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_THEME_COMPOUND_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
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

  it("declares an exhaustive current-addressee fandom policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_ADDRESSED_FANDOM_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_ADDRESSED_FANDOM_MODE_POLICY, {
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

  it("declares an exhaustive avatar-visibility Power policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_AVATAR_VISIBILITY_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_AVATAR_VISIBILITY_MODE_POLICY, {
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

  it("declares an exhaustive avatar-size Power policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_AVATAR_SCALE_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_AVATAR_SCALE_MODE_POLICY, {
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

  it("declares an exhaustive loud/quiet presentation policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_VOICE_PRESENCE_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_VOICE_PRESENCE_MODE_POLICY, {
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

  it("declares an exhaustive speech-obfuscation policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
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

  it("declares an exhaustive intermittent-mute mood policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY, {
      chat: "enforced",
      zen: "enforced",
      arena: "required_before_activation",
      polling: "required_before_activation",
      coffee: "enforced",
      botcast: "enforced",
      feed: "required_before_activation",
      games: "required_before_activation",
      story: "adapted",
      gym: "required_before_activation",
      slate: "not_applicable",
      pseudo: "required_before_activation",
      surf: "required_before_activation",
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

  it("exhaustively limits identity mirroring to bot-to-bot participant routing", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_IDENTITY_MIRROR_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_IDENTITY_MIRROR_MODE_POLICY, {
      chat: "irrelevant",
      zen: "irrelevant",
      arena: "deferred",
      polling: "deferred",
      coffee: "direct",
      botcast: "direct",
      feed: "deferred",
      games: "deferred",
      story: "cue",
      gym: "deferred",
      slate: "irrelevant",
      pseudo: "deferred",
      surf: "deferred",
    });
  });
});
