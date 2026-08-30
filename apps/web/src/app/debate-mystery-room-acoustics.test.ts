import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  debateMysteryHouseStyleV2,
  type DebateMysteryRoomV2,
  type MansionAmbienceRoomProfileV1,
} from "@localai/shared";
import {
  mysteryMansionCorridorAcousticsV1,
  mysteryMansionRoomAcousticsV1,
} from "./debateMysteryRoomAcoustics.ts";

const houseStyle = debateMysteryHouseStyleV2(
  "A warm old country mansion at night, with timber floors and quiet halls.",
);

function room(name: string, width: number, height: number): DebateMysteryRoomV2 {
  return {
    id: name.toLocaleLowerCase().replace(/\s+/gu, "-"),
    name,
    floor: 1,
    width,
    height,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: null,
    unlocked: true,
    visited: false,
    hotspots: [],
  };
}

function houseWithProfile(profile: MansionAmbienceRoomProfileV1): typeof houseStyle {
  return {
    ...houseStyle,
    ambience: {
      roomProfiles: [profile],
    } as NonNullable<typeof houseStyle.ambience>,
  };
}

function profile(
  roomId: string,
  overrides: Partial<MansionAmbienceRoomProfileV1> = {},
): MansionAmbienceRoomProfileV1 {
  return {
    roomId,
    acousticPresetId: "furnished-medium-v1",
    exposure: 0.2,
    dampening: 0.45,
    reverbSend: 0.45,
    lowPassHz: 9_000,
    surfaceMaterialId: "wood-floor-v1",
    emitters: [],
    ...overrides,
  };
}

describe("Whodunnit room acoustics", () => {
  it("makes a ballroom larger and wetter than a furnished small room", () => {
    const study = mysteryMansionRoomAcousticsV1({ room: room("Study", 3, 2), houseStyle });
    const ballroom = mysteryMansionRoomAcousticsV1({ room: room("Ballroom", 5, 3), houseStyle });
    assert.ok(ballroom.profile.durationSeconds > study.profile.durationSeconds);
    assert.ok(ballroom.profile.preDelaySeconds > study.profile.preDelaySeconds);
    assert.ok(ballroom.voice.wet > study.voice.wet);
    assert.ok(ballroom.foley.wet > ballroom.voice.wet);
    assert.ok(ballroom.voice.wet <= 0.135);
    assert.ok(ballroom.foley.wet <= 0.2);
  });

  it("keeps tiled rooms bright while respecting their small footprint", () => {
    const bathroom = mysteryMansionRoomAcousticsV1({ room: room("Tiled Bathroom", 2, 2), houseStyle });
    assert.equal(bathroom.foleyMaterial, "stone");
    assert.equal(bathroom.size, 0);
    assert.ok(bathroom.profile.highCutHz >= 9_000);
    assert.ok(bathroom.voice.wet >= 0.025);
  });

  it("keeps a representative foyer restrained and within the speech limits", () => {
    const foyerRoom = room("Foyer", 4, 3);
    const foyer = mysteryMansionRoomAcousticsV1({
      room: foyerRoom,
      houseStyle: houseWithProfile(profile(foyerRoom.id)),
    });
    assert.ok(foyer.profile.durationSeconds >= 0.35);
    assert.ok(foyer.profile.durationSeconds <= 1.55);
    assert.ok(foyer.profile.preDelaySeconds >= 0.01);
    assert.ok(foyer.profile.preDelaySeconds <= 0.032);
    assert.ok(foyer.voice.wet >= 0.025 && foyer.voice.wet <= 0.135);
  });

  it("distinguishes a dampened room from a reflective room", () => {
    const library = room("Library", 4, 3);
    const gallery = room("Marble Gallery", 4, 3);
    const dampened = mysteryMansionRoomAcousticsV1({
      room: library,
      houseStyle: houseWithProfile(profile(library.id, {
        dampening: 0.92,
        reverbSend: 0.7,
        lowPassHz: 4_000,
      })),
    });
    const reflective = mysteryMansionRoomAcousticsV1({
      room: gallery,
      houseStyle: houseWithProfile(profile(gallery.id, {
        dampening: 0.05,
        reverbSend: 0.7,
        lowPassHz: 16_000,
        surfaceMaterialId: "marble-tile-v1",
      })),
    });
    assert.equal(dampened.profile.highCutHz, 4_000);
    assert.equal(reflective.profile.highCutHz, 14_000);
    assert.ok(dampened.profile.decayExponent > reflective.profile.decayExponent);
    assert.equal(reflective.foleyMaterial, "stone");
  });

  it("uses a near-dry outdoor override", () => {
    const rooftop = mysteryMansionRoomAcousticsV1({ room: room("Rooftop Terrace", 10, 6), houseStyle });
    assert.equal(rooftop.outdoors, true);
    assert.equal(rooftop.profile.durationSeconds, 0.18);
    assert.equal(rooftop.voice.wet, 0.008);
    assert.equal(rooftop.foley.wet, 0.02);
  });

  it("derives a bounded neutral hall profile for authored corridors", () => {
    const corridor = mysteryMansionCorridorAcousticsV1({
      houseStyle,
      corridor: { kind: "corridor", id: "hall-a", floor: 1, x: 3, y: 0, width: 1, height: 5 },
    });
    assert.equal(corridor.foleyMaterial, "wood");
    assert.match(corridor.profile.id, /hall-a/u);
    assert.ok(corridor.profile.durationSeconds >= 0.35);
    assert.ok(corridor.profile.durationSeconds <= 1.55);
  });
});
