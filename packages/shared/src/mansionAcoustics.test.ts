import assert from "node:assert/strict";
import test from "node:test";
import {
  debateMysteryHouseStyleV2,
} from "./debateMysteryV2.ts";
import {
  buildMansionAmbienceManifestV1,
  mansionAmbienceWorldBedV1,
} from "./mansionAcoustics.ts";
import { validateMansionPackageManifestV1 } from "./portableMysteryPackage.ts";

const hash = "a".repeat(64);

test("Blackwood and Space Odyssey freeze categorically distinct acoustic fixtures", () => {
  const blackwood = debateMysteryHouseStyleV2(
    "Blackwood House, a rain-lashed 1890s Gothic mansion at night with elegant dread.",
  );
  const space = debateMysteryHouseStyleV2(
    "Space Odyssey aboard an orbital spacecraft with reactor decks, airlocks, and isolated calm.",
  );
  assert.equal(blackwood.acousticThemePaletteId, "gothic-old-house-v1");
  assert.equal(blackwood.atmosphere.weather, "storm");
  assert.equal(blackwood.atmosphere.timeOfDay, "night");
  assert.equal(space.acousticThemePaletteId, "spacecraft-industrial-v1");
  assert.equal(space.atmosphere.exteriorSetting, "a sealed vessel beyond a planetary atmosphere");
  assert.notEqual(mansionAmbienceWorldBedV1(blackwood).id, mansionAmbienceWorldBedV1(space).id);
});

test("passenger ships use an ocean-and-machinery palette without mansion fallbacks", () => {
  const ship = debateMysteryHouseStyleV2(
    "A modern full-size passenger cruise ship with a gangway and promenade deck.",
  );
  assert.equal(ship.acousticThemePaletteId, "maritime-passenger-v1");
  assert.match(ship.atmosphere.exteriorSetting, /passenger ship at sea/u);
  const ambience = buildMansionAmbienceManifestV1({
    houseStyle: ship,
    rooms: [
      { id: "engine", name: "Engine Control Room", floor: 1 },
      { id: "promenade", name: "Promenade Deck", floor: 2 },
      { id: "cabin", name: "Passenger Cabin", floor: 2 },
    ],
    promptContractHash: hash,
    variationSeed: "passenger-ship-fixture",
  });
  assert.equal(ambience.assets[0]?.sharedAssetId, "prism.theme.maritime-passenger.engine-ocean.v1");
  assert.equal(ambience.assets[0]?.fallbackSharedAssetId, "prism.theme.maritime-passenger.engine-ocean.v1");
  assert.deepEqual(
    ambience.roomProfiles.map((room) => room.acousticPresetId),
    ["ship-service-v1", "ocean-deck-v1", "passenger-cabin-v1"],
  );
  assert.equal(ambience.surfaceMappings.some((mapping) => mapping.materialId === "wood"), false);
  assert.equal(ambience.fallbackSharedAssetIds.includes("prism.shared.fallback.indoor-room-tone.v1"), false);
});

test("portable ambience references shared roles without embedding reusable beds", () => {
  const houseStyle = debateMysteryHouseStyleV2(
    "Blackwood House, a rain-lashed Gothic mansion with a glass arboretum.",
  );
  const ambience = buildMansionAmbienceManifestV1({
    houseStyle: { ...houseStyle, bespokeAmbienceRequested: false },
    rooms: [
      { id: "foyer", name: "Foyer", floor: 1 },
      { id: "arboretum", name: "Arboretum", floor: 2 },
    ],
    promptContractHash: hash,
    variationSeed: "blackwood-fixture",
  });
  assert.equal(ambience.assets[0]?.scope, "shared");
  assert.equal(ambience.assets[0]?.packageAssetId, null);
  assert.equal(ambience.roomProfiles[1]?.acousticPresetId, "glass-conservatory-v1");
  assert.equal(ambience.stageCueStingerAllowlist.length, 0);

  const manifest = {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "blackwood-fixture",
    title: "Blackwood",
    description: "Acoustic fixture",
    creator: { name: "PRISM", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 2,
    rooms: [
      { id: "foyer", templateId: "foyer", name: "Foyer", floor: 1, x: 0, y: 0, width: 1, height: 1, neighborIds: ["arboretum"], slots: [{ id: "slot-1", x: 0.5, y: 0.5 }], emoji: "◇", roomAssetId: null, propAssetIds: [] },
      { id: "arboretum", templateId: "arboretum", name: "Arboretum", floor: 2, x: 0, y: 1, width: 1, height: 1, neighborIds: ["foyer"], slots: [], emoji: "◇", roomAssetId: null, propAssetIds: [] },
    ],
    houseStyle: { id: houseStyle.id, label: houseStyle.label, promptContract: houseStyle.promptContract },
    assets: [],
    previewAssetId: null,
    investigationThemeAssetId: null,
    ambience,
  };
  assert.deepEqual(validateMansionPackageManifestV1(manifest), []);
});

test("mansion ambience rejects clue-bearing or unbound semantic audio", () => {
  const houseStyle = debateMysteryHouseStyleV2("Space Odyssey spacecraft");
  const ambience = buildMansionAmbienceManifestV1({
    houseStyle,
    rooms: [{ id: "bridge", name: "Bridge", floor: 1 }],
    promptContractHash: hash,
    variationSeed: "space-fixture",
  }) as unknown as Record<string, unknown>;
  const assets = ambience.assets as Array<Record<string, unknown>>;
  assets.push({
    ...assets[0],
    id: "invented-clue",
    semanticRole: "gunshot",
  });
  const errors = validateMansionPackageManifestV1({
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "space-fixture",
    title: "Space",
    description: "Safety fixture",
    creator: { name: "PRISM", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 1,
    rooms: [{ id: "bridge", templateId: "bridge", name: "Bridge", floor: 1, x: 0, y: 0, width: 1, height: 1, neighborIds: [], slots: [{ id: "slot-1", x: 0.5, y: 0.5 }], emoji: "◇", roomAssetId: null, propAssetIds: [] }],
    houseStyle: { id: houseStyle.id, label: houseStyle.label, promptContract: houseStyle.promptContract },
    assets: [],
    previewAssetId: null,
    investigationThemeAssetId: null,
    ambience,
  }).join("\n");
  assert.match(errors, /ambience\.assets\[1\] is invalid/u);
});
