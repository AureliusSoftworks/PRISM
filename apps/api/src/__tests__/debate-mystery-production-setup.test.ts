import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../debate-mystery-v2.ts", import.meta.url),
  "utf8",
);

function slice(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${startMarker} … ${endMarker}`);
  return source.slice(start, end);
}

describe("Whodunnit Case Forge production requests", () => {
  it("guards Upgraded rooms with a complete Mosaic pack from the case or the venue", () => {
    const create = slice(
      "export async function createDebateMysterySessionV2(",
      "// Playback voice selection never enters the compiler.",
    );
    assert.match(
      create,
      /\(config\.assetSynthesis\.rooms \|\| config\.assetSynthesis\.illustratedRooms\) &&\s*\(runtime\.responseMode === "local"/u,
      "LOCAL refuses HD derivatives as well as Mosaic synthesis",
    );
    assert.match(create, /MYSTERY_UPGRADED_ROOMS_REQUIRE_MOSAIC/u);
    assert.match(
      create,
      /!resolveDebateMysteryVenueProductionV1\(mansion\)\.roomArt\.complete/u,
      "a venue must provide authored art for every room before HD-only requests pass",
    );
    assert.match(
      create,
      /config\.assetSynthesis\.illustratedRooms &&\s*!config\.assetSynthesis\.rooms &&\s*!config\.mansionBundleId/u,
      "without a venue, HD rooms still need a Mosaic request",
    );
  });

  it("reports a personalized ambience mix as prepared rather than as a fallback", () => {
    const readiness = slice(
      "function productionReadinessFromCheckpointV1(",
      "return readiness;",
    );
    const ambience = readiness.slice(readiness.indexOf("ambience: ambienceRequested"));
    assert.match(ambience, /generatedCount: ambienceReused \? 0 : 1/u);
    assert.match(ambience, /fallbackCount: 0/u);
    assert.match(ambience, /sourceCode: ambienceReused \? "reused_venue_asset" : "generated"/u);
    assert.doesNotMatch(ambience, /compatible authored acoustic palette/u);
  });
});
