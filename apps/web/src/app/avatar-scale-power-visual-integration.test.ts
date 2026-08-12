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
    for (const [mode, scale] of [
      ["tiny", "0.5"],
      ["small", "0.75"],
      ["large", "1.25"],
      ["giant", "1.5"],
      ["colossal", "3"],
    ] as const) {
      assert.match(
        pageCss,
        new RegExp(`data-power-avatar-scale="${mode}"\\] \\{[\\s\\S]{0,100}--power-avatar-scale: ${scale.replace(".", "\\.")}`, "u"),
      );
    }
    assert.match(pageCss, /data-canvas-side="left"[\s\S]{0,120}--power-avatar-shift-x/u);
    assert.match(pageCss, /:not\(\[data-dragging="true"\]\)/u);
    assert.match(pageCss, /> \.botAmbientPresenceRig,[\s\S]{0,180}scale: var\(--power-avatar-scale\)/u);
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
    assert.match(pageSource, /const seatPowerEdgeSide[\s\S]{0,420}coffeeSeatStableHash/u);
    assert.match(pageSource, /data-power-edge-side=\{seatPowerEdgeSide\}/u);
    assert.match(pageCss, /\.coffeeSeat\[data-power-edge-side="left"\][\s\S]{0,100}--power-avatar-shift-x/u);
    assert.match(pageCss, /\.coffeeSeat \.coffeeSeatPlate > \.botAmbientPresenceRig[\s\S]{0,160}scale: var\(--power-avatar-scale\)/u);
    assert.doesNotMatch(pageCss, /coffeeSeatPlate[^}]*scale:\s*(?:0\.5|0\.75|1\.25|1\.5|3)/u);
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
    for (const [mode, scale] of [
      ["tiny", ".5"],
      ["small", ".75"],
      ["large", "1.25"],
      ["giant", "1.5"],
      ["colossal", "3"],
    ] as const) {
      assert.match(
        signalCss,
        new RegExp(`\\.avatarRig\\[data-power-avatar-scale="${mode}"\\] \\{[^}]*--signal-power-avatar-scale: ${scale.replace(".", "\\.")}`, "u"),
      );
    }
    assert.match(signalCss, /\.avatarEmbodiment \{[^}]*scale: var\(--signal-power-avatar-scale/u);
    assert.match(signalCss, /data-signal-presence="host"[\s\S]{0,110}calc\(-1 \* var\(--signal-power-avatar-shift/u);
    assert.match(signalCss, /data-signal-presence="guest"[\s\S]{0,100}var\(--signal-power-avatar-shift/u);
  });

  it("adapts the same relative size to Story's active bot sprite", () => {
    assert.match(
      pageSource,
      /className=\{styles\.storySpriteWrap\}[\s\S]{0,260}data-power-avatar-scale=\{[\s\S]{0,120}botPowerAvatarScaleModeV1\(npcActor\.bot\.powers\)/u,
    );
    assert.match(pageCss, /\.storySpriteWrap\[data-power-avatar-scale="tiny"\] \{ scale: 0\.5; \}/u);
    assert.match(pageCss, /\.storySpriteWrap\[data-power-avatar-scale="small"\] \{ scale: 0\.75; \}/u);
    assert.match(pageCss, /data-power-avatar-scale="large"[^}]*scale: 1\.25; translate: -6% 0/u);
    assert.match(pageCss, /data-power-avatar-scale="giant"[^}]*scale: 1\.5; translate: -16% 0/u);
    assert.match(pageCss, /data-power-avatar-scale="colossal"[^}]*scale: 3; translate: -58% 0/u);
  });

  it("switches unreadable full avatars to the shared Ink-aware micro form", () => {
    assert.match(
      pageSource,
      /BOT_AVATAR_MICRO_FALLBACK_MAX_PX = 118/u,
    );
    assert.match(
      pageSource,
      /setMicroFallbackActive\([\s\S]{0,120}width < BOT_AVATAR_MICRO_FALLBACK_MAX_PX/u,
    );
    assert.match(
      pageSource,
      /if \(microFallbackActive\)[\s\S]{0,700}<BotAvatarMicroRenderer[\s\S]{0,500}avatarDetails=\{avatarDetails\}/u,
    );
    assert.match(
      pageCss,
      /:has\(\.zenLiveBotPresenceBody\[data-render-detail="micro"\]\)\s*\{[^}]*scale:\s*1;/u,
    );
    assert.match(
      signalCss,
      /\.avatarEmbodiment:has\(\[data-render-detail="micro"\]\)\s*\{[^}]*scale:\s*1;/u,
    );
  });

  it("uses the authored Mini chassis in Signal's compact episode archive", () => {
    assert.match(signalSource, /surface:\s*"archive"/u);
    assert.match(pageSource, /avatarState\.surface === "archive"/u);
    assert.match(
      pageSource,
      /if \(signalArchiveAvatar\)[\s\S]{0,1800}<EmptyStateHeroMiniBot[\s\S]{0,900}size="room"/u,
    );
    assert.match(
      signalCss,
      /\.episodeParticipantAvatar \[data-chat-mini-bot-avatar="true"\]\s*\{[^}]*width:\s*58px;[^}]*height:\s*58px;/u,
    );
    assert.doesNotMatch(
      signalCss,
      /\.episodeParticipantAvatar \[data-signal-bot-presence="true"\]/u,
    );
  });
});
