import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(root, "page.tsx"), "utf8");
const pageCss = readFileSync(join(root, "page.module.css"), "utf8");

test("power whitelist cosmetics wire opacity, sealed mouth, and meta sigil", () => {
  assert.match(
    pageSource,
    /data-power-avatar-opacity=\{[\s\S]{0,220}botPowerAvatarOpacity/u,
  );
  assert.match(
    pageSource,
    /data-power-mouth-motion=\{[\s\S]{0,160}sealed/u,
  );
  assert.match(
    pageSource,
    /data-power-meta-sigil=\{[\s\S]{0,120}botPowerMetaSigil/u,
  );
  assert.match(
    pageSource,
    /botPowerAuthoringParadoxHintV1\(powers\)/u,
  );
  assert.match(pageCss, /\.botPowerParadoxHint\s*\{/u);
  assert.match(
    pageCss,
    /\.coffeeSeat\[data-power-avatar-opacity="0\.5"\]/u,
  );
  assert.match(
    pageCss,
    /\[data-power-meta-sigil="refraction"\]/u,
  );
});
