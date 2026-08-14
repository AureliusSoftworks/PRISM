import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./botcast.module.css", import.meta.url), "utf8");

test("Signal isolates a static grain overlay from the live studio", () => {
  const stage = Array.from(
    css.matchAll(/\.stageViewport\s*\{[^}]*\}/gu),
  ).find(([rule]) => rule.includes("isolation: isolate"))?.[0] ?? "";
  const grain = Array.from(
    css.matchAll(/\.stageViewport::after\s*\{[^}]*\}/gu),
  ).find(([rule]) => rule.includes("signal-film-grain.svg"))?.[0] ?? "";

  assert.match(stage, /isolation:\s*isolate/u);
  assert.match(stage, /contain:\s*paint/u);
  assert.match(grain, /signal-film-grain\.svg/u);
  assert.doesNotMatch(grain, /animation\s*:/u);
  assert.doesNotMatch(css, /@keyframes signalFilmGrainJitter/u);
});
