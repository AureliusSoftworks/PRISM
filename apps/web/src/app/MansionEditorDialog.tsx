"use client";

import {
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
  MANSION_PLACEMENT_RELATIONS_V2,
  addAutoCenteredMansionLayoutV2Doors,
  canonicalMansionLayoutV2,
  mansionLayoutV2DoorPoint,
  mansionLayoutV2EntityRect,
  mansionLayoutV2EditorDerivativeFromLegacyRooms,
  mansionLayoutV2FloorSemanticRoomCount,
  mansionLayoutV2FromLegacyRooms,
  mansionLayoutV2PlacementIsLegal,
  placeMansionLayoutV2Entity,
  mansionLayoutV2SemanticRoomCount,
  mansionLayoutV2SemanticRoomsAreConnected,
  mansionLayoutV2SharedWall,
  reconcileMansionLayoutV2Doors,
  removeMansionLayoutV2Door,
  resolveDebateMysteryMansionExteriorScaleClassV1,
  rotateMansionLayoutV2Room,
  slideMansionLayoutV2Door,
  snapMansionLayoutV2Entity,
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
import {
  installedMansionExteriorPreviewV1,
  resolveInstalledMansionPresentationV1,
} from "./installedMansionLibrary";
import {
  whodunnitBundledRoomArtPathForRoom,
  whodunnitMansionRoomArtUrl,
} from "./debateMysteryInvestigationArt";
import WhodunnitSetupDialog from "./WhodunnitSetupDialog";
import styles from "./debateMystery.module.css";

interface MansionEditorDialogProps {
  theme: "light" | "dark";
  mansion: DebateMysteryMansionBundleSummaryV1;
  busy: boolean;
  responseMode: "local" | "online";
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
}

interface EntityDragV2 {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  previewX: number;
  previewY: number;
}

interface CorridorResizeV2 {
  id: string;
  pointerId: number;
  edge: "north" | "east" | "south" | "west";
  startX: number;
  startY: number;
  original: MansionLayoutBlockV2 & { kind: "corridor" };
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

function cloneLayout(layout: MansionLayoutV2): MansionLayoutV2 {
  return JSON.parse(JSON.stringify(layout)) as MansionLayoutV2;
}

function normalizeEditorLayout(layout: MansionLayoutV2): MansionLayoutV2 {
  let next: MansionLayoutV2 = {
    ...cloneLayout(layout),
    entities: layout.entities.map((entity) => entity.kind === "infill"
      ? { ...entity, kind: "corridor" as const }
      : entity),
  };
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

function stableId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roomTemplate(templateId: string) {
  return DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === templateId) ??
    DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === "parlor")!;
}

function roomAssetUrl(
  mansion: DebateMysteryMansionBundleSummaryV1,
  room: MansionLayoutRoomV2,
  mosaic: boolean,
): string | null {
  const style = mosaic ? "mosaic" : "illustrated";
  if (room.acceptedRoomAssetId) {
    return whodunnitMansionRoomArtUrl(mansion.id, room.acceptedRoomAssetId, style);
  }
  return whodunnitBundledRoomArtPathForRoom(room, style);
}

function candidateAssetUrl(
  mansion: DebateMysteryMansionBundleSummaryV1,
  assetId: string,
): string {
  return `/api/debates/mystery-mansions/${encodeURIComponent(mansion.id)}/assets/${encodeURIComponent(assetId)}/file`;
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
  const base = {
    "--mansion-light-color": light.color,
    "--mansion-light-intensity": String(light.intensity),
    "--mansion-light-delay": `${-(visualSeed(`${light.id}:${light.animationSeed}`) / 100)}s`,
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
    return {
      ...common,
      kind,
      dust: true,
      geometry: { ...point, width: 0.32, height: 0.16, rotation: 0 },
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
    return {
      left: `${clampNormalized(light.geometry.x + light.geometry.width / 2) * 100}%`,
      top: `${clampNormalized(light.geometry.y + light.geometry.height / 2) * 100}%`,
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
  return {
    ...light,
    geometry: {
      ...light.geometry,
      x: clampNormalized(light.geometry.x + delta.x),
      y: clampNormalized(light.geometry.y + delta.y),
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
    return {
      ...light,
      geometry: {
        ...light.geometry,
        width: Math.min(1, Math.max(0.04, light.geometry.width + delta.x * 2)),
        height: Math.min(1, Math.max(0.04, light.geometry.height + delta.y * 2)),
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
  return {
    ...light,
    geometry: { ...light.geometry, [axis]: value },
  };
}

function omniHasNeonBulb(
  light: MansionDynamicLightV2,
  roomLights: readonly MansionDynamicLightV2[],
): boolean {
  if (light.kind !== "omni") return false;
  return roomLights.some((candidate) => {
    if (candidate.kind !== "neon" || candidate.geometry.points.length > 3) return false;
    const point = candidate.geometry.points[0];
    if (!point) return false;
    return Math.hypot(point.x - light.geometry.x, point.y - light.geometry.y) <= light.geometry.radius;
  });
}

export default function MansionEditorDialog({
  theme,
  mansion,
  busy,
  responseMode,
  onClose,
  onSave,
  onGenerateRoomArt,
  onAcceptRoomArt,
  onDiscardRoomArt,
}: MansionEditorDialogProps): JSX.Element {
  const [layout, setLayout] = useState(() => initialLayout(mansion));
  const [layoutHistory, setLayoutHistory] = useState<MansionLayoutV2[]>([]);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedEntityId, setSelectedEntityId] = useState(
    () => layout.entities.find((entity) => entity.floor === 1)?.id ?? layout.entities[0]?.id ?? "",
  );
  const [roomEditorId, setRoomEditorId] = useState<string | null>(null);
  const [mosaicPreview, setMosaicPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomArtBusy, setRoomArtBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<EntityDragV2 | null>(null);
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
  const presentation = resolveInstalledMansionPresentationV1(mansion);
  const semanticRoomCount = mansionLayoutV2SemanticRoomCount(layout);
  const draftFloors = Math.max(1, ...layout.entities.map((entity) => entity.floor));
  const draftScaleClass = resolveDebateMysteryMansionExteriorScaleClassV1({
    floors: draftFloors,
    totalRooms: semanticRoomCount,
  });
  const exterior = installedMansionExteriorPreviewV1({
    mansion,
    assetId: presentation.thumbnailAssetId,
    scaleClass: draftScaleClass,
  });
  const validationErrors = useMemo(
    () => validateMansionLayoutV2(layout, {
      suspectCount: mansion.suspectCount,
      requireEditorFloors: true,
    }),
    [layout, mansion.suspectCount],
  );
  const thirdFloorAccessible = mansionLayoutV2FloorSemanticRoomCount(layout, 2) >= 4;

  const pushLayoutHistory = (snapshot: MansionLayoutV2): void => {
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

  const undoLayout = (): void => {
    const previous = layoutHistory.at(-1);
    if (!previous) return;
    setLayoutHistory((current) => current.slice(0, -1));
    setLayout(cloneLayout(previous));
    const retainedSelection = previous.entities.find((entity) => entity.id === selectedEntityId);
    const fallback = previous.entities.find((entity) => entity.floor === selectedFloor) ?? previous.entities[0];
    setSelectedEntityId(retainedSelection?.id ?? fallback?.id ?? "");
    if (roomEditorId && !previous.entities.some((entity) => entity.id === roomEditorId && entity.kind === "room")) {
      setRoomEditorId(null);
    }
    setNotice("Undid the last mansion layout change.");
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
    if (updated?.layoutV2) setLayout(cloneLayout(updated.layoutV2));
  };

  const mutateRoomArt = async (
    action: "generate" | "accept" | "discard",
    roomId: string,
  ): Promise<void> => {
    const handler = action === "generate"
      ? onGenerateRoomArt
      : action === "accept"
        ? onAcceptRoomArt
        : onDiscardRoomArt;
    if (!handler || roomArtBusy) return;
    setRoomArtBusy(true);
    setNotice(null);
    try {
      replaceLayoutFromMansion(await handler(mansion, roomId));
    } finally {
      setRoomArtBusy(false);
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

  const addRoom = (): void => {
    if (selectedFloor === 3 && !thirdFloorAccessible) {
      setNotice("Floor 2 needs at least four semantic rooms before Floor 3 opens.");
      return;
    }
    const template = roomTemplate(layout.entities.some(
      (entity) => entity.kind === "room" && entity.templateId === "foyer",
    ) ? "parlor" : "foyer");
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
    };
    const next = addEntityToLayout(layout, entity, selectedFloor);
    if (!next) {
      setNotice("That floor has no legal connected space for this room footprint.");
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

  const removeSelectedEntity = (): void => {
    if (!selectedEntity || selectedRoom?.templateId === "foyer") return;
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
    if (!entity || !other || !wall || entity.kind === "infill" || other.kind === "infill") return;
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

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    entity: MansionLayoutEntityV2,
  ): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const cellWidth = bounds.width / MANSION_LAYOUT_V2_COLUMNS;
    const cellHeight = bounds.height / MANSION_LAYOUT_V2_ROWS;
    setSelectedEntityId(entity.id);
    setDrag({
      id: entity.id,
      pointerId: event.pointerId,
      offsetX: (event.clientX - bounds.left) / cellWidth - entity.x,
      offsetY: (event.clientY - bounds.top) / cellHeight - entity.y,
      previewX: entity.x,
      previewY: entity.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!drag || drag.id !== event.currentTarget.dataset.entityId) return;
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
    if (!drag || drag.id !== event.currentTarget.dataset.entityId) return;
    const currentEntity = layout.entities.find((entity) => entity.id === drag.id);
    const moved = currentEntity && (currentEntity.x !== drag.previewX || currentEntity.y !== drag.previewY);
    const next = snapMansionLayoutV2Entity(layout, drag.id, {
      x: drag.previewX,
      y: drag.previewY,
    });
    commitLayout(next);
    setDrag(null);
    setNotice(moved && next === layout
      ? "That move would create an island, so the block stayed connected."
      : null);
  };

  const beginCorridorResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    entity: MansionLayoutBlockV2 & { kind: "corridor" },
    edge: CorridorResizeV2["edge"],
  ): void => {
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
    setLayout(placeMansionLayoutV2Entity(
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
      commitLayout(rotateMansionLayoutV2Room(layout, entity.id));
    } else if (entity.kind === "corridor") {
      commitLayout(placeMansionLayoutV2Entity(layout, entity.id, {
        ...entity,
        width: entity.height,
        height: entity.width,
      }));
    }
    setNotice(null);
  };

  const save = async (): Promise<void> => {
    if (validationErrors.length > 0) return;
    setSaving(true);
    try {
      const saved = await onSave(mansion, layout);
      if (saved) onClose();
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
          <p><strong>Exterior needs review</strong>The retained custom cover was accepted for a different mansion scale. It will not be overwritten.</p>
        ) : (
          <p><strong>{exterior.switchesWithTopology ? "Included family" : "Accepted exterior"}</strong>{exterior.switchesWithTopology ? "The cover follows semantic room count and floor scale automatically." : "This protected cover stays with the derivative."}</p>
        )}
        <p><strong>Planner contract</strong>Rooms keep fixed silhouettes. Corridors shape the house and carry traversal without counting as rooms.</p>
      </aside>

      <div className={styles.mansionEditorWorkspace}>
        <header className={styles.mansionEditorFloorBar}>
          <nav aria-label="Mansion floors">
            {FLOOR_IDS.map((floor) => (
              <button
                key={floor}
                type="button"
                aria-pressed={selectedFloor === floor}
                disabled={floor === 3 && !thirdFloorAccessible}
                title={floor === 3 && !thirdFloorAccessible ? "Floor 2 needs at least four rooms" : undefined}
                onClick={() => setSelectedFloor(floor)}
              >
                Floor {floor}<small>{mansionLayoutV2FloorSemanticRoomCount(layout, floor)} rooms</small>
              </button>
            ))}
          </nav>
          <div>
            <button type="button" onClick={addRoom}>+ Room</button>
            <button type="button" onClick={addCorridor}>+ Corridor</button>
          </div>
        </header>

        <div className={styles.mansionEditorCanvasShell}>
          <div ref={canvasRef} className={styles.mansionEditorCanvas} aria-label={`Floor ${selectedFloor} 16 by 12 plan`}>
            {layout.entities.filter((entity) => entity.floor === selectedFloor).map((entity) => {
              const rect = mansionLayoutV2EntityRect(entity);
              const preview = drag?.id === entity.id
                ? { ...rect, x: drag.previewX, y: drag.previewY }
                : rect;
              const roomArt = entity.kind === "room"
                ? roomAssetUrl(mansion, entity, true)
                : null;
              return (
                <button
                  key={entity.id}
                  type="button"
                  className={entity.kind === "room"
                    ? styles.mansionEditorRoomBlock
                    : styles.mansionEditorCorridorBlock}
                  data-entity-id={entity.id}
                  data-entity-kind={entity.kind}
                  data-selected={entity.id === selectedEntityId ? "true" : undefined}
                  style={{
                    gridColumn: `${preview.x + 1} / span ${preview.width}`,
                    gridRow: `${preview.y + 1} / span ${preview.height}`,
                    ...(roomArt ? { backgroundImage: `linear-gradient(rgb(4 8 15 / 28%), rgb(4 8 15 / 62%)), url("${roomArt}")` } : {}),
                  } as CSSProperties}
                  onDoubleClick={() => entity.kind === "room" && setRoomEditorId(entity.id)}
                  onClick={() => setSelectedEntityId(entity.id)}
                  onPointerDown={(event) => beginDrag(event, entity)}
                  onPointerMove={continueDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  <span aria-hidden="true">{entity.kind === "room" ? entity.emoji : "⇄"}</span>
                  <strong>{entity.kind === "room" ? entity.name : "Corridor"}</strong>
                  <small>{entity.kind === "room" ? `${rect.width}×${rect.height} · ${entity.rotation}°` : `${rect.width}×${rect.height}`}</small>
                  {entity.kind === "corridor" ? (["north", "east", "south", "west"] as const).map((edge) => (
                    <span
                      key={edge}
                      className={styles.mansionEditorCorridorResizeHandle}
                      data-edge={edge}
                      aria-label={`Resize corridor from ${edge} edge`}
                      role="separator"
                      onPointerDown={(event) => beginCorridorResize(
                        event,
                        entity as MansionLayoutBlockV2 & { kind: "corridor" },
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
            <span>Drag to arrange. Collisions reflow nearby blocks; only an island returns. Double-click a room to enter it.</span>
            <button type="button" disabled={!selectedRoom} onClick={() => selectedRoom && setRoomEditorId(selectedRoom.id)}>Open Room Editor</button>
          </div>
        </div>
      </div>

      <aside className={styles.mansionEditorInspector}>
        {selectedEntity ? (
          <>
            <header>
              <span aria-hidden="true">{selectedRoom?.emoji ?? "⇄"}</span>
              <div><small>{selectedRoom ? "Selected room" : selectedEntity.kind}</small><strong>{selectedRoom?.name ?? selectedEntity.id}</strong></div>
            </header>
            <div className={styles.mansionEditorTransformActions}>
              <button
                type="button"
                aria-label={`Rotate ${selectedRoom ? "room" : "corridor"} counterclockwise`}
                title="Rotate counterclockwise"
                onClick={() => rotateEntity(selectedEntity, "counterclockwise")}
              >↶</button>
              <span>{selectedRoom ? `${selectedRoom.rotation}°` : `${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0}`}</span>
              <button
                type="button"
                aria-label={`Rotate ${selectedRoom ? "room" : "corridor"} clockwise`}
                title="Rotate clockwise"
                onClick={() => rotateEntity(selectedEntity, "clockwise")}
              >↷</button>
              <button type="button" disabled={layoutHistory.length === 0} onClick={undoLayout}>Undo</button>
            </div>
            {selectedRoom ? (
              <>
                <label>Room type
                  <select value={selectedRoom.templateId} onChange={(event) => changeRoomTemplate(selectedRoom, event.currentTarget.value)}>
                    {!DEBATE_MYSTERY_ROOM_TEMPLATES.some((template) => template.id === selectedRoom.templateId)
                      ? <option value={selectedRoom.templateId}>{selectedRoom.name} · imported type</option>
                      : null}
                    {DEBATE_MYSTERY_ROOM_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </label>
                <label>Room name<input value={selectedRoom.name} maxLength={80} onChange={(event) => updateRoom(selectedRoom.id, { name: event.currentTarget.value })} /></label>
                <button type="button" onClick={() => setRoomEditorId(selectedRoom.id)}>Room art, anchors & lights</button>
              </>
            ) : null}

            <fieldset className={styles.mansionEditorGeometry}>
              <legend>{selectedRoom ? "Fixed silhouette" : "Block geometry"}</legend>
              <div><span>Horizontal</span><button type="button" onClick={() => commitLayout(snapMansionLayoutV2Entity(layout, selectedEntity.id, { x: selectedEntity.x - 1, y: selectedEntity.y }))}>←</button><output>{selectedEntity.x + 1}</output><button type="button" onClick={() => commitLayout(snapMansionLayoutV2Entity(layout, selectedEntity.id, { x: selectedEntity.x + 1, y: selectedEntity.y }))}>→</button></div>
              <div><span>Vertical</span><button type="button" onClick={() => commitLayout(snapMansionLayoutV2Entity(layout, selectedEntity.id, { x: selectedEntity.x, y: selectedEntity.y - 1 }))}>↑</button><output>{selectedEntity.y + 1}</output><button type="button" onClick={() => commitLayout(snapMansionLayoutV2Entity(layout, selectedEntity.id, { x: selectedEntity.x, y: selectedEntity.y + 1 }))}>↓</button></div>
              <p>{selectedRoom ? "Fixed room silhouette" : `${selectedBlock?.width ?? 0}×${selectedBlock?.height ?? 0} corridor · drag an edge to resize`}</p>
            </fieldset>

            <fieldset className={styles.mansionEditorConnections}>
              <legend>Geometry-derived doors</legend>
              {layout.doors.filter((door) => door.aEntityId === selectedEntity.id || door.bEntityId === selectedEntity.id).map((door) => {
                const otherId = door.aEntityId === selectedEntity.id ? door.bEntityId : door.aEntityId;
                const other = layout.entities.find((entity) => entity.id === otherId);
                return (
                  <div key={door.id} className={styles.mansionEditorDoorControl}>
                    <span><strong>{other?.kind === "room" ? other.name : other?.kind ?? "Route"}</strong><small>Shared-wall door</small></span>
                    <input aria-label={`Door position toward ${otherId}`} type="range" min="0" max="1" step="0.01" value={door.position} onChange={(event) => commitLayout(slideMansionLayoutV2Door(layout, door.id, Number(event.currentTarget.value)))} />
                    <button type="button" onClick={() => commitLayout(removeMansionLayoutV2Door(layout, door.id))}>Remove</button>
                  </div>
                );
              })}
              {layout.doors.every((door) => door.aEntityId !== selectedEntity.id && door.bEntityId !== selectedEntity.id)
                ? <p>No wall doors. Save will reject an inaccessible semantic room.</p>
                : null}
              {layout.entities.filter((other) => {
                if (other.id === selectedEntity.id || selectedEntity.kind === "infill" || other.kind === "infill") return false;
                if (!mansionLayoutV2SharedWall(selectedEntity, other)) return false;
                return !layout.doors.some((door) =>
                  (door.aEntityId === selectedEntity.id && door.bEntityId === other.id) ||
                  (door.aEntityId === other.id && door.bEntityId === selectedEntity.id));
              }).map((other) => (
                <button key={other.id} type="button" onClick={() => addDoorBetween(selectedEntity.id, other.id)}>
                  Add centered door to {other.kind === "room" ? other.name : "corridor"}
                </button>
              ))}
            </fieldset>

            {layout.verticalConnectors.filter((connector) => connector.lowerEntityId === selectedEntity.id || connector.upperEntityId === selectedEntity.id).map((connector) => (
              <div key={connector.id} className={styles.mansionEditorVerticalConnector}>
                <span aria-hidden="true">↕</span><span><strong>{connector.kind}</strong><small>Vertical connector preserved</small></span>
              </div>
            ))}
            <button type="button" className={styles.mansionEditorRemoveRoom} disabled={selectedRoom?.templateId === "foyer"} onClick={removeSelectedEntity}>Remove {selectedRoom ? "room" : "block"}</button>
          </>
        ) : <p>Select a room or corridor from the plan.</p>}
      </aside>

      <footer className={styles.mansionEditorFooter}>
        <div>
          <strong>{semanticRoomCount} semantic rooms · {draftFloors} floors · {draftScaleClass}</strong>
          {notice ? <span role="status">{notice}</span> : validationErrors.length > 0 ? <span role="alert">{validationErrors[0]}{validationErrors.length > 1 ? ` · ${validationErrors.length - 1} more` : ""}</span> : <span data-valid="true">Plan is connected and ready to save.</span>}
        </div>
        <button type="button" disabled={busy || saving} onClick={onClose}>Close</button>
        <button type="button" className={styles.installedMansionSave} disabled={busy || saving || validationErrors.length > 0} onClick={() => void save()}>{saving ? "Saving plan…" : "Save mansion plan"}</button>
      </footer>
    </section>
  );

  const roomEditor = roomEditorRoom ? (
    <section className={styles.mansionRoomEditor} data-tutorial-target="whodunnit-room-editor">
      <header className={styles.mansionRoomEditorBreadcrumb}>
        <nav aria-label="Editor breadcrumb">
          <button type="button" onClick={() => setRoomEditorId(null)}>Mansion Editor</button>
          <span aria-hidden="true">/</span>
          <strong>{roomEditorRoom.name}</strong>
        </nav>
        <div role="group" aria-label="Room art preview style" data-tutorial-target="whodunnit-room-mosaic-preview">
          <button type="button" aria-pressed={mosaicPreview} onClick={() => setMosaicPreview(true)}>Mosaic</button>
          <button type="button" aria-pressed={!mosaicPreview} onClick={() => setMosaicPreview(false)}>Illustrated</button>
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
          ) : (
            <button key={light.id} type="button" className={styles.mansionDynamicLight} data-light-kind={light.kind} data-selected={light.id === selectedLightId ? "true" : undefined} data-fire-animation={light.kind === "fire" ? light.animation : undefined} data-directional-dust={light.kind === "directional" && light.dust ? "true" : undefined} data-bulb-flicker={omniHasNeonBulb(light, roomEditorLights) ? "true" : undefined} style={lightStyle(light)} aria-label={`${light.kind} dynamic light`} onPointerDown={(event) => beginLightGesture(event, light, "move")} />
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

      <aside className={styles.mansionRoomEditorTools}>
        <section>
          <header><small>Room presentation</small><h3>{roomEditorRoom.name}</h3></header>
          <p>New rooms use their bundled room-type art. Mosaic changes this preview only; it never changes geometry, hotspots, evidence, or the saved source plate.</p>
          {(() => {
            const candidate = layout.roomArtCandidates.find((entry) => entry.roomId === roomEditorRoom.id) ?? null;
            const persistedRoom = mansion.layoutV2?.entities.some((entity) => entity.id === roomEditorRoom.id) ?? false;
            const roomArtMutationReady = persistedRoom && persistedLayoutMatchesDraft;
            return (
              <div className={styles.mansionRoomArtCandidateControls} data-candidate-status={candidate?.status ?? "none"}>
                {candidate?.status === "ready" ? (
                  <>
                    <button type="button" disabled={busy || roomArtBusy || !roomArtMutationReady} onClick={() => void mutateRoomArt("accept", roomEditorRoom.id)}>Accept candidate</button>
                    <button type="button" disabled={busy || roomArtBusy || responseMode === "local" || !roomArtMutationReady} onClick={() => void mutateRoomArt("generate", roomEditorRoom.id)}>Retry candidate</button>
                    <button type="button" disabled={busy || roomArtBusy || !roomArtMutationReady} onClick={() => void mutateRoomArt("discard", roomEditorRoom.id)}>Discard candidate</button>
                  </>
                ) : (
                  <button type="button" disabled={busy || roomArtBusy || responseMode === "local" || !roomArtMutationReady || !onGenerateRoomArt} onClick={() => void mutateRoomArt("generate", roomEditorRoom.id)}>Generate room-art candidate · ONLINE</button>
                )}
                <small>{responseMode === "local"
                  ? "LOCAL is server-rejected and uses bundled or accepted art."
                  : roomArtMutationReady
                    ? "Generation stages a content-addressed candidate. Accepted art is never overwritten until Accept candidate."
                    : "Save the current mansion plan before generating or changing its mansion-owned candidate."}</small>
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
          <header><small>Mansion-static · deterministic</small><h3>Dynamic Lights</h3><span>{roomEditorLights.length}/{MANSION_LAYOUT_V2_MAX_LIGHTS}</span></header>
          <div className={styles.mansionRoomLightKinds}>
            {(["fire", "omni", "directional", "neon"] as const).map((kind) => (
              <button key={kind} type="button" aria-pressed={roomTool === kind} disabled={roomEditorLights.length >= MANSION_LAYOUT_V2_MAX_LIGHTS} onClick={() => setRoomTool((current) => current === kind ? null : kind)}>{roomTool === kind ? "Cancel" : `+ Place ${kind}`}</button>
            ))}
          </div>
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
                {light.kind !== "neon" ? (
                  <>
                    <label>X<input type="range" min="0" max="1" step="0.01" value={light.geometry.x} onChange={(event) => {
                      const x = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => setLightPoint(entry, "x", x));
                    }} /></label>
                    <label>Y<input type="range" min="0" max="1" step="0.01" value={light.geometry.y} onChange={(event) => {
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
                    <label>Width<input type="range" min="0.04" max="1" step="0.01" value={light.geometry.width} onChange={(event) => {
                      const width = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => entry.kind === "directional" ? { ...entry, geometry: { ...entry.geometry, width } } : entry);
                    }} /></label>
                    <label>Depth<input type="range" min="0.04" max="1" step="0.01" value={light.geometry.height} onChange={(event) => {
                      const height = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => entry.kind === "directional" ? { ...entry, geometry: { ...entry.geometry, height } } : entry);
                    }} /></label>
                    <label>Rotation<input type="range" min="-180" max="180" step="1" value={light.geometry.rotation} onChange={(event) => {
                      const rotation = Number(event.currentTarget.value);
                      updateLight(light.id, (entry) => entry.kind === "directional" ? { ...entry, geometry: { ...entry.geometry, rotation } } : entry);
                    }} /></label>
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
          <p>Fire uses a triangle, omni a circle, directional a rectangle, and neon a vector stroke. Stable IDs seed animation; Reduced Motion freezes it. Cue permission metadata remains mansion-static in this release.</p>
        </section>
      </aside>

      <footer className={styles.mansionRoomEditorFooter}>
        <button type="button" onClick={() => setRoomEditorId(null)}>← Back to Mansion Editor</button>
        <span>{validationErrors.length > 0 ? validationErrors[0] : "Room authoring context is included in the mansion plan."}</span>
      </footer>
    </section>
  ) : null;

  return (
    <WhodunnitSetupDialog
      open
      id="mansion-topology-editor"
      theme={theme}
      eyebrow={roomEditor ? "Room Editor" : "Mansion Editor"}
      title={presentation.title}
      description={`Editing a local derivative of ${mansion.derivation?.sourceTitle ?? mansion.name}. The source remains unchanged.`}
      size="screen"
      busy={busy || saving || roomArtBusy}
      onClose={onClose}
    >
      {roomEditor ?? planner}
    </WhodunnitSetupDialog>
  );
}
