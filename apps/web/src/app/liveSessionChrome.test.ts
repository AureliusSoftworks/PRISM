import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  liveSessionRoutingChipLabels,
  LIVE_SESSION_EFFORT_LABELS,
} from "./liveSessionChromeLabels.ts";

test("live session routing chip shows the server-observed Auto route", () => {
  assert.deepEqual(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "GPT-4o",
      effort: "high",
      turbo: true,
      lane: "online",
      actualRoute: {
        provider: "openai",
        model: "gpt-4o",
        effort: "high",
        turbo: true,
      },
    }),
    {
      modelLabel: "Auto → GPT-4o",
      effortLabel: "High",
      effortKey: "high",
      automatic: true,
      turbo: true,
    },
  );
});

test("live Auto waits or chooses without substituting a client preview", () => {
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "preview-model",
      effort: "medium",
      lane: "online",
    }).modelLabel,
    "Auto → Awaiting first turn",
  );
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "preview-model",
      effort: "medium",
      lane: "online",
      choosing: true,
    }).modelLabel,
    "Auto → Choosing…",
  );
});

test("LOCAL ignores stale online routes", () => {
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "preview-model",
      effort: "medium",
      lane: "local",
      actualRoute: { provider: "openai", model: "gpt-5.6" },
    }).modelLabel,
    "Auto → Awaiting first turn",
  );
});

test("live session routing chip shows concrete model and effort", () => {
  assert.deepEqual(
    liveSessionRoutingChipLabels({
      modelIsAuto: false,
      modelLabel: "Claude Sonnet",
      effort: "medium",
    }),
    {
      modelLabel: "Claude Sonnet",
      effortLabel: LIVE_SESSION_EFFORT_LABELS.medium,
      effortKey: "medium",
      automatic: false,
      turbo: false,
    },
  );
});

test("live session routing chip always resolves a visible effort glyph", () => {
  assert.deepEqual(
    liveSessionRoutingChipLabels({
      modelIsAuto: false,
      modelLabel: "Default model",
      effort: undefined,
    }),
    {
      modelLabel: "Default model",
      effortLabel: "Default",
      effortKey: "auto",
      automatic: false,
      turbo: false,
    },
  );
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: false,
      modelLabel: "No reasoning",
      effort: "none",
    }).effortKey,
    "none",
  );
});

test("live session chrome mounts model chip and theme-aware watermark", () => {
  const source = readFileSync(
    new URL("./liveSessionChrome.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("./liveSessionChrome.module.css", import.meta.url),
    "utf8",
  );
  const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const debateSource = readFileSync(
    new URL("./DebateExperience.tsx", import.meta.url),
    "utf8",
  );
  const signalSource = readFileSync(
    new URL("./BotcastExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /data-live-session-model-chip="true"/u);
  assert.match(source, /Auto route currently:/u);
  assert.match(source, /This may change on a later generation/u);
  assert.match(source, /aria-live=\{props\.automatic \? "polite" : undefined\}/u);
  assert.match(source, /MODEL_EFFORT_ICON_PATHS\[effortKey\]/u);
  assert.match(source, /modelChipTurbo/u);
  assert.match(source, /turboToggle/u);
  assert.match(source, /Turbo changes only future ungenerated Debate turns/u);
  assert.match(css, /\.modelChipTurboToggle/u);
  assert.match(source, /data-live-session-watermark="true"/u);
  assert.match(source, /theme === "light" \? "#000000" : "#ffffff"/u);
  assert.match(css, /opacity:\s*0\.5/u);
  assert.match(css, /\.watermark\s*\{[^}]*position:\s*fixed/u);
  assert.match(css, /\.watermarkContained\s*\{[^}]*position:\s*absolute/u);
  assert.match(pageSource, /LiveSessionModelChip/u);
  assert.match(pageSource, /LiveSessionPrismWatermark/u);
  assert.match(
    pageSource,
    /function latestConversationAutoRoute\([\s\S]{0,1800}latestActualAppletRoute/u,
  );
  assert.match(
    pageSource,
    /const coffeeLatestAutoRoute =[\s\S]{0,1200}actualAutoRoute: coffeeLatestAutoRoute/u,
  );
  assert.match(debateSource, /lockedRoutingChip/u);
  assert.match(
    debateSource,
    /latestDebateActualAutoRoute\(session\)[\s\S]{0,900}actualRoute: actualAutoRoute/u,
  );
  assert.match(
    pageSource,
    /autoRouteLabel=\{[\s\S]{0,180}debateLiveRoutingChip\?\.modelLabel/u,
  );
  assert.match(
    signalSource,
    /resolveLockedRoutingChip\?\.\(\{[\s\S]{0,220}activeAutoRoute,/u,
  );
  assert.match(
    debateSource,
    /data-debate-stage-viewport="live"[\s\S]{0,280}LiveSessionPrismWatermark[\s\S]{0,120}contained/u,
  );
  assert.match(signalSource, /resolveLockedRoutingChip/u);
  assert.match(signalSource, /LiveSessionPrismWatermark/u);
});
