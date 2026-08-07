import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  liveSessionRoutingChipLabels,
  LIVE_SESSION_EFFORT_LABELS,
} from "./liveSessionChromeLabels.ts";

test("live session routing chip keeps Auto effort when model is Auto", () => {
  assert.deepEqual(
    liveSessionRoutingChipLabels({
      modelIsAuto: true,
      modelLabel: "gpt-4o",
      effort: "high",
    }),
    { modelLabel: "Auto", effortLabel: "Auto" },
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
    },
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
  assert.match(source, /data-live-session-watermark="true"/u);
  assert.match(source, /theme === "light" \? "#000000" : "#ffffff"/u);
  assert.match(css, /opacity:\s*0\.5/u);
  assert.match(css, /\.watermark\s*\{[^}]*position:\s*fixed/u);
  assert.match(css, /\.watermarkContained\s*\{[^}]*position:\s*absolute/u);
  assert.match(pageSource, /LiveSessionModelChip/u);
  assert.match(pageSource, /LiveSessionPrismWatermark/u);
  assert.match(debateSource, /lockedRoutingChip/u);
  assert.match(
    debateSource,
    /data-debate-stage-viewport="live"[\s\S]{0,280}LiveSessionPrismWatermark[\s\S]{0,120}contained/u,
  );
  assert.match(signalSource, /resolveLockedRoutingChip/u);
  assert.match(signalSource, /LiveSessionPrismWatermark/u);
});
