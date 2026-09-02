import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const component = readFileSync(
  new URL("./PrismStartupScreen.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./prism-startup-screen.module.css", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const nativeSplash = readFileSync(
  new URL("../../../desktop/webview/index.html", import.meta.url),
  "utf8",
);
const flavorCatalog = readFileSync(
  new URL("./prismStartupFlavor.ts", import.meta.url),
  "utf8",
);
const progressContract = readFileSync(
  new URL("./prismStartupProgress.ts", import.meta.url),
  "utf8",
);

describe("continued PRISM startup screen", () => {
  it("retains the native hero and service vocabulary", () => {
    assert.match(component, /data-prism-startup-screen="true"/u);
    assert.match(component, /M28 6L48 43H8L28 6Z/u);
    assert.match(component, /\["Qdrant", "API", "Web"\]/u);
  });

  it("fills the triangle only after authentication", () => {
    assert.match(
      component,
      /data-prism-startup-glyph="authenticated"[\s\S]{0,160}fill="currentColor"/u,
    );
    assert.doesNotMatch(
      component,
      /data-prism-startup-glyph="authenticated"[\s\S]{0,320}stroke="currentColor"/u,
    );
    assert.match(
      nativeSplash,
      /M28 6L48 43H8L28 6Z" stroke="currentColor"/u,
    );
  });

  it("keeps the terminal behind the hero while workspace lines continue", () => {
    assert.match(component, /role="log" aria-label="Boot log"/u);
    assert.match(component, /Startup Trace/u);
    assert.match(css, /\.console \{[\s\S]*z-index: 1;/u);
    assert.match(css, /\.focusMask \{[\s\S]*z-index: 2;/u);
    assert.match(css, /\.center \{[\s\S]*z-index: 3;/u);
  });

  it("uses a PRISM refraction trace instead of traffic-light window chrome", () => {
    for (const source of [component, nativeSplash]) {
      assert.match(source, /prism-startup-spectrum/u);
      assert.match(source, /Startup Trace/u);
      assert.match(source, /M18 1\.5 23 10\.5H13L18 1\.5Z/u);
      assert.doesNotMatch(source, /console-?Dot/u);
      assert.doesNotMatch(source, /#ff5f57|#febc2e|#28c840/u);
    }
    assert.match(css, /\.consoleRule \{[\s\S]*linear-gradient/u);
  });

  it("lets the hero focus falloff finish before the viewport edge", () => {
    for (const source of [css, nativeSplash]) {
      const focusStart = source.search(/\.focus-?Mask|\.focus-mask/u);
      const focusEnd = source.indexOf("}", focusStart);
      const focusRule = source.slice(focusStart, focusEnd + 1);
      assert.match(focusRule, /inset: 0;/u);
      assert.match(focusRule, /ellipse 48% 46% at center/u);
      assert.match(focusRule, /transparent 100%/u);
      assert.doesNotMatch(focusRule, /width:|height:|filter:/u);
    }
  });

  it("keeps retry available without replacing the startup presentation", () => {
    assert.match(component, /failed && onRetry/u);
    assert.match(component, />\s*Try again\s*</u);
    assert.match(css, /\.retry:focus-visible/u);
  });

  it("pauses loading motion and presents failure without hiding diagnostics", () => {
    for (const source of [nativeSplash, css]) {
      assert.match(source, /data-prism-startup-state="failed"[\s\S]*animation-play-state: paused/u);
      assert.match(source, /data-prism-startup-state="failed"[\s\S]*transition: none/u);
    }
    assert.match(nativeSplash, /id="startup-failure-help" role="alert" hidden/u);
    assert.match(component, /data-prism-startup-state=\{failed \? "failed" : "loading"\}/u);
    assert.match(component, /const displayLabel = failed\s*\? "Your private workspace couldn’t open\."/u);
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /const flavorEnabled =\s*accountWorkspaceStartup.phase === "checking-session" \|\|\s*accountWorkspaceStartup.phase === "loading-workspace";\s*if \(!flavorEnabled\) return;/u);
    assert.match(page, /return \(\) => window.clearInterval\(intervalId\);\s*\}, \[accountWorkspaceStartup.phase/u);
  });

  it("distinguishes ambient flavor from authoritative startup status", () => {
    assert.match(component, /data-kind=\{line\.kind \?\? "status"\}/u);
    assert.match(component, /line\.kind === "flavor" \? "true"/u);
    assert.match(nativeSplash, /STARTUP_FLAVOR_INITIAL_DELAY_MS = 2800/u);
    assert.match(nativeSplash, /line\.dataset\.kind = kind/u);
    assert.match(nativeSplash, /kind === "flavor"[\s\S]*aria-hidden/u);
    assert.match(nativeSplash, /appendLog\("prism", flavor, "flavor"\)/u);
    assert.match(nativeSplash, /"Calibrating the spectrum\.\.\."/u);
    assert.match(nativeSplash, /"Aligning the mirrors\.\.\."/u);
    assert.match(flavorCatalog, /"Pouring coffee\.\.\."/u);
    assert.match(flavorCatalog, /"Warming up the bots\.\.\."/u);
    assert.doesNotMatch(nativeSplash, /Pouring coffee|Warming up the bots/u);
  });

  it("uses white message copy with a random Prism spark on the first word", () => {
    assert.match(component, /data-spectrum=\{line\.spectrumIndex/u);
    assert.match(css, /\.logText \{[\s\S]*color: #fff;/u);
    assert.match(css, /data-spectrum="0"[\s\S]*#ff4d6d/u);
    assert.match(css, /data-spectrum="4"[\s\S]*#7b5cff/u);
    assert.doesNotMatch(css, /data-kind="flavor"[\s\S]*\.logText/u);
    assert.match(nativeSplash, /nextStartupSpectrumIndex\(\)/u);
    assert.match(nativeSplash, /line\.dataset\.spectrum/u);
    assert.match(nativeSplash, /\.log-text \{[\s\S]*color: #fff;/u);
  });

  it("normalizes every displayed trace message to an ellipsis", () => {
    assert.match(component, /prismStartupTraceText\(line\.text\)/u);
    assert.match(nativeSplash, /function startupTraceText\(text\)/u);
    assert.match(nativeSplash, /msg\.textContent = startupTraceText\(text\)/u);
  });

  it("copies only the displayed startup trace with accessible feedback", () => {
    assert.match(
      nativeSplash,
      /id="copy-log"[^>]*aria-label="Copy displayed startup trace"/u,
    );
    assert.match(
      nativeSplash,
      /id="copy-log-status" role="status" aria-live="polite"/u,
    );
    assert.match(nativeSplash, /function displayedStartupTrace\(\)/u);
    assert.match(
      nativeSplash,
      /querySelectorAll\("\.log-line"\)[\s\S]*\.log-src[\s\S]*\.log-text/u,
    );
    assert.doesNotMatch(nativeSplash, /readFile|fetch\(/u);
    assert.match(nativeSplash, /navigator\.clipboard\?\.writeText/u);
    assert.match(nativeSplash, /document\.execCommand\("copy"\)/u);
    assert.match(nativeSplash, /setCopyLogFeedback\("Copied"\)/u);
    assert.match(nativeSplash, /setCopyLogFeedback\("Unable to copy"\)/u);
  });

  it("hands off atomically without moving the hero", () => {
    const veilStart = css.indexOf(".veil {");
    const veilRule = css.slice(veilStart, css.indexOf("}", veilStart) + 1);
    const centerStart = css.indexOf(".center {");
    const centerRule = css.slice(
      centerStart,
      css.indexOf("}", centerStart) + 1,
    );
    assert.match(component, /data-prism-startup-stage="workspace"/u);
    assert.doesNotMatch(veilRule, /animation:/u);
    assert.doesNotMatch(centerRule, /animation:/u);
    assert.match(nativeSplash, /animation: veilIn 420ms ease-out both/u);
    assert.doesNotMatch(nativeSplash, /floatIn/u);
    assert.match(css, /\.consoleLines \{[\s\S]*handoffDetailIn 240ms/u);
  });

  it("keeps the ambient orb motion in phase across both documents", () => {
    for (const source of [component, nativeSplash]) {
      assert.match(source, /--prism-startup-ring-phase/u);
      assert.match(source, /now % 4800/u);
      assert.match(source, /now % 2600/u);
      assert.match(source, /now % 2800/u);
      assert.match(source, /now % 7200/u);
      assert.doesNotMatch(source, /--prism-startup-glyph-phase|now % 1550/u);
    }
    for (const source of [css, nativeSplash]) {
      assert.match(
        source,
        /animation-delay: var\(--prism-startup-ring-phase, 0ms\)/u,
      );
      assert.match(source, /\.orb \{[\s\S]*animation: haloDrift 2\.6s/u);
    }
  });

  it("keeps the triangle fixed while the surrounding orb moves", () => {
    assert.match(
      component,
      /className=\{styles\.halo\}[\s\S]*className=\{styles\.orb\}[\s\S]*className=\{styles\.glyph\}/u,
    );
    assert.match(
      nativeSplash,
      /class="halo"[\s\S]*class="orb"[\s\S]*class="glyph"/u,
    );
    for (const source of [css, nativeSplash]) {
      const glyphStart = source.indexOf(".glyph {");
      const glyphRule = source.slice(
        glyphStart,
        source.indexOf("}", glyphStart) + 1,
      );
      assert.match(glyphRule, /opacity: 1;/u);
      assert.match(glyphRule, /transform: none;/u);
      assert.doesNotMatch(glyphRule, /animation:/u);
      assert.doesNotMatch(source, /glyphPulse/u);
    }
  });

  it("keeps the optical axis independent while light flows continuously", () => {
    assert.match(
      component,
      /className=\{styles\.center\}[\s\S]*className=\{styles\.optics\}[\s\S]*className=\{styles\.halo\}/u,
    );
    assert.match(
      nativeSplash,
      /class="center"[\s\S]*class="optics"[\s\S]*class="halo"/u,
    );
    for (const source of [css, nativeSplash]) {
      const opticsStart = source.search(/\.optics \{/u);
      const opticsRule = source.slice(
        opticsStart,
        source.indexOf("}", opticsStart) + 1,
      );
      assert.match(opticsRule, /--startup-halo-radius/u);
      assert.doesNotMatch(opticsRule, /animation:/u);
      assert.match(source, /incomingFlow 7\.2s linear infinite/u);
      assert.match(source, /spectrumFlow 7\.2s linear infinite/u);
      assert.match(source, /--prism-startup-optics-flow-phase/u);
      assert.match(source, /transition: clip-path 1(?:600|800)ms linear/u);
    }
  });

  it("refracts a truthful loading beam through matching optical geometry", () => {
    for (const source of [component, nativeSplash]) {
      assert.match(source, /role="progressbar"/u);
      assert.match(source, /M0 160L1000 18/u);
      assert.match(source, /M0 160L1000 82/u);
      assert.match(source, /M0 160L1000 142/u);
      assert.match(source, /M0 160L1000 222/u);
      assert.match(source, /M0 160L1000 302/u);
    }
    assert.match(component, /prismStartupProgressFromLogs\(logs\)/u);
    assert.match(nativeSplash, /STARTUP_SERVICE_PROGRESS/u);
    assert.match(nativeSplash, /"web:ready": 0\.72/u);
    assert.match(
      progressContract,
      /PRISM_STARTUP_WORKSPACE_BASE_PROGRESS = 0\.72/u,
    );
    assert.match(
      progressContract,
      /PRISM_STARTUP_REFRACTION_CONTACT_PROGRESS =\s*PRISM_STARTUP_WORKSPACE_BASE_PROGRESS/u,
    );
    assert.match(nativeSplash, /STARTUP_REFRACTION_CONTACT_PROGRESS = 0\.72/u);
    assert.match(
      css,
      /\.incomingBeam \{[\s\S]*--prism-startup-beam-remainder/u,
    );
    assert.match(
      css,
      /\.spectrum \{[\s\S]*--prism-startup-spectrum-remainder/u,
    );
    assert.match(css, /\.spectrumRay \{[\s\S]*stroke-width: 1\.4/u);
  });

  it("keeps optical progress calm for reduced-motion players", () => {
    for (const source of [css, nativeSplash]) {
      assert.match(
        source,
        /prefers-reduced-motion: reduce[\s\S]*incoming(?:Beam|-beam)[\s\S]*transition: none !important/u,
      );
    }
  });

  it("lets the completed spectrum resolve before crossfading into Home", () => {
    assert.match(component, /Your private workspace is ready\./u);
    assert.match(progressContract, /PRISM_STARTUP_COMPLETION_HOLD_MS = 2200/u);
    assert.match(progressContract, /PRISM_STARTUP_CROSSFADE_MS = 800/u);
    assert.match(
      globalCss,
      /data-prism-startup-handoff[\s\S]*prism-startup-handoff-out[\s\S]*prism-startup-handoff-in/u,
    );
    assert.match(
      globalCss,
      /prefers-reduced-motion: reduce[\s\S]*data-prism-startup-handoff[\s\S]*animation-duration: 160ms/u,
    );
  });
});
