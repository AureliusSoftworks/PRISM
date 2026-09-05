import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1,
  debateMysteryExteriorEntryTargetFromClientPointV1,
  debateMysteryMansionDoorTargetV1,
  debateMysteryMansionExteriorFallbackV1,
  normalizeDebateMysteryExteriorEntryTargetV1,
} from "./debateMysteryMansionExterior.ts";

describe("mansion exterior presentation", () => {
  it("ships every palette and scale family as a substantive bundled cover", () => {
    for (const [familyId, family] of Object.entries(DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1)) {
      for (const [scaleClass, path] of Object.entries(family)) {
        assert.match(path, /^\/debate\/mystery\/exteriors\//u);
        assert.match(
          path,
          new RegExp(`-${scaleClass}-v1\\.${familyId === "abstract-venue-v1" ? "svg" : "webp"}$`, "u"),
        );
        assert.ok(
          statSync(new URL(`../../public${path}`, import.meta.url)).size >
            (familyId === "abstract-venue-v1" ? 500 : 100_000),
          `${path} should contain reviewed cover art`,
        );
      }
    }
  });

  it("matches the mansion geography and keeps PRISM House as the neutral default", () => {
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Gothic old house" }, "compact"),
      "/debate/mystery/exteriors/gothic-old-house-compact-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Orbital observatory" }, "standard"),
      "/debate/mystery/exteriors/spacecraft-industrial-standard-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Jungle expedition" }, "grand"),
      "/debate/mystery/exteriors/jungle-wilderness-grand-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "PRISM House" }, "standard"),
      "/debate/mystery/exteriors/prism-house-standard-v1.webp",
    );
    const passengerShip = {
      kind: "vessel" as const,
      presentation: {
        version: 1 as const,
        familyId: "maritime-passenger-v1",
        mapStyle: "hull-deck-v1" as const,
        physicalScaleClass: "grand" as const,
        entryAction: "Board the ship",
        compatibleExteriorFamilies: ["maritime-passenger-v1"],
        compatibleAcousticFamilies: ["maritime-passenger-v1"],
        mapOrientation: { fore: "right" as const, port: "top" as const, pitchDegrees: -2 },
      },
    };
    assert.equal(
      debateMysteryMansionExteriorFallbackV1(
        { label: "Modern full-size passenger cruise ship" },
        "grand",
        passengerShip,
      ),
      "/debate/mystery/exteriors/maritime-passenger-grand-v1.webp",
    );
    assert.doesNotMatch(
      debateMysteryMansionExteriorFallbackV1(
        { label: "Unknown vessel" },
        "standard",
        { kind: "vessel" },
      ),
      /mansion|prism-house|gothic/iu,
    );
  });

  it("pins the exterior threshold target to each reviewed entrance composition", () => {
    assert.deepEqual(
      debateMysteryMansionDoorTargetV1({ label: "Gothic old house" }, "compact"),
      { xPercent: 50, yPercent: 59 },
    );
    assert.deepEqual(
      debateMysteryMansionDoorTargetV1({ label: "Orbital observatory" }, "standard"),
      { xPercent: 66, yPercent: 58 },
    );
    assert.deepEqual(
      debateMysteryMansionDoorTargetV1({ label: "Jungle expedition" }, "grand"),
      { xPercent: 45, yPercent: 57 },
    );
    assert.deepEqual(
      debateMysteryMansionDoorTargetV1({ label: "PRISM House" }, "standard"),
      { xPercent: 60, yPercent: 44 },
    );
    assert.deepEqual(
      debateMysteryMansionDoorTargetV1(
        { label: "Passenger vessel" },
        "standard",
        {
          kind: "vessel",
          presentation: {
            version: 1,
            familyId: "maritime-passenger-v1",
            mapStyle: "hull-deck-v1",
            physicalScaleClass: "standard",
            entryAction: "Board the ship",
            compatibleExteriorFamilies: ["maritime-passenger-v1"],
            compatibleAcousticFamilies: ["maritime-passenger-v1"],
            mapOrientation: { fore: "right", port: "top", pitchDegrees: -2 },
          },
        },
      ),
      { xPercent: 60, yPercent: 70 },
    );
  });

  it("maps entrance clicks through the rendered cover plane at every viewport crop", () => {
    assert.deepEqual(
      debateMysteryExteriorEntryTargetFromClientPointV1(
        { left: 0, top: 0, width: 1_600, height: 900 },
        { clientX: 960, clientY: 630 },
      ),
      { x: 0.6, y: 0.7 },
    );
    assert.deepEqual(
      debateMysteryExteriorEntryTargetFromClientPointV1(
        { left: -600, top: 0, width: 1_600, height: 900 },
        { clientX: 360, clientY: 630 },
      ),
      { x: 0.6, y: 0.7 },
    );
    assert.deepEqual(
      debateMysteryExteriorEntryTargetFromClientPointV1(
        { left: 100, top: 50, width: 800, height: 450 },
        { clientX: 980, clientY: 5 },
      ),
      { x: 1, y: 0 },
    );
  });

  it("rejects malformed entrance targets and clamps finite numeric input", () => {
    assert.deepEqual(
      normalizeDebateMysteryExteriorEntryTargetV1({ x: -0.2, y: 1.4 }),
      { x: 0, y: 1 },
    );
    assert.equal(
      normalizeDebateMysteryExteriorEntryTargetV1({ x: "0.5", y: 0.5 }),
      null,
    );
    assert.equal(
      normalizeDebateMysteryExteriorEntryTargetV1({ x: Number.NaN, y: 0.5 }),
      null,
    );
  });

  it("presents the accepted exterior as the dominant Case Forge surface", () => {
    const experience = readFileSync(
      new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
    assert.match(experience, /data-exterior-hero="true"/u);
    assert.match(experience, /debateMysteryMansionExteriorFallbackV1\([\s\S]*?state\.config\.houseStyle,[\s\S]*?state\.config\.scaleClass,[\s\S]*?forgeVenueProfile/u);
    assert.match(experience, /sealedMysteryAssetApiUrl\([\s\S]*?DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1/u);
    assert.match(styles, /\.forgeCard\[data-exterior-hero="true"\][\s\S]*?--forge-exterior-image/u);
  });
});
