import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { autoDecorateMansionLayoutV2 } from "./mansionAutoDecorationV2.ts";
import {
  createBlankMansionLayoutV2,
  validateMansionLayoutV2,
  type MansionDynamicLightV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MansionPlacementAnchorV2,
} from "./mansionLayoutV2.ts";

const OPTIONS = { seed: "case-seed-17", sourceIdentity: "mansion:asterion" } as const;

describe("MansionLayoutV2 auto-decoration", () => {
  it("fills semantic tags and template-aware lights deterministically", () => {
    const source = createBlankMansionLayoutV2();
    const first = autoDecorateMansionLayoutV2(source, OPTIONS);
    const second = autoDecorateMansionLayoutV2(source, OPTIONS);

    assert.deepEqual(first, second);
    assert.notEqual(first, source);
    assert.equal(first.entities, source.entities);
    for (const room of first.entities.filter((entity) => entity.kind === "room")) {
      assert.ok(first.placementAnchors.some((anchor) => anchor.roomId === room.id));
      assert.ok(first.lights.some((light) => light.roomId === room.id));
    }
    assert.deepEqual(validateMansionLayoutV2(first), []);
    assert.equal(autoDecorateMansionLayoutV2(first, OPTIONS), first);
  });

  it("preserves authored tags and lights exactly while filling only missing room content", () => {
    const source = createBlankMansionLayoutV2();
    const foyer = source.entities.find((entity): entity is MansionLayoutRoomV2 =>
      entity.kind === "room" && entity.templateId === "foyer")!;
    const authoredAnchor: MansionPlacementAnchorV2 = {
      id: "anchor:authored-foyer-console",
      roomId: foyer.id,
      name: "entry console",
      relation: "under",
      point: { x: 0.91, y: 0.22 },
    };
    const authoredLight: MansionDynamicLightV2 = {
      id: "light:authored-foyer",
      roomId: foyer.id,
      kind: "neon",
      color: "#12abef",
      intensity: 0.91,
      animationSeed: "author-chosen-seed",
      geometry: { points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }], width: 0.04 },
      cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: ["cue:foyer"] },
    };
    const authored: MansionLayoutV2 = {
      ...source,
      placementAnchors: [authoredAnchor],
      lights: [authoredLight],
    };
    const decorated = autoDecorateMansionLayoutV2(authored, OPTIONS);

    assert.equal(decorated.placementAnchors[0], authoredAnchor);
    assert.equal(decorated.lights[0], authoredLight);
    assert.deepEqual(decorated.placementAnchors[0], authoredAnchor);
    assert.deepEqual(decorated.lights.filter((light) => light.roomId === foyer.id), [authoredLight]);
    assert.equal(
      decorated.placementAnchors.filter((anchor) => anchor.roomId === foyer.id && anchor.name === "entry console").length,
      1,
    );
    assert.deepEqual(
      decorated.placementAnchors.filter((anchor) => anchor.roomId === foyer.id),
      [authoredAnchor],
    );
    assert.ok(decorated.placementAnchors.some((anchor) => anchor.roomId !== foyer.id));
    assert.deepEqual(validateMansionLayoutV2(decorated), []);
  });

  it("uses template coordinates only for the template plate, never custom foyer art", () => {
    const bundledSource = createBlankMansionLayoutV2();
    const bundledFoyer = bundledSource.entities.find((entity): entity is MansionLayoutRoomV2 =>
      entity.kind === "room" && entity.templateId === "foyer")!;
    const bundled = autoDecorateMansionLayoutV2(bundledSource, OPTIONS);
    const bundledAnchors = bundled.placementAnchors.filter((anchor) => anchor.roomId === bundledFoyer.id);
    const bundledLight = bundled.lights.find((light) => light.roomId === bundledFoyer.id)!;
    assert.ok(bundledAnchors.some((anchor) => anchor.name === "entry doors"));

    for (const artAuthority of ["imageId", "acceptedRoomAssetId"] as const) {
      const customSource: MansionLayoutV2 = {
        ...bundledSource,
        entities: bundledSource.entities.map((entity) => entity.id === bundledFoyer.id
          ? { ...entity, [artAuthority]: `${artAuthority}:custom-space-foyer` }
          : entity),
      };
      const custom = autoDecorateMansionLayoutV2(customSource, OPTIONS);
      const customAnchors = custom.placementAnchors.filter((anchor) => anchor.roomId === bundledFoyer.id);
      const customLight = custom.lights.find((light) => light.roomId === bundledFoyer.id)!;

      assert.deepEqual(customAnchors.map((anchor) => anchor.name), [
        "left wall", "center surface", "right wall", "foreground",
      ]);
      assert.ok(customAnchors.every((anchor) =>
        !bundledAnchors.some((bundledAnchor) =>
          bundledAnchor.name === anchor.name ||
          (bundledAnchor.point.x === anchor.point.x && bundledAnchor.point.y === anchor.point.y))));
      assert.notDeepEqual(customLight.geometry, bundledLight.geometry);
      assert.deepEqual(validateMansionLayoutV2(custom), []);
    }

    const missingPlateSource: MansionLayoutV2 = {
      ...bundledSource,
      entities: bundledSource.entities.map((entity) => entity.id === bundledFoyer.id
        ? { ...entity, bundledAssetPath: null }
        : entity),
    };
    const missingPlate = autoDecorateMansionLayoutV2(missingPlateSource, OPTIONS);
    assert.deepEqual(
      missingPlate.placementAnchors
        .filter((anchor) => anchor.roomId === bundledFoyer.id)
        .map((anchor) => anchor.name),
      ["left wall", "center surface", "right wall", "foreground"],
    );
  });

  it("respects room caps and changes generated identity only when the explicit source changes", () => {
    const source = createBlankMansionLayoutV2();
    const foyer = source.entities.find((entity): entity is MansionLayoutRoomV2 =>
      entity.kind === "room" && entity.templateId === "foyer")!;
    const fullAnchors = Array.from({ length: 24 }, (_, index): MansionPlacementAnchorV2 => ({
      id: `anchor:authored:${index}`,
      roomId: foyer.id,
      name: `Authored ${index}`,
      relation: "near",
      point: { x: 0.5, y: 0.5 },
    }));
    const authored: MansionLayoutV2 = { ...source, placementAnchors: fullAnchors };
    const first = autoDecorateMansionLayoutV2(authored, OPTIONS);
    const otherSource = autoDecorateMansionLayoutV2(source, {
      ...OPTIONS,
      sourceIdentity: "mansion:other",
    });

    assert.deepEqual(first.placementAnchors.filter((anchor) => anchor.roomId === foyer.id), fullAnchors);
    assert.notEqual(
      autoDecorateMansionLayoutV2(source, OPTIONS).placementAnchors[0]?.id,
      otherSource.placementAnchors[0]?.id,
    );
    assert.deepEqual(validateMansionLayoutV2(first), []);
  });
});
