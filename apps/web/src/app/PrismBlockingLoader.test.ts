import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatBlockingLoaderElapsed } from "./prismBlockingLoaderFormat.ts";

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

  it("supports a docked soft-wait placement without inert or companion suppression", () => {
    assert.match(source, /placement\?: PrismBlockingLoaderPlacement/u);
    assert.match(source, /placement === "docked"/u);
    assert.match(source, /data-prism-blocking-placement="docked"/u);
    assert.match(source, /docked \? null : \(\s*<PrismCompanionPresenceBoundary/u);
    assert.match(source, /if \(docked\) return;/u);
  });
});

describe("PrismBlockingLoader docked styles", () => {
  const css = readFileSync(
    new URL("./prism-blocking-loader.module.css", import.meta.url),
    "utf8",
  );

  it("docks the soft refract card like Signal’s bottom-right activity shell", () => {
    assert.match(css, /\.docked\s*\{/u);
    assert.match(css, /right:\s*22px/u);
    assert.match(css, /bottom:\s*22px/u);
    assert.match(css, /z-index:\s*760/u);
  });
});
