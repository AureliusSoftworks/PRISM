import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  botCursorAttentionDistanceRatio,
  botCursorAttentionGaze,
  botCursorAttentionProfile,
  botCursorAttentionShouldCatch,
} from "./botCursorAttention.ts";

describe("full-size bot cursor attention", () => {
  it("uses Eye movement as a progressively stronger attention threshold", () => {
    assert.equal(botCursorAttentionProfile("still"), null);
    const natural = botCursorAttentionProfile("natural")!;
    const nervous = botCursorAttentionProfile("nervous")!;
    const frantic = botCursorAttentionProfile("frantic")!;
    const paranoid = botCursorAttentionProfile("paranoid")!;

    assert.ok(natural.radiusScale < nervous.radiusScale);
    assert.ok(nervous.radiusScale < frantic.radiusScale);
    assert.ok(frantic.radiusScale < paranoid.radiusScale);
    assert.ok(natural.catchChance < nervous.catchChance);
    assert.ok(nervous.catchChance < frantic.catchChance);
    assert.ok(frantic.catchChance < paranoid.catchChance);
    assert.ok(natural.maxX < nervous.maxX);
    assert.ok(nervous.maxX < frantic.maxX);
    assert.ok(frantic.maxX < paranoid.maxX);
  });

  it("notices only nearby cursor passes and remains probabilistic", () => {
    assert.equal(
      botCursorAttentionShouldCatch({
        movement: "still",
        distanceRatio: 0.1,
        randomSample: 0,
      }),
      false,
    );
    assert.equal(
      botCursorAttentionShouldCatch({
        movement: "natural",
        distanceRatio: 2,
        randomSample: 0,
      }),
      false,
    );
    assert.equal(
      botCursorAttentionShouldCatch({
        movement: "natural",
        distanceRatio: 0.1,
        randomSample: 0,
      }),
      true,
    );
    assert.equal(
      botCursorAttentionShouldCatch({
        movement: "natural",
        distanceRatio: 0.1,
        randomSample: 0.99,
      }),
      false,
    );
  });

  it("maps viewport cursor position into the authored gaze envelope", () => {
    const rect = { left: 100, top: 50, width: 200, height: 200 };
    assert.equal(
      botCursorAttentionDistanceRatio({ clientX: 200, clientY: 150, rect }),
      0,
    );
    const right = botCursorAttentionGaze({
      movement: "natural",
      clientX: 300,
      clientY: 150,
      rect,
    });
    const mirrored = botCursorAttentionGaze({
      movement: "natural",
      clientX: 300,
      clientY: 150,
      rect,
      facingScaleX: -1,
    });
    assert.ok(right.xPx > 0);
    assert.equal(mirrored.xPx, -right.xPx);
    assert.equal(right.yPx, 0);
  });

  it("opts in only the bot-management and Zen full-size mannequins", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const tutorials = readFileSync(
      new URL("./modeTutorials.ts", import.meta.url),
      "utf8",
    );
    const hook = readFileSync(
      new URL("./useBotCursorAttention.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      page,
      /avatarRenderMode === "mini"[\s\S]*?<ZenLiveBotMannequin[\s\S]*?cursorAttention/u,
    );
    assert.match(
      page,
      /data-bot-hub-showcase-backdrop="true"[\s\S]*?<ZenLiveBotMannequin[\s\S]*?cursorAttention=\{!isMarketplacePreview\}/u,
    );
    assert.doesNotMatch(
      page,
      /data-avatar-customizer-preview="true"[\s\S]{0,3000}cursorAttention/u,
    );
    assert.match(page, /faceEyeMovement="still"/u);
    assert.match(hook, /window\.addEventListener\("pointermove"/u);
    assert.match(hook, /armIdleRelease\(\)/u);
    assert.match(hook, /prefers-reduced-motion: reduce/u);
    assert.match(tutorials, /Eye movement also sets attention/u);
    assert.match(tutorials, /Mini avatars stay fixed/u);
    assert.match(tutorials, /lose interest when it rests/u);
  });
});
