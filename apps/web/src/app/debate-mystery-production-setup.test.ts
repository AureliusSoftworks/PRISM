import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const setup = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./debateMystery.module.css", import.meta.url),
  "utf8",
);
const tutorials = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

const productionPage = setup.slice(
  setup.indexOf('{mysterySetupPage === "production" ? ('),
  setup.indexOf("{mysterySetupError || mysteryMansionExteriorError ?"),
);

describe("Whodunnit Case production setup", () => {
  it("derives what the chosen venue already provides from the shared helper", () => {
    assert.match(setup, /resolveDebateMysteryVenueProductionV1,/u);
    assert.match(
      setup,
      /const mysteryVenueProduction = resolveDebateMysteryVenueProductionV1\(\s*selectedMysteryMansionBundle,\s*\)/u,
    );
    assert.match(productionPage, /Already part of \{venueName\}/u);
    assert.match(productionPage, /data-venue-provided="true"/u);
    assert.match(setup, /Art for all \$\{venueProvides\.roomArt\.totalRooms\} rooms/u);
  });

  it("never requests what the venue provides and never asks Case Forge to compose music", () => {
    assert.match(
      setup,
      /rooms:\s*mysteryRoomAssetSynthesis &&\s*!mysteryVenueProduction\.roomArt\.complete &&/u,
    );
    assert.match(
      setup,
      /illustratedRooms:\s*mysteryIllustratedRoomSynthesis &&\s*\(mysteryRoomAssetSynthesis \|\| mysteryVenueProduction\.roomArt\.complete\) &&/u,
    );
    assert.match(setup, /music: false,/u);
    assert.match(
      setup,
      /ambience:\s*mysteryAmbienceAssetSynthesis &&\s*!mysteryVenueProduction\.atmosphere &&/u,
    );
    assert.doesNotMatch(setup, /mysteryMusicAssetSynthesis/u);
    assert.match(productionPage, /\{!venueProvides\.roomArt\.complete \? \(/u);
    assert.match(productionPage, /data-production-status="music"/u);
    const musicRow = productionPage.slice(
      productionPage.indexOf('data-production-status="music"'),
      productionPage.indexOf("{venueProvides.atmosphere ? ("),
    );
    assert.ok(musicRow.length > 0, "music status row present");
    assert.doesNotMatch(musicRow, /<input/u, "music is a status row, never a request");
  });

  it("offers Upgraded rooms directly when the venue's room art is complete", () => {
    assert.match(productionPage, /upgradedRoomsPossible/u);
    assert.match(setup, /const upgradedRoomsPossible =\s*mysteryRoomAssetSynthesis \|\| venueProvides\.roomArt\.complete;/u);
    assert.match(productionPage, /<strong>Upgraded rooms \(HD\)<\/strong>/u);
    assert.match(productionPage, /Choose Every room in Mosaic first, or pick a venue whose rooms already have art\./u);
    assert.match(productionPage, /Draw the missing room art/u);
  });

  it("keeps the tutorial targets, pinned labels, and grouped plain-language copy", () => {
    for (const target of [
      "whodunnit-production",
      "whodunnit-v2-assets",
      "whodunnit-v2-personal-props",
      "whodunnit-v2-ambience-synthesis",
      "whodunnit-seed-import",
    ]) {
      assert.match(productionPage, new RegExp(`data-tutorial-target="${target}"`, "u"), target);
    }
    assert.match(productionPage, /<strong>Use props from my Asset Library<\/strong>/u);
    assert.match(productionPage, /<strong>Ambience<\/strong>/u);
    assert.match(productionPage, /productionReason\("ambience"\)/u);
    assert.match(productionPage, /Unavailable · court-only cases exclude venue ambience\./u);
    assert.match(productionPage, /<span>Pictures<\/span>/u);
    assert.match(productionPage, /<span>Sound<\/span>/u);
    assert.match(productionPage, /<span>Voices<\/span>/u);
    assert.match(productionPage, /PRISM checks everything you ask for before the case opens\./u);
    assert.match(productionPage, /Restore an older case/u);
    assert.doesNotMatch(productionPage, /case-scoped production asset|audited at Production Readiness/u);
    assert.match(css, /\.assetForgeGroup\s*\{/u);
    assert.match(css, /\.assetForgeChoices > \.assetForgeProvided\s*\{/u);
    assert.match(css, /\.assetForgeChoices > \.assetForgeStatusRow\s*\{/u);
  });

  it("teaches the venue-aware Production page in the Whodunnit tutorial", () => {
    assert.match(tutorials, /Production first lists what the selected Mystery Venue already provides/u);
    assert.match(tutorials, /Case Forge never composes music/u);
    assert.match(tutorials, /together with Every room in Mosaic or on a venue whose rooms already have art/u);
    assert.doesNotMatch(tutorials, /disables Rooms and Music assets/u);
  });
});
