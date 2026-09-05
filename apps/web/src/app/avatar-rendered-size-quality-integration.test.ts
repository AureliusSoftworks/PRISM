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
  assert.match(fallback, /thinking=\{showThinkingSpinner\}/u);
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
  // Signal spends its two-bot budget on the authored full CRT, including the
  // Studio pixel mask and emission treatment. Runtime-only animation/audio
  // effects may still yield while live. The renderer shares typed prop objects
  // rather than repeating the complete prop list in both JSX branches.
  assert.match(signalAvatarRenderer, /detailLevel: "full"/u);
  assert.match(signalAvatarRenderer, /minimumRenderedSizeTier: "full"/u);
  assert.match(
    signalAvatarRenderer,
    /pixelRasterizationEnabled: true/u,
  );
  assert.match(
    signalAvatarRenderer,
    /runtimeEffectsEnabled: !signalLivePerformanceAvatar/u,
  );
  assert.match(signalAvatarRenderer, /semanticFaceMotionEnabled: true/u);
  assert.match(signalAvatarRenderer, /isTalking: signalMannequinTalking/u);
  assert.match(signalAvatarRenderer, /mouthShape: avatarState\.mouthShape/u);
  assert.match(pageSource, /data-prism-priority-phosphor="true"/u);
});

test("Signal consumes Avatar Studio's canonical full-scale style and surface theme", () => {
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

  assert.equal(
    signalAvatarRenderer.match(/\.\.\.botAvatarFullScaleIdentityStyle\(/gu)
      ?.length,
    2,
  );
  assert.equal(
    signalAvatarRenderer.match(
      /data-avatar-full-scale-identity="canonical"/gu,
    )?.length,
    2,
  );
  assert.equal(signalAvatarRenderer.match(/theme: renderTheme/gu)?.length, 4);
  assert.doesNotMatch(signalAvatarRenderer, /theme: resolvedTheme/u);
  assert.doesNotMatch(signalAvatarRenderer, /\.\.\.botAccentStyle\(/u);
  assert.doesNotMatch(signalAvatarRenderer, /\.\.\.prismDefaultAccentStyle\(/u);
  assert.doesNotMatch(
    pageCss,
    /\.signalBotPresencePlate\s*\{[^}]*(?:--bot-face-(?:metal|screen|crt)|animation:)/iu,
  );
});

test("live load shedding never substitutes a generic avatar token", () => {
  assert.doesNotMatch(pageCss, /data-prism-adaptive-quality/u);
  assert.doesNotMatch(signalCss, /data-prism-adaptive-quality/u);
  assert.doesNotMatch(pageCss, /\.signalLiveCompactAvatar/u);
  assert.doesNotMatch(pageCss, /\.coffeeLiveSeatAvatar/u);
  assert.match(signalSource, /mouthShape:\s*ZenLiveBotMouthShape/u);
  assert.match(signalSource, /mouthShape,/u);
  assert.match(pageSource, /runtimeEffectsEnabled: !signalLivePerformanceAvatar/u);
  assert.match(pageSource, /runtimeEffectsEnabled=\{!staticAudiencePortrait\}/u);
});
