import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  coffeeAvatarPresentation,
  debateAvatarPresentation,
  debateForumModeratorUsesMini,
  signalAvatarPresentation,
} from "./sessionAvatarPresentationPolicy.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);

describe("session avatar presentation policy", () => {
  it("marks wide, left, and right as compact Moderator shots", () => {
    assert.equal(debateForumModeratorUsesMini("wide"), true);
    assert.equal(debateForumModeratorUsesMini("left"), true);
    assert.equal(debateForumModeratorUsesMini("right"), true);
    assert.equal(debateForumModeratorUsesMini("moderator"), false);
    assert.equal(debateForumModeratorUsesMini("jury"), false);
  });

  it("keeps authored Coffee and Signal mannequins live and in replay", () => {
    assert.equal(signalAvatarPresentation({ live: true }), "full");
    assert.equal(signalAvatarPresentation({ live: false }), "full");
    assert.equal(coffeeAvatarPresentation({ live: true }), "full");
    assert.equal(coffeeAvatarPresentation({ live: false }), "full");
  });

  it("uses the mini Moderator in wide, left, and right, and keeps the close-up full", () => {
    for (const cameraView of ["wide", "left", "right"] as const) {
      assert.equal(
        debateAvatarPresentation({
          consumer: "forum",
          role: "moderator",
          cameraView,
        }),
        "mini",
      );
    }
    for (const cameraView of ["moderator", "jury"] as const) {
      assert.equal(
        debateAvatarPresentation({
          consumer: "forum",
          role: "moderator",
          cameraView,
        }),
        "full",
      );
    }
    for (const role of ["for", "against"] as const) {
      for (const cameraView of [
        "wide",
        "left",
        "moderator",
        "right",
        "jury",
      ] as const) {
        assert.equal(
          debateAvatarPresentation({ consumer: "forum", role, cameraView }),
          "full",
        );
      }
    }
    // Jurors sit at the chamber table as full mannequins; the seat geometry
    // (306x408 boxes, tabletop occluding lower frames) is authored for the
    // complete body, not the gallery ring plate.
    assert.equal(
      debateAvatarPresentation({
        consumer: "jury",
        role: "for",
        cameraView: "jury",
      }),
      "full",
    );
    assert.equal(
      debateAvatarPresentation({
        consumer: "gallery",
        role: "against",
        cameraView: "wide",
      }),
      "mini",
    );
  });

  it("keeps authored Coffee and Signal bodies while shedding only peripheral live effects", () => {
    assert.match(
      signalSource,
      /signalAvatarPresentation\(\{[\s\S]{0,100}live: !args\.replay/u,
    );
    assert.match(
      pageSource,
      /coffeeAvatarPresentation\(\{[\s\S]{0,100}live: conversationActive && !coffeeReplayActive/u,
    );
    assert.doesNotMatch(pageSource, /data-signal-live-compact-avatar/u);
    const coffeeRenderer = pageSource.slice(
      pageSource.indexOf("function CoffeeSeatAvatarRenderer"),
      pageSource.indexOf("function FullAvatarCompactFallback"),
    );
    assert.match(
      coffeeRenderer,
      /return \(\s*<BotAmbientPresenceRig[\s\S]*?<ZenLiveBotMannequin/u,
    );
    assert.doesNotMatch(coffeeRenderer, /compactLiveAvatar|coffeeLiveSeatAvatar/u);
    assert.match(
      pageSource,
      /const coffeeLiveMinimumRenderedSizeTier = "full" as const/u,
    );
    const signalRenderer = pageSource.slice(
      pageSource.indexOf("renderAvatar={(botSummary, avatarState) => {"),
      pageSource.indexOf("renderMug={(botSummary, mugState) => {"),
    );
    assert.match(signalRenderer, /signalLivePerformanceAvatar/u);
    assert.match(
      signalRenderer,
      /pixelRasterizationEnabled: !signalLivePerformanceAvatar/u,
    );
    assert.match(
      signalRenderer,
      /runtimeEffectsEnabled: !signalLivePerformanceAvatar/u,
    );
    assert.match(signalRenderer, /semanticFaceMotionEnabled: true/u);
    assert.doesNotMatch(pageSource, /runtimeEffectsEnabled:\s*coffeeReplayActive/u);
    assert.match(
      pageSource,
      /coffee-live-\$\{bot\.id\}[\s\S]{0,1200}showThinkingSpinner:\s*seatThinkingVisualActive[\s\S]{0,300}detailLevel:\s*"full"/u,
    );
    assert.match(
      pageSource,
      /botcast-producer-prism[\s\S]{0,600}showThinkingSpinner:\s*signalPrismThinking[\s\S]{0,300}detailLevel:\s*"full"/u,
    );
  });

  it("routes the live forum, Stage Placement, Jury, and gallery through the policy", () => {
    assert.match(
      debateSource,
      /consumer: "forum"[\s\S]{0,120}cameraView/u,
    );
    assert.match(
      debateSource,
      /consumer: "forum"[\s\S]{0,160}stageAlignmentPreviewCamera/u,
    );
    assert.match(debateSource, /consumer: "jury"/u);
    assert.match(debateSource, /consumer: "gallery"/u);
  });
});
