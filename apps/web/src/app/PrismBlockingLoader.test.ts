import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat.ts";
import {
  getPrismSoftSynthesisUiServerSnapshot,
  getPrismSoftSynthesisUiSnapshot,
  registerPrismSoftSynthesisJobs,
  resetPrismSoftSynthesisUiForTests,
  setPrismSoftSynthesisExpanded,
} from "./prismSoftSynthesisUi.ts";

describe("PrismBlockingLoader elapsed formatting", () => {
  it("formats seconds under one minute", () => {
    assert.equal(formatBlockingLoaderElapsed(1_000, 46_000), "45s");
  });

  it("formats minutes with zero-padded seconds", () => {
    assert.equal(formatBlockingLoaderElapsed(0, 754_000), "12m 34s");
  });

  it("accepts ISO startedAt strings", () => {
    assert.equal(
      formatBlockingLoaderElapsed(
        "2026-08-05T19:00:00.000Z",
        Date.parse("2026-08-05T19:02:05.000Z"),
      ),
      "2m 05s",
    );
  });
});

describe("PrismBlockingLoader confirm-before-cancel contract", () => {
  const source = readFileSync(
    new URL("./PrismBlockingLoader.tsx", import.meta.url),
    "utf8",
  );

  it("requires in-card confirm before calling onCancel", () => {
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /blockingLoaderCancelAction\(confirming, "request"\)/u);
    assert.match(source, /onCancel\?\.\(\)/u);
    assert.doesNotMatch(source, /window\.confirm/u);
  });

  it("renders an elapsed timer from startedAt", () => {
    assert.match(source, /formatBlockingLoaderElapsed\(startedAt, nowMs\)/u);
    assert.match(source, /elapsedLabel/u);
  });

  it("anchors docked soft waits to the live companion while hard waits retain handoff", () => {
    assert.match(source, /placement: "docked"; operation\?: never/u);
    assert.match(source, /operation: "refraction"; onCancel: \(\) => void/u);
    assert.match(source, /placement === "docked"/u);
    assert.match(source, /data-prism-blocking-placement="docked"/u);
    assert.match(source, /useSyncExternalStore\(/u);
    assert.match(source, /companionVisual\.position/u);
    assert.match(source, /data-prism-soft-orb-anchored="true"/u);
    assert.match(source, /requestPrismCompanionView/u);
    assert.match(source, /Return to Prism chat/u);
    assert.match(source, /hardCompanionSuppressed/u);
    assert.match(source, /animatePrismOrbHandoff/u);
    assert.doesNotMatch(source, /setPrismSoftSynthesisLodged/u);
    assert.doesNotMatch(source, /setPrismSoftSynthesisPosition/u);
    assert.match(source, /setPrismSoftSynthesisExpanded\(false\)/u);
    assert.match(source, /activeChildren/u);
    assert.match(source, /queuedChildren/u);
    assert.match(source, /if \(docked\) return;/u);
  });
});

describe("PrismBlockingLoader docked styles", () => {
  const css = readFileSync(
    new URL("./prism-blocking-loader.module.css", import.meta.url),
    "utf8",
  );

  it("wraps soft cards around Prism and keeps outside-click minimize", () => {
    assert.match(css, /\.docked\s*\{/u);
    assert.match(css, /\.softDismiss\s*\{/u);
    assert.match(css, /z-index:\s*760/u);
    assert.match(css, /--soft-orb-anchor/u);
    assert.match(css, /data-dock="left"/u);
    assert.match(css, /data-vertical="above"/u);
    assert.match(css, /\.jobSectionLabel/u);
  });
});

describe("prism soft synthesis UI store", () => {
  it("caches the server snapshot React reads during hydration", () => {
    assert.strictEqual(
      getPrismSoftSynthesisUiServerSnapshot(),
      getPrismSoftSynthesisUiServerSnapshot(),
    );
  });

  it("starts minimized when soft jobs appear and tracks chip counts", () => {
    resetPrismSoftSynthesisUiForTests();
    registerPrismSoftSynthesisJobs("debate", 2);
    const snap = getPrismSoftSynthesisUiSnapshot();
    assert.equal(snap.jobCount, 2);
    assert.equal(snap.expanded, false);
    assert.deepEqual(Object.keys(snap).sort(), [
      "expanded",
      "jobCount",
      "orbOpensProgress",
    ]);
    assert.equal(snap.orbOpensProgress, false);
    setPrismSoftSynthesisExpanded(true);
    assert.equal(getPrismSoftSynthesisUiSnapshot().expanded, true);
    registerPrismSoftSynthesisJobs("debate", 0);
    assert.equal(getPrismSoftSynthesisUiSnapshot().jobCount, 0);
    assert.equal(getPrismSoftSynthesisUiSnapshot().expanded, false);
  });

  it("lets a scoped soft workflow temporarily route the orb to Progress", () => {
    resetPrismSoftSynthesisUiForTests();
    registerPrismSoftSynthesisJobs("whodunnit-items", 1, {
      orbOpensProgress: true,
    });
    assert.equal(getPrismSoftSynthesisUiSnapshot().orbOpensProgress, true);
    registerPrismSoftSynthesisJobs("signal", 2);
    assert.equal(getPrismSoftSynthesisUiSnapshot().jobCount, 3);
    assert.equal(getPrismSoftSynthesisUiSnapshot().orbOpensProgress, true);
    registerPrismSoftSynthesisJobs("whodunnit-items", 0);
    assert.equal(getPrismSoftSynthesisUiSnapshot().orbOpensProgress, false);
  });
});
