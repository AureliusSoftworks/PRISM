import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  botPowerRuneDesign,
  botPowerRuneTracePath,
} from "./botPowerRuneDesign.ts";

const SOURCE = {
  id: "power-echo",
  name: "Signal Ghost",
  intent: "She becomes visible only while speaking.",
  sigil: "arc" as const,
};

const componentSource = readFileSync(
  new URL("./BotPowerRune.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./BotPowerRune.module.css", import.meta.url),
  "utf8",
);

test("Power runes are deterministic signatures of the authored Power", () => {
  const first = botPowerRuneDesign(SOURCE);
  const second = botPowerRuneDesign({ ...SOURCE });

  assert.deepEqual(second, first);
  assert.equal(first.runeId, "arc");
  assert.ok(first.traces.length >= 3);
  assert.ok(first.nodes.length >= 4);
  assert.ok(first.signalArcLength >= 11 && first.signalArcLength <= 17);
});

test("rerolling the portable recipe produces a different procedural rune", () => {
  const first = botPowerRuneDesign(SOURCE);
  const rerolled = botPowerRuneDesign({ ...SOURCE, sigil: "gate" });

  assert.equal(rerolled.runeId, "gate");
  assert.notDeepEqual(rerolled, first);
  assert.notEqual(rerolled.seed, first.seed);
});

test("generated circuitry stays bounded on the machine grid", () => {
  const design = botPowerRuneDesign(SOURCE);
  const points = [
    ...design.traces.flat(),
    ...design.nodes,
    design.core,
  ];

  for (const point of points) {
    assert.ok(point.x >= 14 && point.x <= 86, `x ${point.x}`);
    assert.ok(point.y >= 14 && point.y <= 86, `y ${point.y}`);
    assert.equal(Number.isInteger(point.x), true);
    assert.equal(Number.isInteger(point.y), true);
  }
  assert.match(botPowerRuneTracePath(design.traces[0]!), /^M\d+ \d+(?: L\d+ \d+)+$/u);
});

test("scanner animation stays clipped, compact, and continuously phased", () => {
  assert.match(
    componentSource,
    /className=\{styles\.scopeRail\} cx="50" cy="50" r="31"/u,
  );
  assert.match(componentSource, /signalArcLength/u);
  assert.match(cssSource, /\.rune\s*\{[\s\S]*?overflow:\s*hidden;/u);
  assert.match(cssSource, /\.diagram\s*\{[\s\S]*?overflow:\s*hidden;/u);
  assert.match(
    cssSource,
    /animation:\s*powerRuneSignalOrbit 11s linear infinite;/u,
  );
  assert.match(cssSource, /stroke-dashoffset:\s*-195;/u);
  assert.doesNotMatch(cssSource, /steps\(/u);
  assert.doesNotMatch(cssSource, /rotate:\s*360deg/u);
});
