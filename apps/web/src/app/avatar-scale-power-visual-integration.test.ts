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
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

describe("avatar scale Power visual contract", () => {
  it("sizes Chat and Zen avatars from enabled Ready Powers", () => {
    assert.match(
      pageSource,
      /data-power-avatar-scale=\{[\s\S]{0,160}botPowerAvatarScaleModeV1\(bot\.powers\)/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-power-avatar-scale="larger"\][\s\S]{0,100}> \.botAmbientPresenceRig\s*\{[^}]*scale:\s*1\.12/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-power-avatar-scale="smaller"\][\s\S]{0,100}> \.botAmbientPresenceRig\s*\{[^}]*scale:\s*0\.86/u,
    );
  });

  it("uses Coffee's frozen plan after session start and live Powers before it", () => {
    assert.match(
      pageSource,
      /const seatAvatarScaleMode\s*=\s*coffeePowerPlan[\s\S]{0,220}botPowerAvatarScaleModeFromEffectsV1\([\s\S]{0,140}coffeePowerPlan\.bots\[bot\.id\]\?\.effects[\s\S]{0,120}botPowerAvatarScaleModeV1\(bot\.powers\)/u,
    );
    assert.match(
      pageSource,
      /data-power-avatar-scale=\{seatAvatarScaleMode \?\? undefined\}/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-power-avatar-scale="larger"\] \.coffeeSeatPlate\s*\{[^}]*scale:\s*1\.12/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-power-avatar-scale="smaller"\] \.coffeeSeatPlate\s*\{[^}]*scale:\s*0\.86/u,
    );
  });

  it("prefers Signal's immutable episode snapshot for live use and replay", () => {
    assert.match(
      signalSource,
      /const roleAvatarScaleMode[\s\S]{0,300}botcastSnapshotPowersForRoleV1\([\s\S]{0,180}snapshot !== null[\s\S]{0,120}botPowerAvatarScaleModeV1\(snapshot\)[\s\S]{0,120}resolveAvatarScaleMode/u,
    );
    assert.match(
      signalSource,
      /data-power-avatar-scale=\{[\s\S]{0,100}roleAvatarScaleMode\("host", args\.host\)/u,
    );
    assert.match(
      signalSource,
      /data-power-avatar-scale=\{[\s\S]{0,100}roleAvatarScaleMode\("guest", args\.guest\)/u,
    );
    assert.match(
      signalCss,
      /\.avatarRig\[data-power-avatar-scale="larger"\] \{ scale: 1\.12; \}/u,
    );
    assert.match(
      signalCss,
      /\.avatarRig\[data-power-avatar-scale="smaller"\] \{ scale: \.86; \}/u,
    );
  });

  it("adapts the same relative size to Story's active bot sprite", () => {
    assert.match(
      pageSource,
      /className=\{styles\.storySpriteWrap\}[\s\S]{0,260}data-power-avatar-scale=\{[\s\S]{0,120}botPowerAvatarScaleModeV1\(npcActor\.bot\.powers\)/u,
    );
    assert.match(
      pageCss,
      /\.storySpriteWrap\[data-power-avatar-scale="larger"\] \{[^}]*scale:\s*1\.12/u,
    );
    assert.match(
      pageCss,
      /\.storySpriteWrap\[data-power-avatar-scale="smaller"\] \{[^}]*scale:\s*0\.86/u,
    );
  });
});
