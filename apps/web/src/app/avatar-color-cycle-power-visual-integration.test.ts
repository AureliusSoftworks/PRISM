import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

describe("avatar color-cycle Power visual contract", () => {
  it("cycles Chat and Zen avatar accents from enabled Ready Powers", () => {
    assert.match(
      pageSource,
      /data-power-avatar-color-cycle=\{[\s\S]{0,180}botPowerHasAvatarColorCycleV1\(bot\.powers\)/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-power-avatar-color-cycle="spectrum"\][\s\S]{0,260}animation:\s*botPowerSpectrumColorCycle 7\.2s linear infinite/u,
    );
  });

  it("uses Coffee's frozen plan after session start and live Powers before it", () => {
    assert.match(
      pageSource,
      /const seatAvatarColorCycle\s*=\s*coffeePowerPlan[\s\S]{0,220}botPowerHasAvatarColorCycleFromEffectsV1\([\s\S]{0,140}coffeePowerPlan\.bots\[bot\.id\]\?\.effects[\s\S]{0,120}botPowerHasAvatarColorCycleV1\(bot\.powers\)/u,
    );
    assert.match(
      pageSource,
      /data-power-avatar-color-cycle=\{[\s\S]{0,100}seatAvatarColorCycle \? "spectrum" : undefined/u,
    );
  });

  it("prefers Signal's immutable episode snapshot for live use and replay", () => {
    assert.match(
      signalSource,
      /const roleAvatarColorCycle[\s\S]{0,300}botcastSnapshotPowersForRoleV1\([\s\S]{0,180}snapshot !== null[\s\S]{0,120}botPowerHasAvatarColorCycleV1\(snapshot\)[\s\S]{0,120}resolveAvatarColorCycle/u,
    );
    assert.match(
      pageSource,
      /data-power-avatar-color-cycle=\{[\s\S]{0,100}avatarState\.avatarColorCycle \? "spectrum" : undefined/u,
    );
  });

  it("adapts the same spectrum cycle to Story's active bot sprite", () => {
    const storySprite = pageSource.slice(
      pageSource.indexOf("className={styles.storySpriteWrap}"),
      pageSource.indexOf("className={styles.storySprite}", pageSource.indexOf("className={styles.storySpriteWrap}")),
    );
    assert.match(
      storySprite,
      /data-power-avatar-color-cycle=\{[\s\S]*botPowerHasAvatarColorCycleV1\(npcActor\.bot\.powers\)/u,
    );
    assert.match(
      pageCss,
      /\.storySpriteWrap\[data-power-avatar-color-cycle="spectrum"\]\s*\{[^}]*animation:\s*botPowerStorySpectrumColorCycle 7\.2s linear infinite/u,
    );
  });

  it("falls back to the authored inline color when motion is reduced", () => {
    assert.match(
      pageCss,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,420}\[data-power-avatar-color-cycle="spectrum"\][\s\S]{0,260}animation:\s*none/u,
    );
  });
});
