import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_POWER_ADDRESSED_FANDOM_MODE_POLICY,
  BOT_POWER_ANNOYANCE_MODE_POLICY,
  BOT_POWER_AVATAR_SCALE_MODE_POLICY,
  BOT_POWER_AVATAR_COLOR_CYCLE_MODE_POLICY,
  BOT_POWER_AVATAR_VISIBILITY_MODE_POLICY,
  BOT_POWER_CANDOR_MODE_POLICY,
  BOT_POWER_DESIGNATION_MODE_POLICY,
  BOT_POWER_ETERNAL_INTRODUCTION_MODE_POLICY,
  BOT_POWER_HEARING_REPEAT_MODE_POLICY,
  BOT_POWER_IDENTITY_MIRROR_MODE_POLICY,
  BOT_POWER_IDENTITY_SHAPESHIFT_MODE_POLICY,
  BOT_POWER_IMMUNITY_MODE_POLICY,
  BOT_POWER_INEPTITUDE_MODE_POLICY,
  BOT_POWER_FALSE_NAME_MODE_POLICY,
  BOT_POWER_INTERMITTENT_MUTE_MODE_POLICY,
  BOT_POWER_INTERMITTENT_AUDIBILITY_MODE_POLICY,
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
      ["chat", "zen", "coffee", "debate", "botcast", "slate"]
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
      "polling",
      "feed",
      "games",
      "story",
      "gym",
      "pseudo",
      "surf",
    ]);
    assert.equal(switcherIds.includes("zen"), true);
    assert.equal(switcherIds.includes("story"), false);
    assert.equal(switcherIds.some((id) => plannedIds.includes(id)), false);
  });

  it("tracks the current visual applet versions for release provenance", () => {
    assert.equal(PRISM_APPLETS.chat.version, "1.37");
    assert.equal(PRISM_APPLETS.zen.version, "1.36");
    assert.equal(PRISM_APPLETS.coffee.version, "2.46");
    assert.equal(PRISM_APPLETS.debate.version, "0.19");
    assert.equal(PRISM_APPLETS.debate.status, "preview");
    assert.equal(PRISM_APPLETS.botcast.version, "1.57");
    assert.equal(PRISM_APPLETS.botcast.name, "Signal");
    assert.equal(PRISM_APPLETS.story.version, "0.31");
    assert.equal(PRISM_APPLETS.story.status, "planned");
    assert.equal(PRISM_APPLETS.slate.version, "0.9");
    assert.equal(PRISM_APPLETS.slate.status, "preview");
    assert.equal(prismAppletVersionLabel("chat"), "v1.37");
    assert.equal(prismAppletVersionLabel("zen"), "v1.36");
    assert.equal(prismAppletVersionLabel("coffee"), "v2.46");
    assert.equal(prismAppletVersionLabel("debate"), "v0.19");
    assert.equal(prismAppletVersionLabel("botcast"), "v1.57");
    assert.equal(prismAppletVersionLabel("story"), "v0.31");
    assert.equal(prismAppletVersionLabel("slate"), "v0.9");
  });

  it("declares holder-scoped bot-naming support for every applet", () => {
    assert.deepEqual(Object.keys(BOT_POWER_DESIGNATION_MODE_POLICY), Object.keys(PRISM_APPLETS));
    assert.deepEqual(BOT_POWER_DESIGNATION_MODE_POLICY, {
      chat: "cue",
      zen: "cue",
      debate: "direct",
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
      debate: "direct",
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

  it("declares holder-only Power immunity for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_IMMUNITY_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_IMMUNITY_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "direct",
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

  it("declares Inept role failure for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_INEPTITUDE_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_INEPTITUDE_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "adapted",
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

  it("declares holder avatar color cycling for every current and planned applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_AVATAR_COLOR_CYCLE_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_AVATAR_COLOR_CYCLE_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "direct",
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
      debate: "adapted",
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

  it("requires future applets to implement hard mute without making bots ineligible", () => {
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
      debate: "adapted",
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
      debate: "adapted",
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
      debate: "adapted",
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
      debate: "direct",
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
      debate: "adapted",
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
      debate: "direct",
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
      debate: "direct",
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
      debate: "direct",
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
      debate: "direct",
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

  it("limits Quiet hearing and Loud annoyance to applets with bot listeners", () => {
    for (const policy of [
      BOT_POWER_INTERMITTENT_AUDIBILITY_MODE_POLICY,
      BOT_POWER_ANNOYANCE_MODE_POLICY,
    ]) {
      assert.deepEqual(Object.keys(policy), Object.keys(PRISM_APPLETS));
      assert.equal(policy.chat, "irrelevant");
      assert.equal(policy.zen, "irrelevant");
      assert.equal(policy.coffee, "direct");
      assert.equal(policy.botcast, "direct");
      assert.equal(policy.story, "adapted");
      assert.equal(policy.slate, "irrelevant");
      for (const applet of prismPlannedRoadmapApplets()) {
        if (applet.id === "story") continue;
        assert.equal(policy[applet.id], "deferred");
      }
    }
  });

  it("declares an exhaustive speech-obfuscation policy for every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_SPEECH_OBFUSCATION_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "direct",
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
      debate: "enforced",
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
      debate: "adapted",
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
      debate: "enforced",
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
      debate: "adapted",
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
      debate: "direct",
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

  it("covers Library/Marketplace shapeshift across every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_IDENTITY_SHAPESHIFT_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_IDENTITY_SHAPESHIFT_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "direct",
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

  it("covers John/Jane Doe false names across every applet", () => {
    assert.deepEqual(
      Object.keys(BOT_POWER_FALSE_NAME_MODE_POLICY),
      Object.keys(PRISM_APPLETS),
    );
    assert.deepEqual(BOT_POWER_FALSE_NAME_MODE_POLICY, {
      chat: "direct",
      zen: "direct",
      debate: "direct",
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
});
