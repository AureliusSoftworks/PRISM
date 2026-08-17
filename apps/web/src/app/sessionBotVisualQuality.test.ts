import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const debatePerformanceSource = readFileSync(
  new URL("./useDebateDomPerformance.ts", import.meta.url),
  "utf8",
);

test("removes the cast-count quality stepper from production", () => {
  assert.equal(
    existsSync(new URL("./sessionBotVisualQuality.ts", import.meta.url)),
    false,
  );
  for (const source of [pageSource, signalSource, debateSource]) {
    assert.doesNotMatch(
      source,
      /sessionBotVisualQualityForVisibleCount|sessionBotSceneQualityCeilingForVisibleCount/u,
    );
  }
});

test("Coffee, Signal, and Debate pin runtime session tiers to full presentation", () => {
  assert.match(pageSource, /data-session-bot-visual-quality/u);
  assert.match(pageSource, /const coffeeSessionBotVisualQuality = "full"/u);
  assert.match(signalSource, /data-session-bot-visual-quality/u);
  assert.match(signalSource, /signalStageVisibleBotCount/u);
  assert.match(
    signalSource,
    /const signalStageBotVisualQuality = signalAvatarPresentation\(\)/u,
  );
  assert.match(debateSource, /data-session-bot-visual-quality/u);
  assert.match(
    debatePerformanceSource,
    /prismSceneQualityCeilingForGraphicsQuality\([\s\S]{0,80}options\.graphicsQuality/u,
  );
  assert.doesNotMatch(
    debatePerformanceSource,
    /sessionBotSceneQualityCeilingForVisibleCount/u,
  );
  assert.match(
    debatePerformanceSource,
    /controller\.recordFrame[\s\S]{0,500}quality: renderedQuality/u,
  );
  assert.doesNotMatch(debatePerformanceSource, /setQualityState/u);
});

test("lower tiers remove only peripheral work and preserve bot screens", () => {
  assert.match(
    pageCss,
    /data-session-bot-visual-quality="balanced"[\s\S]*botAmbientUnderglow/u,
  );
  assert.match(
    pageCss,
    /data-session-bot-visual-quality="reduced"[\s\S]*botAmbientUnderglow/u,
  );
  assert.match(
    pageCss,
    /data-session-bot-visual-quality="minimal"[\s\S]*botFaceFrameLedAura/u,
  );
  const qualityRules = pageCss.slice(
    pageCss.indexOf("Session bot visual quality"),
    pageCss.indexOf("@keyframes botAmbientHoverDrift"),
  );
  assert.doesNotMatch(
    qualityRules,
    /(?:FaceEmissionMask|CrtNoiseLayer|CrtBreathingLayer|CrtGrimeLayer|data-crt-glyph-layer|data-avatar-details-emission|data-avatar-details-motion-group)/u,
  );
});
