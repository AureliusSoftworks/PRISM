import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const navigator = readFileSync(
  new URL("./PrismTetrahedronNavigator.tsx", import.meta.url),
  "utf8",
);
const model = readFileSync(
  new URL("./prismTetrahedronModel.ts", import.meta.url),
  "utf8",
);

test("makes the tetrahedron the chat companion's primary control surface", () => {
  assert.match(companion, /<PrismTetrahedronNavigator/u);
  assert.match(navigator, /data-prism-tetrahedron-navigator="true"/u);
  assert.match(navigator, /onOpenSaved/u);
  assert.match(navigator, /onOpenPrivate/u);
  assert.match(navigator, /onContinueFocused/u);
  assert.match(navigator, /onOpenProgress/u);
  assert.doesNotMatch(companion, /PrismCompanionViewTabs|panelView/u);
});

test("maps all four faces to chat-adjacent controls without persistence", () => {
  assert.match(model, /id: "saved"/u);
  assert.match(model, /id: "private"/u);
  assert.match(model, /id: "focus"/u);
  assert.match(model, /id: "progress"/u);
  assert.match(navigator, /pickPrismTetrahedronFace/u);
  assert.match(navigator, /Drag to turn · choose a face/u);
  assert.doesNotMatch(navigator, /fetch\(|localStorage|sessionStorage/u);
});

test("keeps progress bounded to active synthesis work", () => {
  assert.match(
    navigator,
    /id === "progress" && synthesisJobCount === 0/u,
  );
  assert.match(companion, /setPrismSoftSynthesisExpanded\(true\)/u);
  assert.match(companion, /softJobChip/u);
  assert.doesNotMatch(companion, /Recent syntheses|global-prism-synthesis/u);
});
