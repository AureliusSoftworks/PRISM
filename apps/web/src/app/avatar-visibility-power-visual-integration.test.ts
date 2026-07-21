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

describe("avatar visibility Power visual contract", () => {
  it("keeps Chat and Zen microscopic avatars hidden and Invisible avatars translucent", () => {
    assert.match(
      pageSource,
      /data-power-avatar-visibility=\{[\s\S]{0,180}botPowerAvatarVisibilityModeV1\(bot\.powers\)/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-power-avatar-visibility="hidden"\]\s*\{[^}]*opacity:\s*0;/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\[data-power-avatar-visibility="translucent"\]\s*\{[^}]*opacity:\s*0\.5;/u,
    );
  });

  it("uses Coffee's frozen visibility state without hiding roster previews", () => {
    assert.match(
      pageSource,
      /const seatObserverProjection[\s\S]{0,700}const seatAvatarVisibilityMode[\s\S]{0,220}seatObserverProjection\?\.visibility[\s\S]{0,260}botPowerAvatarVisibilityModeFromEffectsV1/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-power-avatar-visibility="hidden"\]:not\(\[data-roster-preview="true"\]\)[\s\S]{0,140}opacity:\s*0;/u,
    );
    assert.match(
      pageCss,
      /\.coffeeSeat\[data-power-avatar-visibility="translucent"\]:not\(\[data-roster-preview="true"\]\)[\s\S]{0,140}opacity:\s*0\.5;/u,
    );
  });

  it("freezes Signal visibility and applies its live or replay observer projection", () => {
    assert.match(
      signalSource,
      /const roleAvatarVisibilityMode[\s\S]{0,220}observerParticipants\?\.\[role\]\.visibility[\s\S]{0,260}botcastSnapshotPowersForRoleV1\([\s\S]{0,180}snapshot !== null[\s\S]{0,120}botPowerAvatarVisibilityModeV1\(snapshot\)/u,
    );
    assert.match(
      signalSource,
      /data-power-avatar-visibility=\{[\s\S]{0,100}roleAvatarVisibilityMode\("guest", args\.guest\)/u,
    );
    assert.match(
      signalCss,
      /\.avatarRig\[data-power-avatar-visibility="hidden"\] \{ opacity: 0; \}/u,
    );
    assert.match(
      signalCss,
      /\.avatarRig\[data-power-avatar-visibility="translucent"\] \{ opacity: \.5; \}/u,
    );
  });

  it("labels speaking-only, hidden, and translucent states distinctly in Avatar Studio", () => {
    assert.match(pageSource, /Fully hidden, including while speaking/u);
    assert.match(pageSource, /Half-translucent spectral presence/u);
    assert.match(pageSource, /Hidden while idle; appears while speaking/u);
  });

  it("adapts hidden, translucent, and speaking-only states to Story", () => {
    assert.match(
      pageSource,
      /className=\{styles\.storySpriteWrap\}[\s\S]{0,360}data-power-avatar-visibility=\{[\s\S]{0,120}botPowerAvatarVisibilityModeV1\(npcActor\.bot\.powers\)/u,
    );
    assert.match(pageCss, /\.storySpriteWrap\[data-power-avatar-visibility="hidden"\][\s\S]{0,60}opacity:\s*0;/u);
    assert.match(pageCss, /\.storySpriteWrap\[data-power-avatar-visibility="translucent"\][\s\S]{0,60}opacity:\s*0\.5;/u);
    assert.match(pageCss, /data-power-avatar-visibility="speaking_only"\]\[data-speaking="true"\][\s\S]{0,60}opacity:\s*1;/u);
  });
});
