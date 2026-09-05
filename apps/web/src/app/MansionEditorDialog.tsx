"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  MANSION_LAYOUT_V2_COLUMNS,
  MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM,
  MANSION_LAYOUT_V2_MAX_LIGHTS,
  MANSION_LAYOUT_V2_MAX_NEON_POINTS,
  MANSION_LAYOUT_V2_ROWS,
  MANSION_MAP_BOARD_V1,
  MANSION_OVERHEAD_FRAME_V1,
  MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1,
  MANSION_PLACEMENT_RELATIONS_V2,
  addAutoCenteredMansionLayoutV2Doors,
  fillMysteryVenueSideRoomsV1,
  mansionLayoutV2DoorPairIsAllowed,
  mansionLayoutV2RectsOverlap,
  mysterySideRoomSuggestedNameV1,
  canonicalMansionLayoutV2,
  debateMysteryRoomFloorRuleV1,
  debateMysteryRoomTypeIsAllowedOnFloorV1,
  mansionLayoutV2DoorPoint,
  mansionLayoutV2EntityRect,
  mansionLayoutV2EditorDerivativeFromLegacyRooms,
  mansionLayoutV2FloorSemanticRoomCount,
  mansionLayoutV2FromLegacyRooms,
  mansionLayoutV2PlacementIsLegal,
  mansionLayoutV2RooftopFloor,
  debateMysteryRoomFootprint,
  mansionLayoutV2InvalidEntityIdsV1,
  placeMansionLayoutV2Entity,
  placeMansionLayoutV2EntityFreelyV1,
  mansionLayoutV2SemanticRoomCount,
  mansionLayoutV2SemanticRoomsAreConnected,
  mansionLayoutV2SharedWall,
  reconcileMansionLayoutV2Doors,
  removeMansionLayoutV2Door,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  rotateMansionLayoutV2Room,
  slideMansionLayoutV2Door,
  validateMansionLayoutV2,
  type DebateMysteryMansionBundleSummaryV1,
  type MansionDynamicLightV2,
  type MansionLayoutBlockV2,
  type MansionLayoutEntityV2,
  type MansionLayoutRoomV2,
  type MansionLayoutRotationV2,
  type MansionLayoutV2,
  type MansionPlacementRelationV2,
} from "@localai/shared";
import { mansionDirectionalGeometryIsPolygonV2, mansionDirectionalLightPolygonV2, mansionGodrayEdgesV2, mansionGodrayParallelPointsV2 } from "@localai/shared";
import {
  installedMansionExteriorPreviewV1,
  resolveInstalledMansionPresentationV1,
} from "./installedMansionLibrary";
import {
  whodunnitBundledRoomArtPathForRoom,
  whodunnitMansionRoomArtUrl,
} from "./debateMysteryInvestigationArt";
import WhodunnitSetupDialog from "./WhodunnitSetupDialog";
import MapOverheadEditorDialog from "./MapOverheadEditorDialog";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import styles from "./debateMystery.module.css";

const CREATION_VALIDATION_MINIMUM_LOADER_MS = 900;

interface MansionEditorDialogProps {
  theme: "light" | "dark";
  mansion: DebateMysteryMansionBundleSummaryV1;
  busy: boolean;
  responseMode: "local" | "online";
  creationFlow?: boolean;
  onClose: () => void;
  onSave: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    layoutV2: MansionLayoutV2,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onGenerateRoomArt?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onAcceptRoomArt?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onDiscardRoomArt?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  onRegenerateRoomArt?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
  /** Pre-setup parity with Field Repair. Detection results land in the draft
   * and save with the venue plan; the overhead plate is stored on the venue. */
  onDetectRoomLights?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<import("@localai/shared").MansionDynamicLightV2[] | null>;
  onDetectRoomAnchors?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    roomId: string,
  ) => Promise<import("@localai/shared").MansionPlacementAnchorV2[] | null>;
  /** Names blocks in the venue's own vocabulary; falls back to the built-in catalog when absent. */
  onNameRooms?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
    entityIds: readonly string[],
  ) => Promise<Record<string, string> | null>;
  onGenerateOverhead?: (
    mansion: DebateMysteryMansionBundleSummaryV1,
  ) => Promise<DebateMysteryMansionBundleSummaryV1 | null>;
}

interface EntityDragV2 {
  /** The block under the pointer. */
  id: string;
  /** Every block moving with it; a single drag lists just the one. */
  ids: string[];
  pointerId: number;
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  previewX: number;
  previewY: number;
}

/** A drag on empty plan that selects everything it crosses, in fractional cells. */
interface MarqueeV2 {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  additive: boolean;
}

interface CorridorResizeV2 {
  id: string;
  pointerId: number;
  edge: "north" | "east" | "south" | "west";
  startX: number;
  startY: number;
  original: MansionLayoutBlockV2;
  baseLayout: MansionLayoutV2;
}

type RoomPlacementToolV2 = "anchor" | MansionDynamicLightV2["kind"];

type RoomOverlayGestureV2 = {
  kind: "light";
  pointerId: number;
  lightId: string;
  mode: "move" | "resize";
  start: { x: number; y: number };
  original: MansionDynamicLightV2;
} | {
  kind: "neon-draw";
  pointerId: number;
  lightId: string;
};

const FLOOR_IDS = [1, 2, 3] as const;

function cloneLayoutEntity(entity: MansionLayoutEntityV2): MansionLayoutEntityV2 {
  return JSON.parse(JSON.stringify(entity)) as MansionLayoutEntityV2;
}

function cloneLayout(layout: MansionLayoutV2): MansionLayoutV2 {
  return JSON.parse(JSON.stringify(layout)) as MansionLayoutV2;
}

/** Ambient infill stays infill: it dresses the map like a room and never
 * carries traversal, so it must not be promoted into a corridor on load. */
function normalizeEditorLayout(layout: MansionLayoutV2): MansionLayoutV2 {
  let next: MansionLayoutV2 = cloneLayout(layout);
  next = reconcileMansionLayoutV2Doors(next);
  for (const entity of next.entities) next = addAutoCenteredMansionLayoutV2Doors(next, entity.id);
  return next;
}

function initialLayout(mansion: DebateMysteryMansionBundleSummaryV1): MansionLayoutV2 {
  const layout = mansion.layoutV2
    ? cloneLayout(mansion.layoutV2)
    : mansion.derivation
      ? mansionLayoutV2EditorDerivativeFromLegacyRooms(mansion.rooms, { seed: mansion.name })
      : mansionLayoutV2FromLegacyRooms(mansion.rooms);
  return normalizeEditorLayout(layout);
}

interface MansionOverheadBoardTransformV1 {
  x: (value: number) => number;
  y: (value: number) => number;
  width: (value: number) => number;
  height: (value: number) => number;
}

/** Projects envelope cells through the same 2:1 fitted board used during
 * investigation, keeping rooms square and a stored 2:1 plate truly widescreen. */
function mansionOverheadBoardTransformV1(
  layout: MansionLayoutV2,
  floor: number,
): MansionOverheadBoardTransformV1 {
  const rectangles = layout.entities
    .filter((entity) => entity.floor === floor)
    .map(mansionLayoutV2EntityRect);
  const outlinePoints =
    layout.venuePresentation?.tierOutlines
      .find((outline) => outline.floor === floor)
      ?.points.map((point) => ({
        x: point.x * MANSION_LAYOUT_V2_COLUMNS,
        y: point.y * MANSION_LAYOUT_V2_ROWS,
      })) ?? [];
  const geometry = [
    ...rectangles.flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ]),
    ...outlinePoints,
  ];
  const minX = geometry.length
    ? Math.min(...geometry.map((point) => point.x))
    : 0;
  const minY = geometry.length
    ? Math.min(...geometry.map((point) => point.y))
    : 0;
  const maxX = geometry.length
    ? Math.max(...geometry.map((point) => point.x))
    : MANSION_LAYOUT_V2_COLUMNS;
  const maxY = geometry.length
    ? Math.max(...geometry.map((point) => point.y))
    : MANSION_LAYOUT_V2_ROWS;
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const { width: boardWidth, height: boardHeight, padding } =
    MANSION_MAP_BOARD_V1;
  const scale = Math.min(
    (boardWidth - padding * 2) / contentWidth,
    (boardHeight - padding * 2) / contentHeight,
  );
  const offsetX = (boardWidth - contentWidth * scale) / 2;
  const offsetY = (boardHeight - contentHeight * scale) / 2;
  return {
    x: (value) => offsetX + (value - minX) * scale,
    y: (value) =>
      ((offsetY + (value - minY) * scale) / boardHeight) * 100,
    width: (value) => (value * scale / boardWidth) * 100,
    height: (value) => (value * scale / boardHeight) * 100,
  };
}

function stableId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

/** Player-facing name for a non-room block. Side rooms are named, doored, and never
 * entered; corridors carry traversal. */
function blockLabel(entity: MansionLayoutEntityV2): string {
  if (entity.kind === "room") return entity.name;
  return entity.kind === "infill" ? entity.name?.trim() || "Side room" : "Corridor";
}

function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roomTemplate(templateId: string) {
  return DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === templateId) ??
    DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === "parlor")!;
}

function roomFloorRulePresentation(templateId: string, topFloor: number) {
  const rule = debateMysteryRoomFloorRuleV1(templateId);
  if (rule === "ground-floor-only") {
    return { label: "Floor 1 only", title: "Ground-floor only · use Floor 1" };
  }
  if (rule === "top-floor-only") {
    return { label: "Top floor only", title: `Top-floor only · use Floor ${topFloor}` };
  }
  return null;
}

function roomFloorRuleNotice(templateId: string, name: string, topFloor: number): string {
  return debateMysteryRoomFloorRuleV1(templateId) === "ground-floor-only"
    ? `${name} can only be used on Floor 1.`
    : `${name} can only be used on the current top floor, Floor ${topFloor}.`;
}

function roomAssetUrl(
  mansion: DebateMysteryMansionBundleSummaryV1,
  room: MansionLayoutRoomV2,
  mosaic: boolean,
): string | null {
  const style = mosaic ? "mosaic" : "illustrated";
  if (room.acceptedRoomAssetId) {
    if (mosaic) {
      return whodunnitMansionRoomArtUrl(mansion.id, room.acceptedRoomAssetId, style);
    }
    const sourcePlate = (mansion.assets ?? []).find(
      (asset) => asset.role === "room" && asset.logicalId === `${room.id}:illustrated-v1`,
    );
    return sourcePlate
      ? whodunnitMansionRoomArtUrl(mansion.id, sourcePlate.id, style)
      : whodunnitMansionRoomArtUrl(mansion.id, room.acceptedRoomAssetId, style);
  }
  return whodunnitBundledRoomArtPathForRoom(room, style);
}

function candidateAssetUrl(
  mansion: DebateMysteryMansionBundleSummaryV1,
  assetId: string,
): string {
  return whodunnitMansionRoomArtUrl(mansion.id, assetId, "mosaic");
}

function findPlacement(
  layout: MansionLayoutV2,
  entity: MansionLayoutEntityV2,
  floor: number,
): MansionLayoutEntityV2 | null {
  const rotations: readonly MansionLayoutRotationV2[] = entity.kind === "room"
    ? [entity.rotation, entity.rotation === 0 ? 90 : 0]
    : [0];
  for (const rotation of rotations) {
    for (let y = 0; y < MANSION_LAYOUT_V2_ROWS; y += 1) {
      for (let x = 0; x < MANSION_LAYOUT_V2_COLUMNS; x += 1) {
        const candidate: MansionLayoutEntityV2 = entity.kind === "room"
          ? { ...entity, floor, x, y, rotation }
          : { ...entity, floor, x, y };
        if (mansionLayoutV2PlacementIsLegal(layout, entity.id, candidate)) return candidate;
      }
    }
  }
  return null;
}

function firstRoomOnFloor(layout: MansionLayoutV2, floor: number): MansionLayoutRoomV2 | null {
  return layout.entities.find(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room" && entity.floor === floor,
  ) ?? null;
}

function shiftEntity(entity: MansionLayoutEntityV2, dx: number, dy: number): MansionLayoutEntityV2 {
  return { ...entity, x: entity.x + dx, y: entity.y + dy };
}

function rectInsideEnvelope(rect: { x: number; y: number; width: number; height: number }): boolean {
  return rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.width <= MANSION_LAYOUT_V2_COLUMNS && rect.y + rect.height <= MANSION_LAYOUT_V2_ROWS;
}

/** A copy that is its own block: fresh id, no suspect seat, no accepted art. */
function cloneEntity(source: MansionLayoutEntityV2, id: string, floor: number): MansionLayoutEntityV2 {
  if (source.kind === "room") {
    return {
      ...source, id, floor, suspectSlotId: null, imageId: null, bundledAssetPath: null,
      acceptedRoomAssetId: null, acceptedRoomArtAnchorSha256: null,
    };
  }
  return { ...source, id, floor };
}

/** Moves a group as one piece, as freely as a single block: the whole group shifts by the
 * same offset, held inside the plan, and anything it lands on is marked rather than
 * refused. Doors re-derive from the new adjacencies. */
function moveEntitiesTogether(
  layout: MansionLayoutV2,
  ids: readonly string[],
  dx: number,
  dy: number,
): MansionLayoutV2 {
  if (!dx && !dy) return layout;
  const group = new Set(ids);
  const members = layout.entities.filter((entity) => group.has(entity.id));
  if (!members.length) return layout;
  // One clamp for the group, so its blocks keep their spacing at the plan's edge.
  const rects = members.map(mansionLayoutV2EntityRect);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  const shiftX = Math.max(-minX, Math.min(MANSION_LAYOUT_V2_COLUMNS - maxX, dx));
  const shiftY = Math.max(-minY, Math.min(MANSION_LAYOUT_V2_ROWS - maxY, dy));
  if (!shiftX && !shiftY) return layout;
  let next: MansionLayoutV2 = reconcileMansionLayoutV2Doors({
    ...layout,
    entities: layout.entities.map((entity) => group.has(entity.id) ? shiftEntity(entity, shiftX, shiftY) : entity),
  });
  for (const id of ids) next = addAutoCenteredMansionLayoutV2Doors(next, id);
  return next;
}

/** Lays copies of a group on a floor at the nearest offset where all of them fit and the
 * group touches the plan, then gives each its doors. Null when nowhere fits. */
function placeGroupCopies(
  layout: MansionLayoutV2,
  sources: readonly MansionLayoutEntityV2[],
  floor: number,
  idFor: (source: MansionLayoutEntityV2) => string,
): MansionLayoutV2 | null {
  if (!sources.length) return null;
  const copies = sources.map((source) => cloneEntity(source, idFor(source), floor));
  const onFloor = layout.entities.filter((entity) => entity.floor === floor);
  const offsets: Array<[number, number]> = [];
  for (let dy = -MANSION_LAYOUT_V2_ROWS; dy <= MANSION_LAYOUT_V2_ROWS; dy += 1) {
    for (let dx = -MANSION_LAYOUT_V2_COLUMNS; dx <= MANSION_LAYOUT_V2_COLUMNS; dx += 1) offsets.push([dx, dy]);
  }
  // Nearest first; ties go right, then down, so a copy appears beside its source.
  offsets.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])) || (b[0] - a[0]) || (b[1] - a[1]));
  for (const [dx, dy] of offsets) {
    if (dx === 0 && dy === 0) continue;
    const shifted = copies.map((copy) => shiftEntity(copy, dx, dy));
    const fits = shifted.every((copy) => {
      const rect = mansionLayoutV2EntityRect(copy);
      return rectInsideEnvelope(rect) && !onFloor.some((other) => mansionLayoutV2RectsOverlap(rect, mansionLayoutV2EntityRect(other)));
    });
    if (!fits) continue;
    if (onFloor.length && !shifted.some((copy) => onFloor.some((other) => mansionLayoutV2SharedWall(copy, other)))) continue;
    let next: MansionLayoutV2 = { ...layout, entities: [...layout.entities, ...shifted] };
    for (const copy of shifted) next = addAutoCenteredMansionLayoutV2Doors(next, copy.id);
    return next;
  }
  return null;
}

function addEntityToLayout(
  layout: MansionLayoutV2,
  entity: MansionLayoutEntityV2,
  floor: number,
): MansionLayoutV2 | null {
  const floorHasTraversal = layout.entities.some(
    (candidate) => candidate.floor === floor && candidate.kind !== "infill",
  );
  const provisionalConnector = !floorHasTraversal && floor > 1
    ? (() => {
        const lower = firstRoomOnFloor(layout, floor - 1);
        return lower
          ? {
              id: stableId("stairs"),
              kind: "stairs" as const,
              lowerEntityId: lower.id,
              upperEntityId: entity.id,
            }
          : null;
      })()
    : null;
  const placementLayout = provisionalConnector
    ? { ...layout, verticalConnectors: [...layout.verticalConnectors, provisionalConnector] }
    : layout;
  const placed = findPlacement(placementLayout, entity, floor);
  if (!placed) return null;
  const next: MansionLayoutV2 = {
    ...placementLayout,
    entities: [...placementLayout.entities, placed],
  };
  return addAutoCenteredMansionLayoutV2Doors(next, placed.id);
}

function removeEntityFromLayout(layout: MansionLayoutV2, entityId: string): MansionLayoutV2 {
  return {
    ...layout,
    entities: layout.entities.filter((entity) => entity.id !== entityId),
    doors: layout.doors.filter(
      (door) => door.aEntityId !== entityId && door.bEntityId !== entityId,
    ),
    verticalConnectors: layout.verticalConnectors.filter(
      (connector) => connector.lowerEntityId !== entityId && connector.upperEntityId !== entityId,
    ),
    placementAnchors: layout.placementAnchors.filter((anchor) => anchor.roomId !== entityId),
    lights: layout.lights.filter((light) => light.roomId !== entityId),
    roomArtCandidates: layout.roomArtCandidates.filter((candidate) => candidate.roomId !== entityId),
  };
}

function visualSeed(id: string): number {
  let value = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    value ^= id.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) % 1_000;
}

function lightStyle(light: MansionDynamicLightV2): CSSProperties {
  const animationSeed = visualSeed(`${light.id}:${light.animationSeed}`);
  const cycleSeconds = light.kind === "fire" ? (light.animation === "flicker" ? 0.7 : 3.1)
    : light.kind === "omni" ? 4.2 : light.kind === "directional" ? 2.6 : 1.2;
  const base = {
    "--mansion-light-color": light.color,
    "--mansion-light-intensity": String(light.intensity),
    "--mansion-light-delay": `${-(animationSeed / 100)}s`,
    "--mansion-light-duration": `${cycleSeconds * (0.82 + animationSeed / 1_000 * 0.36)}s`,
  } as CSSProperties;
  if (light.kind === "fire") {
    const geometry = light.geometry;
    return {
      ...base,
      "--mansion-light-rotation": `${geometry.rotation}deg`,
      left: `${geometry.x * 100}%`,
      top: `${geometry.y * 100}%`,
      width: `${geometry.radius * 200}%`,
      aspectRatio: "1",
      transform: `translate(-50%, -50%) rotate(${geometry.rotation}deg)`,
    } as CSSProperties;
  }
  if (light.kind === "omni") {
    const geometry = light.geometry;
    return {
      ...base,
      left: `${geometry.x * 100}%`,
      top: `${geometry.y * 100}%`,
      width: `${geometry.radius * 200}%`,
      aspectRatio: "1",
      transform: "translate(-50%, -50%)",
    };
  }
  if (light.kind === "directional") {
    const geometry = light.geometry;
    if (mansionDirectionalGeometryIsPolygonV2(geometry)) return base;
    return {
      ...base,
      left: `${geometry.x * 100}%`,
      top: `${geometry.y * 100}%`,
      width: `${geometry.width * 100}%`,
      height: `${geometry.height * 100}%`,
      transform: `translate(-50%, -50%) rotate(${geometry.rotation}deg)`,
    };
  }
  return base;
}

function defaultLight(
  roomId: string,
  kind: MansionDynamicLightV2["kind"],
  point: { x: number; y: number } = { x: 0.5, y: 0.5 },
): MansionDynamicLightV2 {
  const common = {
    id: stableId("light"),
    roomId,
    color: kind === "neon" ? "#66e5ea" : "#ffb067",
    intensity: 0.72,
    animationSeed: stableId("seed"),
    cuePermission: { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
  };
  if (kind === "fire" || kind === "omni") {
    return kind === "fire"
      ? { ...common, kind, animation: "flicker", geometry: { ...point, radius: 0.18, rotation: 0 } }
      : { ...common, kind, geometry: { ...point, radius: 0.18 } };
  }
  if (kind === "directional") {
    // A window edge at the click with the ray falling toward the room's center.
    const top = { x: point.x, y: clampNormalized(point.y - 0.1) };
    const bottom = { x: point.x, y: clampNormalized(point.y + 0.06) };
    const ray = { x: point.x > 0.5 ? -0.26 : 0.26, y: 0.3 };
    return {
      ...common,
      kind,
      dust: true,
      geometry: {
        points: mansionGodrayParallelPointsV2([
          top, bottom, { x: bottom.x + ray.x, y: bottom.y + ray.y }, { x: top.x + ray.x, y: top.y + ray.y },
        ]),
      },
    };
  }
  return {
    ...common,
    kind,
    geometry: { points: [point, point], width: 0.025 },
  };
}

function lightResizeHandleStyle(light: MansionDynamicLightV2): CSSProperties {
  if (light.kind === "fire" || light.kind === "omni") {
    return {
      left: `${clampNormalized(light.geometry.x + light.geometry.radius) * 100}%`,
      top: `${clampNormalized(light.geometry.y + light.geometry.radius) * 100}%`,
    };
  }
  if (light.kind === "directional") {
    const geometry = light.geometry;
    if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
      const { landing } = mansionGodrayEdgesV2(geometry.points);
      return {
        left: `${((landing.start.x + landing.end.x) / 2) * 100}%`,
        top: `${((landing.start.y + landing.end.y) / 2) * 100}%`,
      };
    }
    return {
      left: `${clampNormalized(geometry.x + geometry.width / 2) * 100}%`,
      top: `${clampNormalized(geometry.y + geometry.height / 2) * 100}%`,
    };
  }
  const point = light.geometry.points.at(-1) ?? { x: 0.5, y: 0.5 };
  return { left: `${point.x * 100}%`, top: `${point.y * 100}%` };
}

function moveLight(
  light: MansionDynamicLightV2,
  delta: { x: number; y: number },
): MansionDynamicLightV2 {
  if (light.kind === "neon") {
    const minX = Math.min(...light.geometry.points.map((point) => point.x));
    const maxX = Math.max(...light.geometry.points.map((point) => point.x));
    const minY = Math.min(...light.geometry.points.map((point) => point.y));
    const maxY = Math.max(...light.geometry.points.map((point) => point.y));
    const dx = Math.min(1 - maxX, Math.max(-minX, delta.x));
    const dy = Math.min(1 - maxY, Math.max(-minY, delta.y));
    return {
      ...light,
      geometry: {
        ...light.geometry,
        points: light.geometry.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      },
    };
  }
  if (light.kind === "fire") return {
    ...light,
    geometry: {
      ...light.geometry,
      x: clampNormalized(light.geometry.x + delta.x),
      y: clampNormalized(light.geometry.y + delta.y),
    },
  };
  if (light.kind === "omni") return {
    ...light,
    geometry: {
      ...light.geometry,
      x: clampNormalized(light.geometry.x + delta.x),
      y: clampNormalized(light.geometry.y + delta.y),
    },
  };
  const geometry = light.geometry;
  if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
    const minX = Math.min(...geometry.points.map((point) => point.x));
    const maxX = Math.max(...geometry.points.map((point) => point.x));
    const minY = Math.min(...geometry.points.map((point) => point.y));
    const maxY = Math.max(...geometry.points.map((point) => point.y));
    const dx = Math.min(1 - maxX, Math.max(-minX, delta.x));
    const dy = Math.min(1 - maxY, Math.max(-minY, delta.y));
    return {
      ...light,
      geometry: { points: geometry.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) },
    };
  }
  return {
    ...light,
    geometry: {
      ...geometry,
      x: clampNormalized(geometry.x + delta.x),
      y: clampNormalized(geometry.y + delta.y),
    },
  };
}

function resizeLight(
  light: MansionDynamicLightV2,
  delta: { x: number; y: number },
): MansionDynamicLightV2 {
  if (light.kind === "fire") {
    const radius = Math.min(0.6, Math.max(0.035, light.geometry.radius + Math.max(delta.x, delta.y)));
    return { ...light, geometry: { ...light.geometry, radius } };
  }
  if (light.kind === "omni") {
    const radius = Math.min(0.6, Math.max(0.035, light.geometry.radius + Math.max(delta.x, delta.y)));
    return { ...light, geometry: { ...light.geometry, radius } };
  }
  if (light.kind === "directional") {
    const geometry = light.geometry;
    if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
      return {
        ...light,
        geometry: {
          points: geometry.points.map((point, index) => index < 2 ? point : {
            x: clampNormalized(point.x + delta.x),
            y: clampNormalized(point.y + delta.y),
          }),
        },
      };
    }
    return {
      ...light,
      geometry: {
        ...geometry,
        width: Math.min(1, Math.max(0.04, geometry.width + delta.x * 2)),
        height: Math.min(1, Math.max(0.04, geometry.height + delta.y * 2)),
      },
    };
  }
  return {
    ...light,
    geometry: {
      ...light.geometry,
      width: Math.min(0.25, Math.max(0.005, light.geometry.width + Math.max(delta.x, delta.y) * 0.15)),
    },
  };
}

function setLightPoint(
  light: MansionDynamicLightV2,
  axis: "x" | "y",
  value: number,
): MansionDynamicLightV2 {
  if (light.kind === "neon") return light;
  if (light.kind === "fire") return {
    ...light,
    geometry: { ...light.geometry, [axis]: value },
  };
  if (light.kind === "omni") return {
    ...light,
    geometry: { ...light.geometry, [axis]: value },
  };
  const geometry = light.geometry;
  if (mansionDirectionalGeometryIsPolygonV2(geometry)) return light;
  return {
    ...light,
    geometry: { ...geometry, [axis]: value },
  };
}

/** The single draggable anchor of a light, or null for point-set shapes. */
function lightAnchorPoint(light: MansionDynamicLightV2): { x: number; y: number } | null {
  if (light.kind === "neon") return null;
  if (light.kind === "directional") {
    const geometry = light.geometry;
    return mansionDirectionalGeometryIsPolygonV2(geometry) ? null : { x: geometry.x, y: geometry.y };
  }
  return { x: light.geometry.x, y: light.geometry.y };
}

export default function MansionEditorDialog({
  theme,
  mansion: initialMansion,
  busy,
  responseMode,
  creationFlow = false,
  onClose,
  onSave,
  onGenerateRoomArt,
  onAcceptRoomArt,
  onDiscardRoomArt,
  onRegenerateRoomArt,
  onDetectRoomLights,
  onDetectRoomAnchors,
  onNameRooms,
  onGenerateOverhead,
}: MansionEditorDialogProps): JSX.Element {
  const [mansion, setMansion] = useState(initialMansion);
  const [layout, setLayout] = useState(() => initialLayout(initialMansion));
  const [layoutHistory, setLayoutHistory] = useState<MansionLayoutV2[]>([]);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedEntityId, setSelectedEntityId] = useState(
    () => layout.entities.find((entity) => entity.floor === 1)?.id ?? layout.entities[0]?.id ?? "",
  );
  const [roomEditorId, setRoomEditorId] = useState<string | null>(null);
  const [mosaicPreview, setMosaicPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomArtBusy, setRoomArtBusy] = useState(false);
  const [creationPrepared, setCreationPrepared] = useState(false);
  const [regenerateConfirmationRoomId, setRegenerateConfirmationRoomId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomArtNotice, setRoomArtNotice] = useState<string | null>(null);
  const [overheadEditorOpen, setOverheadEditorOpen] = useState(false);
  const [overheadBusy, setOverheadBusy] = useState(false);
  const [roomToolBusy, setRoomToolBusy] = useState<"lights" | "anchors" | null>(null);
  const [drag, setDrag] = useState<EntityDragV2 | null>(null);
  /** Multi-selection; empty means only the primary selection above is selected. */
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<MarqueeV2 | null>(null);
  const [layoutFuture, setLayoutFuture] = useState<MansionLayoutV2[]>([]);
  const clipboard = useRef<MansionLayoutEntityV2[] | null>(null);
  const [corridorResize, setCorridorResize] = useState<CorridorResizeV2 | null>(null);
  const [roomTool, setRoomTool] = useState<RoomPlacementToolV2 | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [overlayGesture, setOverlayGesture] = useState<RoomOverlayGestureV2 | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const roomOverlayRef = useRef<HTMLDivElement | null>(null);
  const selectedEntity = layout.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedRoom = selectedEntity?.kind === "room" ? selectedEntity : null;
  const selectedBlock = selectedEntity && selectedEntity.kind !== "room" ? selectedEntity : null;
  const roomEditorRoom = layout.entities.find(
    (entity): entity is MansionLayoutRoomV2 => entity.kind === "room" && entity.id === roomEditorId,
  ) ?? null;
  const roomEditorLights = roomEditorRoom
    ? layout.lights.filter((light) => light.roomId === roomEditorRoom.id)
    : [];
  const selectedLight = roomEditorLights.find((light) => light.id === selectedLightId) ?? null;
  const persistedLayoutMatchesDraft = Boolean(
    mansion.layoutV2 && canonicalMansionLayoutV2(mansion.layoutV2) === canonicalMansionLayoutV2(layout),
  );
  const creationReady = creationPrepared && persistedLayoutMatchesDraft;
  const roomRefinementReady = !creationFlow || creationReady;
  const presentation = resolveInstalledMansionPresentationV1(mansion);
  const venueProfile = layout.venueProfile ?? null;
  // The venue's overhead plate, drawn by PRISM from the cover. When present it is
  // the board's backdrop; the sketched hull outline is only the fallback.
  const overheadAsset = (mansion.assets ?? []).find(
    (asset) => asset.role === "map" && asset.logicalId === "overhead",
  ) ?? null;
  const overheadUrl = overheadAsset
    ? `/api/debates/mystery-mansions/${encodeURIComponent(mansion.id)}/assets/${encodeURIComponent(overheadAsset.id)}/file`
    : null;
  const overheadPlacement = layout.overheadPlacement ?? MANSION_OVERHEAD_PLACEMENT_IDENTITY_V1;
  const cellWidthPercent = 100 / MANSION_LAYOUT_V2_COLUMNS;
  const cellHeightPercent = 100 / MANSION_LAYOUT_V2_ROWS;
  const overheadBoardTransform = useMemo(
    () => mansionOverheadBoardTransformV1(layout, selectedFloor),
    [layout, selectedFloor],
  );
  const venueArchitectureLocked = venueProfile !== null;
  /** The lock freezes the accepted topology: rooms and corridors. Side rooms are dressing,
   * so they stay placeable, resizable, doorable, and removable on a validated venue. */
  const entityLocked = (entity: MansionLayoutEntityV2 | null | undefined): boolean =>
    venueArchitectureLocked && entity?.kind !== "infill";
  const venueMapStyle = venueProfile?.presentation?.mapStyle ?? "estate-grid-v1";
  const semanticRoomCount = mansionLayoutV2SemanticRoomCount(layout);
  const tierLabel = (floor: number): string =>
    venueProfile?.tierLabels[floor - 1] ?? `Floor ${floor}`;
  const editorTierIds = venueProfile
    ? Array.from({ length: venueProfile.tierLabels.length }, (_, index) => index + 1)
    : [...FLOOR_IDS];
  const tierUnit = venueProfile?.kind === "vessel" ? "decks"
    : venueProfile ? "tiers" : "floors";
  const draftFloors = Math.max(1, ...layout.entities.map((entity) => entity.floor));
  const draftScaleClass = venueProfile?.physicalScaleClass ??
    resolveDebateMysteryMansionExteriorScaleClassV1({
      floors: draftFloors,
      totalRooms: semanticRoomCount,
    });
  const exterior = installedMansionExteriorPreviewV1({
    mansion,
    assetId: presentation.thumbnailAssetId,
    scaleClass: draftScaleClass,
  });
  const invalidEntityIds = useMemo(() => mansionLayoutV2InvalidEntityIdsV1(layout), [layout]);
  const validationErrors = useMemo(
    () => [
      ...validateMansionLayoutV2(layout, {
        suspectCount: mansion.suspectCount,
        requireEditorFloors: true,
      }),
      ...(mansionLayoutV2SemanticRoomsAreConnected(layout)
        ? []
        : ["A room has no route back to the rest of the plan. Move it against a corridor or another room."]),
    ],
    [layout, mansion.suspectCount],
  );
  const selectedRemovalErrors = selectedEntity
    ? validateMansionLayoutV2(removeEntityFromLayout(layout, selectedEntity.id), {
        suspectCount: mansion.suspectCount,
        requireEditorFloors: true,
      })
    : [];
  const selectedLocked = entityLocked(selectedEntity);
  const selectedRemovalBlockedReason = selectedLocked
    ? "The accepted venue architecture is fixed. Rename or dress rooms without changing its topology."
    : selectedRoom && (
      selectedRoom.id === layout.venueProfile?.entryRoomId ||
      (!layout.venueProfile && selectedRoom.templateId === "foyer")
    )
    ? "The venue entry is required structure."
    : selectedRemovalErrors[0] ?? null;
  const selectedEntityCanBeRemoved = Boolean(selectedEntity && !selectedRemovalBlockedReason);
  const thirdFloorAccessible = !venueProfile && mansionLayoutV2FloorSemanticRoomCount(layout, 2) >= 4;
  const rooftopFloor = mansionLayoutV2RooftopFloor(layout);
  const paletteTopFloor = Math.max(rooftopFloor, selectedFloor);
  const usedRoomTemplateIds = useMemo(
    () => new Set(layout.entities
      .filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room")
      .map((room) => room.templateId)),
    [layout.entities],
  );

  const pushLayoutHistory = (snapshot: MansionLayoutV2): void => {
    setLayoutFuture([]);
    setLayoutHistory((current) => {
      if (current.at(-1) && canonicalMansionLayoutV2(current.at(-1)!) === canonicalMansionLayoutV2(snapshot)) {
        return current;
      }
      return [...current, cloneLayout(snapshot)].slice(-50);
    });
  };

  const commitLayout = (next: MansionLayoutV2): void => {
    if (canonicalMansionLayoutV2(next) === canonicalMansionLayoutV2(layout)) return;
    pushLayoutHistory(layout);
    setLayout(next);
  };

  const openRoomEditor = (roomId: string): void => {
    if (!roomRefinementReady) {
      setNotice("Continue to validate the venue before entering individual rooms.");
      return;
    }
    setRoomArtNotice(null);
    setRegenerateConfirmationRoomId(null);
    setRoomEditorId(roomId);
  };

  const undoLayout = (): void => {
    const previous = layoutHistory.at(-1);
    if (!previous) return;
    setLayoutHistory((current) => current.slice(0, -1));
    setLayoutFuture((current) => [...current, cloneLayout(layout)].slice(-50));
    setLayout(cloneLayout(previous));
    setSelectedEntityIds((current) => current.filter((id) => previous.entities.some((entity) => entity.id === id)));
    const retainedSelection = previous.entities.find((entity) => entity.id === selectedEntityId);
    const fallback = previous.entities.find((entity) => entity.floor === selectedFloor) ?? previous.entities[0];
    setSelectedEntityId(retainedSelection?.id ?? fallback?.id ?? "");
    if (roomEditorId && !previous.entities.some((entity) => entity.id === roomEditorId && entity.kind === "room")) {
      setRoomEditorId(null);
    }
    setNotice("Undid the last venue layout change.");
  };

  const updateRoom = (roomId: string, update: Partial<MansionLayoutRoomV2>): void => {
    setLayout((current) => ({
      ...current,
      entities: current.entities.map((entity) => entity.id === roomId && entity.kind === "room"
        ? { ...entity, ...update }
        : entity),
    }));
  };

  const updateLight = (
    lightId: string,
    updater: (light: MansionDynamicLightV2) => MansionDynamicLightV2,
  ): void => {
    setLayout((current) => ({
      ...current,
      lights: current.lights.map((light) => light.id === lightId ? updater(light) : light),
    }));
  };

  const replaceLayoutFromMansion = (
    updated: DebateMysteryMansionBundleSummaryV1 | null,
  ): void => {
    if (!updated) return;
    setMansion(updated);
    if (updated.layoutV2) setLayout(cloneLayout(updated.layoutV2));
  };

  const mutateRoomArt = async (
    action: "generate" | "accept" | "discard" | "regenerate",
    roomId: string,
  ): Promise<void> => {
    const handler = action === "generate"
      ? onGenerateRoomArt
      : action === "accept"
        ? onAcceptRoomArt
        : action === "discard"
          ? onDiscardRoomArt
          : onRegenerateRoomArt;
    if (!handler || roomArtBusy) return;
    setRoomArtBusy(true);
    setNotice(null);
    setRoomArtNotice(null);
    try {
      const updated = await handler(mansion, roomId);
      replaceLayoutFromMansion(updated);
      if (updated && action === "regenerate") {
        setSelectedLightId(null);
        setRegenerateConfirmationRoomId(null);
        setRoomArtNotice("This room returned to its bundled Mosaic; its anchors and lights were cleared.");
      }
    } finally {
      setRoomArtBusy(false);
    }
  };

  const generateOverhead = async (): Promise<void> => {
    if (!onGenerateOverhead || overheadBusy) return;
    setOverheadBusy(true);
    setNotice(null);
    try {
      const updated = await onGenerateOverhead(mansion);
      if (updated) replaceLayoutFromMansion(updated);
    } finally {
      setOverheadBusy(false);
    }
  };
  const detectRoomTool = async (tool: "lights" | "anchors", roomId: string): Promise<void> => {
    if (roomToolBusy) return;
    setRoomToolBusy(tool);
    setRoomArtNotice(null);
    try {
      if (tool === "lights") {
        const detected = onDetectRoomLights ? await onDetectRoomLights(mansion, roomId) : null;
        if (!detected) return;
        setLayout((current) => ({
          ...current,
          lights: [...current.lights.filter((light) => light.roomId !== roomId), ...detected],
        }));
        setSelectedLightId(null);
        setRoomArtNotice(detected.length
          ? `PRISM read ${detected.length} light source${detected.length === 1 ? "" : "s"} from the accepted art. Save the venue plan to keep them.`
          : "PRISM found no lit sources in the accepted art; the room's lights were cleared. Save the venue plan to keep that.");
      } else {
        const detected = onDetectRoomAnchors ? await onDetectRoomAnchors(mansion, roomId) : null;
        if (!detected) return;
        setLayout((current) => ({
          ...current,
          placementAnchors: current.placementAnchors.map((anchor) =>
            detected.find((entry) => entry.id === anchor.id) ?? anchor),
        }));
        setRoomArtNotice("PRISM re-read where each named anchor sits in the accepted art. Save the venue plan to keep the new positions.");
      }
    } finally {
      setRoomToolBusy(null);
    }
  };

  const roomOverlayPoint = (event: ReactPointerEvent<Element>): { x: number; y: number } | null => {
    const overlay = roomOverlayRef.current;
    if (!overlay) return null;
    const bounds = overlay.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) return null;
    return {
      x: clampNormalized((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clampNormalized((event.clientY - bounds.top) / Math.max(1, bounds.height)),
    };
  };

  const beginRoomOverlay = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!roomEditorRoom || !roomTool || !event.isPrimary || event.button !== 0 || overlayGesture) return;
    const point = roomOverlayPoint(event);
    if (!point) return;
    event.preventDefault();
    if (roomTool === "anchor") {
      const roomAnchorCount = layout.placementAnchors.filter(
        (anchor) => anchor.roomId === roomEditorRoom.id,
      ).length;
      if (roomAnchorCount >= MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM) return;
      setLayout((current) => ({
        ...current,
        placementAnchors: [...current.placementAnchors, {
          id: stableId("anchor"),
          roomId: roomEditorRoom.id,
          name: "New anchor",
          relation: "near",
          point,
        }],
      }));
      setRoomTool(null);
      return;
    }
    if (roomEditorLights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS) return;
    const light = defaultLight(roomEditorRoom.id, roomTool, point);
    setLayout((current) => ({ ...current, lights: [...current.lights, light] }));
    setSelectedLightId(light.id);
    if (roomTool === "neon") {
      setOverlayGesture({ kind: "neon-draw", pointerId: event.pointerId, lightId: light.id });
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      setRoomTool(null);
    }
  };

  const beginLightGesture = (
    event: ReactPointerEvent<Element>,
    light: MansionDynamicLightV2,
    mode: "move" | "resize",
  ): void => {
    const point = roomOverlayPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    roomOverlayRef.current?.setPointerCapture(event.pointerId);
    setSelectedLightId(light.id);
    setRoomTool(null);
    setOverlayGesture({
      kind: "light",
      pointerId: event.pointerId,
      lightId: light.id,
      mode,
      start: point,
      original: JSON.parse(JSON.stringify(light)) as MansionDynamicLightV2,
    });
  };

  const continueRoomOverlay = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!overlayGesture || overlayGesture.pointerId !== event.pointerId) return;
    const point = roomOverlayPoint(event);
    if (!point) return;
    if (overlayGesture.kind === "neon-draw") {
      setLayout((current) => ({
        ...current,
        lights: current.lights.map((light) => {
          if (light.id !== overlayGesture.lightId || light.kind !== "neon" ||
            light.geometry.points.length >= MANSION_LAYOUT_V2_MAX_NEON_POINTS) return light;
          const previous = light.geometry.points.at(-1);
          if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.012) return light;
          return { ...light, geometry: { ...light.geometry, points: [...light.geometry.points, point] } };
        }),
      }));
      return;
    }
    const delta = { x: point.x - overlayGesture.start.x, y: point.y - overlayGesture.start.y };
    setLayout((current) => ({
      ...current,
      lights: current.lights.map((light) => light.id !== overlayGesture.lightId
        ? light
        : overlayGesture.mode === "move"
          ? moveLight(overlayGesture.original, delta)
          : resizeLight(overlayGesture.original, delta)),
    }));
  };

  const finishRoomOverlay = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!overlayGesture || overlayGesture.pointerId !== event.pointerId) return;
    if (overlayGesture.kind === "neon-draw") {
      setLayout((current) => ({
        ...current,
        lights: current.lights.map((light) => light.id === overlayGesture.lightId && light.kind === "neon" &&
          light.geometry.points.length === 1
          ? { ...light, geometry: { ...light.geometry, points: [...light.geometry.points, light.geometry.points[0]!] } }
          : light),
      }));
      setRoomTool(null);
    }
    setOverlayGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const addRoom = (requestedTemplateId?: string): void => {
    if (selectedFloor === 3 && !thirdFloorAccessible) {
      setNotice("Floor 2 needs at least four semantic rooms before Floor 3 opens.");
      return;
    }
    const availableDefaultTemplate = DEBATE_MYSTERY_ROOM_TEMPLATES.find((candidate) =>
      !usedRoomTemplateIds.has(candidate.id) &&
      debateMysteryRoomTypeIsAllowedOnFloorV1(candidate.id, selectedFloor, paletteTopFloor));
    const requestedTemplate = requestedTemplateId
      ? roomTemplate(requestedTemplateId)
      : availableDefaultTemplate;
    if (!requestedTemplate) {
      setNotice("No unused room type is available on this floor.");
      return;
    }
    const template = requestedTemplate;
    if (!layout.venueProfile && usedRoomTemplateIds.has(template.id)) {
      setNotice(`${template.name} is already placed in this legacy estate. Each room type can only be used once.`);
      return;
    }
    if (!debateMysteryRoomTypeIsAllowedOnFloorV1(template.id, selectedFloor, paletteTopFloor)) {
      setNotice(roomFloorRuleNotice(template.id, template.name, paletteTopFloor));
      return;
    }
    const lowerTopFloorRoom = layout.entities.find(
      (entity): entity is MansionLayoutRoomV2 => entity.kind === "room" &&
        debateMysteryRoomFloorRuleV1(entity.templateId) === "top-floor-only" &&
        entity.floor < selectedFloor,
    );
    if (lowerTopFloorRoom) {
      setNotice(`Change ${lowerTopFloorRoom.name} on Floor ${lowerTopFloorRoom.floor} before building above it.`);
      return;
    }
    const entity: MansionLayoutRoomV2 = {
      kind: "room",
      id: stableId("room"),
      templateId: template.id,
      name: template.name,
      floor: selectedFloor,
      x: 0,
      y: 0,
      rotation: 0,
      suspectSlotId: null,
      emoji: template.emoji,
      imageId: null,
      bundledAssetPath: template.bundledAssetPath ?? null,
      acceptedRoomAssetId: null,
      ...(layout.venueProfile
        ? { venueContract: { version: 1 as const, role: "other" as const, footprint: { width: 2, height: 2 } } }
        : {}),
    };
    const next = addEntityToLayout(layout, entity, selectedFloor);
    if (!next) {
      // A top-floor room that cannot fit among this level's rooms takes the empty level
      // above as the new top floor: a rooftop lounge wants the whole roof, not a corner.
      const above = selectedFloor + 1;
      const topFloorOnly = debateMysteryRoomFloorRuleV1(template.id) === "top-floor-only";
      const aboveIsOpen = above <= 3 &&
        !layout.entities.some((candidate) => candidate.kind === "room" && candidate.floor === above) &&
        (above !== 3 || Boolean(venueProfile) || thirdFloorAccessible);
      const lifted = topFloorOnly && aboveIsOpen ? addEntityToLayout(layout, { ...entity, floor: above }, above) : null;
      if (!lifted) {
        setNotice(topFloorOnly
          ? `${template.name} takes the whole top level. Clear ${tierLabel(above)} or make room on it first.`
          : "That floor has no legal connected space for this room footprint.");
        return;
      }
      commitLayout(lifted);
      setSelectedFloor(above);
      setSelectedEntityId(entity.id);
      setNotice(`${template.name} needs the whole roof, so it took ${tierLabel(above)} as the new top floor.`);
      return;
    }
    commitLayout(next);
    setSelectedEntityId(entity.id);
    setNotice(null);
  };

  const addCorridor = (): void => {
    const entity: MansionLayoutEntityV2 = {
      kind: "corridor",
      id: stableId("corridor"),
      floor: selectedFloor,
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    };
    const next = addEntityToLayout(layout, entity, selectedFloor);
    if (!next) {
      setNotice("No legal shared-edge position is available for a corridor.");
      return;
    }
    commitLayout(next);
    setSelectedEntityId(entity.id);
    setNotice(null);
  };

  const addAmbientSpace = (): void => {
    if (!layout.entities.some((candidate) => candidate.floor === selectedFloor)) {
      setNotice("Place a room or corridor first. Side rooms attach to the floor plan.");
      return;
    }
    const id = stableId("space");
    const entity: MansionLayoutEntityV2 = {
      kind: "infill",
      id,
      floor: selectedFloor,
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      name: mysterySideRoomSuggestedNameV1(layout, { width: 2, height: 2 }, id),
    };
    const placed = addEntityToLayout(layout, entity, selectedFloor);
    if (!placed) {
      setNotice("No legal shared-edge position is available for a side room.");
      return;
    }
    commitLayout(addAutoCenteredMansionLayoutV2Doors(placed, entity.id));
    setSelectedEntityId(entity.id);
    setNotice(null);
  };

  const [namingEntityIds, setNamingEntityIds] = useState<readonly string[]>([]);
  /** Asks the venue for names in its own vocabulary, falling back to the local catalog.
   * Returns the names actually applied, keyed by block id. */
  const nameBlocks = async (
    base: MansionLayoutV2,
    entityIds: readonly string[],
  ): Promise<Record<string, string>> => {
    const localNames = (): Record<string, string> => {
      let running = base;
      const names: Record<string, string> = {};
      for (const id of entityIds) {
        const entity = running.entities.find((candidate) => candidate.id === id);
        if (!entity || entity.kind === "corridor") continue;
        const footprint = entity.kind === "room"
          ? debateMysteryRoomFootprint(entity.templateId)
          : { width: entity.width, height: entity.height };
        const name = mysterySideRoomSuggestedNameV1(running, footprint, `${stableId("name")}:${id}`);
        names[id] = name;
        running = { ...running, entities: running.entities.map((candidate) => candidate.id === id ? { ...candidate, name } : candidate) };
      }
      return names;
    };
    if (!onNameRooms) return localNames();
    setNamingEntityIds(entityIds);
    try {
      const names = await onNameRooms(mansion, entityIds);
      return names && Object.keys(names).length ? names : localNames();
    } catch {
      return localNames();
    } finally {
      setNamingEntityIds([]);
    }
  };
  const applyNames = (base: MansionLayoutV2, names: Record<string, string>): MansionLayoutV2 => ({
    ...base,
    entities: base.entities.map((entity) => {
      const name = names[entity.id];
      return name && entity.kind !== "corridor" ? { ...entity, name } : entity;
    }),
  });

  /** Fills every open cell between this level's rooms and corridors with named side rooms. */
  const fillSideRooms = (): void => {
    const filled = fillMysteryVenueSideRoomsV1(layout, {
      seed: stableId("fill"),
      archetype: layout.venueProfile?.intent?.archetype ?? null,
      kind: layout.venueProfile?.kind ?? null,
    });
    // Side rooms that predate names get one too, so a legacy estate's infill reads as rooms.
    let next = filled;
    for (const entity of filled.entities) {
      if (entity.kind !== "infill" || entity.name?.trim()) continue;
      const name = mysterySideRoomSuggestedNameV1(next, entity, `${stableId("name")}:${entity.id}`);
      next = { ...next, entities: next.entities.map((candidate) => candidate.id === entity.id && candidate.kind !== "room" ? { ...candidate, name } : candidate) };
    }
    if (canonicalMansionLayoutV2(next) === canonicalMansionLayoutV2(layout)) {
      setNotice("No open cells between rooms and corridors are left to fill.");
      return;
    }
    for (const entity of next.entities) {
      if (entity.kind === "infill") next = addAutoCenteredMansionLayoutV2Doors(next, entity.id);
    }
    const before = new Set(layout.entities.map((entity) => entity.id));
    const addedIds = next.entities.filter((entity) => !before.has(entity.id)).map((entity) => entity.id);
    commitLayout(next);
    setNotice(null);
    if (!addedIds.length) return;
    const filledLayout = next;
    void (async () => {
      const names = await nameBlocks(filledLayout, addedIds);
      setLayout((current) => applyNames(current, names));
    })();
  };

  const updateBlock = (blockId: string, update: Partial<MansionLayoutBlockV2>): void => {
    setLayout((current) => ({
      ...current,
      entities: current.entities.map((entity) => entity.id === blockId && entity.kind !== "room"
        ? { ...entity, ...update }
        : entity),
    }));
  };

  /** Swaps a block between corridor and side room. Doors follow the kind: a side room
   * keeps only corridor doors, a corridor gains centered ones to everything it touches.
   * A swap that would strand a semantic room is refused rather than saved broken. */
  const convertBlockKind = (entityId: string, kind: "corridor" | "infill"): void => {
    const entity = layout.entities.find((candidate) => candidate.id === entityId);
    if (!entity || entity.kind === "room" || entity.kind === kind) return;
    let next: MansionLayoutV2 = {
      ...layout,
      entities: layout.entities.map((candidate): MansionLayoutEntityV2 =>
        candidate.id === entityId && candidate.kind !== "room" ? { ...candidate, kind } : candidate),
    };
    next = reconcileMansionLayoutV2Doors(next);
    next = addAutoCenteredMansionLayoutV2Doors(next, entityId);
    if (!mansionLayoutV2SemanticRoomsAreConnected(next)) {
      setNotice("That corridor is the only route to a room, so it stayed a corridor.");
      return;
    }
    commitLayout(next);
    setNotice(null);
  };

  const removeSelectedEntity = (): void => {
    if (!selectedEntity) return;
    if (!selectedEntityCanBeRemoved) {
      setNotice(selectedRemovalBlockedReason ?? "That block is required by the venue structure.");
      return;
    }
    const next = removeEntityFromLayout(layout, selectedEntity.id);
    if (mansionLayoutV2SemanticRoomsAreConnected(layout) &&
      !mansionLayoutV2SemanticRoomsAreConnected(next)) {
      setNotice("That block still carries circulation. Add another route before removing it.");
      return;
    }
    commitLayout(next);
    setSelectedEntityId(next.entities.find((entity) => entity.floor === selectedFloor)?.id ?? "");
    if (roomEditorId === selectedEntity.id) setRoomEditorId(null);
    setNotice(null);
  };

  const changeRoomTemplate = (room: MansionLayoutRoomV2, templateId: string): void => {
    const template = roomTemplate(templateId);
    const duplicateRoom = layout.entities.find((entity) =>
      entity.kind === "room" && entity.id !== room.id && entity.templateId === template.id);
    if (!layout.venueProfile && duplicateRoom) {
      setNotice(`${template.name} is already placed in this legacy estate. Each room type can only be used once.`);
      return;
    }
    if (!debateMysteryRoomTypeIsAllowedOnFloorV1(template.id, room.floor, rooftopFloor)) {
      setNotice(roomFloorRuleNotice(template.id, template.name, rooftopFloor));
      return;
    }
    const candidate: MansionLayoutRoomV2 = {
      ...room,
      templateId: template.id,
      name: template.name,
      emoji: template.emoji,
      imageId: null,
      bundledAssetPath: template.bundledAssetPath ?? null,
      acceptedRoomAssetId: null,
    };
    if (!mansionLayoutV2PlacementIsLegal(layout, room.id, candidate)) {
      setNotice("That fixed room silhouette does not fit here. Move the room or rotate it first.");
      return;
    }
    let next: MansionLayoutV2 = {
      ...layout,
      entities: layout.entities.map((entity) => entity.id === room.id ? candidate : entity),
      roomArtCandidates: layout.roomArtCandidates.filter((entry) => entry.roomId !== room.id),
    };
    next = addAutoCenteredMansionLayoutV2Doors(reconcileMansionLayoutV2Doors(next), room.id);
    if (mansionLayoutV2SemanticRoomsAreConnected(layout) &&
      !mansionLayoutV2SemanticRoomsAreConnected(next)) {
      setNotice("That silhouette would break the connected plan.");
      return;
    }
    commitLayout(next);
    setNotice(null);
  };

  const addDoorBetween = (entityId: string, otherId: string): void => {
    const entity = layout.entities.find((entry) => entry.id === entityId);
    const other = layout.entities.find((entry) => entry.id === otherId);
    const wall = entity && other ? mansionLayoutV2SharedWall(entity, other) : null;
    if (!entity || !other || !wall || !mansionLayoutV2DoorPairIsAllowed(entity, other)) return;
    if (layout.doors.some((door) =>
      (door.aEntityId === entityId && door.bEntityId === otherId) ||
      (door.aEntityId === otherId && door.bEntityId === entityId))) return;
    commitLayout({
      ...layout,
      doors: [...layout.doors, {
        id: stableId("door"),
        floor: entity.floor,
        aEntityId: entity.id,
        bEntityId: other.id,
        aWall: wall.aWall,
        position: 0.5,
      }],
    });
    setNotice(null);
  };

  const redoLayout = (): void => {
    const next = layoutFuture.at(-1);
    if (!next) return;
    setLayoutFuture((current) => current.slice(0, -1));
    setLayoutHistory((current) => [...current, cloneLayout(layout)].slice(-50));
    setLayout(cloneLayout(next));
    setSelectedEntityIds((current) => current.filter((id) => next.entities.some((entity) => entity.id === id)));
    setNotice("Redid the last venue layout change.");
  };

  /** Everything selected on this floor: the multi-selection, or just the primary block. */
  const selectionIds: string[] = selectedEntityIds.length > 0
    ? selectedEntityIds.filter((id) => layout.entities.some((entity) => entity.id === id && entity.floor === selectedFloor))
    : selectedEntityId && layout.entities.some((entity) => entity.id === selectedEntityId) ? [selectedEntityId] : [];
  const selectOnly = (id: string): void => { setSelectedEntityId(id); setSelectedEntityIds([]); };
  const selectMany = (ids: string[], primary?: string): void => {
    const unique = [...new Set(ids)];
    setSelectedEntityIds(unique.length > 1 ? unique : []);
    setSelectedEntityId(primary && unique.includes(primary) ? primary : unique[0] ?? "");
  };
  const toggleInSelection = (id: string): void => {
    const current = selectionIds.includes(id) ? selectionIds.filter((entry) => entry !== id) : [...selectionIds, id];
    selectMany(current, selectionIds.includes(id) ? undefined : id);
  };

  /** Copies the selection next to itself and hands the copies back selected; null when nothing fits. */
  const cloneSelection = (ids: readonly string[]): string[] | null => {
    const sources = layout.entities.filter((entity) => ids.includes(entity.id) && !entityLocked(entity));
    if (!sources.length) { setNotice("Those blocks are fixed by the accepted venue architecture."); return null; }
    if (!layout.venueProfile && sources.some((entity) => entity.kind === "room")) {
      setNotice("Each room type appears once in a legacy estate, so rooms cannot be cloned here. Corridors and side rooms can.");
      return null;
    }
    const idByPart = new Map(sources.map((source) => [source.id, stableId(source.kind === "room" ? "room" : source.kind === "infill" ? "space" : "corridor")]));
    const next = placeGroupCopies(layout, sources, selectedFloor, (source) => idByPart.get(source.id)!);
    if (!next) { setNotice("There is no open stretch of plan beside those blocks for a copy."); return null; }
    commitLayout(next);
    const cloneIds = [...idByPart.values()];
    selectMany(cloneIds, cloneIds[0]);
    setNotice(null);
    return cloneIds;
  };
  const copySelection = (): void => {
    const sources = layout.entities.filter((entity) => selectionIds.includes(entity.id));
    if (!sources.length) return;
    clipboard.current = sources.map((entity) => cloneLayoutEntity(entity));
    setNotice(sources.length === 1 ? `Copied ${blockLabel(sources[0]!)}.` : `Copied ${sources.length} blocks.`);
  };
  const pasteSelection = (): void => {
    const sources = clipboard.current;
    if (!sources?.length) { setNotice("Copy a block first, then paste."); return; }
    if (!layout.venueProfile && sources.some((entity) => entity.kind === "room")) {
      setNotice("Each room type appears once in a legacy estate, so rooms cannot be pasted here. Corridors and side rooms can.");
      return;
    }
    if (venueArchitectureLocked && sources.some((entity) => entity.kind !== "infill")) {
      setNotice("Only side rooms can be pasted into a validated venue.");
      return;
    }
    const idByPart = new Map(sources.map((source) => [source.id, stableId(source.kind === "room" ? "room" : source.kind === "infill" ? "space" : "corridor")]));
    let next: MansionLayoutV2 | null;
    if (layout.entities.some((entity) => entity.floor === selectedFloor)) {
      next = placeGroupCopies(layout, sources, selectedFloor, (source) => idByPart.get(source.id)!);
    } else {
      // An empty level takes the blocks one at a time so the first one brings its connector.
      next = layout;
      for (const source of sources) {
        next = next ? addEntityToLayout(next, cloneEntity(source, idByPart.get(source.id)!, selectedFloor), selectedFloor) : null;
      }
    }
    if (!next) { setNotice("There is no open stretch of plan on this level for the copy."); return; }
    commitLayout(next);
    const pastedIds = [...idByPart.values()];
    selectMany(pastedIds, pastedIds[0]);
    setNotice(null);
  };
  /** Removes every selected block at once; refuses when any is fixed or the plan would split. */
  const removeSelection = (): void => {
    const targets = layout.entities.filter((entity) => selectionIds.includes(entity.id));
    if (!targets.length) return;
    if (targets.length === 1 && targets[0]!.id === selectedEntityId) { removeSelectedEntity(); return; }
    const fixed = targets.find((entity) => entityLocked(entity) ||
      (entity.kind === "room" && (entity.id === layout.venueProfile?.entryRoomId || (!layout.venueProfile && entity.templateId === "foyer"))));
    if (fixed) { setNotice(`${blockLabel(fixed)} is required structure, so the selection stayed.`); return; }
    let next = layout;
    for (const target of targets) next = removeEntityFromLayout(next, target.id);
    if (mansionLayoutV2SemanticRoomsAreConnected(layout) && !mansionLayoutV2SemanticRoomsAreConnected(next)) {
      setNotice("Those blocks still carry circulation. Add another route before removing them.");
      return;
    }
    commitLayout(next);
    selectOnly(next.entities.find((entity) => entity.floor === selectedFloor)?.id ?? "");
    if (roomEditorId && targets.some((target) => target.id === roomEditorId)) setRoomEditorId(null);
    setNotice(null);
  };
  const cutSelection = (): void => { copySelection(); removeSelection(); };

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    entity: MansionLayoutEntityV2,
  ): void => {
    if (event.button !== 0) return;
    if (event.shiftKey) { toggleInSelection(entity.id); return; }
    if (entityLocked(entity)) {
      selectOnly(entity.id);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cellWidth = bounds.width / MANSION_LAYOUT_V2_COLUMNS;
    const cellHeight = bounds.height / MANSION_LAYOUT_V2_ROWS;
    const inGroup = selectionIds.includes(entity.id) && selectionIds.length > 1;
    let subject = entity;
    let ids = inGroup
      ? selectionIds.filter((id) => { const member = layout.entities.find((candidate) => candidate.id === id); return member && !entityLocked(member); })
      : [entity.id];
    if (event.altKey) {
      // Option-drag carries a copy; the original stays where it is.
      const cloneIds = cloneSelection(ids);
      if (!cloneIds) return;
      const index = Math.max(0, ids.indexOf(entity.id));
      const cloneId = cloneIds[index] ?? cloneIds[0]!;
      const placed = layout.entities.find((candidate) => candidate.id === cloneId);
      ids = cloneIds;
      if (placed) subject = placed;
      // The clone was placed by commitLayout; the fresh entities live in the next render, so
      // the drag starts from the copy's known geometry via the pending layout below.
    }
    if (!inGroup && !event.altKey) selectOnly(entity.id);
    setDrag({
      id: subject.id,
      ids,
      pointerId: event.pointerId,
      offsetX: (event.clientX - bounds.left) / cellWidth - subject.x,
      offsetY: (event.clientY - bounds.top) / cellHeight - subject.y,
      originX: subject.x,
      originY: subject.y,
      previewX: subject.x,
      previewY: subject.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cellWidth = bounds.width / MANSION_LAYOUT_V2_COLUMNS;
    const cellHeight = bounds.height / MANSION_LAYOUT_V2_ROWS;
    const previewX = Math.round((event.clientX - bounds.left) / cellWidth - drag.offsetX);
    const previewY = Math.round((event.clientY - bounds.top) / cellHeight - drag.offsetY);
    setDrag((current) => current ? { ...current, previewX, previewY } : current);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = drag.previewX - drag.originX;
    const dy = drag.previewY - drag.originY;
    if (drag.ids.length > 1) {
      commitLayout(moveEntitiesTogether(layout, drag.ids, dx, dy));
      setDrag(null);
      setNotice(null);
      return;
    }
    const currentEntity = layout.entities.find((entity) => entity.id === drag.id);
    if (!currentEntity) { setDrag(null); return; }
    // Free placement: the block lands where it was dropped, and anything wrong with it is
    // marked on the plan instead of being undone under the pointer.
    commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, drag.id, {
      ...currentEntity,
      x: drag.previewX,
      y: drag.previewY,
    }));
    setDrag(null);
    setNotice(null);
  };

  /** Dragging on empty plan draws a marquee; whatever it crosses becomes the selection. */
  const canvasCellPoint = (event: ReactPointerEvent<HTMLElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * MANSION_LAYOUT_V2_COLUMNS,
      y: ((event.clientY - bounds.top) / bounds.height) * MANSION_LAYOUT_V2_ROWS,
    };
  };
  const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || drag || corridorResize) return;
    if ((event.target as HTMLElement).closest("[data-entity-id], [role='separator'], button")) return;
    const point = canvasCellPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMarquee({ pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, additive: event.shiftKey });
  };
  const continueMarquee = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    const point = canvasCellPoint(event);
    if (point) setMarquee({ ...marquee, x: point.x, y: point.y });
  };
  const finishMarquee = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    setMarquee(null);
    const left = Math.min(marquee.startX, marquee.x);
    const right = Math.max(marquee.startX, marquee.x);
    const top = Math.min(marquee.startY, marquee.y);
    const bottom = Math.max(marquee.startY, marquee.y);
    if (right - left < 0.2 && bottom - top < 0.2) {
      // A plain click on empty plan collapses the selection to the primary block.
      if (!marquee.additive) setSelectedEntityIds([]);
      return;
    }
    const crossed = layout.entities.filter((entity) => {
      if (entity.floor !== selectedFloor) return false;
      const rect = mansionLayoutV2EntityRect(entity);
      return rect.x < right && rect.x + rect.width > left && rect.y < bottom && rect.y + rect.height > top;
    }).map((entity) => entity.id);
    selectMany(marquee.additive ? [...selectionIds, ...crossed] : crossed, crossed[0]);
  };

  useEffect(() => {
    // Editor shortcuts at the document level: the room, light, and overhead editors are modal
    // dialogs that stop their own key events, so these only fire for the venue plan.
    const onKey = (event: KeyboardEvent): void => {
      if (roomEditorId) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (key === "z") { event.preventDefault(); if (event.shiftKey) redoLayout(); else undoLayout(); }
        else if (key === "y") { event.preventDefault(); redoLayout(); }
        else if (key === "c") { event.preventDefault(); copySelection(); }
        else if (key === "x") { event.preventDefault(); cutSelection(); }
        else if (key === "v") { event.preventDefault(); pasteSelection(); }
        else if (key === "d") { event.preventDefault(); cloneSelection(selectionIds); }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removeSelection(); }
      else if (event.key === "Escape" && selectedEntityIds.length) { setSelectedEntityIds([]); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const beginCorridorResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    entity: MansionLayoutBlockV2,
    edge: CorridorResizeV2["edge"],
  ): void => {
    if (entityLocked(entity)) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedEntityId(entity.id);
    setCorridorResize({
      id: entity.id,
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      original: { ...entity },
      baseLayout: layout,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueCorridorResize = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (!corridorResize || event.pointerId !== corridorResize.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = Math.round((event.clientX - corridorResize.startX) /
      (bounds.width / MANSION_LAYOUT_V2_COLUMNS));
    const dy = Math.round((event.clientY - corridorResize.startY) /
      (bounds.height / MANSION_LAYOUT_V2_ROWS));
    const original = corridorResize.original;
    let candidate = { ...original };
    if (corridorResize.edge === "east") candidate.width = Math.max(1, original.width + dx);
    if (corridorResize.edge === "south") candidate.height = Math.max(1, original.height + dy);
    if (corridorResize.edge === "west") {
      const width = Math.max(1, original.width - dx);
      candidate = { ...candidate, x: original.x + original.width - width, width };
    }
    if (corridorResize.edge === "north") {
      const height = Math.max(1, original.height - dy);
      candidate = { ...candidate, y: original.y + original.height - height, height };
    }
    setLayout(placeMansionLayoutV2EntityFreelyV1(
      corridorResize.baseLayout,
      corridorResize.id,
      candidate,
    ));
  };

  const finishCorridorResize = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (corridorResize && canonicalMansionLayoutV2(layout) !==
      canonicalMansionLayoutV2(corridorResize.baseLayout)) {
      pushLayoutHistory(corridorResize.baseLayout);
    }
    setCorridorResize(null);
    setNotice(null);
  };

  const cancelCorridorResize = (): void => {
    if (corridorResize) setLayout(corridorResize.baseLayout);
    setCorridorResize(null);
  };

  const rotateEntity = (
    entity: MansionLayoutEntityV2,
    _direction: "counterclockwise" | "clockwise",
  ): void => {
    if (entity.kind === "room") {
      commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, entity.id, {
        ...entity,
        rotation: entity.rotation === 0 ? 90 : 0,
      }));
    } else {
      commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, entity.id, {
        ...entity,
        width: entity.height,
        height: entity.width,
      }));
    }
    setNotice(null);
  };

  const save = async (): Promise<void> => {
    if (validationErrors.length > 0) return;
    const loaderStartedAt = Date.now();
    setSaving(true);
    try {
      const saved = await onSave(mansion, layout);
      if (!saved) {
        setNotice("The venue plan was not saved. The studio behind this editor shows the reason.");
        return;
      }
      replaceLayoutFromMansion(saved);
      if (creationFlow) {
        const remainingLoaderTime = CREATION_VALIDATION_MINIMUM_LOADER_MS - (Date.now() - loaderStartedAt);
        if (remainingLoaderTime > 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, remainingLoaderTime));
        }
        setCreationPrepared(true);
        setLayoutHistory([]);
        setRoomEditorId(null);
        setNotice("Venue plan is ready. Review the map, then use this venue. Room art remains optional.");
      } else {
        onClose();
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The venue plan could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const planner = (
    <section
      className={styles.mansionTopologyEditor}
      data-tutorial-target="whodunnit-mansion-editor"
      data-layout-version="2"
    >
      <aside className={styles.mansionEditorExterior}>
        <div style={{ backgroundImage: `url("${exterior.url}")` }} role="img" aria-label={`${presentation.title} exterior`} />
        <span data-scale={draftScaleClass}>{draftScaleClass} silhouette</span>
        {exterior.stale ? (
          <p><strong>Exterior needs review</strong>The retained custom cover was accepted for a different venue scale. It will not be overwritten.</p>
        ) : (
          <p><strong>{exterior.switchesWithTopology ? "Included family" : "Accepted exterior"}</strong>{exterior.switchesWithTopology ? "The cover follows semantic room count and venue scale automatically." : "This protected cover stays with the derivative."}</p>
        )}
        <p><strong>Planner contract</strong>{venueArchitectureLocked
          ? `${venueProfile?.kindLabel ?? "Venue"} architecture is frozen to the accepted intent. Rename and dress rooms without replacing its topology.`
          : "Rooms keep fixed silhouettes. Corridors shape the estate and carry traversal without counting as rooms. Ambient spaces dress the map like rooms but stay inaccessible."}</p>
      </aside>

      <div className={styles.mansionEditorWorkspace}>
        <header className={styles.mansionEditorFloorBar}>
          <nav aria-label="Venue tiers">
            {editorTierIds.map((floor) => (
              <button
                key={floor}
                type="button"
                aria-pressed={selectedFloor === floor}
                disabled={!venueProfile && floor === 3 && !thirdFloorAccessible}
                title={!venueProfile && floor === 3 && !thirdFloorAccessible ? "Floor 2 needs at least four rooms" : undefined}
                onClick={() => setSelectedFloor(floor)}
              >
                {tierLabel(floor)}<small>{!venueProfile && floor === 3 && !thirdFloorAccessible
                  ? "Needs 4 rooms below"
                  : `${mansionLayoutV2FloorSemanticRoomCount(layout, floor)} rooms`}</small>
              </button>
            ))}
          </nav>
          {venueArchitectureLocked
            ? <div>
                <span className={styles.mansionEditorArchitectureLock}>Validated architecture · names, presentation, and side rooms remain editable</span>
                <button type="button" onClick={addAmbientSpace} title="A named, doored space no case enters">+ Side room</button>
                <button type="button" onClick={fillSideRooms} title="Fill the open cells between rooms and corridors with named side rooms">Fill side rooms</button>
              </div>
            : <div>
                <button type="button" onClick={() => addRoom()}>+ Room</button>
                <button type="button" onClick={addCorridor}>+ Corridor</button>
                <button type="button" onClick={addAmbientSpace} title="A named, doored space no case enters">+ Side room</button>
                <button type="button" onClick={fillSideRooms} title="Fill the open cells between rooms and corridors with named side rooms">Fill side rooms</button>
              </div>}
          <div className={styles.mansionEditorOverheadTools} data-tutorial-target="whodunnit-venue-overhead">
            <button
              type="button"
              disabled={busy || overheadBusy || responseMode === "local" || !onGenerateOverhead || !persistedLayoutMatchesDraft}
              title={responseMode === "local"
                ? "Drawing the overhead needs ONLINE. Placement works in LOCAL."
                : !persistedLayoutMatchesDraft
                  ? "Save the venue plan first; the overhead is drawn from the saved structure."
                  : overheadUrl
                    ? "Redraw from the current Library cover, title, description, and venue style. If the setting does not match, this plate stays."
                    : "Draw this venue from directly above using its current Library cover, title, description, and venue style."}
              onClick={() => void generateOverhead()}
            >{overheadBusy ? "Drawing overhead…" : overheadUrl ? "Redraw overhead" : "Draw overhead"}</button>
            <button
              type="button"
              disabled={busy || !overheadUrl}
              title={overheadUrl ? "Pan, rotate, and zoom the overhead plate under the rooms." : "Draw the overhead first."}
              onClick={() => setOverheadEditorOpen(true)}
            >Place overhead</button>
          </div>
        </header>

        <div className={styles.mansionEditorCanvasShell}>
          <div
            ref={canvasRef}
            className={styles.mansionEditorCanvas}
            aria-label={`${tierLabel(selectedFloor)} 16 by 12 plan`}
            data-map-style={venueMapStyle}
            data-architecture-locked={venueArchitectureLocked ? "true" : undefined}
            data-has-overhead={overheadUrl ? "true" : undefined}
            data-marquee={marquee ? "true" : undefined}
            onPointerDown={beginMarquee}
            onPointerMove={continueMarquee}
            onPointerUp={finishMarquee}
            onPointerCancel={() => setMarquee(null)}
          >
            {marquee ? (
              <div
                className={styles.mansionEditorMarquee}
                aria-hidden="true"
                style={{
                  left: `${(Math.min(marquee.startX, marquee.x) / MANSION_LAYOUT_V2_COLUMNS) * 100}%`,
                  top: `${(Math.min(marquee.startY, marquee.y) / MANSION_LAYOUT_V2_ROWS) * 100}%`,
                  width: `${(Math.abs(marquee.x - marquee.startX) / MANSION_LAYOUT_V2_COLUMNS) * 100}%`,
                  height: `${(Math.abs(marquee.y - marquee.startY) / MANSION_LAYOUT_V2_ROWS) * 100}%`,
                }}
              />
            ) : null}
            {overheadUrl ? (
              <div className={styles.mansionEditorOverhead} aria-hidden="true">
                <div
                  className={styles.mansionEditorOverheadPlacement}
                  style={{
                    transform: `translate(${overheadPlacement.x * cellWidthPercent}%, ${overheadPlacement.y * cellHeightPercent}%) rotate(${overheadPlacement.rotation}deg) scale(${overheadPlacement.scale})`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={overheadAsset?.id}
                    src={overheadUrl}
                    alt=""
                    draggable={false}
                    style={{
                      left: `${MANSION_OVERHEAD_FRAME_V1.left * cellWidthPercent}%`,
                      top: `${MANSION_OVERHEAD_FRAME_V1.top * cellHeightPercent}%`,
                      width: `${MANSION_OVERHEAD_FRAME_V1.columns * cellWidthPercent}%`,
                      height: `${MANSION_OVERHEAD_FRAME_V1.rows * cellHeightPercent}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            {venueMapStyle === "hull-deck-v1" && !overheadUrl ? (
              <svg className={styles.mansionEditorHullOutline} viewBox="0 0 160 120" preserveAspectRatio="none" aria-hidden="true">
                <path d="M7 18 L126 10 Q146 18 156 60 Q146 102 126 110 L7 102 Q2 82 2 60 Q2 38 7 18 Z" />
                <path d="M18 60 H139" />
              </svg>
            ) : null}
            {layout.entities.filter((entity) => entity.floor === selectedFloor).map((entity) => {
              const rect = mansionLayoutV2EntityRect(entity);
              const preview = drag && drag.ids.includes(entity.id)
                ? { ...rect, x: rect.x + (drag.previewX - drag.originX), y: rect.y + (drag.previewY - drag.originY) }
                : rect;
              const roomArt = entity.kind === "room" && roomRefinementReady
                ? roomAssetUrl(mansion, entity, true)
                : null;
              return (
                <button
                  key={entity.id}
                  type="button"
                  className={entity.kind === "room"
                    ? styles.mansionEditorRoomBlock
                    : entity.kind === "infill"
                      ? styles.mansionEditorAmbientBlock
                      : styles.mansionEditorCorridorBlock}
                  data-entity-id={entity.id}
                  data-entity-kind={entity.kind}
                  data-selected={selectionIds.includes(entity.id) ? "true" : undefined}
                  data-invalid={invalidEntityIds.has(entity.id) ? "true" : undefined}
                  style={{
                    gridColumn: `${preview.x + 1} / span ${preview.width}`,
                    gridRow: `${preview.y + 1} / span ${preview.height}`,
                    ...(roomArt ? { backgroundImage: `linear-gradient(rgb(4 8 15 / 28%), rgb(4 8 15 / 62%)), url("${roomArt}")` } : {}),
                  } as CSSProperties}
                  onDoubleClick={() => entity.kind === "room" && openRoomEditor(entity.id)}
                  onClick={(event) => { if (!event.shiftKey && !event.altKey) selectOnly(entity.id); }}
                  onPointerDown={(event) => beginDrag(event, entity)}
                  onPointerMove={continueDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  <span aria-hidden="true">{entity.kind === "room" ? entity.emoji : entity.kind === "infill" ? "▢" : "⇄"}</span>
                  <strong>{blockLabel(entity)}</strong>
                  <small>{entity.kind === "room" ? `${rect.width}×${rect.height} · ${entity.rotation}°` : `${rect.width}×${rect.height}`}</small>
                  {entity.kind !== "room" && !entityLocked(entity) ? (["north", "east", "south", "west"] as const).map((edge) => (
                    <span
                      key={edge}
                      className={styles.mansionEditorCorridorResizeHandle}
                      data-edge={edge}
                      aria-label={`Resize ${blockLabel(entity).toLowerCase()} from ${edge} edge`}
                      role="separator"
                      onPointerDown={(event) => beginCorridorResize(
                        event,
                        entity as MansionLayoutBlockV2,
                        edge,
                      )}
                      onPointerMove={continueCorridorResize}
                      onPointerUp={finishCorridorResize}
                      onPointerCancel={cancelCorridorResize}
                    />
                  )) : null}
                </button>
              );
            })}
            {layout.doors.filter((door) => door.floor === selectedFloor).map((door) => {
              const point = mansionLayoutV2DoorPoint(layout, door);
              const a = layout.entities.find((entity) => entity.id === door.aEntityId);
              const b = layout.entities.find((entity) => entity.id === door.bEntityId);
              const wall = a && b ? mansionLayoutV2SharedWall(a, b) : null;
              if (!point || !wall) return null;
              return (
                <span
                  key={door.id}
                  className={styles.mansionEditorDoor}
                  data-orientation={wall.orientation}
                  style={{
                    left: `${point.x / MANSION_LAYOUT_V2_COLUMNS * 100}%`,
                    top: `${point.y / MANSION_LAYOUT_V2_ROWS * 100}%`,
                  }}
                  title="Wall door"
                />
              );
            })}
          </div>
          <div className={styles.mansionEditorCanvasActions}>
            <span>{venueArchitectureLocked
              ? "The validated architecture stays fixed. Select a room to rename it or prepare its presentation."
              : roomRefinementReady
              ? "Drag to arrange; blocks go exactly where you drop them, and anything overlapping, floating, or cut off turns red until you move it. Drag on empty plan to select several, Shift+click to add, and move them together. Option+drag clones. ⌘C, ⌘X, ⌘V copy, cut, paste; ⌘Z and ⇧⌘Z undo and redo; Delete removes. Double-click a room to enter it."
              : "Arrange structural placeholders, then Continue to prepare Mosaic rooms before entering them."}</span>
            <button type="button" disabled={!selectedRoom || !roomRefinementReady} onClick={() => selectedRoom && openRoomEditor(selectedRoom.id)}>Open Room Editor</button>
          </div>
        </div>
      </div>

      <aside className={styles.mansionEditorInspector}>
        <section className={styles.mansionEditorRoomPalette} aria-label={venueArchitectureLocked ? "Venue room program" : "Semantic room palette"}>
          <header><strong>{venueArchitectureLocked ? "Venue room program" : "Room blocks"}</strong><small>{venueArchitectureLocked ? tierLabel(selectedFloor) : `Add to Floor ${selectedFloor}`}</small></header>
          <div>
            {venueArchitectureLocked ? layout.entities
              .filter((entity): entity is MansionLayoutRoomV2 => entity.kind === "room" && entity.floor === selectedFloor)
              .map((room) => (
                <button key={room.id} type="button" aria-pressed={room.id === selectedEntityId} onClick={() => setSelectedEntityId(room.id)}>
                  <span aria-hidden="true">{room.emoji}</span>
                  <strong>{room.name}</strong>
                  <small>{room.venueContract?.role ?? "room"}</small>
                </button>
              )) : DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => {
              const floorRule = roomFloorRulePresentation(template.id, paletteTopFloor);
              const alreadyPlaced = usedRoomTemplateIds.has(template.id);
              const floorUnavailable = !debateMysteryRoomTypeIsAllowedOnFloorV1(
                template.id,
                selectedFloor,
                paletteTopFloor,
              );
              const disabled = alreadyPlaced || floorUnavailable;
              return (
                <button
                  key={template.id}
                  type="button"
                  disabled={disabled}
                  title={alreadyPlaced
                    ? `${template.name} is already placed in this legacy estate`
                    : floorUnavailable
                      ? floorRule?.title
                      : `Add ${template.name}`}
                  onClick={() => addRoom(template.id)}
                >
                  <span aria-hidden="true">{template.emoji}</span>
                  <strong>{template.name}</strong>
                  {alreadyPlaced
                    ? <small>Placed</small>
                    : floorRule
                      ? <small>{floorRule.label}</small>
                      : null}
                </button>
              );
            })}
          </div>
        </section>
        {selectedEntity ? (
          <>
            <header>
              <span aria-hidden="true">{selectedRoom?.emoji ?? (selectedEntity.kind === "infill" ? "▢" : "⇄")}</span>
              <div>
                <small>{selectedRoom ? "Selected room" : selectedEntity.kind === "infill" ? "Selected side room" : "Selected corridor"}</small>
                <strong>{selectedRoom?.name ?? `${blockLabel(selectedEntity)} · ${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0}`}</strong>
              </div>
            </header>
            <div className={styles.mansionEditorTransformActions}>
              <button
                type="button"
                disabled={venueArchitectureLocked}
                aria-label={`Rotate ${blockLabel(selectedEntity).toLowerCase()} counterclockwise`}
                title="Rotate counterclockwise"
                onClick={() => rotateEntity(selectedEntity, "counterclockwise")}
              >↶</button>
              <span>{selectedRoom ? `${selectedRoom.rotation}°` : `${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0}`}</span>
              <button
                type="button"
                disabled={venueArchitectureLocked}
                aria-label={`Rotate ${blockLabel(selectedEntity).toLowerCase()} clockwise`}
                title="Rotate clockwise"
                onClick={() => rotateEntity(selectedEntity, "clockwise")}
              >↷</button>
              <button type="button" disabled={layoutHistory.length === 0} onClick={undoLayout}>Undo</button>
            </div>
            {selectedRoom ? (
              <>
                {venueArchitectureLocked ? (
                  <label>Venue role<input readOnly value={selectedRoom.venueContract?.role ?? "room"} /></label>
                ) : <label>Room type
                  <select value={selectedRoom.templateId} onChange={(event) => changeRoomTemplate(selectedRoom, event.currentTarget.value)}>
                    {!DEBATE_MYSTERY_ROOM_TEMPLATES.some((template) => template.id === selectedRoom.templateId)
                      ? <option value={selectedRoom.templateId}>{selectedRoom.name} · imported type</option>
                      : null}
                    {DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => {
                      const floorRule = roomFloorRulePresentation(template.id, rooftopFloor);
                      const alreadyPlaced = template.id !== selectedRoom.templateId &&
                        usedRoomTemplateIds.has(template.id);
                      const floorUnavailable = !debateMysteryRoomTypeIsAllowedOnFloorV1(
                        template.id,
                        selectedRoom.floor,
                        rooftopFloor,
                      );
                      return <option key={template.id} value={template.id} disabled={alreadyPlaced || floorUnavailable}>{template.name}{alreadyPlaced ? " · already placed" : floorRule ? ` · ${floorRule.label}` : ""}</option>;
                    })}
                  </select>
                </label>}
                <div className={styles.mansionEditorSideRoomName}>
                  <label>Room name<input value={selectedRoom.name} maxLength={80} onChange={(event) => updateRoom(selectedRoom.id, { name: event.currentTarget.value })} /></label>
                  <button
                    type="button"
                    disabled={namingEntityIds.includes(selectedRoom.id)}
                    title="Reroll: rename this room in the venue's own vocabulary, keeping what it is"
                    onClick={() => void (async () => {
                      const names = await nameBlocks(layout, [selectedRoom.id]);
                      const name = names[selectedRoom.id];
                      if (name) { pushLayoutHistory(layout); updateRoom(selectedRoom.id, { name }); }
                    })()}
                  >{namingEntityIds.includes(selectedRoom.id) ? "Rerolling…" : "Reroll"}</button>
                </div>
                <button type="button" disabled={!roomRefinementReady} title={roomRefinementReady ? undefined : "Prepare Mosaic before refining rooms"} onClick={() => openRoomEditor(selectedRoom.id)}>Room art, anchors & lights</button>
              </>
            ) : null}

            {selectedBlock?.kind === "infill" ? (
              <div className={styles.mansionEditorSideRoomName}>
                <label>Side room name<input value={selectedBlock.name ?? ""} maxLength={80} placeholder="Linen Store" onChange={(event) => updateBlock(selectedBlock.id, { name: event.currentTarget.value })} /></label>
                <button
                  type="button"
                  disabled={namingEntityIds.includes(selectedBlock.id)}
                  title="Reroll: another space this setting would have, sized to this block and not already on the map"
                  onClick={() => void (async () => {
                    const names = await nameBlocks(layout, [selectedBlock.id]);
                    commitLayout(applyNames(layout, names));
                  })()}
                >{namingEntityIds.includes(selectedBlock.id) ? "Rerolling…" : "Reroll"}</button>
              </div>
            ) : null}
            <fieldset className={styles.mansionEditorGeometry}>
              <legend>{selectedRoom ? "Fixed silhouette" : "Block geometry"}</legend>
              <div><span>Horizontal</span><button type="button" disabled={selectedLocked} onClick={() => commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, selectedEntity.id, { ...selectedEntity, x: selectedEntity.x - 1 }))}>←</button><output>{selectedEntity.x + 1}</output><button type="button" disabled={selectedLocked} onClick={() => commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, selectedEntity.id, { ...selectedEntity, x: selectedEntity.x + 1 }))}>→</button></div>
              <div><span>Vertical</span><button type="button" disabled={selectedLocked} onClick={() => commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, selectedEntity.id, { ...selectedEntity, y: selectedEntity.y - 1 }))}>↑</button><output>{selectedEntity.y + 1}</output><button type="button" disabled={selectedLocked} onClick={() => commitLayout(placeMansionLayoutV2EntityFreelyV1(layout, selectedEntity.id, { ...selectedEntity, y: selectedEntity.y + 1 }))}>↓</button></div>
              <p>{selectedLocked
                ? "Position frozen by the accepted venue architecture"
                : selectedRoom
                  ? "Fixed room silhouette"
                  : selectedEntity.kind === "infill"
                    ? `${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0} side room · drag an edge to resize`
                    : `${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0} corridor · drag an edge to resize`}</p>
            </fieldset>

            {selectedBlock && !venueArchitectureLocked ? (
              <fieldset className={styles.mansionEditorBlockRole}>
                <legend>Block role</legend>
                <div className={styles.mansionEditorBlockRoleOptions}>
                  <button type="button" aria-pressed={selectedBlock.kind === "corridor"} onClick={() => convertBlockKind(selectedBlock.id, "corridor")}>
                    <span aria-hidden="true">⇄</span><strong>Corridor</strong><small>Carries traversal between rooms</small>
                  </button>
                  <button type="button" aria-pressed={selectedBlock.kind === "infill"} onClick={() => convertBlockKind(selectedBlock.id, "infill")}>
                    <span aria-hidden="true">▢</span><strong>Side room</strong><small>Named and doored, never entered</small>
                  </button>
                </div>
              </fieldset>
            ) : null}

            <fieldset className={styles.mansionEditorConnections}>
              <legend>{selectedEntity.kind === "infill" ? "Doors" : "Geometry-derived doors"}</legend>
              <div className={styles.mansionEditorConnectionsList}>
              {layout.doors.filter((door) => door.aEntityId === selectedEntity.id || door.bEntityId === selectedEntity.id).map((door) => {
                const otherId = door.aEntityId === selectedEntity.id ? door.bEntityId : door.aEntityId;
                const other = layout.entities.find((entity) => entity.id === otherId);
                return (
                  <div key={door.id} className={styles.mansionEditorDoorControl}>
                    <span><strong>{other ? blockLabel(other) : "Route"}</strong><small>Shared-wall door</small></span>
                    <input disabled={selectedLocked} aria-label={`Door position toward ${otherId}`} type="range" min="0" max="1" step="0.01" value={door.position} onChange={(event) => commitLayout(slideMansionLayoutV2Door(layout, door.id, Number(event.currentTarget.value)))} />
                    <button type="button" disabled={selectedLocked} onClick={() => commitLayout(removeMansionLayoutV2Door(layout, door.id))}>Remove</button>
                  </div>
                );
              })}
              {layout.doors.every((door) => door.aEntityId !== selectedEntity.id && door.bEntityId !== selectedEntity.id)
                ? <p>{selectedEntity.kind === "infill"
                    ? "No wall doors. A side room shows a door onto any room or corridor it backs onto; the door is cosmetic and never carries a route."
                    : "No wall doors. Save will reject an inaccessible semantic room."}</p>
                : null}
              {!selectedLocked ? layout.entities.filter((other) => {
                if (!mansionLayoutV2DoorPairIsAllowed(selectedEntity, other)) return false;
                if (!mansionLayoutV2SharedWall(selectedEntity, other)) return false;
                return !layout.doors.some((door) =>
                  (door.aEntityId === selectedEntity.id && door.bEntityId === other.id) ||
                  (door.aEntityId === other.id && door.bEntityId === selectedEntity.id));
              }).map((other) => (
                <button key={other.id} type="button" onClick={() => addDoorBetween(selectedEntity.id, other.id)}>
                  Add centered door to {other.kind === "corridor" ? "corridor" : blockLabel(other)}
                </button>
              )) : null}
              </div>
            </fieldset>

            {layout.verticalConnectors.filter((connector) => connector.lowerEntityId === selectedEntity.id || connector.upperEntityId === selectedEntity.id).map((connector) => (
              <div key={connector.id} className={styles.mansionEditorVerticalConnector}>
                <span aria-hidden="true">↕</span><span><strong>{connector.kind}</strong><small>Vertical connector preserved</small></span>
              </div>
            ))}
            <button type="button" className={styles.mansionEditorRemoveRoom} disabled={!selectedEntityCanBeRemoved} title={selectedRemovalBlockedReason ?? "Remove selected block"} onClick={removeSelectedEntity}>Remove {selectedRoom ? "room" : blockLabel(selectedEntity).toLowerCase()}</button>
          </>
        ) : <p>Select a room, corridor, or ambient space from the plan.</p>}
      </aside>

      <footer className={styles.mansionEditorFooter}>
        <div>
          <strong>{semanticRoomCount} semantic rooms · {draftFloors} {tierUnit} · {draftScaleClass}</strong>
          {notice ? <span role="status">{notice}</span> : validationErrors.length > 0 ? <span role="alert">{validationErrors[0]}{validationErrors.length > 1 ? ` · ${validationErrors.length - 1} more` : ""}</span> : <span data-valid="true">Plan is connected and ready to save.</span>}
        </div>
        <button type="button" disabled={busy || saving} onClick={onClose}>{creationFlow ? "Return to setup" : "Close"}</button>
        {creationReady ? (
          <button type="button" className={styles.installedMansionSave} disabled={busy || saving} onClick={onClose}>Use this venue</button>
        ) : (
          <button type="button" className={styles.installedMansionSave} disabled={busy || saving || validationErrors.length > 0} onClick={() => void save()}>{saving ? "Validating venue…" : creationFlow ? "Continue" : "Save venue plan"}</button>
        )}
      </footer>
    </section>
  );

  const roomEditor = roomEditorRoom ? (
    <section className={styles.mansionRoomEditor} data-tutorial-target="whodunnit-room-editor">
      <header className={styles.mansionRoomEditorBreadcrumb}>
        <nav aria-label="Editor breadcrumb">
          <button type="button" onClick={() => setRoomEditorId(null)}>Venue Editor</button>
          <span aria-hidden="true">/</span>
          <strong>{roomEditorRoom.name}</strong>
        </nav>
        <div role="group" aria-label="Room art authoring view" data-tutorial-target="whodunnit-room-mosaic-preview">
          <button type="button" aria-pressed={mosaicPreview} onClick={() => setMosaicPreview(true)}>Mosaic</button>
          <button type="button" aria-pressed={!mosaicPreview} onClick={() => setMosaicPreview(false)}>Composition reference</button>
        </div>
      </header>

      <div
        className={styles.mansionRoomEditorStage}
        data-mosaic-preview={mosaicPreview ? "true" : "false"}
        data-placement-active={roomTool ?? undefined}
        onPointerDown={beginRoomOverlay}
        onPointerMove={continueRoomOverlay}
        onPointerUp={finishRoomOverlay}
        onPointerCancel={() => setOverlayGesture(null)}
      >
        <div className={styles.mansionRoomArtViewport}>
          {(() => {
            const candidate = layout.roomArtCandidates.find((entry) => entry.roomId === roomEditorRoom.id) ?? null;
            const currentUrl = roomAssetUrl(mansion, roomEditorRoom, mosaicPreview);
            const candidateUrl = candidate?.status === "ready" && candidate.assetId
              ? candidateAssetUrl(mansion, candidate.assetId)
              : null;
            return candidateUrl ? (
              <div className={styles.mansionRoomArtCompare}>
                <figure>{currentUrl ? <img src={currentUrl} alt={`${roomEditorRoom.name} accepted or bundled room art`} /> : <span>Bundled silhouette</span>}<figcaption>Current</figcaption></figure>
                <figure><img src={candidateUrl} alt={`${roomEditorRoom.name} generated candidate`} /><figcaption>Candidate · not accepted</figcaption></figure>
              </div>
            ) : currentUrl
              ? <img src={currentUrl} alt={`${roomEditorRoom.name} room art`} />
              : <div className={styles.mansionRoomArtFallback}><span aria-hidden="true">{roomEditorRoom.emoji}</span><strong>{roomEditorRoom.name}</strong></div>;
          })()}

          <div
            ref={roomOverlayRef}
            className={styles.mansionRoomOverlay}
            aria-label="Room authoring canvas"
            data-active-tool={roomTool ?? undefined}
          >
            {layout.placementAnchors.filter((anchor) => anchor.roomId === roomEditorRoom.id).map((anchor) => (
              <button key={anchor.id} type="button" className={styles.mansionRoomAnchorMarker} style={{ left: `${anchor.point.x * 100}%`, top: `${anchor.point.y * 100}%` }} title={`${anchor.relation} ${anchor.name}`} onPointerDown={(event) => event.stopPropagation()}>{anchor.name.slice(0, 1).toUpperCase()}</button>
            ))}
            {layout.lights.filter((light) => light.roomId === roomEditorRoom.id).map((light) => light.kind === "neon" ? (
              <svg key={light.id} className={styles.mansionDynamicLight} data-light-kind="neon" data-selected={light.id === selectedLightId ? "true" : undefined} viewBox="0 0 100 100" preserveAspectRatio="none" style={lightStyle(light)} aria-label="Neon vector light" onPointerDown={(event) => beginLightGesture(event, light, "move")}>
                <polyline points={light.geometry.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={Math.max(0.5, light.geometry.width * 100)} />
              </svg>
            ) : light.kind === "directional" && mansionDirectionalGeometryIsPolygonV2(light.geometry) ? (
              <svg key={light.id} className={styles.mansionDynamicLight} data-light-kind="directional" data-light-shape="polygon" data-selected={light.id === selectedLightId ? "true" : undefined} data-directional-dust={light.dust ? "true" : undefined} viewBox="0 0 100 100" preserveAspectRatio="none" style={lightStyle(light)} aria-label="Godray light" onPointerDown={(event) => beginLightGesture(event, light, "move")}>
                <polygon points={mansionDirectionalLightPolygonV2(light).map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} fill="currentColor" fillOpacity={0.38} stroke="currentColor" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <button key={light.id} type="button" className={styles.mansionDynamicLight} data-light-kind={light.kind} data-selected={light.id === selectedLightId ? "true" : undefined} data-fire-animation={light.kind === "fire" ? light.animation : undefined} data-directional-dust={light.kind === "directional" && light.dust ? "true" : undefined} style={lightStyle(light)} aria-label={`${light.kind} dynamic light`} onPointerDown={(event) => beginLightGesture(event, light, "move")} />
            ))}
            {selectedLight ? (
              <button
                type="button"
                className={styles.mansionLightResizeHandle}
                style={lightResizeHandleStyle(selectedLight)}
                aria-label={`Resize ${selectedLight.kind} light`}
                onPointerDown={(event) => beginLightGesture(event, selectedLight, "resize")}
              />
            ) : null}
            {roomTool ? <span className={styles.mansionRoomPlacementHint} role="status">{roomTool === "neon" ? "Draw the neon path" : `Click to place ${roomTool}`}</span> : null}
          </div>
        </div>
      </div>

      <aside className={styles.mansionRoomEditorTools}>
        <section>
          <header><small>Room presentation</small><h3>{roomEditorRoom.name}</h3></header>
          <p>Mosaic is the sole playable room-art base. Its composition reference stays authoring-only; an optional Upgraded derivative is created from the accepted Mosaic without replacing it.</p>
          {roomArtNotice ? <p className={styles.mansionRoomEditorNotice} role="status">{roomArtNotice}</p> : null}
          {(() => {
            const candidate = layout.roomArtCandidates.find((entry) => entry.roomId === roomEditorRoom.id) ?? null;
            const persistedRoom = mansion.layoutV2?.entities.some((entity) => entity.id === roomEditorRoom.id) ?? false;
            const roomArtMutationReady = persistedRoom && persistedLayoutMatchesDraft;
            return (
              <div className={styles.mansionRoomArtCandidateControls} data-candidate-status={candidate?.status ?? "none"}>
                <button
                  type="button"
                  disabled={busy || roomArtBusy || !roomArtMutationReady || !onRegenerateRoomArt}
                  data-awaiting-confirmation={regenerateConfirmationRoomId === roomEditorRoom.id ? "true" : undefined}
                  onClick={() => {
                    if (regenerateConfirmationRoomId === roomEditorRoom.id) {
                      void mutateRoomArt("regenerate", roomEditorRoom.id);
                    } else {
                      setRegenerateConfirmationRoomId(roomEditorRoom.id);
                    }
                  }}
                >{regenerateConfirmationRoomId === roomEditorRoom.id ? "Confirm reset room asset" : "Regenerate room asset"}</button>
                <small>Resets this room to its bundled Mosaic and clears only this room&apos;s anchors, lights, and staged art.</small>
                {candidate?.status === "ready" ? (
                  <>
                    <button type="button" disabled={busy || roomArtBusy || !roomArtMutationReady} onClick={() => void mutateRoomArt("accept", roomEditorRoom.id)}>Accept candidate</button>
                    <button type="button" disabled={busy || roomArtBusy || responseMode === "local" || !roomArtMutationReady} onClick={() => void mutateRoomArt("generate", roomEditorRoom.id)}>Retry Mosaic candidate</button>
                    <button type="button" disabled={busy || roomArtBusy || !roomArtMutationReady} onClick={() => void mutateRoomArt("discard", roomEditorRoom.id)}>Discard candidate</button>
                  </>
                ) : (
                  <button type="button" disabled={busy || roomArtBusy || responseMode === "local" || !roomArtMutationReady || !onGenerateRoomArt} onClick={() => void mutateRoomArt("generate", roomEditorRoom.id)}>Synthesize Mosaic · ONLINE</button>
                )}
                <small>{responseMode === "local"
                  ? "LOCAL is server-rejected and uses bundled or accepted art."
                  : roomArtMutationReady
                    ? "Only this open room is synthesized. Generation stages a content-addressed Mosaic candidate; the composition reference and accepted Mosaic remain intact until Accept candidate."
                    : "Save the current venue plan before generating or changing its venue-owned candidate."}</small>
              </div>
            );
          })()}
        </section>

        <section data-tutorial-target="whodunnit-room-anchors">
          <header><small>Authoring context · not hotspots</small><h3>Placement anchors</h3><span>{layout.placementAnchors.filter((anchor) => anchor.roomId === roomEditorRoom.id).length}/{MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM}</span></header>
          <button
            type="button"
            disabled={layout.placementAnchors.filter((anchor) => anchor.roomId === roomEditorRoom.id).length >= MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM}
            aria-pressed={roomTool === "anchor"}
            onClick={() => setRoomTool((current) => current === "anchor" ? null : "anchor")}
          >{roomTool === "anchor" ? "Cancel anchor" : "+ Place anchor"}</button>
          <button
            type="button"
            className={styles.mansionRoomEditorReadArt}
            disabled={busy || roomArtBusy || roomToolBusy !== null || responseMode === "local" || !onDetectRoomAnchors || !roomEditorRoom.acceptedRoomAssetId || !persistedLayoutMatchesDraft || !layout.placementAnchors.some((anchor) => anchor.roomId === roomEditorRoom.id)}
            title={responseMode === "local"
              ? "Re-reading anchors needs ONLINE."
              : !roomEditorRoom.acceptedRoomAssetId
                ? "Accept a Mosaic for this room first."
                : !persistedLayoutMatchesDraft
                  ? "Save the venue plan first so PRISM reads the anchors you named."
                  : "PRISM finds where each named anchor actually sits in the accepted art."}
            onClick={() => void detectRoomTool("anchors", roomEditorRoom.id)}
          >{roomToolBusy === "anchors" ? "Reading art…" : "Re-read anchors from art"}</button>
          <div className={styles.mansionRoomEditorList}>
            {layout.placementAnchors.filter((anchor) => anchor.roomId === roomEditorRoom.id).map((anchor) => (
              <div key={anchor.id} className={styles.mansionRoomAnchorEditor}>
                <input aria-label="Anchor name" value={anchor.name} maxLength={80} onChange={(event) => {
                  const name = event.currentTarget.value;
                  setLayout((current) => ({ ...current, placementAnchors: current.placementAnchors.map((entry) => entry.id === anchor.id ? { ...entry, name } : entry) }));
                }} />
                <select aria-label="Anchor relation" value={anchor.relation} onChange={(event) => {
                  const relation = event.currentTarget.value as MansionPlacementRelationV2;
                  setLayout((current) => ({ ...current, placementAnchors: current.placementAnchors.map((entry) => entry.id === anchor.id ? { ...entry, relation } : entry) }));
                }}>
                  {MANSION_PLACEMENT_RELATIONS_V2.map((relation) => <option key={relation} value={relation}>{relation}</option>)}
                </select>
                {(["x", "y"] as const).map((axis) => (
                  <label key={axis}>{axis.toUpperCase()}<input type="range" min="0" max="1" step="0.01" value={anchor.point[axis]} onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setLayout((current) => ({
                      ...current,
                      placementAnchors: current.placementAnchors.map((entry) => entry.id === anchor.id
                        ? { ...entry, point: { ...entry.point, [axis]: value } }
                        : entry),
                    }));
                  }} /></label>
                ))}
                <button type="button" aria-label={`Remove ${anchor.name}`} onClick={() => setLayout((current) => ({ ...current, placementAnchors: current.placementAnchors.filter((entry) => entry.id !== anchor.id) }))}>×</button>
              </div>
            ))}
          </div>
        </section>

        <section data-tutorial-target="whodunnit-room-lights">
          <header><small>Venue-static · deterministic</small><h3>Dynamic Lights</h3><span>{roomEditorLights.length}/{MANSION_LAYOUT_V2_MAX_LIGHTS}</span></header>
          <div className={styles.mansionRoomLightKinds}>
            {(["fire", "omni", "directional", "neon"] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={roomTool === kind} disabled={roomEditorLights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => setRoomTool((current) => current === kind ? null : kind)}>{roomTool === kind ? "Cancel" : `+ Place ${kind}`}</button>
            ))}
          </div>
          <button
            type="button"
            className={styles.mansionRoomEditorReadArt}
            disabled={busy || roomArtBusy || roomToolBusy !== null || responseMode === "local" || !onDetectRoomLights || !roomEditorRoom.acceptedRoomAssetId || !persistedLayoutMatchesDraft}
            title={responseMode === "local"
              ? "Reading lights from art needs ONLINE. Hand placement works in LOCAL."
              : !roomEditorRoom.acceptedRoomAssetId
                ? "Accept a Mosaic for this room first."
                : !persistedLayoutMatchesDraft
                  ? "Save the venue plan first; detection continues from the saved lights."
                  : "PRISM reads the accepted art for fires, lamps, windows, and neon and places lights on them, replacing this room's lights in the draft."}
            onClick={() => void detectRoomTool("lights", roomEditorRoom.id)}
          >{roomToolBusy === "lights" ? "Reading art…" : "Auto-place lights from art"}</button>
          <div className={styles.mansionRoomEditorList}>
            {roomEditorLights.map((light) => (
              <div key={light.id} className={styles.mansionRoomLightEditor} data-light-kind={light.kind} data-selected={light.id === selectedLightId ? "true" : undefined} onClick={() => setSelectedLightId(light.id)}>
                <strong>{light.kind}</strong>
                <label>Color<input type="color" value={light.color.startsWith("#") ? light.color.slice(0, 7) : "#ffb067"} onChange={(event) => {
                  const color = event.currentTarget.value;
                  updateLight(light.id, (entry) => ({ ...entry, color }));
                }} /></label>
                <label>Intensity<input type="range" min="0" max="1" step="0.01" value={light.intensity} onChange={(event) => {
                  const intensity = Number(event.currentTarget.value);
                  updateLight(light.id, (entry) => ({ ...entry, intensity }));
                }} /></label>
                <button type="button" onClick={() => {
                  setLayout((current) => ({ ...current, lights: current.lights.filter((entry) => entry.id !== light.id) }));
                  setSelectedLightId((current) => current === light.id ? null : current);
                }}>Remove</button>
                {lightAnchorPoint(light) ? (
                  <>
                    <label>X<input type="range" min="0" max="1" step="0.01" value={lightAnchorPoint(light)!.x} onChange={(event) => {
                      const x = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => setLightPoint(entry, "x", x));
                    }} /></label>
                    <label>Y<input type="range" min="0" max="1" step="0.01" value={lightAnchorPoint(light)!.y} onChange={(event) => {
                      const y = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => setLightPoint(entry, "y", y));
                    }} /></label>
                  </>
                ) : null}
                {light.kind === "fire" ? (
                  <>
                    <label>Size<input type="range" min="0.035" max="0.6" step="0.005" value={light.geometry.radius} onChange={(event) => {
                      const radius = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => entry.kind === "fire" ? { ...entry, geometry: { ...entry.geometry, radius } } : entry);
                    }} /></label>
                    <label>Rotation<input type="range" min="-180" max="180" step="1" value={light.geometry.rotation} onChange={(event) => {
                      const rotation = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => entry.kind === "fire" ? { ...entry, geometry: { ...entry.geometry, rotation } } : entry);
                    }} /></label>
                    <label>Motion<select value={light.animation} onChange={(event) => {
                      const animation = event.currentTarget.value as "steady" | "flicker";
                      updateLight(light.id, (entry) => entry.kind === "fire" ? { ...entry, animation } : entry);
                    }}><option value="flicker">Random flicker</option><option value="steady">Steady</option></select></label>
                  </>
                ) : light.kind === "omni" ? (
                  <label>Size<input type="range" min="0.035" max="0.6" step="0.005" value={light.geometry.radius} onChange={(event) => {
                    const radius = Number(event.currentTarget.value);
                    updateLight(light.id, (entry) => entry.kind === "omni" ? { ...entry, geometry: { ...entry.geometry, radius } } : entry);
                  }} /></label>
                ) : light.kind === "directional" ? (
                  <>
                    {mansionDirectionalGeometryIsPolygonV2(light.geometry) ? (
                      <>
                        <span>Godray: drag its corners on the canvas. The first edge sits on the window; the resize handle extends the floor edge.</span>
                        <button type="button" onClick={() => updateLight(light.id, (entry) => entry.kind === "directional"
                          ? { ...entry, geometry: { points: mansionGodrayParallelPointsV2(mansionDirectionalLightPolygonV2(entry)) } }
                          : entry)}>Make rays parallel</button>
                      </>
                    ) : (
                      <>
                        <label>Width<input type="range" min="0.04" max="1" step="0.01" value={light.geometry.width} onChange={(event) => {
                          const width = Number(event.currentTarget.value);
                          updateLight(light.id, (entry) => entry.kind === "directional" && !mansionDirectionalGeometryIsPolygonV2(entry.geometry) ? { ...entry, geometry: { ...entry.geometry, width } } : entry);
                        }} /></label>
                        <label>Depth<input type="range" min="0.04" max="1" step="0.01" value={light.geometry.height} onChange={(event) => {
                          const height = Number(event.currentTarget.value);
                          updateLight(light.id, (entry) => entry.kind === "directional" && !mansionDirectionalGeometryIsPolygonV2(entry.geometry) ? { ...entry, geometry: { ...entry.geometry, height } } : entry);
                        }} /></label>
                        <label>Rotation<input type="range" min="-180" max="180" step="1" value={light.geometry.rotation} onChange={(event) => {
                          const rotation = Number(event.currentTarget.value);
                          updateLight(light.id, (entry) => entry.kind === "directional" && !mansionDirectionalGeometryIsPolygonV2(entry.geometry) ? { ...entry, geometry: { ...entry.geometry, rotation } } : entry);
                        }} /></label>
                      </>
                    )}
                    <label>Dust<input type="checkbox" checked={light.dust} onChange={(event) => {
                      const dust = event.currentTarget.checked;
                      updateLight(light.id, (entry) => entry.kind === "directional" ? { ...entry, dust } : entry);
                    }} /></label>
                  </>
                ) : (
                  <label>Stroke width<input type="range" min="0.005" max="0.25" step="0.005" value={light.geometry.width} onChange={(event) => {
                    const width = Number(event.currentTarget.value);
                    updateLight(light.id, (entry) => entry.kind === "neon" ? { ...entry, geometry: { ...entry.geometry, width } } : entry);
                  }} /></label>
                )}
              </div>
            ))}
          </div>
          <p>Fire uses a triangle, omni a circle, directional a window-to-floor godray polygon of up to four corners, and neon a vector stroke. Stable IDs seed animation; Reduced Motion freezes it. Cue permission metadata remains venue-static in this release.</p>
        </section>
      </aside>

      <footer className={styles.mansionRoomEditorFooter}>
        <button type="button" onClick={() => setRoomEditorId(null)}>← Back to Venue Editor</button>
        <span>{validationErrors.length > 0 ? validationErrors[0] : "Room authoring context is included in the venue plan."}</span>
      </footer>
    </section>
  ) : null;

  return (
    <>
      <WhodunnitSetupDialog
        open
        id="mansion-topology-editor"
        theme={theme}
        eyebrow={roomEditor ? "Room Editor" : "Venue Editor"}
        title={presentation.title}
        description={creationFlow
          ? layout.venueProfile
            ? `Dress this ${layout.venueProfile.placeNoun} across ${layout.venueProfile.tierLabels.join(", ")}. Its accepted architecture remains fixed; art stays optional and explicit.`
            : "Build a tenant-owned estate from the connected blank draft. Continue prepares its authored Mosaic room plates."
          : `Editing a local derivative of ${mansion.derivation?.sourceTitle ?? mansion.name}. The source remains unchanged.`}
        size="screen"
        busy={busy || saving || roomArtBusy}
        onClose={onClose}
      >
        {roomEditor ?? planner}
      </WhodunnitSetupDialog>
      {overheadEditorOpen ? <MapOverheadEditorDialog
        key={`${mansion.id}:overhead:${selectedFloor}`}
        placeNoun={venueProfile?.placeNoun ?? "venue"}
        levelLabel={tierLabel(selectedFloor)}
        imageUrl={overheadUrl}
        frame={{
          left: overheadBoardTransform.x(MANSION_OVERHEAD_FRAME_V1.left),
          top: overheadBoardTransform.y(MANSION_OVERHEAD_FRAME_V1.top),
          width: overheadBoardTransform.width(MANSION_OVERHEAD_FRAME_V1.columns),
          height: overheadBoardTransform.height(MANSION_OVERHEAD_FRAME_V1.rows),
        }}
        cell={{
          width: overheadBoardTransform.width(1),
          height: overheadBoardTransform.height(1),
        }}
        tiles={layout.entities.filter((entity) => entity.floor === selectedFloor).map((entity) => {
          const rect = mansionLayoutV2EntityRect(entity);
          return {
            id: entity.id,
            label: "name" in entity && typeof entity.name === "string" ? entity.name : "",
            kind: entity.kind === "room" ? "room" as const : entity.kind === "corridor" ? "corridor" as const : "side" as const,
            left: overheadBoardTransform.x(rect.x),
            top: overheadBoardTransform.y(rect.y),
            width: overheadBoardTransform.width(rect.width),
            height: overheadBoardTransform.height(rect.height),
          };
        })}
        placement={layout.overheadPlacement ?? null}
        theme={theme}
        online={responseMode === "online"}
        onClose={() => setOverheadEditorOpen(false)}
        onSave={(placement) => {
          setLayout((current) => {
            const next = { ...current };
            if (placement) next.overheadPlacement = placement;
            else delete next.overheadPlacement;
            return next;
          });
          setOverheadEditorOpen(false);
          setNotice("Overhead placement is in the draft. Save the venue plan to keep it.");
        }}
        onGenerate={generateOverhead}
      /> : null}
      <PrismBlockingLoader
        open={saving && creationFlow}
        operation="preparation"
        placement="fullscreen"
        theme={theme}
        eyebrow="PRISM / Venue Editor"
        title="Validating the venue plan"
        detail="PRISM is checking room footprints, circulation, the semantic entry, and every occupied tier. No art is generated here."
        stepLabel="Preparing the venue map"
        progress={0.72}
        footer="LOCAL stays local. No case truth or venue art leaves this device."
      />
      {/* Every synthesis or art read in the editor waits behind the same loader
          the rest of PRISM uses; these requests finish on their own. */}
      <PrismBlockingLoader
        open={!saving && (roomArtBusy || overheadBusy || roomToolBusy !== null)}
        operation="preparation"
        placement="fullscreen"
        theme={theme}
        eyebrow="PRISM / Venue Editor"
        title={overheadBusy
          ? "Drawing the overhead plate"
          : roomToolBusy === "lights"
            ? "Reading light sources from the art"
            : roomToolBusy === "anchors"
              ? "Re-reading anchors from the art"
              : "Refracting room art"}
        detail={overheadBusy
          ? "One deck plan for the venue's floors, drawn from the exterior and the room plan. Place it on the board when it lands."
          : roomToolBusy
            ? "PRISM reads the accepted art. The result lands in the draft; save the venue plan to keep it."
            : "A room plate preview. Accept it or discard it before saving the venue plan."}
        stepLabel={overheadBusy ? "Painting the plate" : roomToolBusy ? "Reading the art" : "Painting the room"}
        progress={null}
        footer={roomToolBusy ? "LOCAL stays local. No art leaves this device." : "This finishes on its own; nothing is saved until you save the venue plan."}
      />
    </>
  );
}
