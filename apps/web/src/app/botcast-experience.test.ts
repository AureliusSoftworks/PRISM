import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Signal experience shell", () => {
  it("uses Signal throughout player-facing applet chrome", () => {
    assert.match(source, />SIGNAL</u);
    assert.match(source, /<h1>Signal<\/h1>/u);
    assert.match(source, /aria-label="Signal shows"/u);
    assert.match(source, /aria-label="Signal replay cameras"/u);
    assert.doesNotMatch(source, />BOTCAST</u);
  });

  it("defaults replay to Auto and keeps manual camera selection viewer-local", () => {
    assert.match(source, /useState<BotcastCameraShot>\("auto"\)/u);
    assert.match(source, /\["auto", "left", "right", "wide"\]/u);
    assert.match(source, /setReplayCamera\(camera\)/u);
    assert.match(source, /replayTimeline\.messageStartMs\[index\]/u);
    assert.doesNotMatch(source, /index \* 4_500/u);
    assert.doesNotMatch(source, /PATCH[\s\S]{0,120}replayCamera/u);
  });

  it("renders the authored two-seat stage and empty-chair aftermath", () => {
    assert.match(source, /data-role="host"/u);
    assert.match(source, /data-role="guest"/u);
    assert.match(source, /Guest has left the studio/u);
    assert.match(source, /Host logo mug/u);
    assert.match(source, /Guest accent mug/u);
    assert.match(css, /\.hostSeat\s*\{\s*left:/u);
    assert.match(css, /\.guestSeat\s*\{\s*right:/u);
  });

  it("keeps Signal coffee cosmetic and producer direction private", () => {
    assert.doesNotMatch(source, /top.?off|refill|depletion/iu);
    assert.match(source, /Private line to host/u);
    assert.match(source, /never spoken or attributed to you/u);
  });

  it("brands shows with synthesis controls and resilient PRISM fallbacks", () => {
    assert.match(source, /Synthesize studio \+ logo/u);
    assert.match(source, /regenerateLogo: true/u);
    assert.match(source, /function SignalShowLogo/u);
    assert.match(source, /show\.logo\.fallbackGlyph/u);
    assert.match(source, /data-theme=\{theme\}/u);
    assert.match(css, /--prism-p:\s*#ff4d6d/iu);
    assert.match(css, /--prism-s:\s*#2fd3e3/iu);
    assert.match(css, /\.shell\[data-theme="light"\]/u);
    assert.match(css, /data-atmosphere="fallback"/u);
  });

  it("inherits the active theme in shared panels and uses image settings for artwork", () => {
    assert.match(
      pageSource,
      /if \(view === "botcast"\) \{[\s\S]*?return \(\s*<div className=\{themeClass\}>/u,
    );
    assert.match(
      pageSource,
      /preferredImageProvider=\{settings\?\.preferredImageProvider \?\? "local"\}/u,
    );
    assert.match(source, /preferredProvider: preferredImageProvider/u);
    assert.match(source, /botId: workingShow\.hostBotId/u);
    assert.match(source, /failureMessage \?\?= errorMessage\(artworkError\)/u);
    assert.match(source, /if \(artwork\.failureMessage\) setError\(artwork\.failureMessage\)/u);
  });

  it("offers confirmed show deletion and episode delete or discard without nesting actions", () => {
    assert.match(
      source,
      /`\/api\/botcast\/shows\/\$\{encodeURIComponent\(target\.id\)\}`,[\s\S]{0,100}method: "DELETE"/u,
    );
    assert.match(
      source,
      /`\/api\/botcast\/episodes\/\$\{encodeURIComponent\(target\.id\)\}`,[\s\S]{0,100}method: "DELETE"/u,
    );
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /Discard episode/u);
    assert.match(source, /Delete show/u);
    assert.match(source, /Saved studio and logo artwork stays in Images/u);
    assert.match(source, /deleteCancelButtonRef\.current\?\.focus\(\)/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(
      source,
      /<article key=\{item\.id\} className=\{styles\.episodeCard\}>[\s\S]*?<\/article>/u,
    );
    assert.match(css, /\.deleteDialog\s*\{/u);
    assert.match(css, /\.deleteConfirmButton/u);
    assert.match(css, /\.episodeOpenButton/u);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.episodeDeleteButton/u);
  });
});
