import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("./SceneMediaVignette.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./sceneMediaVignette.module.css", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const mystery = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);

test("shares one input-transparent Light and Dark top-and-bottom veil across scene media", () => {
  assert.match(component, /data-theme=\{props\.theme\}/u);
  assert.match(styles, /pointer-events:\s*none/u);
  assert.match(styles, /\.vignette\[data-theme="dark"\]::before/u);
  assert.match(styles, /\.vignette\[data-theme="light"\]::after/u);
  assert.match(styles, /\.vignette::before \{ color: #000; \}/u);
  assert.match(styles, /\.vignette::after \{ color: #fff; \}/u);
  assert.match(styles, /currentColor 0%[\s\S]*?currentColor 100%/u);
  assert.match(styles, /linear-gradient\([\s\S]*?to bottom/u);
  assert.doesNotMatch(styles, /to right/u);
  assert.doesNotMatch(styles, /radial-gradient/u);
  assert.doesNotMatch(styles, /scene-vignette-(?:left|right)-clear/u);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?transition:\s*none/u);
  assert.match(page, /<SceneMediaVignette[\s\S]*?theme=\{resolvedTheme\}/u);
  assert.equal(mystery.match(/<SceneMediaVignette\b/gu)?.length, 3);
});

test("has no per-consumer axis escape hatch that can restore side vignettes", () => {
  assert.doesNotMatch(component, /axis\??:/u);
  assert.doesNotMatch(component, /data-axis/u);
  assert.doesNotMatch(mystery, /axis="/u);
});
