import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mostRestrictivePrismSceneQuality,
  sessionBotSceneQualityCeilingForVisibleCount,
  sessionBotVisualQualityForVisibleCount,
} from "./sessionBotVisualQuality.ts";

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

test("session bot quality steps down as full-size casts grow", () => {
  assert.equal(sessionBotVisualQualityForVisibleCount(0), "full");
  assert.equal(sessionBotVisualQualityForVisibleCount(2), "full");
  assert.equal(sessionBotVisualQualityForVisibleCount(3), "balanced");
  assert.equal(sessionBotVisualQualityForVisibleCount(4), "reduced");
  assert.equal(sessionBotVisualQualityForVisibleCount(5), "minimal");
  assert.equal(sessionBotVisualQualityForVisibleCount(Number.NaN), "full");
});

test("scene ceilings preserve the strictest player, cast, or runtime limit", () => {
  assert.equal(sessionBotSceneQualityCeilingForVisibleCount(2), "full");
  assert.equal(sessionBotSceneQualityCeilingForVisibleCount(4), "balanced");
  assert.equal(sessionBotSceneQualityCeilingForVisibleCount(5), "minimal");
  assert.equal(
    mostRestrictivePrismSceneQuality("full", "balanced"),
    "balanced",
  );
  assert.equal(
    mostRestrictivePrismSceneQuality("minimal", "full"),
    "minimal",
  );
});

test("Coffee, Signal, and Debate expose session-only quality contracts", () => {
  assert.match(pageSource, /data-session-bot-visual-quality/u);
  assert.match(pageSource, /coffeeSessionBotVisualQuality/u);
  assert.match(pageSource, /coffeeSessionAvatarDetailLevel/u);
  assert.match(signalSource, /data-session-bot-visual-quality/u);
  assert.match(signalSource, /signalStageVisibleBotCount/u);
  assert.match(debateSource, /data-session-bot-visual-quality/u);
  assert.match(
    debatePerformanceSource,
    /sessionBotSceneQualityCeilingForVisibleCount\(options\.objectCount\)/u,
  );
});

test("lower tiers remove decorative work without hiding semantic faces", () => {
  assert.match(
    pageCss,
    /data-session-bot-visual-quality="balanced"[\s\S]*botFaceCrtNoiseLayer/u,
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
    /zenLiveBotPresenceFaceGlyph[^}]*display:\s*none/u,
  );
  assert.doesNotMatch(
    qualityRules,
    /\[data-avatar-details-emission\][^{]*\{[^}]*display:\s*none/u,
  );
  assert.match(
    qualityRules,
    /data-avatar-details-emission="glow"[^}]*\{[^}]*display:\s*none/u,
  );
});
