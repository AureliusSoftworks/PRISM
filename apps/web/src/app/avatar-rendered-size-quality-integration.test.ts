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

test("Signal stage avatars retain the full animated face", () => {
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

  assert.equal(signalStageMannequins.length, 2);
  for (const [mannequin] of signalStageMannequins) {
    assert.match(mannequin, /minimumRenderedSizeTier="full"/u);
    assert.match(mannequin, /isTalking=\{avatarState\.talking\}/u);
    assert.match(mannequin, /mouthShape=\{avatarState\.mouthShape\}/u);
  }
});

test("runtime pressure has no CSS path that degrades session avatars", () => {
  assert.doesNotMatch(pageCss, /data-prism-adaptive-quality/u);
  assert.doesNotMatch(signalCss, /data-prism-adaptive-quality/u);
  assert.match(signalSource, /mouthShape:\s*ZenLiveBotMouthShape/u);
  assert.match(signalSource, /mouthShape,/u);
  assert.match(pageSource, /isTalking=\{avatarState\.talking\}/u);
  assert.match(pageSource, /mouthShape=\{avatarState\.mouthShape\}/u);
});
