import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat.ts";
import {
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
    assert.match(source, /setConfirming\(true\)/u);
    assert.match(source, /onCancel\?\.\(\)/u);
    assert.doesNotMatch(source, /window\.confirm/u);
  });

  it("renders an elapsed timer from startedAt", () => {
    assert.match(source, /formatBlockingLoaderElapsed\(startedAt, nowMs\)/u);
    assert.match(source, /elapsedLabel/u);
  });

  it("supports a docked soft-wait placement with minimize and delayed hard companion suppression", () => {
    assert.match(source, /placement\?: PrismBlockingLoaderPlacement/u);
    assert.match(source, /placement === "docked"/u);
    assert.match(source, /data-prism-blocking-placement="docked"/u);
    assert.match(source, /hardCompanionSuppressed/u);
    assert.match(source, /animatePrismOrbHandoff/u);
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

  it("supports relocatable soft cards and outside-click minimize", () => {
    assert.match(css, /\.docked\s*\{/u);
    assert.match(css, /\.softDismiss\s*\{/u);
    assert.match(css, /z-index:\s*760/u);
    assert.match(css, /\.jobSectionLabel/u);
  });
});

describe("prism soft synthesis UI store", () => {
  it("starts minimized when soft jobs appear and tracks chip counts", () => {
    resetPrismSoftSynthesisUiForTests();
    registerPrismSoftSynthesisJobs("debate", 2);
    const snap = getPrismSoftSynthesisUiSnapshot();
    assert.equal(snap.jobCount, 2);
    assert.equal(snap.expanded, false);
    setPrismSoftSynthesisExpanded(true);
    assert.equal(getPrismSoftSynthesisUiSnapshot().expanded, true);
    registerPrismSoftSynthesisJobs("debate", 0);
    assert.equal(getPrismSoftSynthesisUiSnapshot().jobCount, 0);
    assert.equal(getPrismSoftSynthesisUiSnapshot().expanded, false);
  });
});
