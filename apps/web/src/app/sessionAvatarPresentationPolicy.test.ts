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

  it("pins Signal and Coffee to full presentation", () => {
    assert.equal(signalAvatarPresentation(), "full");
    assert.equal(coffeeAvatarPresentation(), "full");
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

  it("wires full-size floors without Coffee mini or micro seat renderers", () => {
    assert.match(signalSource, /signalAvatarPresentation\(\)/u);
    assert.match(pageSource, /coffeeAvatarPresentation\(\)/u);
    assert.match(
      pageSource,
      /function CoffeeSeatAvatarRenderer[\s\S]{0,500}<ZenLiveBotMannequin/u,
    );
    const coffeeRenderer = pageSource.slice(
      pageSource.indexOf("function CoffeeSeatAvatarRenderer"),
      pageSource.indexOf("function FullAvatarCompactFallback"),
    );
    assert.doesNotMatch(coffeeRenderer, /ChatMiniBotAvatar|BotAvatarMicroRenderer/u);
    // The live player stand-in follows the table shed tier (uniform mini on
    // crowded low-FPS tables); only replay pins the stand-in to full.
    assert.match(
      pageSource,
      /coffee-replay-player-[\s\S]{0,900}minimumRenderedSizeTier=\{\s*coffeeReplayActive\s*\?\s*"full"\s*:\s*coffeeLiveMinimumRenderedSizeTier\s*\}/u,
    );
    assert.match(
      pageSource,
      /coffee-live-\$\{bot\.id\}[\s\S]{0,800}minimumRenderedSizeTier: coffeeLiveMinimumRenderedSizeTier/u,
    );
    assert.match(
      pageSource,
      /if \(minimumRenderedSizeTier === "full"\) \{[\s\S]{0,400}setRenderedSizeTier\("full"\);\s*return;[\s\S]{0,600}getBoundingClientRect/u,
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
