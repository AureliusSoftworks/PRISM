import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("FPS counter is opt-in, persisted locally, and mounted in the app shell", () => {
  assert.match(pageSource, /FPS_COUNTER_STORAGE_KEY = "prism\.fps-counter\.enabled"/u);
  assert.match(pageSource, /window\.localStorage\.setItem\(FPS_COUNTER_STORAGE_KEY/u);
  assert.match(pageSource, /requestAnimationFrame\(tick\)/u);
  assert.match(pageSource, /<FpsCounter \/>/u);
  assert.match(pageSource, /data-settings-action="toggle-fps-counter"/u);
  assert.match(pageSource, /Show FPS counter/u);
});

test("FPS counter stays tiny and pinned to the bottom-left", () => {
  assert.match(
    cssSource,
    /\.fpsCounter\s*\{[\s\S]*position:\s*fixed;[\s\S]*bottom:\s*4px;[\s\S]*left:\s*6px;[\s\S]*font:\s*600 9px/u,
  );
});

test("FPS counter uses black text in Light Mode", () => {
  assert.match(
    cssSource,
    /:global\(body\[data-prism-theme="light"\]\) \.fpsCounter\s*\{\s*color:\s*#000;/u,
  );
});
