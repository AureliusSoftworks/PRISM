import {
  debateMysteryRoomFootprint,
  type DebateMysteryRoomFootprintV1,
} from "./debateMystery.ts";

export const MANSION_LAYOUT_V2_VERSION = 2 as const;
export const MANSION_LAYOUT_V2_COLUMNS = 16 as const;
export const MANSION_LAYOUT_V2_ROWS = 12 as const;
export const MANSION_LAYOUT_V2_MAX_FLOORS = 3 as const;
export const MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM = 24 as const;
export const MANSION_LAYOUT_V2_MAX_LIGHTS = 8 as const;
export const MANSION_LAYOUT_V2_MAX_NEON_POINTS = 32 as const;

export type MansionLayoutRotationV2 = 0 | 90;
export type MansionLayoutEntityKindV2 = "room" | "corridor" | "infill";
export type MansionLayoutWallV2 = "north" | "east" | "south" | "west";

export interface MansionLayoutEnvelopeV2 {
  columns: typeof MANSION_LAYOUT_V2_COLUMNS;
  rows: typeof MANSION_LAYOUT_V2_ROWS;
}

/** A semantic room has one authored module footprint. Width and height are
 * derived from templateId + rotation and are deliberately not editable. */
export interface MansionLayoutRoomV2 {
  kind: "room";
  id: string;
  templateId: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  rotation: MansionLayoutRotationV2;
  /** Reusable public casting socket; never a case occupant or private seat. */
  suspectSlotId: string | null;
  emoji: string;
  imageId: string | null;
  bundledAssetPath: string | null;
  /** Content-addressed aggregate asset. A candidate never replaces this. */
  acceptedRoomAssetId: string | null;
}

export interface MansionLayoutBlockV2 {
  kind: "corridor" | "infill";
  id: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MansionLayoutEntityV2 = MansionLayoutRoomV2 | MansionLayoutBlockV2;

/** Same-floor traversal is authored only through a wall door. `position` is
 * normalized along the shared wall, so a room can move without pixel state. */
export interface MansionLayoutDoorV2 {
  id: string;
  floor: number;
  aEntityId: string;
  bEntityId: string;
  aWall: MansionLayoutWallV2;
  position: number;
}

export type MansionVerticalConnectorKindV2 = "stairs" | "lift" | "ladder" | "portal";

export interface MansionVerticalConnectorV2 {
  id: string;
  kind: MansionVerticalConnectorKindV2;
  lowerEntityId: string;
  upperEntityId: string;
}

export const MANSION_PLACEMENT_RELATIONS_V2 = [
  "on",
  "in",
  "under",
  "behind",
  "beside",
  "near",
] as const;
export type MansionPlacementRelationV2 = typeof MANSION_PLACEMENT_RELATIONS_V2[number];

/** Authoring context for room prose and prop composition. It is intentionally
 * separate from investigation hotspots and never unlocks gameplay. */
export interface MansionPlacementAnchorV2 {
  id: string;
  roomId: string;
  name: string;
  relation: MansionPlacementRelationV2;
  point: { x: number; y: number };
}

export interface MansionLightCuePermissionV2 {
  version: 1;
  /** Static in this release. Stable cue IDs make a later opt-in runtime safe. */
  mode: "mansion_static";
  allowedCueIds: string[];
}

interface MansionDynamicLightBaseV2 {
  id: string;
  roomId: string;
  color: string;
  intensity: number;
  animationSeed: string;
  cuePermission: MansionLightCuePermissionV2;
}

export interface MansionFireLightV2 extends MansionDynamicLightBaseV2 {
  kind: "fire";
  animation: "steady" | "flicker";
  geometry: { x: number; y: number; radius: number; rotation: number };
}

export interface MansionOmniLightV2 extends MansionDynamicLightBaseV2 {
  kind: "omni";
  geometry: { x: number; y: number; radius: number };
}

export interface MansionDirectionalLightV2 extends MansionDynamicLightBaseV2 {
  kind: "directional";
  dust: boolean;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
}

export interface MansionNeonLightV2 extends MansionDynamicLightBaseV2 {
  kind: "neon";
  geometry: {
    points: Array<{ x: number; y: number }>;
    width: number;
  };
}

export type MansionDynamicLightV2 =
  | MansionFireLightV2
  | MansionOmniLightV2
  | MansionDirectionalLightV2
  | MansionNeonLightV2;

export type MansionRoomArtCandidateStatusV2 = "pending" | "ready" | "failed";

/** Durable candidate metadata. Candidate bytes use their own protected asset
 * reference and cannot become accepted art without an explicit accept action. */
export interface MansionRoomArtCandidateV2 {
  id: string;
  roomId: string;
  status: MansionRoomArtCandidateStatusV2;
  prompt: string;
  promptSha256: string;
  assetId: string | null;
  createdAt: string;
}

export interface MansionLayoutV2 {
  version: typeof MANSION_LAYOUT_V2_VERSION;
  envelope: MansionLayoutEnvelopeV2;
  entities: MansionLayoutEntityV2[];
  doors: MansionLayoutDoorV2[];
  verticalConnectors: MansionVerticalConnectorV2[];
  placementAnchors: MansionPlacementAnchorV2[];
  lights: MansionDynamicLightV2[];
  roomArtCandidates: MansionRoomArtCandidateV2[];
}

export interface MansionLayoutLegacyRoomV1 {
  id: string;
  templateId: string;
  name: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  neighborIds: string[];
  assignedSuspectSeatId: string | null;
  emoji: string;
  imageId: string | null;
  bundledAssetPath: string | null;
}

export interface MansionLayoutRectV2 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MansionLayoutSharedWallV2 {
  aWall: MansionLayoutWallV2;
  bWall: MansionLayoutWallV2;
  orientation: "horizontal" | "vertical";
  start: number;
  length: number;
  coordinate: number;
}

const ID_PATTERN = /^[A-Za-z0-9:_-]+$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COLOR_PATTERN = /^(?:#[a-f0-9]{3,8}|(?:rgb|hsl)a?\([^)]{1,120}\))$/iu;

function isFiniteNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function entityIsTraversable(entity: MansionLayoutEntityV2): boolean {
  return entity.kind === "room" || entity.kind === "corridor";
}

export function mansionLayoutV2RoomFootprint(
  room: Pick<MansionLayoutRoomV2, "templateId" | "rotation">,
): DebateMysteryRoomFootprintV1 {
  const footprint = debateMysteryRoomFootprint(room.templateId);
  return room.rotation === 90
    ? { roomTypeId: footprint.roomTypeId, width: footprint.height, height: footprint.width }
    : footprint;
}

export function mansionLayoutV2EntityRect(
  entity: MansionLayoutEntityV2,
): MansionLayoutRectV2 {
  if (entity.kind === "room") {
    const footprint = mansionLayoutV2RoomFootprint(entity);
    return { x: entity.x, y: entity.y, width: footprint.width, height: footprint.height };
  }
  return {
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
  };
}

export function mansionLayoutV2RectsOverlap(
  left: MansionLayoutRectV2,
  right: MansionLayoutRectV2,
): boolean {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

export function mansionLayoutV2SharedWall(
  a: MansionLayoutEntityV2,
  b: MansionLayoutEntityV2,
): MansionLayoutSharedWallV2 | null {
  if (a.floor !== b.floor) return null;
  const left = mansionLayoutV2EntityRect(a);
  const right = mansionLayoutV2EntityRect(b);
  const verticalStart = Math.max(left.y, right.y);
  const verticalEnd = Math.min(left.y + left.height, right.y + right.height);
  if (verticalEnd > verticalStart) {
    if (left.x + left.width === right.x) {
      return {
        aWall: "east",
        bWall: "west",
        orientation: "vertical",
        start: verticalStart,
        length: verticalEnd - verticalStart,
        coordinate: right.x,
      };
    }
    if (right.x + right.width === left.x) {
      return {
        aWall: "west",
        bWall: "east",
        orientation: "vertical",
        start: verticalStart,
        length: verticalEnd - verticalStart,
        coordinate: left.x,
      };
    }
  }
  const horizontalStart = Math.max(left.x, right.x);
  const horizontalEnd = Math.min(left.x + left.width, right.x + right.width);
  if (horizontalEnd > horizontalStart) {
    if (left.y + left.height === right.y) {
      return {
        aWall: "south",
        bWall: "north",
        orientation: "horizontal",
        start: horizontalStart,
        length: horizontalEnd - horizontalStart,
        coordinate: right.y,
      };
    }
    if (right.y + right.height === left.y) {
      return {
        aWall: "north",
        bWall: "south",
        orientation: "horizontal",
        start: horizontalStart,
        length: horizontalEnd - horizontalStart,
        coordinate: left.y,
      };
    }
  }
  return null;
}

export function mansionLayoutV2DoorPoint(
  layout: MansionLayoutV2,
  door: MansionLayoutDoorV2,
): { x: number; y: number } | null {
  const byId = new Map(layout.entities.map((entity) => [entity.id, entity]));
  const a = byId.get(door.aEntityId);
  const b = byId.get(door.bEntityId);
  if (!a || !b) return null;
  const wall = mansionLayoutV2SharedWall(a, b);
  if (!wall || wall.aWall !== door.aWall) return null;
  const along = wall.start + wall.length * Math.min(1, Math.max(0, door.position));
  return wall.orientation === "vertical"
    ? { x: wall.coordinate, y: along }
    : { x: along, y: wall.coordinate };
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function uniqueStableId(base: string, used: Set<string>): string {
  const safeBase = base.replace(/[^A-Za-z0-9:_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "item";
  let candidate = safeBase;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${safeBase}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

/** Removes doors whose entities moved apart; explicitly removed valid doors
 * stay removed. */
export function reconcileMansionLayoutV2Doors(
  layout: MansionLayoutV2,
): MansionLayoutV2 {
  const byId = new Map(layout.entities.map((entity) => [entity.id, entity]));
  return {
    ...layout,
    doors: layout.doors.filter((door) => {
      const a = byId.get(door.aEntityId);
      const b = byId.get(door.bEntityId);
      const wall = a && b && entityIsTraversable(a) && entityIsTraversable(b)
        ? mansionLayoutV2SharedWall(a, b)
        : null;
      return Boolean(
        a && b && wall && wall.aWall === door.aWall &&
        door.floor === a.floor && door.floor === b.floor,
      );
    }),
  };
}

/** Adds centered doors only for newly shared walls touching one placed block. */
export function addAutoCenteredMansionLayoutV2Doors(
  layout: MansionLayoutV2,
  entityId: string,
): MansionLayoutV2 {
  const reconciled = reconcileMansionLayoutV2Doors(layout);
  const entity = reconciled.entities.find((candidate) => candidate.id === entityId);
  if (!entity || !entityIsTraversable(entity)) return reconciled;
  const paired = new Set(reconciled.doors.map((door) => pairKey(door.aEntityId, door.bEntityId)));
  const usedIds = new Set(reconciled.doors.map((door) => door.id));
  const doors = [...reconciled.doors];
  for (const other of reconciled.entities) {
    if (other.id === entity.id || !entityIsTraversable(other)) continue;
    const wall = mansionLayoutV2SharedWall(entity, other);
    if (!wall || paired.has(pairKey(entity.id, other.id))) continue;
    doors.push({
      id: uniqueStableId(`door:${entity.id}:${other.id}`, usedIds),
      floor: entity.floor,
      aEntityId: entity.id,
      bEntityId: other.id,
      aWall: wall.aWall,
      position: 0.5,
    });
    paired.add(pairKey(entity.id, other.id));
  }
  return { ...reconciled, doors };
}

export function mansionLayoutV2PlacementIsLegal(
  layout: MansionLayoutV2,
  entityId: string,
  candidate: MansionLayoutEntityV2,
): boolean {
  if (candidate.id !== entityId) return false;
  const rect = mansionLayoutV2EntityRect(candidate);
  if (
    !Number.isInteger(candidate.floor) || candidate.floor < 1 ||
    candidate.floor > MANSION_LAYOUT_V2_MAX_FLOORS ||
    !Number.isInteger(rect.x) || !Number.isInteger(rect.y) ||
    !Number.isInteger(rect.width) || !Number.isInteger(rect.height) ||
    rect.width < 1 || rect.height < 1 || rect.x < 0 || rect.y < 0 ||
    rect.x + rect.width > MANSION_LAYOUT_V2_COLUMNS ||
    rect.y + rect.height > MANSION_LAYOUT_V2_ROWS
  ) return false;
  const others = layout.entities.filter((entity) => entity.id !== entityId);
  if (others.some((entity) => entity.floor === candidate.floor &&
    mansionLayoutV2RectsOverlap(rect, mansionLayoutV2EntityRect(entity)))) return false;
  const entitiesOnFloor = others.filter((entity) => entity.floor === candidate.floor);
  if (!entityIsTraversable(candidate)) {
    return entitiesOnFloor.length === 0 ||
      entitiesOnFloor.some((entity) => mansionLayoutV2SharedWall(candidate, entity));
  }
  const traversableOnFloor = entitiesOnFloor.filter(
    (entity) => entity.floor === candidate.floor && entityIsTraversable(entity),
  );
  if (traversableOnFloor.length === 0) return true;
  if (traversableOnFloor.some((entity) => mansionLayoutV2SharedWall(candidate, entity))) return true;
  return layout.verticalConnectors.some((connector) =>
    connector.lowerEntityId === entityId || connector.upperEntityId === entityId,
  );
}

function clampMansionLayoutV2Entity(entity: MansionLayoutEntityV2): MansionLayoutEntityV2 {
  const rect = mansionLayoutV2EntityRect(entity);
  return {
    ...entity,
    x: Math.max(0, Math.min(MANSION_LAYOUT_V2_COLUMNS - rect.width, Math.round(entity.x))),
    y: Math.max(0, Math.min(MANSION_LAYOUT_V2_ROWS - rect.height, Math.round(entity.y))),
  } as MansionLayoutEntityV2;
}

function nearestConnectedMansionLayoutV2Placement(
  layout: MansionLayoutV2,
  entity: MansionLayoutEntityV2,
): MansionLayoutEntityV2 | null {
  const candidates: MansionLayoutEntityV2[] = [];
  for (let y = 0; y < MANSION_LAYOUT_V2_ROWS; y += 1) {
    for (let x = 0; x < MANSION_LAYOUT_V2_COLUMNS; x += 1) {
      const candidate = { ...entity, x, y } as MansionLayoutEntityV2;
      if (mansionLayoutV2PlacementIsLegal(layout, entity.id, candidate)) candidates.push(candidate);
    }
  }
  candidates.sort((left, right) =>
    Math.abs(left.x - entity.x) + Math.abs(left.y - entity.y) -
    (Math.abs(right.x - entity.x) + Math.abs(right.y - entity.y)) ||
    left.y - right.y || left.x - right.x);
  return candidates[0] ?? null;
}

/** Places a room or corridor directly. A colliding block is displaced to its
 * nearest legal connected position, so editing feels like arranging a house
 * instead of negotiating a rejection state. The previous layout is retained
 * only when no connected reflow exists. */
export function placeMansionLayoutV2Entity(
  layout: MansionLayoutV2,
  entityId: string,
  requested: MansionLayoutEntityV2,
): MansionLayoutV2 {
  const current = layout.entities.find((entity) => entity.id === entityId);
  if (!current || requested.id !== entityId || requested.floor < 1 || requested.floor > 3) return layout;
  const existingDoorPairs = new Set(layout.doors.map((door) => pairKey(door.aEntityId, door.bEntityId)));
  const deliberatelyDoorlessPairs = new Set<string>();
  for (let leftIndex = 0; leftIndex < layout.entities.length; leftIndex += 1) {
    const left = layout.entities[leftIndex]!;
    if (!entityIsTraversable(left)) continue;
    for (const right of layout.entities.slice(leftIndex + 1)) {
      if (!entityIsTraversable(right) || !mansionLayoutV2SharedWall(left, right)) continue;
      const key = pairKey(left.id, right.id);
      if (!existingDoorPairs.has(key)) deliberatelyDoorlessPairs.add(key);
    }
  }
  const candidate = clampMansionLayoutV2Entity(requested);
  if (JSON.stringify(candidate) === JSON.stringify(current)) return layout;
  const changedIds = [entityId];
  let entities = layout.entities.map((entity) => entity.id === entityId ? candidate : entity);
  const collisions = entities.filter((entity) => entity.id !== entityId && entity.floor === candidate.floor &&
    mansionLayoutV2RectsOverlap(mansionLayoutV2EntityRect(candidate), mansionLayoutV2EntityRect(entity)));
  for (const collision of collisions) {
    const withoutCollision: MansionLayoutV2 = {
      ...layout,
      entities: entities.filter((entity) => entity.id !== collision.id),
      doors: layout.doors.filter((door) => door.aEntityId !== collision.id && door.bEntityId !== collision.id),
    };
    const relocated = nearestConnectedMansionLayoutV2Placement(withoutCollision, collision);
    if (!relocated) return layout;
    entities = entities.map((entity) => entity.id === collision.id ? relocated : entity);
    changedIds.push(collision.id);
  }
  let next: MansionLayoutV2 = { ...layout, entities };
  next = reconcileMansionLayoutV2Doors(next);
  for (const changedId of changedIds) next = addAutoCenteredMansionLayoutV2Doors(next, changedId);
  next = {
    ...next,
    doors: next.doors.filter((door) =>
      !deliberatelyDoorlessPairs.has(pairKey(door.aEntityId, door.bEntityId))),
  };
  return mansionLayoutV2SemanticRoomsAreConnected(next) &&
    mansionLayoutV2TraversableEntitiesAreConnected(next) ? next : layout;
}

/** Applies a grid snap, clamping to the buildable envelope and reflowing any
 * collision. Only a disconnected/island result returns to the old position. */
export function snapMansionLayoutV2Entity(
  layout: MansionLayoutV2,
  entityId: string,
  placement: { x: number; y: number; floor?: number; rotation?: MansionLayoutRotationV2 },
): MansionLayoutV2 {
  const current = layout.entities.find((entity) => entity.id === entityId);
  if (!current) return layout;
  const candidate: MansionLayoutEntityV2 = {
    ...current,
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    floor: placement.floor ?? current.floor,
    ...(current.kind === "room" && placement.rotation !== undefined
      ? { rotation: placement.rotation }
      : {}),
  } as MansionLayoutEntityV2;
  return placeMansionLayoutV2Entity(layout, entityId, candidate);
}

export function rotateMansionLayoutV2Room(
  layout: MansionLayoutV2,
  roomId: string,
): MansionLayoutV2 {
  const room = layout.entities.find(
    (entity): entity is MansionLayoutRoomV2 => entity.id === roomId && entity.kind === "room",
  );
  if (!room) return layout;
  return snapMansionLayoutV2Entity(layout, roomId, {
    x: room.x,
    y: room.y,
    rotation: room.rotation === 0 ? 90 : 0,
  });
}

function traversableAdjacency(layout: MansionLayoutV2): Map<string, Set<string>> {
  const traversableIds = new Set(
    layout.entities.filter(entityIsTraversable).map((entity) => entity.id),
  );
  const adjacency = new Map<string, Set<string>>();
  const join = (left: string, right: string): void => {
    if (!traversableIds.has(left) || !traversableIds.has(right)) return;
    const leftSet = adjacency.get(left) ?? new Set<string>();
    leftSet.add(right);
    adjacency.set(left, leftSet);
    const rightSet = adjacency.get(right) ?? new Set<string>();
    rightSet.add(left);
    adjacency.set(right, rightSet);
  };
  for (const door of layout.doors) join(door.aEntityId, door.bEntityId);
  for (const connector of layout.verticalConnectors) {
    join(connector.lowerEntityId, connector.upperEntityId);
  }
  return adjacency;
}

function mansionLayoutV2TraversableEntitiesAreConnected(layout: MansionLayoutV2): boolean {
  const traversable = layout.entities.filter(entityIsTraversable);
  if (traversable.length < 2) return true;
  const adjacency = traversableAdjacency(layout);
  const visited = new Set<string>();
  const queue = [traversable[0]!.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighborId of adjacency.get(id) ?? []) queue.push(neighborId);
  }
  return traversable.every((entity) => visited.has(entity.id));
}

/** True when every semantic room is reachable from the foyer (or the first
 * room while a draft has not added its foyer yet). Corridors and vertical
 * connectors carry traversal; decorative infill never does. */
export function mansionLayoutV2SemanticRoomsAreConnected(
  layout: MansionLayoutV2,
): boolean {
  const rooms = layout.entities.filter(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room",
  );
  if (rooms.length < 2) return true;
  const root = rooms.find(
    (room) => room.floor === 1 && room.templateId === "foyer",
  ) ?? rooms[0]!;
  const adjacency = traversableAdjacency(layout);
  const visited = new Set<string>();
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighborId of adjacency.get(id) ?? []) queue.push(neighborId);
  }
  return rooms.every((room) => visited.has(room.id));
}

export function slideMansionLayoutV2Door(
  layout: MansionLayoutV2,
  doorId: string,
  position: number,
): MansionLayoutV2 {
  if (!Number.isFinite(position) || !layout.doors.some((door) => door.id === doorId)) {
    return layout;
  }
  const normalized = Math.min(1, Math.max(0, position));
  return {
    ...layout,
    doors: layout.doors.map((door) => door.id === doorId
      ? { ...door, position: normalized }
      : door),
  };
}

export function removeMansionLayoutV2Door(
  layout: MansionLayoutV2,
  doorId: string,
): MansionLayoutV2 {
  if (!layout.doors.some((door) => door.id === doorId)) return layout;
  return { ...layout, doors: layout.doors.filter((door) => door.id !== doorId) };
}

/** Compatibility neighbors collapse corridor chains but never tunnel through a
 * semantic room. Vertical connectors remain explicit room neighbors. */
export function mansionLayoutV2CompatibilityNeighborIds(
  layout: MansionLayoutV2,
): ReadonlyMap<string, readonly string[]> {
  const rooms = layout.entities.filter(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room",
  );
  const kindById = new Map(layout.entities.map((entity) => [entity.id, entity.kind]));
  const adjacency = traversableAdjacency(layout);
  const result = new Map<string, readonly string[]>();
  for (const room of rooms) {
    const neighbors = new Set<string>();
    const visitedCorridors = new Set<string>();
    const queue = [...(adjacency.get(room.id) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (id === room.id) continue;
      if (kindById.get(id) === "room") {
        neighbors.add(id);
        continue;
      }
      if (kindById.get(id) !== "corridor" || visitedCorridors.has(id)) continue;
      visitedCorridors.add(id);
      for (const next of adjacency.get(id) ?? []) queue.push(next);
    }
    result.set(room.id, [...neighbors].sort());
  }
  return result;
}

export function mansionLayoutV2SemanticRoomCount(layout: MansionLayoutV2): number {
  return layout.entities.filter((entity) => entity.kind === "room").length;
}

export function mansionLayoutV2FloorSemanticRoomCount(
  layout: MansionLayoutV2,
  floor: number,
): number {
  return layout.entities.filter(
    (entity) => entity.kind === "room" && entity.floor === floor,
  ).length;
}

export function mansionLayoutV2ToLegacyRooms(
  layout: MansionLayoutV2,
): MansionLayoutLegacyRoomV1[] {
  const neighborIds = mansionLayoutV2CompatibilityNeighborIds(layout);
  return layout.entities
    .filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room")
    .map((room) => {
      const footprint = mansionLayoutV2RoomFootprint(room);
      return {
        id: room.id,
        templateId: room.templateId,
        name: room.name,
        floor: room.floor,
        x: room.x,
        y: room.y,
        width: footprint.width,
        height: footprint.height,
        neighborIds: [...(neighborIds.get(room.id) ?? [])],
        assignedSuspectSeatId: room.suspectSlotId,
        emoji: room.emoji,
        imageId: room.imageId,
        bundledAssetPath: room.bundledAssetPath,
      };
    });
}

/** Rewrites aggregate-local IDs at a portable or tenant boundary while
 * preserving every geometric and authoring relationship. */
export function remapMansionLayoutV2Ids(
  layout: MansionLayoutV2,
  entityId: (id: string, entity: MansionLayoutEntityV2) => string,
  assetId: (id: string) => string | null = (id) => id,
): MansionLayoutV2 {
  const entityIds = new Map(
    layout.entities.map((entity) => [entity.id, entityId(entity.id, entity)]),
  );
  const mappedEntityId = (id: string): string => entityIds.get(id) ?? id;
  return {
    ...layout,
    entities: layout.entities.map((entity) => entity.kind === "room"
      ? {
          ...entity,
          id: mappedEntityId(entity.id),
          acceptedRoomAssetId: entity.acceptedRoomAssetId
            ? assetId(entity.acceptedRoomAssetId)
            : null,
        }
      : { ...entity, id: mappedEntityId(entity.id) }),
    doors: layout.doors.map((door) => ({
      ...door,
      aEntityId: mappedEntityId(door.aEntityId),
      bEntityId: mappedEntityId(door.bEntityId),
    })),
    verticalConnectors: layout.verticalConnectors.map((connector) => ({
      ...connector,
      lowerEntityId: mappedEntityId(connector.lowerEntityId),
      upperEntityId: mappedEntityId(connector.upperEntityId),
    })),
    placementAnchors: layout.placementAnchors.map((anchor) => ({
      ...anchor,
      roomId: mappedEntityId(anchor.roomId),
    })),
    lights: layout.lights.map((light) => ({
      ...light,
      roomId: mappedEntityId(light.roomId),
    })),
    roomArtCandidates: layout.roomArtCandidates.map((candidate) => ({
      ...candidate,
      roomId: mappedEntityId(candidate.roomId),
      assetId: candidate.assetId ? assetId(candidate.assetId) : null,
    })),
  };
}

function placementForRoom(
  occupied: Array<{ floor: number; rect: MansionLayoutRectV2 }>,
  preferredFloor: number,
  templateId: string,
): { floor: number; x: number; y: number; rotation: MansionLayoutRotationV2 } | null {
  const floors = [preferredFloor, 1, 2, 3].filter(
    (floor, index, values) => floor >= 1 && floor <= 3 && values.indexOf(floor) === index,
  );
  for (const floor of floors) {
    for (const rotation of [0, 90] as const) {
      const footprint = mansionLayoutV2RoomFootprint({ templateId, rotation });
      for (let y = 0; y <= MANSION_LAYOUT_V2_ROWS - footprint.height; y += 1) {
        for (let x = 0; x <= MANSION_LAYOUT_V2_COLUMNS - footprint.width; x += 1) {
          const rect = { x, y, width: footprint.width, height: footprint.height };
          if (!occupied.some((entry) => entry.floor === floor && mansionLayoutV2RectsOverlap(entry.rect, rect))) {
            return { floor, x, y, rotation };
          }
        }
      }
    }
  }
  return null;
}

/** Deterministic additive migration. It preserves valid fixed placements, then
 * packs only rooms that cannot fit the 16x12 envelope. Source V1 bytes remain
 * untouched; callers store this on a derivative or V2 package only. */
export function mansionLayoutV2FromLegacyRooms(
  legacyRooms: readonly MansionLayoutLegacyRoomV1[],
): MansionLayoutV2 {
  const entities: MansionLayoutRoomV2[] = [];
  const occupied: Array<{ floor: number; rect: MansionLayoutRectV2 }> = [];
  for (const source of legacyRooms) {
    const natural = debateMysteryRoomFootprint(source.templateId);
    const preferredRotation: MansionLayoutRotationV2 =
      source.width === natural.height && source.height === natural.width &&
      (natural.width !== natural.height)
        ? 90
        : 0;
    const preferred: MansionLayoutRoomV2 = {
      kind: "room",
      id: source.id,
      templateId: source.templateId,
      name: source.name,
      floor: Math.min(3, Math.max(1, Math.round(source.floor))),
      x: Math.round(source.x),
      y: Math.round(source.y),
      rotation: preferredRotation,
      suspectSlotId: source.assignedSuspectSeatId ? `slot:${source.id}` : null,
      emoji: source.emoji,
      imageId: source.imageId,
      bundledAssetPath: source.bundledAssetPath,
      acceptedRoomAssetId: null,
    };
    const preferredRect = mansionLayoutV2EntityRect(preferred);
    const preferredFits = preferredRect.x >= 0 && preferredRect.y >= 0 &&
      preferredRect.x + preferredRect.width <= MANSION_LAYOUT_V2_COLUMNS &&
      preferredRect.y + preferredRect.height <= MANSION_LAYOUT_V2_ROWS &&
      !occupied.some((entry) => entry.floor === preferred.floor &&
        mansionLayoutV2RectsOverlap(entry.rect, preferredRect));
    const placement = preferredFits
      ? { floor: preferred.floor, x: preferred.x, y: preferred.y, rotation: preferred.rotation }
      : placementForRoom(occupied, preferred.floor, preferred.templateId);
    if (!placement) {
      throw new Error(`The 16x12 Mansion Editor envelope cannot fit ${source.name || source.id}.`);
    }
    const room = { ...preferred, ...placement };
    entities.push(room);
    occupied.push({ floor: room.floor, rect: mansionLayoutV2EntityRect(room) });
  }
  let layout: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities,
    doors: [],
    verticalConnectors: [],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [],
  };
  for (const room of entities) layout = addAutoCenteredMansionLayoutV2Doors(layout, room.id);

  const byId = new Map(entities.map((room) => [room.id, room]));
  const usedConnectorIds = new Set<string>();
  const connectorPairs = new Set<string>();
  const verticalConnectors: MansionVerticalConnectorV2[] = [];
  for (const source of legacyRooms) {
    const room = byId.get(source.id);
    if (!room) continue;
    for (const neighborId of source.neighborIds) {
      const neighbor = byId.get(neighborId);
      if (!neighbor || neighbor.floor === room.floor) continue;
      const key = pairKey(room.id, neighbor.id);
      if (connectorPairs.has(key)) continue;
      const lower = room.floor < neighbor.floor ? room : neighbor;
      const upper = room.floor < neighbor.floor ? neighbor : room;
      verticalConnectors.push({
        id: uniqueStableId(`stairs:${lower.id}:${upper.id}`, usedConnectorIds),
        kind: "stairs",
        lowerEntityId: lower.id,
        upperEntityId: upper.id,
      });
      connectorPairs.add(key);
    }
  }
  const floors = [...new Set(entities.map((room) => room.floor))].sort((a, b) => a - b);
  for (let index = 1; index < floors.length; index += 1) {
    const lowerFloor = floors[index - 1]!;
    const upperFloor = floors[index]!;
    const alreadyJoined = verticalConnectors.some((connector) => {
      const lower = byId.get(connector.lowerEntityId);
      const upper = byId.get(connector.upperEntityId);
      return lower?.floor === lowerFloor && upper?.floor === upperFloor;
    });
    if (alreadyJoined) continue;
    const lower = entities.find((room) => room.floor === lowerFloor && room.templateId === "foyer") ??
      entities.find((room) => room.floor === lowerFloor);
    const upper = entities.find((room) => room.floor === upperFloor);
    if (!lower || !upper) continue;
    verticalConnectors.push({
      id: uniqueStableId(`stairs:${lower.id}:${upper.id}`, usedConnectorIds),
      kind: "stairs",
      lowerEntityId: lower.id,
      upperEntityId: upper.id,
    });
  }
  return { ...layout, verticalConnectors };
}

function legacyUpperFloorPriority(templateId: string): number {
  if (templateId === "primary-bedroom" || templateId === "guest-bedroom") return 0;
  if (templateId === "bathroom") return 1;
  if (templateId === "study" || templateId === "library") return 2;
  return 3;
}

export type MansionLayoutV2HouseProfile = "gallery" | "spine" | "courtyard";

function mansionLayoutV2SeedProfile(seed: string): MansionLayoutV2HouseProfile {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (["gallery", "spine", "courtyard"] as const)[(hash >>> 0) % 3]!;
}

function corridorPlanForProfile(
  profile: MansionLayoutV2HouseProfile,
  floor: number,
): MansionLayoutBlockV2[] {
  const id = (suffix: string) => `corridor:f${floor}:${profile}:${suffix}`;
  if (profile === "spine") {
    return [{ kind: "corridor", id: id("spine"), floor, x: 7, y: 2, width: 1, height: 8 }];
  }
  if (profile === "courtyard") {
    return [
      { kind: "corridor", id: id("north"), floor, x: 3, y: 3, width: 10, height: 1 },
      { kind: "corridor", id: id("west"), floor, x: 3, y: 4, width: 1, height: 4 },
      { kind: "corridor", id: id("south"), floor, x: 4, y: 7, width: 9, height: 1 },
      { kind: "corridor", id: id("east"), floor, x: 12, y: 4, width: 1, height: 3 },
    ];
  }
  return [{ kind: "corridor", id: id("gallery"), floor, x: 4, y: 5, width: 8, height: 1 }];
}

function placeRoomAgainstCorridors(
  source: MansionLayoutRoomV2,
  floor: number,
  profile: MansionLayoutV2HouseProfile,
  placed: readonly MansionLayoutEntityV2[],
): MansionLayoutRoomV2 | null {
  const corridors = placed.filter((entity) => entity.kind === "corridor");
  const candidates: MansionLayoutRoomV2[] = [];
  for (const rotation of [source.rotation, source.rotation === 0 ? 90 : 0] as const) {
    const footprint = mansionLayoutV2RoomFootprint({ templateId: source.templateId, rotation });
    for (let y = 0; y <= MANSION_LAYOUT_V2_ROWS - footprint.height; y += 1) {
      for (let x = 0; x <= MANSION_LAYOUT_V2_COLUMNS - footprint.width; x += 1) {
        const candidate: MansionLayoutRoomV2 = { ...source, floor, x, y, rotation };
        const candidateRect = mansionLayoutV2EntityRect(candidate);
        if (placed.some((entity) => mansionLayoutV2RectsOverlap(
          mansionLayoutV2EntityRect(entity), candidateRect,
        ))) continue;
        if (!placed.some((entity) => entityIsTraversable(entity) &&
          mansionLayoutV2SharedWall(entity, candidate))) continue;
        candidates.push(candidate);
      }
    }
  }
  const centerX = profile === "spine" ? 8 : 8;
  const centerY = profile === "gallery" ? 6 : 6;
  candidates.sort((left, right) => {
    const leftRect = mansionLayoutV2EntityRect(left);
    const rightRect = mansionLayoutV2EntityRect(right);
    const leftDistance = Math.abs(leftRect.x + leftRect.width / 2 - centerX) +
      Math.abs(leftRect.y + leftRect.height / 2 - centerY);
    const rightDistance = Math.abs(rightRect.x + rightRect.width / 2 - centerX) +
      Math.abs(rightRect.y + rightRect.height / 2 - centerY);
    const leftCorridorPenalty = corridors.some((corridor) =>
      mansionLayoutV2SharedWall(corridor, left)) ? 0 : 100;
    const rightCorridorPenalty = corridors.some((corridor) =>
      mansionLayoutV2SharedWall(corridor, right)) ? 0 : 100;
    return leftCorridorPenalty - rightCorridorPenalty ||
      leftDistance - rightDistance || left.y - right.y || left.x - right.x;
  });
  return candidates[0] ?? null;
}

function addHouseCorridorsToLegacyPlan(
  base: MansionLayoutV2,
  profile: MansionLayoutV2HouseProfile,
): MansionLayoutV2 {
  let next = base;
  const floors = [...new Set(base.entities.map((entity) => entity.floor))].sort();
  for (const floor of floors) {
    const sizes = profile === "spine"
      ? [{ width: 1, height: 3 }, { width: 1, height: 2 }, { width: 1, height: 1 }]
      : profile === "gallery"
        ? [{ width: 3, height: 1 }, { width: 2, height: 1 }, { width: 1, height: 1 }]
        : [{ width: 2, height: 1 }, { width: 1, height: 2 }, { width: 1, height: 1 }];
    let placed: MansionLayoutBlockV2 | null = null;
    for (const size of sizes) {
      for (let y = 0; y <= MANSION_LAYOUT_V2_ROWS - size.height && !placed; y += 1) {
        for (let x = 0; x <= MANSION_LAYOUT_V2_COLUMNS - size.width; x += 1) {
          const candidate: MansionLayoutBlockV2 = {
            kind: "corridor",
            id: `corridor:f${floor}:${profile}:vestibule`,
            floor,
            x,
            y,
            ...size,
          };
          if (mansionLayoutV2PlacementIsLegal(next, candidate.id, candidate)) {
            placed = candidate;
            break;
          }
        }
      }
      if (placed) break;
    }
    if (placed) next = addAutoCenteredMansionLayoutV2Doors({
      ...next,
      entities: [...next.entities, placed],
    }, placed.id);
  }
  return next;
}

/** Builds a compact house-shaped V2 draft around authored circulation rather
 * than projecting every room into the same hallway chain. */
export function mansionLayoutV2HousePlanFromLegacyRooms(
  legacyRooms: readonly MansionLayoutLegacyRoomV1[],
  options: { seed?: string; profile?: MansionLayoutV2HouseProfile } = {},
): MansionLayoutV2 {
  const base = mansionLayoutV2FromLegacyRooms(legacyRooms);
  const sourceRooms = base.entities.filter(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room",
  );
  if (sourceRooms.length < 2) return base;
  const foyer = sourceRooms.find((room) => room.templateId === "foyer") ?? sourceRooms[0]!;
  const sourceFloors = new Set(sourceRooms.map((room) => room.floor));
  let rooms = sourceRooms;
  if (sourceFloors.size === 1 && sourceFloors.has(1)) {
    const upstairsCount = Math.min(
      rooms.length - 1,
      rooms.length >= 4 ? Math.max(2, Math.floor(rooms.length * 0.4)) : 1,
    );
    const upstairsIds = new Set(rooms
      .filter((room) => room.id !== foyer.id)
      .sort((left, right) => legacyUpperFloorPriority(left.templateId) - legacyUpperFloorPriority(right.templateId))
      .slice(0, upstairsCount)
      .map((room) => room.id));
    rooms = rooms.map((room) => ({ ...room, floor: upstairsIds.has(room.id) ? 2 : 1 }));
  }
  const profile = options.profile ?? mansionLayoutV2SeedProfile(options.seed ?? rooms.map((room) => room.id).join(":"));
  const entities: MansionLayoutEntityV2[] = [];
  for (const floor of [...new Set(rooms.map((room) => room.floor))].sort()) {
    const corridors = corridorPlanForProfile(profile, floor);
    const placed: MansionLayoutEntityV2[] = [...corridors];
    const floorRooms = rooms.filter((room) => room.floor === floor).sort((left, right) =>
      (left.id === foyer.id ? -1 : right.id === foyer.id ? 1 : 0) || left.id.localeCompare(right.id));
    for (const room of floorRooms) {
      const next = placeRoomAgainstCorridors(room, floor, profile, placed);
      if (!next) return addHouseCorridorsToLegacyPlan(base, profile);
      placed.push(next);
    }
    entities.push(...placed);
  }
  let derived: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities,
    doors: [],
    verticalConnectors: [],
    placementAnchors: [],
    lights: [],
    roomArtCandidates: [],
  };
  for (const entity of entities) derived = addAutoCenteredMansionLayoutV2Doors(derived, entity.id);
  const floors = [...new Set(rooms.map((room) => room.floor))].sort();
  derived = {
    ...derived,
    verticalConnectors: floors.slice(1).map((floor) => ({
      id: `stairs:f${floor - 1}:f${floor}`,
      kind: "stairs" as const,
      lowerEntityId: entities.find((entity) => entity.floor === floor - 1 && entity.kind === "corridor")!.id,
      upperEntityId: entities.find((entity) => entity.floor === floor && entity.kind === "corridor")!.id,
    })),
  };
  return validateMansionLayoutV2(derived).length === 0
    ? derived
    : addHouseCorridorsToLegacyPlan(base, profile);
}

/** Creates the first editable V2 draft from a legacy source. A valid legacy
 * one-floor mansion remains playable as-is, but its source-preserving local
 * derivative gains an occupied upstairs and explicit stairs before editing.
 * No semantic room is added or removed; the fixed-footprint rooms are packed
 * into connected shared-wall groups on the two floors. */
export function mansionLayoutV2EditorDerivativeFromLegacyRooms(
  legacyRooms: readonly MansionLayoutLegacyRoomV1[],
  options: { seed?: string; profile?: MansionLayoutV2HouseProfile } = {},
): MansionLayoutV2 {
  return mansionLayoutV2HousePlanFromLegacyRooms(legacyRooms, options);
}

function lightGeometryIsValid(light: MansionDynamicLightV2): boolean {
  if (light.kind === "fire" || light.kind === "omni") {
    const sharedGeometryIsValid = isFiniteNormalized(light.geometry.x) &&
      isFiniteNormalized(light.geometry.y) &&
      Number.isFinite(light.geometry.radius) &&
      light.geometry.radius > 0 && light.geometry.radius <= 1;
    if (light.kind === "omni") return sharedGeometryIsValid;
    return sharedGeometryIsValid &&
      (light.animation === "steady" || light.animation === "flicker") &&
      Number.isFinite(light.geometry.rotation) && Math.abs(light.geometry.rotation) <= 360;
  }
  if (light.kind === "directional") {
    return isFiniteNormalized(light.geometry.x) &&
      isFiniteNormalized(light.geometry.y) &&
      Number.isFinite(light.geometry.width) && light.geometry.width > 0 && light.geometry.width <= 1 &&
      Number.isFinite(light.geometry.height) && light.geometry.height > 0 && light.geometry.height <= 1 &&
      Number.isFinite(light.geometry.rotation) && Math.abs(light.geometry.rotation) <= 360 &&
      typeof light.dust === "boolean";
  }
  return light.geometry.points.length >= 2 &&
    light.geometry.points.length <= MANSION_LAYOUT_V2_MAX_NEON_POINTS &&
    light.geometry.points.every((point) => isFiniteNormalized(point.x) && isFiniteNormalized(point.y)) &&
    Number.isFinite(light.geometry.width) && light.geometry.width > 0 && light.geometry.width <= 0.25;
}

export function validateMansionLayoutV2(
  layout: MansionLayoutV2,
  options: { suspectCount?: number; requireEditorFloors?: boolean } = {},
): string[] {
  const errors: string[] = [];
  if (!layout || layout.version !== 2) return ["Mansion layout V2 is required."];
  if (layout.envelope?.columns !== 16 || layout.envelope?.rows !== 12) {
    errors.push("Mansion layout V2 must use the fixed 16x12 envelope.");
  }
  for (const key of [
    "entities", "doors", "verticalConnectors", "placementAnchors", "lights", "roomArtCandidates",
  ] as const) {
    if (!Array.isArray(layout[key])) errors.push(`Mansion layout V2 ${key} is invalid.`);
  }
  if (errors.length > 0) return [...new Set(errors)];
  if (layout.entities.length > MANSION_LAYOUT_V2_COLUMNS * MANSION_LAYOUT_V2_ROWS * MANSION_LAYOUT_V2_MAX_FLOORS) {
    errors.push("Mansion layout V2 contains more physical blocks than its envelope can hold.");
  }

  const entityById = new Map<string, MansionLayoutEntityV2>();
  const rooms: MansionLayoutRoomV2[] = [];
  for (const entity of layout.entities) {
    if (!entity.id?.trim() || entity.id.length > 200 || !ID_PATTERN.test(entity.id) || entityById.has(entity.id)) {
      errors.push("Every mansion block needs a unique stable ID.");
      continue;
    }
    entityById.set(entity.id, entity);
    if (!Number.isInteger(entity.floor) || entity.floor < 1 || entity.floor > 3) {
      errors.push(`${entity.id} is on an unsupported floor.`);
    }
    if (entity.kind !== "room" && entity.kind !== "corridor" && entity.kind !== "infill") {
      errors.push(`${entity.id} has an unsupported block kind.`);
      continue;
    }
    if (entity.kind === "room") {
      rooms.push(entity);
      if (!entity.templateId?.trim() || !entity.name?.trim()) {
        errors.push(`${entity.id} needs a room type and name.`);
      }
      if (entity.rotation !== 0 && entity.rotation !== 90) {
        errors.push(`${entity.name || entity.id} must use a 0 or 90 degree rotation.`);
      }
    } else if (
      !Number.isInteger(entity.width) || !Number.isInteger(entity.height) ||
      entity.width < 1 || entity.height < 1
    ) {
      errors.push(`${entity.id} needs a positive whole-cell footprint.`);
    }
    const rect = mansionLayoutV2EntityRect(entity);
    if (
      !Number.isInteger(rect.x) || !Number.isInteger(rect.y) || rect.x < 0 || rect.y < 0 ||
      rect.x + rect.width > 16 || rect.y + rect.height > 12
    ) errors.push(`${entity.kind === "room" ? entity.name : entity.id} must fit inside the 16x12 floor envelope.`);
  }
  for (let index = 0; index < layout.entities.length; index += 1) {
    const left = layout.entities[index]!;
    for (let otherIndex = index + 1; otherIndex < layout.entities.length; otherIndex += 1) {
      const right = layout.entities[otherIndex]!;
      if (left.floor === right.floor &&
        mansionLayoutV2RectsOverlap(mansionLayoutV2EntityRect(left), mansionLayoutV2EntityRect(right))) {
        errors.push(`${left.id} overlaps ${right.id} on Floor ${left.floor}.`);
      }
    }
  }
  for (const entity of layout.entities) {
    if (entity.kind !== "infill") continue;
    const attached = layout.entities.some((other) =>
      other.id !== entity.id && mansionLayoutV2SharedWall(entity, other) !== null);
    if (!attached) errors.push(`${entity.id} is floating decorative infill; attach it to the floor plan.`);
  }

  const floors = new Set(rooms.map((room) => room.floor));
  const requireEditorFloors = options.requireEditorFloors !== false;
  if (requireEditorFloors && (!floors.has(1) || !floors.has(2))) {
    errors.push("Every edited mansion needs semantic rooms on Floors 1 and 2.");
  }
  if (floors.has(3) && mansionLayoutV2FloorSemanticRoomCount(layout, 2) < 4) {
    errors.push("Floor 2 needs at least 4 semantic rooms before Floor 3 can be used.");
  }
  if (typeof options.suspectCount === "number" && rooms.length < options.suspectCount) {
    errors.push(`Keep at least ${options.suspectCount} semantic rooms for this mansion's supported cast.`);
  }
  const foyer = rooms.find((room) => room.floor === 1 && room.templateId === "foyer") ?? null;
  if (requireEditorFloors && !foyer) errors.push("Keep a foyer on the ground floor.");

  const doorIds = new Set<string>();
  const doorPairs = new Set<string>();
  for (const door of layout.doors) {
    if (!door.id?.trim() || door.id.length > 200 || !ID_PATTERN.test(door.id) || doorIds.has(door.id)) {
      errors.push("Every mansion door needs a unique stable ID.");
    }
    doorIds.add(door.id);
    const a = entityById.get(door.aEntityId);
    const b = entityById.get(door.bEntityId);
    if (!a || !b || !entityIsTraversable(a) || !entityIsTraversable(b) || a.id === b.id) {
      errors.push(`${door.id || "A door"} references an invalid traversal block.`);
      continue;
    }
    const wall = mansionLayoutV2SharedWall(a, b);
    if (!wall || wall.aWall !== door.aWall || door.floor !== a.floor || door.floor !== b.floor) {
      errors.push(`${door.id || "A door"} must sit on a shared same-floor wall; corner contact is not enough.`);
    }
    if (!isFiniteNormalized(door.position)) errors.push(`${door.id || "A door"} has an invalid wall position.`);
    const key = pairKey(a.id, b.id);
    if (doorPairs.has(key)) errors.push(`${a.id} and ${b.id} have duplicate doors.`);
    doorPairs.add(key);
  }

  const connectorIds = new Set<string>();
  for (const connector of layout.verticalConnectors) {
    if (!connector.id?.trim() || connector.id.length > 200 ||
      !ID_PATTERN.test(connector.id) || connectorIds.has(connector.id)) {
      errors.push("Every vertical connector needs a unique stable ID.");
    }
    connectorIds.add(connector.id);
    const lower = entityById.get(connector.lowerEntityId);
    const upper = entityById.get(connector.upperEntityId);
    if (!lower || !upper || !entityIsTraversable(lower) || !entityIsTraversable(upper) ||
      lower.floor >= upper.floor) {
      errors.push(`${connector.id || "A vertical connector"} has invalid lower and upper endpoints.`);
    }
    if (!["stairs", "lift", "ladder", "portal"].includes(connector.kind)) {
      errors.push(`${connector.id || "A vertical connector"} has an unsupported kind.`);
    }
  }

  if (foyer) {
    const adjacency = traversableAdjacency(layout);
    const visited = new Set<string>();
    const queue = [foyer.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const neighborId of adjacency.get(id) ?? []) queue.push(neighborId);
    }
    if (rooms.some((room) => !visited.has(room.id))) {
      errors.push("Every semantic room needs a shared-wall door or corridor path to the foyer.");
    }
    if (layout.entities.some((entity) => entity.kind === "corridor" && !visited.has(entity.id))) {
      errors.push("Every corridor must belong to the connected foyer circulation plan.");
    }
    if (floors.size > 1 && !layout.verticalConnectors.some((connector) =>
      visited.has(connector.lowerEntityId) && visited.has(connector.upperEntityId))) {
      errors.push("Connect the foyer plan to the upstairs with a vertical connector.");
    }
  }

  const anchorIds = new Set<string>();
  const anchorNamesByRoom = new Map<string, Set<string>>();
  const anchorCountByRoom = new Map<string, number>();
  for (const anchor of layout.placementAnchors) {
    if (!anchor.id?.trim() || anchor.id.length > 200 || !ID_PATTERN.test(anchor.id) || anchorIds.has(anchor.id)) {
      errors.push("Every placement anchor needs a unique stable ID.");
    }
    anchorIds.add(anchor.id);
    if (entityById.get(anchor.roomId)?.kind !== "room") errors.push(`${anchor.id || "An anchor"} references an invalid room.`);
    if (!anchor.name?.trim() || anchor.name.length > 80) errors.push(`${anchor.id || "An anchor"} needs a short name.`);
    if (!MANSION_PLACEMENT_RELATIONS_V2.includes(anchor.relation)) errors.push(`${anchor.id || "An anchor"} has an invalid relation.`);
    if (!isFiniteNormalized(anchor.point?.x) || !isFiniteNormalized(anchor.point?.y)) {
      errors.push(`${anchor.id || "An anchor"} must use a normalized point.`);
    }
    const normalizedName = anchor.name?.trim().toLocaleLowerCase() ?? "";
    const names = anchorNamesByRoom.get(anchor.roomId) ?? new Set<string>();
    if (normalizedName && names.has(normalizedName)) errors.push(`${anchor.roomId} has duplicate anchor names.`);
    if (normalizedName) names.add(normalizedName);
    anchorNamesByRoom.set(anchor.roomId, names);
    anchorCountByRoom.set(anchor.roomId, (anchorCountByRoom.get(anchor.roomId) ?? 0) + 1);
  }
  if ([...anchorCountByRoom.values()].some((count) => count > MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM)) {
    errors.push(`Each room supports at most ${MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM} placement anchors.`);
  }

  const lightIds = new Set<string>();
  const lightCountByRoom = new Map<string, number>();
  for (const light of layout.lights) {
    if (!light.id?.trim() || light.id.length > 200 || !ID_PATTERN.test(light.id) || lightIds.has(light.id)) {
      errors.push("Every dynamic light needs a unique stable ID.");
    }
    lightIds.add(light.id);
    lightCountByRoom.set(light.roomId, (lightCountByRoom.get(light.roomId) ?? 0) + 1);
    if (entityById.get(light.roomId)?.kind !== "room") errors.push(`${light.id || "A light"} references an invalid room.`);
    if (!COLOR_PATTERN.test(light.color ?? "") || !Number.isFinite(light.intensity) ||
      light.intensity < 0 || light.intensity > 1 || !light.animationSeed?.trim()) {
      errors.push(`${light.id || "A light"} has invalid presentation settings.`);
    }
    if (!lightGeometryIsValid(light)) errors.push(`${light.id || "A light"} has invalid normalized geometry.`);
    if (light.cuePermission?.version !== 1 || light.cuePermission?.mode !== "mansion_static" ||
      !Array.isArray(light.cuePermission.allowedCueIds) ||
      !light.cuePermission.allowedCueIds.every((id) => typeof id === "string" && ID_PATTERN.test(id)) ||
      new Set(light.cuePermission.allowedCueIds).size !== light.cuePermission.allowedCueIds.length) {
      errors.push(`${light.id || "A light"} has invalid cue permissions.`);
    }
  }
  if ([...lightCountByRoom.values()].some((count) => count > MANSION_LAYOUT_V2_MAX_LIGHTS)) {
    errors.push(`Each room supports at most ${MANSION_LAYOUT_V2_MAX_LIGHTS} dynamic lights.`);
  }

  const candidateIds = new Set<string>();
  const candidateRooms = new Set<string>();
  for (const candidate of layout.roomArtCandidates) {
    if (!candidate.id?.trim() || candidate.id.length > 200 || !ID_PATTERN.test(candidate.id) || candidateIds.has(candidate.id)) {
      errors.push("Every room-art candidate needs a unique stable ID.");
    }
    candidateIds.add(candidate.id);
    if (entityById.get(candidate.roomId)?.kind !== "room") errors.push(`${candidate.id || "A room-art candidate"} references an invalid room.`);
    if (candidateRooms.has(candidate.roomId)) errors.push(`${candidate.roomId} has more than one room-art candidate.`);
    candidateRooms.add(candidate.roomId);
    if (!["pending", "ready", "failed"].includes(candidate.status) ||
      !candidate.prompt?.trim() || candidate.prompt.length > 2_000 ||
      !SHA256_PATTERN.test(candidate.promptSha256 ?? "") ||
      !Number.isFinite(Date.parse(candidate.createdAt))) {
      errors.push(`${candidate.id || "A room-art candidate"} has invalid metadata.`);
    }
    if (candidate.status === "ready" ? !candidate.assetId?.trim() : candidate.assetId !== null) {
      errors.push(`${candidate.id || "A room-art candidate"} has an invalid protected asset state.`);
    }
  }
  return [...new Set(errors)];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Mansion layout contains a non-finite number.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("Mansion layout contains unsupported JSON.");
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function canonicalMansionLayoutV2(layout: MansionLayoutV2): string {
  const normalized: MansionLayoutV2 = {
    ...layout,
    entities: [...layout.entities].sort((left, right) => left.id.localeCompare(right.id)),
    doors: [...layout.doors].sort((left, right) => left.id.localeCompare(right.id)),
    verticalConnectors: [...layout.verticalConnectors].sort((left, right) => left.id.localeCompare(right.id)),
    placementAnchors: [...layout.placementAnchors].sort((left, right) => left.id.localeCompare(right.id)),
    lights: [...layout.lights].map((light) => ({
      ...light,
      cuePermission: {
        ...light.cuePermission,
        allowedCueIds: [...light.cuePermission.allowedCueIds].sort(),
      },
    })).sort((left, right) => left.id.localeCompare(right.id)),
    roomArtCandidates: [...layout.roomArtCandidates].sort((left, right) => left.id.localeCompare(right.id)),
  };
  return canonicalJson(normalized);
}

function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

/** Deterministic overlay sample. Reduced Motion freezes the seeded frame; it
 * does not remove the authored light or change its saved intensity. */
export function mansionDynamicLightFrameV2(
  light: MansionDynamicLightV2,
  elapsedMs: number,
  reducedMotion: boolean,
): { intensity: number; phase: number } {
  const basePhase = seededUnit(`${light.id}:${light.animationSeed}`) * Math.PI * 2;
  const animatesIntensity = (light.kind === "fire" && light.animation === "flicker") ||
    light.kind === "neon";
  const time = reducedMotion || !animatesIntensity ? 0 : Math.max(0, elapsedMs) / 1_000;
  const frequency = light.kind === "fire" ? 2.4 : light.kind === "neon" ? 0.7 : 0.25;
  const amplitude = light.kind === "fire" && light.animation === "flicker"
    ? 0.16
    : light.kind === "neon"
      ? 0.5
      : 0;
  const phase = basePhase + time * frequency * Math.PI * 2;
  const modulation = 1 - amplitude + amplitude * (0.5 + 0.5 * Math.sin(phase));
  return {
    intensity: Math.min(1, Math.max(0, light.intensity * modulation)),
    phase: basePhase,
  };
}
