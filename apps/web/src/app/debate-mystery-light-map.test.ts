import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const cssSource = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");

describe("Whodunnit Light Mode mansion map", () => {
  it("owns the structural map materials instead of inheriting Dark Mode surfaces", () => {
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.mansionCorridor\s*\{[\s\S]*?linear-gradient\(145deg, #587181, #354d5d\)/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.mansionRoom::after\s*\{[\s\S]*?linear-gradient\(180deg, #78909f, #425968\)/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.mansionDoor\s*\{[\s\S]*?background:\s*#f5c75f/u);
  });

  it("keeps blueprint hierarchy and authored room art legible in Light Mode", () => {
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.mansionCanvas\s*\{[\s\S]*?background-size:\s*140px 140px, 140px 140px, 28px 28px, 28px 28px, auto/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.venueHullOutline polygon\s*\{[\s\S]*?stroke:\s*rgba\(18, 108, 121, 0\.64\)/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.mansionRoom\[data-room-art\]\s*\{[\s\S]*?var\(--mansion-room-image\) center \/ cover no-repeat/u);
  });
});
