import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoDecorateMansionLayoutV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
} from "@localai/shared";
import {
  applyCuratedImportedMansionDecorationV1,
  BLACKWOOD_MANSION_PAYLOAD_SHA256,
  BRIARWATCH_MANSION_PAYLOAD_SHA256,
} from "../debate-mystery-mansion-curated-decoration.ts";

type RoomSpec = readonly [floor: number, templateId: string, name: string];

function layoutFor(roomSpecs: readonly RoomSpec[]): MansionLayoutV2 {
  return {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities: roomSpecs.map(([floor, templateId, name], index): MansionLayoutRoomV2 => ({
      kind: "room",
      id: `room:${index}:${templateId}`,
      templateId,
      name,
      floor,
      x: index % 12,
      y: Math.floor(index / 12) * 3,
      rotation: 0,
      suspectSlotId: null,
      emoji: "◇",
      imageId: null,
      bundledAssetPath: null,
      acceptedRoomAssetId: null,
    })),
    doors: [],
    verticalConnectors: [],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [],
  };
}

const BLACKWOOD_ROOMS: readonly RoomSpec[] = [
  [1, "foyer", "Foyer"],
  [1, "ballroom", "Ballroom"],
  [1, "cellar", "Basement"],
  [1, "pool", "Pool"],
  [2, "guest-bedroom", "Guest Bedroom"],
  [2, "dining-room", "Dining Room"],
  [2, "kitchen", "Kitchen"],
  [2, "utility", "Garage"],
  [2, "library", "Library"],
  [3, "conservatory", "Arboretum"],
  [3, "study", "Office"],
  [3, "parlor", "Living Room"],
  [3, "primary-bedroom", "Bedroom"],
  [3, "bathroom", "Bathroom"],
  [3, "rooftop-lounge", "Rooftop Lounge"],
];

const BRIARWATCH_ROOMS: readonly RoomSpec[] = [
  [1, "foyer", "Foyer"],
  [1, "dining-room", "Dining Room"],
  [1, "library", "Library"],
  [1, "kitchen", "Kitchen"],
  [1, "parlor", "Parlor"],
  [2, "primary-bedroom", "Bedroom"],
  [2, "attic", "Attic"],
  [2, "guest-bedroom", "Guest Bedroom"],
  [2, "bathroom", "Bathroom"],
  [2, "study", "Study"],
];

describe("curated imported mansion decoration", () => {
  it("places the image-reviewed Blackwood anchors and light rigs in every room", () => {
    const source = layoutFor(BLACKWOOD_ROOMS);
    const decorated = applyCuratedImportedMansionDecorationV1(
      source,
      BLACKWOOD_MANSION_PAYLOAD_SHA256,
    );

    for (const room of decorated.entities) {
      if (room.kind !== "room") continue;
      assert.ok(decorated.placementAnchors.some((anchor) => anchor.roomId === room.id), room.name);
      assert.ok(decorated.lights.some((light) => light.roomId === room.id), room.name);
    }
    const foyer = decorated.entities.find((room) => room.kind === "room" && room.templateId === "foyer")!;
    assert.deepEqual(
      decorated.placementAnchors.filter((anchor) => anchor.roomId === foyer.id).map((anchor) => anchor.name),
      ["entry console", "entry door", "stair landing", "center console", "entry bench", "foyer rug"],
    );
    assert.equal(decorated.lights.filter((light) => light.roomId === foyer.id).length, 4);
    assert.ok(decorated.lights.some((light) =>
      light.roomId === foyer.id && light.kind === "directional" && light.geometry.x === .48));
  });

  it("uses exact bundled-room geometry for Briarwatch and leaves its plateless Attic to fallback", () => {
    const source = layoutFor(BRIARWATCH_ROOMS);
    const decorated = applyCuratedImportedMansionDecorationV1(
      source,
      BRIARWATCH_MANSION_PAYLOAD_SHA256,
    );

    for (const room of decorated.entities) {
      if (room.kind !== "room") continue;
      assert.ok(decorated.placementAnchors.some((anchor) => anchor.roomId === room.id), room.name);
      const lights = decorated.lights.filter((light) => light.roomId === room.id);
      if (room.templateId === "attic") assert.deepEqual(lights, []);
      else assert.ok(lights.length > 0, room.name);
    }
    const completed = autoDecorateMansionLayoutV2(decorated, {
      seed: BRIARWATCH_MANSION_PAYLOAD_SHA256,
      sourceIdentity: BRIARWATCH_MANSION_PAYLOAD_SHA256,
    });
    const attic = completed.entities.find((room) => room.kind === "room" && room.templateId === "attic")!;
    const atticLight = completed.lights.find((light) => light.roomId === attic.id);
    assert.ok(atticLight && atticLight.kind === "omni");
    assert.ok(atticLight.geometry.x >= .46 && atticLight.geometry.x <= .54);
    assert.ok(atticLight.geometry.y >= .28 && atticLight.geometry.y <= .36);
  });

  it("never rewrites authored room decoration and ignores unknown packages", () => {
    const source = layoutFor([[1, "foyer", "Foyer"]]);
    assert.equal(applyCuratedImportedMansionDecorationV1(source, "unknown"), source);
    const room = source.entities[0]!;
    const authored = {
      ...source,
      placementAnchors: [{
        id: "authored-anchor",
        roomId: room.id,
        name: "player table",
        relation: "on" as const,
        point: { x: .22, y: .71 },
      }],
      lights: [{
        id: "authored-light",
        roomId: room.id,
        kind: "omni" as const,
        color: "#ffffff",
        intensity: .73,
        animationSeed: "player-seed",
        cuePermission: { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
        geometry: { x: .19, y: .28, radius: .14 },
      }],
    };
    const decorated = applyCuratedImportedMansionDecorationV1(
      authored,
      BLACKWOOD_MANSION_PAYLOAD_SHA256,
    );
    assert.deepEqual(decorated.placementAnchors, authored.placementAnchors);
    assert.deepEqual(decorated.lights, authored.lights);
  });
});
