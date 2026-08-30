import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const prototype = readFileSync(
  new URL("./PrismTetrahedronPrototype.tsx", import.meta.url),
  "utf8",
);

test("keeps the tetrahedron proof behind an explicit Prism menu button", () => {
  assert.match(
    companion,
    /<PrismTetrahedronPrototype\s+key=\{surface\.surfaceId\}\s*\/>/u,
  );
  assert.match(prototype, /data-prism-tetrahedron-trigger="true"/u);
  assert.match(prototype, /Tetrahedron\s*<small>prototype<\/small>/u);
  assert.match(prototype, /data-prism-tetrahedron-study="true"/u);
});

test("keeps the proof local and makes the forward facet readable", () => {
  assert.match(prototype, /data-prism-tetrahedron-face-label/u);
  assert.match(prototype, /pickPrismTetrahedronFace/u);
  assert.match(prototype, /selected locally/u);
  assert.doesNotMatch(prototype, /fetch\(|localStorage|sessionStorage/u);
});
