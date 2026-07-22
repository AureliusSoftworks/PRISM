import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const api = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

test("mounts the global companion on every authenticated product shell", () => {
  assert.ok((page.match(/renderGlobalPrismCompanion\(\)/gu)?.length ?? 0) >= 7);
  assert.match(page, /surfaceId: "home"/u);
  assert.match(page, /surfaceId: "group-home"/u);
  assert.match(page, /surfaceId: "zen"/u);
  assert.match(page, /surfaceId: "prism-home"/u);
  assert.match(page, /surfaceId: "coffee"/u);
  assert.match(page, /surfaceId: "signal"/u);
  assert.match(page, /surfaceId: "slate"/u);
  assert.match(page, /surfaceId: "marketplace"/u);
  assert.match(page, /surfaceId: "avatar-studio"/u);
  assert.match(page, /surfaceId: "images"/u);
  assert.match(page, /surfaceId: "settings"/u);
});

test("keeps the companion explicit, keyboard accessible, and non-destructive", () => {
  assert.match(component, /aria-keyshortcuts="Alt\+Space Control\+Space"/u);
  assert.match(component, /createPortal\(/u);
  assert.match(component, /document\.body/u);
  assert.match(component, /window\.sessionStorage/u);
  assert.match(component, /onAction\(action\)/u);
  assert.doesNotMatch(component, /delete_bot|delete_project|delete_conversation/u);
  assert.match(page, /Select the exact Zen text you want to send/u);
});

test("retires the full-manuscript Slate chat route in favor of global metadata", () => {
  assert.match(api, /Slate project chat has moved to the global Prism companion/u);
  assert.match(api, /route\("POST", "\/api\/prism-companion"/u);
});
