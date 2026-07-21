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

describe("ghost Power live-avatar contract", () => {
  it("hides Chat and Zen avatars until their own talking state is active", () => {
    assert.match(
      pageSource,
      /data-ghostly-presence=\{[\s\S]{0,180}botPowerAvatarVisibilityModeV1\(bot\.powers\) === "speaking_only"/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-ghostly-presence="true"\]\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 420ms ease;/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-ghostly-presence="true"\]\[data-talking="true"\]\s*\{[^}]*opacity:\s*1;/u,
    );
  });

  it("uses the frozen Coffee plan and the active table speaker for the reveal", () => {
    assert.match(
      pageSource,
      /const seatAvatarVisibilityMode\s*=\s*coffeePowerPlan[\s\S]{0,180}botPowerAvatarVisibilityModeFromEffectsV1\([\s\S]{0,100}coffeePowerPlan\.bots\[bot\.id\]\?\.effects/u,
    );
    assert.match(
      pageSource,
      /data-table-speaking=\{[\s\S]{0,100}activeTableSpeakerBotId === bot\.id/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-ghostly-presence="true"\][\s\S]{0,160}\.coffeeSeatPlate\[data-live-body-style="zen"\]\s*\{[^}]*opacity:\s*0;/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-ghostly-presence="true"\]\[data-table-speaking="true"\][\s\S]{0,120}\.coffeeSeatPlate\[data-live-body-style="zen"\]\s*\{[^}]*opacity:\s*1;/u,
    );
  });

  it("uses the recorded Signal snapshot during replay and fades only the speaker in", () => {
    assert.match(
      signalSource,
      /const roleAvatarVisibilityMode[\s\S]{0,300}botcastSnapshotPowersForRoleV1\([\s\S]{0,180}snapshot !== null[\s\S]{0,120}botPowerAvatarVisibilityModeV1\(snapshot\)/u,
    );
    assert.match(signalSource, /data-talking=\{[\s\S]{0,80}roleIsSpeaking/u);
    assert.match(
      signalCss,
      /\.avatarRig\[data-ghostly-presence="true"\]\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 420ms ease;/u,
    );
    assert.match(
      signalCss,
      /\.avatarRig\[data-ghostly-presence="true"\]\[data-talking="true"\]\s*\{[^}]*opacity:\s*1;/u,
    );
  });

  it("keeps reduced-motion users on an immediate visibility change", () => {
    assert.match(
      pageCss,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}data-ghostly-presence="true"[\s\S]{0,200}transition:\s*none;/u,
    );
    assert.match(
      signalCss,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,180}data-ghostly-presence="true"[^}]*transition:\s*none;/u,
    );
  });
});
