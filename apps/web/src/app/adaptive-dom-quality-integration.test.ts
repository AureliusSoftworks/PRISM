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
const nativeTooltipGuard = readFileSync(
  new URL("./DisableNativeTooltips.tsx", import.meta.url),
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

  it("publishes FPS telemetry and applies a separate runtime quality floor", () => {
    assert.match(governor, /controller\.recordFrame/u);
    assert.match(governor, /publishPrismFrameRate/u);
    assert.match(governor, /dataset\.prismRuntimeQuality/u);
    assert.match(governor, /recordInteractionDelay/u);
    assert.match(governor, /addEventListener\("beforeinput"/u);
  });

  it("detects longtask support from the registry, not from a thrown error", () => {
    // `observe()` aborts with a console warning on an unsupported entry type
    // rather than throwing, so a try/catch can never detect WebKit's missing
    // longtask API. That left the observer non-null on the desktop webview,
    // made the event-loop-lag fallback unreachable, and pinned the meter at
    // `busy 0ms/s` in every session regardless of load.
    assert.match(
      governor,
      /PerformanceObserver\.supportedEntryTypes[\s\S]{0,60}includes\("longtask"\)/u,
    );
    assert.match(governor, /if \(supportsLongTask\) \{/u);
  });

  it("still measures main-thread busy time where longtask is unavailable", () => {
    // Low FPS with near-zero busy is the signature of compositor/GPU cost
    // rather than scripting; that distinction only exists if this fallback
    // can actually run.
    assert.match(governor, /loopLagMsInWindow/u);
    assert.match(
      governor,
      /busyMsPerSecond = longTaskObserver[\s\S]{0,160}loopLagMsInWindow/u,
    );
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

  it("keeps live Coffee and Signal phosphor outside adaptive load shedding", () => {
    assert.match(globalStyles, /data-prism-runtime-quality="minimal"/u);
    assert.match(globalStyles, /data-prism-graphics-quality="low"/u);
    assert.match(signalStyles, /data-live-episode="true"/u);
    assert.doesNotMatch(page, /data-prism-live-performance-surface/u);
    assert.doesNotMatch(page, /data-prism-live-phosphor-budget/u);
    assert.doesNotMatch(page, /<PrismLivePerformanceBodyMarker/u);
    assert.doesNotMatch(
      globalStyles,
      /body\[data-prism-live-performance-active="true"\]/u,
    );
    assert.doesNotMatch(globalStyles, /data-prism-live-phosphor-budget/u);
    assert.doesNotMatch(
      signalStyles,
      /\.shell\[data-live-episode="true"\] \.stageViewport::after,[\s\S]{0,220}\.studioGlow,[\s\S]{0,160}\.signalFloorGlowLayer[\s\S]{0,160}display: none;/u,
    );
    assert.match(
      globalStyles,
      /data-prism-runtime-quality="minimal"[\s\S]{0,220}:not\([\s\S]{0,120}data-crt-phosphor="bot"/u,
    );
    assert.match(page, /data-prism-priority-phosphor="true"/u);
  });

  it("chunks post-session native-tooltip cleanup across animation frames", () => {
    assert.match(nativeTooltipGuard, /TITLE_SWEEP_CHUNK_SIZE = 4/u);
    assert.match(
      nativeTooltipGuard,
      /processed >= TITLE_SWEEP_CHUNK_SIZE/u,
    );
    assert.match(nativeTooltipGuard, /requestAnimationFrame/u);
    assert.match(
      page,
      /Restoring the setup canvas is non-urgent[\s\S]{0,180}startTransition/u,
    );
    assert.match(
      pageStyles,
      /\.coffeeGroupSessionListViewport \{[\s\S]{0,260}contain: layout paint style;/u,
    );
    assert.match(
      pageStyles,
      /\.coffeeGroupSessionRow \{[\s\S]{0,100}content-visibility: auto;[\s\S]{0,80}contain-intrinsic-size: auto 34px;/u,
    );
    assert.match(
      page,
      /coffeeSetupRestoreStage[\s\S]{0,900}coffeeSetupRestoreSessionLimit/u,
    );
    assert.match(
      page,
      /assignCoffeeSetupRestoreStage\("overview"\)[\s\S]{0,180}assignCoffeeSetupRestoreStage\("sidebar"\)[\s\S]{0,420}revealedSessions \+ 3/u,
    );
    assert.match(
      page,
      /schedule\(\(\) => \{[\s\S]{0,80}startTransition\(\(\) => \{[\s\S]{0,100}assignCoffeeSetupRestoreStage\("overview"\)/u,
    );
    assert.match(
      page,
      /revealedSessions = Math\.min[\s\S]{0,180}startTransition\(\(\) => \{[\s\S]{0,100}setCoffeeSetupRestoreSessionLimit\(revealedSessions\)/u,
    );
    assert.match(
      page,
      /groupSessions[\s\S]{0,120}slice\(0, coffeeSetupRestoreSessionLimit\)/u,
    );
  });
});
