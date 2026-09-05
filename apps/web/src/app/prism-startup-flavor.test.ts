import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextPrismStartupFlavorLine,
  nextPrismStartupSpectrumIndex,
  PRISM_STARTUP_FLAVOR_INITIAL_DELAY_MS,
  PRISM_STARTUP_FLAVOR_INTERVAL_MS,
  PRISM_STARTUP_FLAVOR_LINES,
  prismStartupTraceText,
} from "./prismStartupFlavor.ts";

describe("PRISM startup flavor", () => {
  it("keeps a varied, private-data-free catalog for ordinary startup waits", () => {
    assert.ok(PRISM_STARTUP_FLAVOR_LINES.length >= 20);
    assert.equal(
      new Set(PRISM_STARTUP_FLAVOR_LINES).size,
      PRISM_STARTUP_FLAVOR_LINES.length,
    );
    assert.ok(PRISM_STARTUP_FLAVOR_LINES.includes("Pouring coffee..."));
    assert.ok(PRISM_STARTUP_FLAVOR_LINES.includes("Warming up the bots..."));
    assert.ok(
      PRISM_STARTUP_FLAVOR_LINES.every(
        (line) =>
          !/account|password|api key|conversation|memory|asset|user/iu.test(line),
      ),
    );
  });

  it("waits for a genuine quiet gap and then keeps an unhurried cadence", () => {
    assert.ok(PRISM_STARTUP_FLAVOR_INITIAL_DELAY_MS >= 2500);
    assert.ok(PRISM_STARTUP_FLAVOR_INTERVAL_MS >= 3000);
  });

  it("uses every line before cycling", () => {
    let cursor = 0;
    const firstPass: string[] = [];
    for (let index = 0; index < PRISM_STARTUP_FLAVOR_LINES.length; index += 1) {
      const step = nextPrismStartupFlavorLine(cursor);
      firstPass.push(step.text);
      cursor = step.nextCursor;
    }
    assert.deepEqual(firstPass, [...PRISM_STARTUP_FLAVOR_LINES]);
    assert.equal(
      nextPrismStartupFlavorLine(cursor).text,
      PRISM_STARTUP_FLAVOR_LINES[0],
    );
  });

  it("chooses a varied Prism color without repeating the previous spark", () => {
    for (const previous of [0, 1, 2, 3, 4]) {
      for (const sample of [0, 0.24, 0.51, 0.76, 0.999999]) {
        const next = nextPrismStartupSpectrumIndex(previous, sample);
        assert.ok(next >= 0 && next < 5);
        assert.notEqual(next, previous);
      }
    }
  });

  it("gives every displayed trace line one consistent ellipsis", () => {
    assert.equal(prismStartupTraceText("Account settings ready."), "Account settings ready...");
    assert.equal(prismStartupTraceText("Pouring coffee..."), "Pouring coffee...");
    assert.equal(prismStartupTraceText("Web interface ready"), "Web interface ready...");
    assert.equal(prismStartupTraceText("Loading bots…"), "Loading bots...");
  });
});
