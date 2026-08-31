import {
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  debateMysteryRoomPresentationRegionsV1,
} from "./debateMystery.ts";
import {
  MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM,
  MANSION_LAYOUT_V2_MAX_LIGHTS,
  type MansionDynamicLightV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MansionPlacementAnchorV2,
  type MansionPlacementRelationV2,
} from "./mansionLayoutV2.ts";

export interface MansionLayoutV2AutoDecorationOptions {
  /** Opaque, replay-stable variation seed. Never use a mutable display name. */
  seed: string;
  /** Durable mansion, bundle, or package lineage identity. */
  sourceIdentity: string;
}

interface SemanticDecorationRegionV2 {
  key: string;
  label: string;
  lightHint: string;
  point: { x: number; y: number };
  bounds: { width: number; height: number };
}

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function hashToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function seededUnit(value: string): number {
  return Number.parseInt(hashToken(value), 16) / 0xffffffff;
}

function stableGeneratedId(
  kind: "anchor" | "light",
  key: string,
  options: MansionLayoutV2AutoDecorationOptions,
  claimedIds: Set<string>,
): string {
  const identity = `${options.sourceIdentity}\u0000${options.seed}\u0000${kind}\u0000${key}`;
  const base = `auto-${kind}:${hashToken(identity)}`;
  let id = base;
  let collisionIndex = 2;
  while (claimedIds.has(id)) {
    id = `${base}:${collisionIndex}`;
    collisionIndex += 1;
  }
  claimedIds.add(id);
  return id;
}

function roomRegions(room: MansionLayoutRoomV2): readonly SemanticDecorationRegionV2[] {
  const broadRegions = debateMysteryRoomPresentationRegionsV1(room)
    .filter((region) => !region.id.includes(":detail-"));
  return broadRegions.map((region) => {
    const xs = region.polygon.map((point) => clamp(point.x / 100, 0, 1));
    const ys = region.polygon.map((point) => clamp(point.y / 100, 0, 1));
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const minimumY = Math.min(...ys);
    const maximumY = Math.max(...ys);
    return {
      key: region.id,
      label: region.label,
      lightHint: `${region.label} ${region.physicalAnchor}`,
      point: {
        x: rounded(xs.reduce((sum, value) => sum + value, 0) / xs.length),
        y: rounded(ys.reduce((sum, value) => sum + value, 0) / ys.length),
      },
      bounds: {
        width: rounded(maximumX - minimumX),
        height: rounded(maximumY - minimumY),
      },
    };
  });
}

function anchorRelation(label: string): MansionPlacementRelationV2 {
  const normalized = normalizedText(label);
  if (/cabinet|case|closet|drawer|hamper|locker|niche|pantry|rack|safe|shelf|trunk|wardrobe/u.test(normalized)) {
    return "in";
  }
  if (/bench|counter|desk|floor|island|mantel|rug|sideboard|sill|stage|table|tile|workbench/u.test(normalized)) {
    return "on";
  }
  if (/bed|chair|door|fireplace|planter|sofa|stair|window/u.test(normalized)) return "beside";
  return "near";
}

function autoAnchorsForRoom(
  room: MansionLayoutRoomV2,
  layout: MansionLayoutV2,
  options: MansionLayoutV2AutoDecorationOptions,
  claimedIds: Set<string>,
): MansionPlacementAnchorV2[] {
  const existing = layout.placementAnchors.filter((anchor) => anchor.roomId === room.id);
  // Anchor sets are authored as a semantic composition. Once a room owns any
  // anchors, Case Forge cannot know which omitted labels were intentional, so
  // the whole set remains authoritative just like an authored light rig.
  if (existing.length > 0) return [];
  const remainingCapacity = Math.max(0, MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM - existing.length);
  if (remainingCapacity === 0) return [];
  return roomRegions(room)
    .slice(0, remainingCapacity)
    .map((region) => ({
      id: stableGeneratedId("anchor", `${room.id}\u0000${region.key}`, options, claimedIds),
      roomId: room.id,
      name: region.label,
      relation: anchorRelation(region.label),
      point: { ...region.point },
    }));
}

function lightCommon(
  room: MansionLayoutRoomV2,
  semanticKey: string,
  color: string,
  intensity: number,
  options: MansionLayoutV2AutoDecorationOptions,
  claimedIds: Set<string>,
) {
  const identity = `${options.sourceIdentity}\u0000${options.seed}\u0000${room.id}\u0000${semanticKey}`;
  return {
    id: stableGeneratedId("light", `${room.id}\u0000${semanticKey}`, options, claimedIds),
    roomId: room.id,
    color,
    intensity: rounded(clamp(intensity + (seededUnit(`${identity}:intensity`) - 0.5) * 0.06, 0, 1)),
    animationSeed: `auto:${hashToken(`${identity}:animation`)}`,
    cuePermission: { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
  };
}

function lightsForRoom(
  room: MansionLayoutRoomV2,
  layout: MansionLayoutV2,
  options: MansionLayoutV2AutoDecorationOptions,
  claimedIds: Set<string>,
): MansionDynamicLightV2[] {
  const existingCount = layout.lights.filter((light) => light.roomId === room.id).length;
  // A light has no semantic role/name field, so adding beside an authored light
  // could silently double it. Treat any authored room lighting as complete.
  if (existingCount > 0 || existingCount >= MANSION_LAYOUT_V2_MAX_LIGHTS) return [];

  const regions = roomRegions(room);
  const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId);
  const templateColor = template?.palette[2] ?? "#d8c7ad";
  const fireRegion = regions.find((region) => /fire[ -]?table|fireplace|hearth/u.test(normalizedText(region.lightHint)));
  const fixtureRegion = regions.find((region) =>
    /chandelier|illuminated|lamp|light(?!house)|pergola|sconce/u.test(normalizedText(region.lightHint)) &&
    !/skylight/u.test(normalizedText(region.lightHint)));
  const daylightRegion = regions.find((region) =>
    /dormer|glass door|glass roof|high window|skylight|window/u.test(normalizedText(region.lightHint)));
  const lights: MansionDynamicLightV2[] = [];

  if (fireRegion) {
    lights.push({
      ...lightCommon(room, `${fireRegion.key}:fire`, "#ff9b55", 0.72, options, claimedIds),
      kind: "fire",
      animation: "flicker",
      geometry: {
        ...fireRegion.point,
        radius: rounded(clamp(Math.max(fireRegion.bounds.width, fireRegion.bounds.height) * 0.48, 0.09, 0.24)),
        rotation: 0,
      },
    });
  }

  if (fixtureRegion && lights.length < MANSION_LAYOUT_V2_MAX_LIGHTS) {
    lights.push({
      ...lightCommon(room, `${fixtureRegion.key}:fixture`, templateColor, 0.5, options, claimedIds),
      kind: "omni",
      geometry: {
        ...fixtureRegion.point,
        radius: rounded(clamp(Math.max(fixtureRegion.bounds.width, fixtureRegion.bounds.height) * 0.58, 0.14, 0.32)),
      },
    });
  }

  if (daylightRegion && lights.length < MANSION_LAYOUT_V2_MAX_LIGHTS) {
    const identity = `${options.sourceIdentity}\u0000${options.seed}\u0000${room.id}\u0000${daylightRegion.key}`;
    lights.push({
      ...lightCommon(room, `${daylightRegion.key}:daylight`, "#a9d7ff", 0.36, options, claimedIds),
      kind: "directional",
      dust: true,
      geometry: {
        ...daylightRegion.point,
        width: rounded(clamp(daylightRegion.bounds.width * 1.08, 0.18, 0.68)),
        height: rounded(clamp(daylightRegion.bounds.height * 1.08, 0.16, 0.72)),
        rotation: rounded((seededUnit(`${identity}:rotation`) - 0.5) * 12),
      },
    });
  }

  if (lights.length === 0) {
    const identity = `${options.sourceIdentity}\u0000${options.seed}\u0000${room.id}\u0000ambient-fill`;
    lights.push({
      ...lightCommon(room, "ambient-fill", templateColor, 0.42, options, claimedIds),
      kind: "omni",
      geometry: {
        x: rounded(0.46 + seededUnit(`${identity}:x`) * 0.08),
        y: rounded(0.28 + seededUnit(`${identity}:y`) * 0.08),
        radius: 0.3,
      },
    });
  }
  return lights.slice(0, MANSION_LAYOUT_V2_MAX_LIGHTS);
}

/**
 * Deterministically fills absent room-scoped tags and lighting without
 * deleting, moving, sorting, or rewriting authored content. Reapplying the
 * same seed/source pair is idempotent and safe for replay/import boundaries.
 */
export function autoDecorateMansionLayoutV2(
  layout: MansionLayoutV2,
  options: MansionLayoutV2AutoDecorationOptions,
): MansionLayoutV2 {
  const rooms = layout.entities.filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room");
  const claimedAnchorIds = new Set(layout.placementAnchors.map((anchor) => anchor.id));
  const claimedLightIds = new Set(layout.lights.map((light) => light.id));
  const addedAnchors = rooms.flatMap((room) =>
    autoAnchorsForRoom(room, layout, options, claimedAnchorIds));
  const addedLights = rooms.flatMap((room) =>
    lightsForRoom(room, layout, options, claimedLightIds));
  if (addedAnchors.length === 0 && addedLights.length === 0) return layout;
  return {
    ...layout,
    placementAnchors: [...layout.placementAnchors, ...addedAnchors],
    lights: [...layout.lights, ...addedLights],
  };
}
