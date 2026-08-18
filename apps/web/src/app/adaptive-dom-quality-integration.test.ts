import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const pageStyles = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const governor = readFileSync(
  new URL("./PrismAdaptiveDomQualityGovernor.tsx", import.meta.url),
  "utf8",
);
const sceneHost = readFileSync(
  new URL("./PrismSceneHost.ts", import.meta.url),
  "utf8",
);
const sceneRuntime = readFileSync(
  new URL("./prismSceneRuntime.ts", import.meta.url),
  "utf8",
);
const debatePerformance = readFileSync(
  new URL("./useDebateDomPerformance.ts", import.meta.url),
  "utf8",
);
const signalStyles = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);

describe("adaptive DOM quality integration", () => {
  it("mounts one always-on governor independently from the FPS overlay", () => {
    assert.match(page, /<PrismAdaptiveDomQualityGovernor \/>/u);
    assert.match(page, /<FpsCounter \/>/u);
  });

  it("keeps the automatic governor observe-only while publishing FPS telemetry", () => {
    assert.match(governor, /controller\.recordFrame/u);
    assert.match(governor, /publishPrismFrameRate/u);
    assert.doesNotMatch(governor, /dataset\.prismAdaptiveQuality/u);
    assert.doesNotMatch(governor, /setAttribute\([^)]*prism-adaptive-quality/u);
  });

  it("reports stalls honestly instead of sampling only the fast frames", () => {
    // Slow frames count with their full duration; only suspension-sized gaps
    // reset the window. Discarding >250ms frames and publishing single-frame
    // instant rates made a 3 FPS room read as 33 (once 240) and kept the
    // FPS-gated load sheds from engaging.
    assert.match(
      governor,
      /PRISM_FRAME_RATE_SUSPENSION_GAP_MS = 10_000/u,
    );
    assert.match(
      governor,
      /deltaMs <= PRISM_FRAME_RATE_SUSPENSION_GAP_MS/u,
    );
    assert.match(governor, /fpsWindowFrameCount \* 1_000/u);
    assert.doesNotMatch(governor, /deltaMs <= 250/u);
    assert.doesNotMatch(governor, /1_000 \/ deltaMs/u);
    assert.doesNotMatch(governor, /hasPublishedFps/u);
  });

  it("keeps scene and Debate frame sampling observe-only", () => {
    assert.match(sceneHost, /adaptiveQuality\.recordFrame/u);
    assert.doesNotMatch(sceneHost, /result\.qualityChanged/u);
    assert.match(sceneRuntime, /window = prismSceneTimingWindow/u);
    assert.doesNotMatch(sceneRuntime, /changeTier|qualityChanged/u);
    assert.match(debatePerformance, /controller\.recordFrame/u);
    assert.doesNotMatch(debatePerformance, /setQualityState|qualityChanged/u);
  });

  it("has no automatic quality CSS gate, including Signal effects", () => {
    for (const source of [globalStyles, pageStyles, signalStyles]) {
      assert.doesNotMatch(source, /data-prism-adaptive-quality/u);
    }
    assert.doesNotMatch(page, /data-prism-adaptive-surface/u);
    assert.match(page, /data-prism-expensive-effect="true"/u);
    assert.match(globalStyles, /data-prism-graphics-quality="low"/u);
  });
});
