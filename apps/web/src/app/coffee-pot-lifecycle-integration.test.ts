import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the live tray owns the Coffee pot return ref", () => {
  assert.equal(pageSource.match(/ref=\{coffeePotTrayRef\}/g)?.length, 1);
  assert.match(
    pageSource,
    /ref=\{coffeePotTrayRef\}[\s\S]{0,260}className=\{styles\.coffeePotTray\}/,
  );
  assert.doesNotMatch(
    pageSource,
    /ref=\{coffeePotTrayRef\}[\s\S]{0,260}className=\{styles\.coffeeGroupSessionButton\}/,
  );
});

test("return cleanup succeeds without mounted tray geometry", () => {
  assert.match(
    pageSource,
    /const trayRect = coffeePotTrayRef\.current\?\.getBoundingClientRect\(\);[\s\S]*const returnPoint = trayRect\s*\?[^:]+:\s*null;/,
  );
  assert.match(
    pageSource,
    /coffeePotDragRuntimeRef\.current = null;[\s\S]*coffeePotDragRef\.current = null;[\s\S]*if \(latest && returnPoint && !prefersReducedMotion\)/,
  );
  assert.doesNotMatch(pageSource, /if \(!trayRect\) return;/);
});

test("equipped pots support click, cancel, Escape, and phase cleanup", () => {
  assert.match(pageSource, /window\.addEventListener\("pointerdown", dropEquippedPot, true\)/);
  assert.match(pageSource, /window\.addEventListener\("pointerup", releaseDraggedPot\)/);
  assert.match(pageSource, /window\.removeEventListener\("pointerup", releaseDraggedPot\)/);
  assert.match(pageSource, /window\.addEventListener\("pointercancel", cancelEquippedPot, true\)/);
  assert.match(pageSource, /event\.key !== "Escape"/);
  assert.match(pageSource, /window\.addEventListener\("keydown", returnEquippedPotWithEscape, true\)/);
  assert.match(
    pageSource,
    /coffeePotDragRuntimeRef\.current = null;[\s\S]*clearCoffeeCupTopOffFillAnimation\(\);[\s\S]*setCoffeePotDrag\(null\);/,
  );
});
