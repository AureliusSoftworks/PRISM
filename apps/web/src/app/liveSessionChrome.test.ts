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
      modelLabel: "GPT-4o",
      effortLabel: "High",
      effortKey: "high",
      automatic: true,
      turbo: true,
    },
  );
});

test("live Auto stays visible until a server route resolves it", () => {
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "preview-model",
      effort: "medium",
      lane: "online",
    }).modelLabel,
    "Auto",
  );
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "preview-model",
      effort: "medium",
      lane: "online",
      choosing: true,
    }).modelLabel,
    "Auto",
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
    "Auto",
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

test("live session routing chip distinguishes ordinary XHigh from Max", () => {
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: false,
      modelLabel: "GPT-5.6 Sol",
      effort: "xhigh",
    }).effortLabel,
    "XHigh",
  );
  assert.equal(
    liveSessionRoutingChipLabels({
      modelIsAuto: false,
      modelLabel: "GPT-5.6 Sol",
      effort: "max",
    }).effortLabel,
    "Max",
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
    pageSource,
    /data-auto-route-resolved=\{autoRouteResolved \? "true" : undefined\}/u,
  );
  assert.match(
    pageSource,
    /composeModelTriggerNameAuto[\s\S]{0,500}data-auto-route-resolved/u,
  );
  assert.match(
    pageSource,
    /autoSelected && !presentedEffort[\s\S]{0,220}<AutoEffortIcon \/>[\s\S]{0,300}<ModelEffortIcon[\s\S]{0,120}level=\{presentedEffort\}/u,
  );
  assert.match(
    pageSource,
    /const effortInteractionDisabled =\s*disabled \|\|\s*loading \|\|/u,
    "disabling the live model picker must also disable the adjacent fixed-model effort control",
  );
  assert.match(
    pageSource,
    /renderCoffeeHeaderModelPicker[\s\S]{0,5200}sessionEffort=\{[\s\S]{0,500}autoPresentation\.effort/u,
  );
  assert.match(
    pageSource,
    /debateLiveSessionActive[\s\S]{0,3600}sessionEffort=\{[\s\S]{0,260}debateActualAutoRoute\?\.effort/u,
  );
  assert.match(
    debateSource,
    /onLiveModelSelectionChange\?\.\([\s\S]{0,500}modelChoice:[\s\S]{0,180}activeSession\.modelSelectionKind === "auto"[\s\S]{0,180}activeSession\.model[\s\S]{0,180}lastReasoningEffort/u,
  );
  assert.match(
    pageSource,
    /debateNavbarModelChoice =\s*debateLiveModelSelection\?\.modelChoice \?\? debateModelChoice/u,
  );
  assert.match(pageSource, /value=\{debateNavbarModelChoice\}/u);
  assert.match(
    pageSource,
    /navigationHeader=\{\(\{[\s\S]{0,800}lockedReasoningEffort[\s\S]{0,6000}sessionEffort=\{[\s\S]{0,500}episodeAutoPresentation\.effort/u,
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
  assert.match(pageSource, /reasoningEffort=\{signalReasoningEffort\}/u);
  assert.match(
    pageSource,
    /lockedReasoningEffort:\s*lockedReasoningEffort \?\? signalReasoningEffort/u,
  );
  assert.match(signalSource, /LiveSessionPrismWatermark/u);
});
