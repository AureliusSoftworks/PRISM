import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("the shared full-avatar renderer derives detail from on-screen size", () => {
  assert.match(pageSource, /avatarRenderedSizeTierForMeasurements/u);
  assert.match(pageSource, /element\.getBoundingClientRect\(\)\.width/u);
  assert.match(pageSource, /renderedSizeTier === "compact"/u);
  assert.match(pageSource, /data-render-detail=\{renderDetailLevel\}/u);
  assert.match(pageSource, /data-avatar-render-size-tier=\{renderedSizeTier\}/u);
  assert.match(pageSource, /minimumRenderedSizeTier = "micro"/u);
  assert.doesNotMatch(pageSource, /transitionSamplingUntilMs/u);
  assert.doesNotMatch(pageSource, /sampleCameraTransition/u);
});

test("compact rendered widths use the authored Mini chassis", () => {
  const compactBranch = pageSource.slice(
    pageSource.indexOf("if (compactFallbackActive)"),
    pageSource.indexOf('if (renderDetailLevel === "audience"'),
  );
  assert.match(compactBranch, /data-render-detail="compact"/u);
  assert.match(compactBranch, /data-avatar-render-size-tier="compact"/u);
  assert.match(compactBranch, /<FullAvatarCompactFallback/u);
  assert.match(compactBranch, /renderSizePx=\{renderedSizePx\}/u);
  assert.match(pageSource, /function FullAvatarCompactFallback/u);
  assert.match(pageSource, /<ChatMiniBotAvatar/u);
});

test("the Mini fallback clears authored Ink while the thinking mark presents", () => {
  // Full HD swaps its whole content rig for the thinking screen, so Ink goes
  // with it. Mini draws the mark inside the face rig, and its above-face Ink
  // layer outranks that rig, so without this guard the art paints over the
  // mark instead of yielding to it.
  const fallback = pageSource.slice(
    pageSource.indexOf("function FullAvatarCompactFallback"),
    pageSource.indexOf("<ChatMiniBotAvatar", pageSource.indexOf("function FullAvatarCompactFallback")),
  );
  assert.match(fallback, /hasAvatarArt && !showThinkingSpinner \? \(/u);
  assert.match(fallback, /showThinkingSpinner/u);
});

test("Signal keeps authored full mannequins live while shedding only runtime effects", () => {
  const signalExperienceStart = pageSource.indexOf("<BotcastExperience");
  const signalAvatarStart = pageSource.indexOf(
    "renderAvatar={(botSummary, avatarState) => {",
    signalExperienceStart,
  );
  const signalAvatarEnd = pageSource.indexOf(
    "renderMug={(botSummary, mugState) => {",
    signalAvatarStart,
  );
  const signalAvatarRenderer = pageSource.slice(
    signalAvatarStart,
    signalAvatarEnd,
  );
  const signalStageMannequins = [
    ...signalAvatarRenderer.matchAll(/<ZenLiveBotMannequin[\s\S]*?\/>/gu),
  ];

  assert.match(
    signalAvatarRenderer,
    /const signalLivePerformanceAvatar =[\s\S]{0,180}avatarState\.surface === "stage"[\s\S]{0,180}signalLiveSessionId !== null[\s\S]{0,180}avatarState\.replayAudioMaster !== true/u,
  );
  assert.doesNotMatch(signalAvatarRenderer, /signalLiveCompactAvatar/u);
  assert.doesNotMatch(signalAvatarRenderer, /data-signal-live-compact-avatar/u);
  assert.equal(signalStageMannequins.length, 2);
  for (const [mannequin] of signalStageMannequins) {
    // Signal spends its two-bot budget on the authored full CRT, static CSS
    // phosphor bloom, and faithful mouth state. Live disables autonomous
    // effects and synchronous canvas readback around that identity.
    assert.match(mannequin, /minimumRenderedSizeTier="full"/u);
    assert.match(mannequin, /detailLevel="full"/u);
    assert.match(
      mannequin,
      /pixelRasterizationEnabled=\{!signalLivePerformanceAvatar\}/u,
    );
    assert.match(
      mannequin,
      /runtimeEffectsEnabled=\{!signalLivePerformanceAvatar\}/u,
    );
    assert.match(mannequin, /isTalking=\{avatarState\.talking\}/u);
    assert.match(mannequin, /mouthShape=\{avatarState\.mouthShape\}/u);
  }
  assert.match(pageSource, /data-prism-priority-phosphor="true"/u);
  assert.match(
    signalCss,
    /data-live-episode="true"[\s\S]{0,180}data-prism-priority-phosphor="true"[\s\S]{0,180}data-crt-glyph-layer="true"\]\)::before/u,
  );
});

test("live load shedding never substitutes a generic avatar token", () => {
  assert.doesNotMatch(pageCss, /data-prism-adaptive-quality/u);
  assert.doesNotMatch(signalCss, /data-prism-adaptive-quality/u);
  assert.doesNotMatch(pageCss, /\.signalLiveCompactAvatar/u);
  assert.doesNotMatch(pageCss, /\.coffeeLiveSeatAvatar/u);
  assert.match(signalSource, /mouthShape:\s*ZenLiveBotMouthShape/u);
  assert.match(signalSource, /mouthShape,/u);
  assert.match(pageSource, /runtimeEffectsEnabled=\{!signalLivePerformanceAvatar\}/u);
  assert.match(pageSource, /runtimeEffectsEnabled: coffeeReplayActive/u);
});
