import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  addAutoCenteredMansionLayoutV2Doors,
  canonicalMansionLayoutV2,
  createBlankMansionLayoutV2,
  mansionDynamicLightFrameV2,
  mansionLayoutV2EditorDerivativeFromLegacyRooms,
  mansionLayoutV2CompatibilityNeighborIds,
  mansionLayoutV2EntityRect,
  mansionLayoutV2FloorSemanticRoomCount,
  mansionLayoutV2RoomFootprint,
  mansionLayoutV2SemanticRoomCount,
  mansionLayoutV2SemanticRoomsAreConnected,
  mansionLayoutV2SharedWall,
  removeMansionLayoutV2Door,
  rotateMansionLayoutV2Room,
  slideMansionLayoutV2Door,
  snapMansionLayoutV2Entity,
  validateMansionLayoutV2,
  type MansionDynamicLightV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
} from "./mansionLayoutV2.ts";
import {
  canonicalPortablePackageJsonV1,
  validateMansionPackageManifestV1,
  type MansionPackageManifestV1,
  type PortablePackageJsonValueV1,
} from "./portableMysteryPackage.ts";
import {
  debateMysteryRoomFloorRuleV1,
  debateMysteryRoomTypeIsAllowedOnFloorV1,
} from "./debateMystery.ts";

function room(
  id: string,
  templateId: string,
  floor: number,
  x: number,
  y: number,
  rotation: 0 | 90 = 0,
): MansionLayoutRoomV2 {
  return {
    kind: "room",
    id,
    templateId,
    name: id,
    floor,
    x,
    y,
    rotation,
    suspectSlotId: null,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: null,
    acceptedRoomAssetId: null,
  };
}

function baseLayout(): MansionLayoutV2 {
  let layout: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities: [
      room("foyer", "foyer", 1, 0, 0),
      { kind: "corridor", id: "hall", floor: 1, x: 3, y: 0, width: 1, height: 2 },
      room("parlor", "parlor", 1, 4, 0),
      room("landing", "guest-bedroom", 2, 0, 0),
      room("bath", "bathroom", 2, 4, 0),
      room("study", "study", 2, 6, 0),
      room("library", "library", 2, 9, 0),
      { kind: "infill", id: "chimney", floor: 1, x: 8, y: 0, width: 1, height: 1 },
    ],
    doors: [],
    verticalConnectors: [{
      id: "stairs:foyer:landing",
      kind: "stairs",
      lowerEntityId: "foyer",
      upperEntityId: "landing",
    }],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [],
  };
  for (const id of ["foyer", "hall", "parlor", "landing", "bath", "study", "library"]) {
    layout = addAutoCenteredMansionLayoutV2Doors(layout, id);
  }
  return layout;
}

describe("MansionLayoutV2 geometry", () => {
  it("starts blank authoring from the smallest valid connected two-floor house", () => {
    const layout = createBlankMansionLayoutV2();
    assert.equal(mansionLayoutV2SemanticRoomCount(layout), 4);
    assert.equal(mansionLayoutV2FloorSemanticRoomCount(layout, 1), 2);
    assert.equal(mansionLayoutV2FloorSemanticRoomCount(layout, 2), 2);
    const suspectSlotIds = layout.entities
      .filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room")
      .map((entity) => entity.suspectSlotId);
    assert.equal(suspectSlotIds.every((slotId) => slotId !== null), true);
    assert.equal(new Set(suspectSlotIds).size, 4);
    assert.equal(layout.verticalConnectors.length, 1);
    assert.equal(mansionLayoutV2SemanticRoomsAreConnected(layout), true);
    assert.deepEqual(validateMansionLayoutV2(layout, { suspectCount: 4 }), []);
  });

  it("moves a legacy one-floor source into a connected two-floor derivative without adding rooms", () => {
    const legacyRooms = [
      { id: "foyer", templateId: "foyer", name: "Foyer", floor: 1, x: 0, y: 0, width: 3, height: 2, neighborIds: ["bed"], assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null },
      { id: "bed", templateId: "primary-bedroom", name: "Bedroom", floor: 1, x: 0, y: 2, width: 4, height: 3, neighborIds: ["foyer", "bath"], assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null },
      { id: "bath", templateId: "bathroom", name: "Bathroom", floor: 1, x: 4, y: 2, width: 2, height: 2, neighborIds: ["bed", "dining"], assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null },
      { id: "dining", templateId: "dining-room", name: "Dining Room", floor: 1, x: 6, y: 2, width: 4, height: 2, neighborIds: ["bath", "kitchen"], assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null },
      { id: "kitchen", templateId: "kitchen", name: "Kitchen", floor: 1, x: 10, y: 2, width: 4, height: 2, neighborIds: ["dining"], assignedSuspectSeatId: null, emoji: "◇", imageId: null, bundledAssetPath: null },
    ];
    const derived = mansionLayoutV2EditorDerivativeFromLegacyRooms(legacyRooms);
    assert.equal(mansionLayoutV2SemanticRoomCount(derived), 5);
    assert.equal(mansionLayoutV2FloorSemanticRoomCount(derived, 1), 3);
    assert.equal(mansionLayoutV2FloorSemanticRoomCount(derived, 2), 2);
    assert.equal(mansionLayoutV2SemanticRoomsAreConnected(derived), true);
    assert.equal(derived.verticalConnectors.length, 1);
    assert.deepEqual(validateMansionLayoutV2(derived, { suspectCount: 4 }), []);
  });

  it("derives fixed footprints and only swaps them for a 90 degree rotation", () => {
    assert.deepEqual(mansionLayoutV2RoomFootprint(room("dining", "dining-room", 1, 0, 0)), {
      roomTypeId: "dining-room",
      width: 4,
      height: 2,
    });
    assert.deepEqual(mansionLayoutV2RoomFootprint(room("dining", "dining-room", 1, 0, 0, 90)), {
      roomTypeId: "dining-room",
      width: 2,
      height: 4,
    });
  });

  it("distinguishes shared edges from corner contact", () => {
    const foyer = room("foyer", "foyer", 1, 0, 0);
    const edge = room("bath", "bathroom", 1, 3, 0);
    const corner = room("corner", "bathroom", 1, 3, 2);
    assert.equal(mansionLayoutV2SharedWall(foyer, edge)?.aWall, "east");
    assert.equal(mansionLayoutV2SharedWall(foyer, corner), null);
  });

  it("reflows collisions, clamps bounds, and only reverts floating drops", () => {
    const foyer = room("foyer", "foyer", 1, 0, 0);
    const parlor = room("parlor", "parlor", 1, 7, 0);
    const layout: MansionLayoutV2 = {
      version: 2,
      envelope: { columns: 16, rows: 12 },
      entities: [foyer, parlor],
      doors: [],
      verticalConnectors: [],
      placementAnchors: [],
      lights: [],
      roomArtCandidates: [],
    };
    const reflowed = snapMansionLayoutV2Entity(layout, "parlor", { x: 1, y: 0 });
    assert.notEqual(reflowed, layout);
    assert.equal(reflowed.entities.find((entity) => entity.id === "parlor")?.x, 1);
    assert.notDeepEqual(
      reflowed.entities.find((entity) => entity.id === "foyer"),
      layout.entities.find((entity) => entity.id === "foyer"),
    );
    const clamped = snapMansionLayoutV2Entity(layout, "parlor", { x: 15, y: 0 });
    assert.equal(clamped, layout);
    assert.equal(snapMansionLayoutV2Entity(layout, "parlor", { x: 3, y: 2 }), layout);
    const legal = snapMansionLayoutV2Entity(layout, "parlor", { x: 3.4, y: 0.2 });
    assert.notEqual(legal, layout);
    assert.equal(legal.doors.length, 1);
    assert.equal(legal.doors[0]?.position, 0.5);

    const floatingInfill: MansionLayoutV2 = {
      ...legal,
      entities: [...legal.entities, { kind: "infill", id: "floating", floor: 1, x: 12, y: 8, width: 1, height: 1 }],
    };
    assert.equal(snapMansionLayoutV2Entity(floatingInfill, "floating", { x: 12, y: 8 }), floatingInfill);
    assert.match(validateMansionLayoutV2(floatingInfill).join("\n"), /floating decorative infill/u);
  });

  it("reverts a drag that would disconnect the plan and preserves an explicitly removed door", () => {
    let layout = baseLayout();
    assert.equal(mansionLayoutV2SemanticRoomsAreConnected(layout), true);
    assert.equal(snapMansionLayoutV2Entity(layout, "hall", { x: 3, y: 4 }), layout);

    const foyerParlorDoor = layout.doors.find((door) =>
      new Set([door.aEntityId, door.bEntityId]).has("foyer") &&
      new Set([door.aEntityId, door.bEntityId]).has("hall"),
    )!;
    layout = slideMansionLayoutV2Door(layout, foyerParlorDoor.id, 0.8);
    assert.equal(layout.doors.find((door) => door.id === foyerParlorDoor.id)?.position, 0.8);
    layout = removeMansionLayoutV2Door(layout, foyerParlorDoor.id);
    const noOpSnap = snapMansionLayoutV2Entity(layout, "foyer", { x: 0, y: 0 });
    assert.equal(noOpSnap.doors.some((door) => door.id === foyerParlorDoor.id), false);
  });

  it("rotates only when the fixed footprint still fits without collision", () => {
    const layout: MansionLayoutV2 = {
      version: 2,
      envelope: { columns: 16, rows: 12 },
      entities: [room("dining", "dining-room", 1, 12, 8)],
      doors: [],
      verticalConnectors: [],
      placementAnchors: [],
      lights: [],
      roomArtCandidates: [],
    };
    const rotated = rotateMansionLayoutV2Room(layout, "dining");
    assert.equal((rotated.entities[0] as MansionLayoutRoomV2).rotation, 90);
    assert.deepEqual(mansionLayoutV2EntityRect(rotated.entities[0]!), {
      x: 12, y: 8, width: 2, height: 4,
    });
  });

  it("collapses real corridor traversal into geometry-derived room neighbors", () => {
    const layout = baseLayout();
    const neighbors = mansionLayoutV2CompatibilityNeighborIds(layout);
    assert.deepEqual(neighbors.get("foyer"), ["landing", "parlor"]);
    assert.deepEqual(neighbors.get("parlor"), ["foyer"]);
    assert.equal(mansionLayoutV2SemanticRoomCount(layout), 6);
    assert.equal(mansionLayoutV2FloorSemanticRoomCount(layout, 1), 2);
  });

  it("validates doors, connectivity, decorative counts, and the Floor 3 gate", () => {
    const valid = baseLayout();
    assert.deepEqual(validateMansionLayoutV2(valid, { suspectCount: 4 }), []);

    const cornerDoor: MansionLayoutV2 = {
      ...valid,
      entities: valid.entities.map((entity) => entity.id === "parlor"
        ? { ...entity, x: 3, y: 2 }
        : entity),
    };
    assert.match(
      validateMansionLayoutV2(cornerDoor).join("\n"),
      /shared same-floor wall; corner contact is not enough/u,
    );

    const floorThree: MansionLayoutV2 = {
      ...valid,
      entities: [
        ...valid.entities.filter((entity) => entity.id !== "library"),
        room("tower", "study", 3, 0, 0),
      ],
      verticalConnectors: [
        ...valid.verticalConnectors,
        { id: "stairs:study:tower", kind: "stairs", lowerEntityId: "study", upperEntityId: "tower" },
      ],
    };
    assert.match(
      validateMansionLayoutV2(floorThree).join("\n"),
      /Floor 2 needs at least 4 semantic rooms/u,
    );
  });

  it("rejects duplicate semantic room types across floors without limiting corridors", () => {
    const valid = baseLayout();
    const duplicateAcrossFloors: MansionLayoutV2 = {
      ...valid,
      entities: [
        ...valid.entities,
        room("second-parlor", "parlor", 2, 12, 8),
      ],
    };
    assert.match(
      validateMansionLayoutV2(duplicateAcrossFloors).join("\n"),
      /duplicates the .* room type.*only be placed once per mansion/u,
    );

    const repeatedCorridors: MansionLayoutV2 = {
      ...valid,
      entities: [
        ...valid.entities,
        { kind: "corridor", id: "hall-2", floor: 2, x: 15, y: 10, width: 1, height: 1 },
      ],
    };
    assert.doesNotMatch(
      validateMansionLayoutV2(repeatedCorridors).join("\n"),
      /room type.*only be placed once per mansion/u,
    );
  });

  it("enforces ground-floor and top-floor semantic room contracts", () => {
    for (const templateId of ["foyer", "cellar", "utility"]) {
      assert.equal(debateMysteryRoomFloorRuleV1(templateId), "ground-floor-only");
      assert.equal(debateMysteryRoomTypeIsAllowedOnFloorV1(templateId, 1, 3), true);
      assert.equal(debateMysteryRoomTypeIsAllowedOnFloorV1(templateId, 2, 3), false);
    }
    for (const templateId of ["attic", "rooftop-lounge"]) {
      assert.equal(debateMysteryRoomFloorRuleV1(templateId), "top-floor-only");
      assert.equal(debateMysteryRoomTypeIsAllowedOnFloorV1(templateId, 2, 3), false);
      assert.equal(debateMysteryRoomTypeIsAllowedOnFloorV1(templateId, 3, 3), true);
    }

    const valid = baseLayout();
    const basementUpstairs: MansionLayoutV2 = {
      ...valid,
      entities: [...valid.entities, room("basement", "cellar", 2, 12, 8)],
    };
    assert.match(
      validateMansionLayoutV2(basementUpstairs).join("\n"),
      /ground-floor-only.*Floor 1/u,
    );

    const atticBelowTop: MansionLayoutV2 = {
      ...valid,
      entities: [...valid.entities, room("attic", "attic", 1, 10, 8)],
    };
    assert.match(
      validateMansionLayoutV2(atticBelowTop).join("\n"),
      /top-floor-only.*Floor 2/u,
    );
  });

  it("keeps rooftop-only templates on the highest occupied floor", () => {
    const valid = baseLayout();
    const rooftop = room("roof", "rooftop-lounge", 3, 0, 4);
    const tower = room("tower-room", "study", 3, 10, 4);
    const onRoof: MansionLayoutV2 = {
      ...valid,
      entities: [...valid.entities, rooftop, tower],
      verticalConnectors: [
        ...valid.verticalConnectors,
        { id: "stairs:library:roof", kind: "stairs", lowerEntityId: "library", upperEntityId: "roof" },
        { id: "stairs:study:tower", kind: "stairs", lowerEntityId: "study", upperEntityId: "tower-room" },
      ],
    };
    assert.doesNotMatch(validateMansionLayoutV2(onRoof).join("\n"), /rooftop-only/u);
    const belowRoof = {
      ...onRoof,
      entities: onRoof.entities.map((entity) => entity.id === "roof" ? { ...entity, floor: 2 } : entity),
    } as MansionLayoutV2;
    assert.match(validateMansionLayoutV2(belowRoof).join("\n"), /rooftop-only.*Floor 3/u);
  });

  it("produces one canonical hash input regardless of array insertion order", () => {
    const left = baseLayout();
    const right: MansionLayoutV2 = {
      ...left,
      entities: [...left.entities].reverse(),
      doors: [...left.doors].reverse(),
    };
    const leftCanonical = canonicalMansionLayoutV2(left);
    const rightCanonical = canonicalMansionLayoutV2(right);
    assert.equal(leftCanonical, rightCanonical);
    assert.equal(
      createHash("sha256").update(leftCanonical).digest("hex"),
      createHash("sha256").update(rightCanonical).digest("hex"),
    );
  });
});

describe("MansionLayoutV2 room presentation", () => {
  const fire: MansionDynamicLightV2 = {
    id: "light:fire",
    roomId: "foyer",
    kind: "fire",
    color: "#ff9b55",
    intensity: 0.8,
    animationSeed: "hearth-1",
    animation: "flicker",
    geometry: { x: 0.25, y: 0.7, radius: 0.2, rotation: 0 },
    cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
  };

  it("caps authoring anchors at 24 and mansion-static lights at 8", () => {
    const layout = baseLayout();
    const overAnchored: MansionLayoutV2 = {
      ...layout,
      placementAnchors: Array.from({ length: 25 }, (_, index) => ({
        id: `anchor:${index}`,
        roomId: "foyer",
        name: `Anchor ${index}`,
        relation: "near" as const,
        point: { x: 0.5, y: 0.5 },
      })),
      lights: Array.from({ length: 9 }, (_, index) => ({
        ...fire,
        id: `light:${index}`,
      })),
    };
    const errors = validateMansionLayoutV2(overAnchored).join("\n");
    assert.match(errors, /at most 24 placement anchors/u);
    assert.match(errors, /at most 8 dynamic lights/u);

    const eightPerRoom: MansionLayoutV2 = {
      ...layout,
      lights: ["foyer", "parlor"].flatMap((roomId) => Array.from({ length: 8 }, (_, index) => ({
        ...fire,
        roomId,
        id: `light:${roomId}:${index}`,
      }))),
    };
    assert.doesNotMatch(validateMansionLayoutV2(eightPerRoom).join("\n"), /at most 8 dynamic lights/u);
  });

  it("animates deterministically and freezes the seeded frame for Reduced Motion", () => {
    assert.deepEqual(mansionDynamicLightFrameV2(fire, 1_250, true),
      mansionDynamicLightFrameV2(fire, 99_000, true));
    assert.deepEqual(mansionDynamicLightFrameV2(fire, 1_250, false),
      mansionDynamicLightFrameV2(fire, 1_250, false));
    assert.notEqual(
      mansionDynamicLightFrameV2(fire, 0, false).intensity,
      mansionDynamicLightFrameV2(fire, 1_000, false).intensity,
    );
    const steady = { ...fire, animation: "steady" as const };
    assert.equal(
      mansionDynamicLightFrameV2(steady, 0, false).intensity,
      mansionDynamicLightFrameV2(steady, 10_000, false).intensity,
    );
  });
});

function portableManifest(layout: MansionLayoutV2 | null): MansionPackageManifestV1 {
  const sourceRooms = layout
    ? Array.from(mansionLayoutV2ToLegacyRoomsForTest(layout))
    : [{
        id: "legacy-room",
        templateId: "library",
        name: "Legacy Library",
        floor: 1,
        x: 24,
        y: 12,
        width: 4,
        height: 3,
        neighborIds: [] as string[],
      }];
  return {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "package-v2-test",
    title: "Connected House",
    description: "A source-preserving fixture.",
    creator: { name: "Fixture", id: null, url: null },
    provenance: {
      createdAt: "2026-08-28T00:00:00.000Z",
      prismVersion: "0.15.0",
      generatedWith: [],
    },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: Math.max(...sourceRooms.map((entry) => entry.floor)),
    ...(layout ? { layoutV2: layout } : {}),
    rooms: sourceRooms.map((entry) => ({
      ...entry,
      slots: [],
      emoji: "◇",
      roomAssetId: null,
      propAssetIds: [],
    })),
    houseStyle: { id: "fixture", label: "Fixture", promptContract: "Connected house." },
    assets: [],
    previewAssetId: null,
    investigationThemeAssetId: null,
  };
}

function mansionLayoutV2ToLegacyRoomsForTest(layout: MansionLayoutV2) {
  const neighbors = mansionLayoutV2CompatibilityNeighborIds(layout);
  return layout.entities
    .filter((entry): entry is MansionLayoutRoomV2 => entry.kind === "room")
    .map((entry) => {
      const footprint = mansionLayoutV2RoomFootprint(entry);
      return {
        id: entry.id,
        templateId: entry.templateId,
        name: entry.name,
        floor: entry.floor,
        x: entry.x,
        y: entry.y,
        width: footprint.width,
        height: footprint.height,
        neighborIds: [...(neighbors.get(entry.id) ?? [])],
      };
    });
}

describe("portable MansionLayoutV2", () => {
  it("keeps bounded V1 packages importable while rejecting hostile legacy coordinates", () => {
    const legacy = portableManifest(null);
    assert.deepEqual(validateMansionPackageManifestV1(legacy), []);
    const hostile = structuredClone(legacy);
    hostile.rooms[0]!.x = 100_000;
    assert.match(validateMansionPackageManifestV1(hostile).join("\n"), /rooms\[0\]\.x is invalid/u);
  });

  it("round-trips a canonical V2 projection without rewriting its source contract", () => {
    const layout = baseLayout();
    const manifest = portableManifest(layout);
    assert.deepEqual(validateMansionPackageManifestV1(manifest), []);
    const canonical = canonicalPortablePackageJsonV1(
      manifest as unknown as PortablePackageJsonValueV1,
    );
    const roundTrip = JSON.parse(canonical) as MansionPackageManifestV1;
    assert.deepEqual(validateMansionPackageManifestV1(roundTrip), []);
    assert.equal(
      canonicalMansionLayoutV2(roundTrip.layoutV2!),
      canonicalMansionLayoutV2(layout),
    );
  });

  it("rejects hostile V2 bounds and a noncanonical V1 compatibility projection", () => {
    const manifest = portableManifest(baseLayout());
    manifest.layoutV2!.entities[0] = {
      ...(manifest.layoutV2!.entities[0] as MansionLayoutRoomV2),
      x: 99,
    };
    assert.match(
      validateMansionPackageManifestV1(manifest).join("\n"),
      /16x12 floor envelope/u,
    );

    const mismatch = portableManifest(baseLayout());
    mismatch.rooms[0]!.neighborIds = [];
    assert.match(
      validateMansionPackageManifestV1(mismatch).join("\n"),
      /projection .* is not canonical/u,
    );
  });
});
