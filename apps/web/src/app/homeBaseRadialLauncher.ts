export const HOME_BASE_RADIAL_HOLD_MS = 420;
export const HOME_BASE_RADIAL_TARGET_RADIUS_PX = 84;
export const HOME_BASE_RADIAL_HANDOFF_MS = 420;
const HOME_BASE_RADIAL_TARGET_GUTTER_PX = 30;
const HOME_BASE_RADIAL_TARGET_RADIUS_MIN_PX = 44;
const HOME_BASE_RADIAL_TARGET_RADIUS_VIEWPORT_SCALE = 0.34;
const HOME_BASE_RADIAL_EDGE_PADDING_PX = 24;
const HOME_BASE_RADIAL_ROW_STEP_PX = 78;
const HOME_BASE_RADIAL_BASE_RADIUS_X_MAX_PX = 740;
const HOME_BASE_RADIAL_BASE_RADIUS_Y_MAX_PX = 520;
const HOME_BASE_RADIAL_USE_RADIUS_X = 0.96;
const HOME_BASE_RADIAL_USE_RADIUS_Y = 0.95;
const HOME_BASE_RADIAL_ARC_START = 0;
const HOME_BASE_RADIAL_ARC_END = Math.PI;

export interface HomeBaseRadialPoint {
  x: number;
  y: number;
}

export interface HomeBaseRadialViewport {
  width: number;
  height: number;
}

export interface HomeBaseRadialTargetPosition<Id extends string = string>
  extends HomeBaseRadialPoint {
  id: Id;
  angle: number;
}

export type HomeBaseRadialGestureState<Id extends string = string> =
  | { phase: "idle" }
  | { phase: "pressing"; pointerId: number }
  | { phase: "open"; pointerId: number | null; highlightedId: Id | null }
  | { phase: "igniting"; selectedId: Id };

export type HomeBaseRadialGestureEvent<Id extends string = string> =
  | { type: "press"; pointerId: number }
  | { type: "hold"; pointerId: number }
  | { type: "open-keyboard"; initialId: Id | null }
  | { type: "aim"; targetId: Id | null }
  | { type: "release"; targetId: Id | null; sourceInside: boolean }
  | { type: "select"; targetId: Id }
  | { type: "cancel" }
  | { type: "finish" };

export interface HomeBaseRadialTransition<Id extends string = string> {
  state: HomeBaseRadialGestureState<Id>;
  effect: "activate-source" | "select-target" | null;
}

/**
 * Pure gesture contract shared by pointer and keyboard input. Once a target is
 * igniting, duplicate release/select events are ignored so navigation fires
 * only from the single transition into that phase.
 */
export function transitionHomeBaseRadialGesture<Id extends string>(
  state: HomeBaseRadialGestureState<Id>,
  event: HomeBaseRadialGestureEvent<Id>,
): HomeBaseRadialTransition<Id> {
  if (event.type === "cancel" || event.type === "finish") {
    return { state: { phase: "idle" }, effect: null };
  }
  if (state.phase === "igniting") {
    return { state, effect: null };
  }
  if (event.type === "press" && state.phase === "idle") {
    return {
      state: { phase: "pressing", pointerId: event.pointerId },
      effect: null,
    };
  }
  if (event.type === "hold" && state.phase === "pressing") {
    if (state.pointerId !== event.pointerId) return { state, effect: null };
    return {
      state: {
        phase: "open",
        pointerId: event.pointerId,
        highlightedId: null,
      },
      effect: null,
    };
  }
  if (event.type === "open-keyboard" && state.phase === "idle") {
    return {
      state: {
        phase: "open",
        pointerId: null,
        highlightedId: event.initialId,
      },
      effect: null,
    };
  }
  if (event.type === "aim" && state.phase === "open") {
    return {
      state: { ...state, highlightedId: event.targetId },
      effect: null,
    };
  }
  if (event.type === "release" && state.phase === "pressing") {
    return {
      state: { phase: "idle" },
      effect: event.sourceInside ? "activate-source" : null,
    };
  }
  if (
    (event.type === "release" || event.type === "select") &&
    state.phase === "open"
  ) {
    const targetId = event.targetId;
    if (targetId === null) {
      return { state: { phase: "idle" }, effect: null };
    }
    return {
      state: { phase: "igniting", selectedId: targetId },
      effect: "select-target",
    };
  }
  return { state, effect: null };
}

/** Calculates a wide lower-hemisphere launcher with stacked arcs when crowded. */
export function homeBaseRadialTargetLayout<Id extends string>(
  targetIds: readonly Id[],
  source: HomeBaseRadialPoint,
  viewport: HomeBaseRadialViewport,
): HomeBaseRadialTargetPosition<Id>[] {
  if (targetIds.length === 0) return [];
  const targetRadius = resolveHomeBaseRadialTargetRadius(
    viewport.width,
    viewport.height,
    source,
  );
  if (targetRadius <= 0) return [];
  const edge = targetRadius + HOME_BASE_RADIAL_EDGE_PADDING_PX;
  const maxRadiusX = Math.max(
    0,
    Math.min(source.x - edge, viewport.width - source.x - edge),
  );
  const maxRadiusY = Math.max(0, viewport.height - source.y - edge);
  if (maxRadiusX === 0 || maxRadiusY === 0) {
    return [];
  }
  const minRadiusPx = Math.max(
    targetRadius + HOME_BASE_RADIAL_TARGET_GUTTER_PX,
    Math.min(targetRadius, HOME_BASE_RADIAL_TARGET_RADIUS_MIN_PX + HOME_BASE_RADIAL_EDGE_PADDING_PX),
  );
  const baseRadiusX = clampToCap(
    Math.min(maxRadiusX * HOME_BASE_RADIAL_USE_RADIUS_X, HOME_BASE_RADIAL_BASE_RADIUS_X_MAX_PX),
    minRadiusPx,
    maxRadiusX,
  );
  const baseRadiusY = clampToCap(
    Math.min(maxRadiusY * HOME_BASE_RADIAL_USE_RADIUS_Y, HOME_BASE_RADIAL_BASE_RADIUS_Y_MAX_PX),
    minRadiusPx,
    maxRadiusY,
  );
  const arcSpan = HOME_BASE_RADIAL_ARC_END - HOME_BASE_RADIAL_ARC_START;
  const targetDiameter = targetRadius * 2;
  const minimumAngleForTarget = (radiusX: number, radiusY: number): number => {
    const minRadius = Math.max(0.0001, Math.min(radiusX, radiusY));
    const spacing = targetDiameter + HOME_BASE_RADIAL_TARGET_GUTTER_PX;
    return spacing / minRadius;
  };
  const rowCapacity = (radiusX: number, radiusY: number): number =>
    Math.max(1, Math.floor(arcSpan / minimumAngleForTarget(radiusX, radiusY)) + 1);

  const placeRow = (
    ids: readonly Id[],
    count: number,
    radiusX: number,
    radiusY: number,
    sourceOffset: number,
    rowOffsetY: number,
  ): void => {
    const step = count <= 1 ? 0 : arcSpan / (count - 1);
    const localAngles = Array.from({ length: count }, (_, index) => {
      return HOME_BASE_RADIAL_ARC_START + step * index;
    });
    for (let index = 0; index < count; index++) {
      const angle = localAngles[index];
      const id = ids[sourceOffset + index];
      if (!id) continue;
      targetPositions.push({
        id,
        angle,
        x: clamp(source.x + Math.cos(angle) * radiusX, edge, viewport.width - edge),
        y: clamp(
          source.y + rowOffsetY + Math.sin(angle) * radiusY,
          edge,
          viewport.height - edge,
        ),
      });
    }
  };

  const targetPositions: HomeBaseRadialTargetPosition<Id>[] = [];
  let remaining = targetIds.length;
  let radiusX = baseRadiusX;
  let radiusY = baseRadiusY;
  let rowOffsetY = 0;
  while (remaining > 0) {
    const rowCount = rowCapacity(radiusX, radiusY);
    const taken = Math.min(remaining, rowCount);
    const rowStartId = targetIds.length - remaining;
    placeRow(targetIds, taken, radiusX, radiusY, rowStartId, rowOffsetY);
    remaining -= taken;
    if (remaining <= 0) break;

    const nextRadiusX = Math.max(
      minRadiusPx,
      radiusX - HOME_BASE_RADIAL_ROW_STEP_PX,
    );
    const nextRadiusY = Math.max(
      minRadiusPx,
      radiusY - HOME_BASE_RADIAL_ROW_STEP_PX,
    );

    const nextOffsetY = rowOffsetY + HOME_BASE_RADIAL_ROW_STEP_PX;
    if (nextOffsetY > maxRadiusY - nextRadiusY) {
      const safeOffsetY = Math.max(0, maxRadiusY - nextRadiusY);
      placeRow(
        targetIds,
        remaining,
        nextRadiusX,
        nextRadiusY,
        targetIds.length - remaining,
        safeOffsetY,
      );
      break;
    }

    radiusX = clampToCap(nextRadiusX, minRadiusPx, maxRadiusX);
    radiusY = clampToCap(nextRadiusY, minRadiusPx, maxRadiusY);
    rowOffsetY = nextOffsetY;
  }
  return targetPositions;
}

export function homeBaseRadialTargetAtPoint<Id extends string>(
  targets: readonly HomeBaseRadialTargetPosition<Id>[],
  point: HomeBaseRadialPoint,
  radius = HOME_BASE_RADIAL_TARGET_RADIUS_PX,
): Id | null {
  let nearest: { id: Id; distance: number } | null = null;
  for (const target of targets) {
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= radius && (!nearest || distance < nearest.distance)) {
      nearest = { id: target.id, distance };
    }
  }
  return nearest?.id ?? null;
}

export function resolveHomeBaseRadialTargetRadius(
  viewportWidth: number,
  viewportHeight: number,
  source: HomeBaseRadialPoint,
): number {
  const maxRadiusX = Math.max(
    0,
    Math.min(source.x, viewportWidth - source.x),
  );
  const maxRadiusY = Math.max(0, viewportHeight - source.y);
  if (maxRadiusX <= 0 || maxRadiusY <= 0) {
    return 0;
  }
  const targetBudget = Math.min(maxRadiusX, maxRadiusY);
  return clamp(
    targetBudget * HOME_BASE_RADIAL_TARGET_RADIUS_VIEWPORT_SCALE,
    HOME_BASE_RADIAL_TARGET_RADIUS_MIN_PX,
    HOME_BASE_RADIAL_TARGET_RADIUS_PX,
  );
}

export interface HomeBaseRadialRayGeometry {
  distance: number;
  endDistance: number;
  sourceWidth: number;
  targetWidth: number;
  points: string;
}

/** Returns a four-point light beam that becomes finer as the aim extends. */
export function homeBaseRadialRayGeometry(
  source: HomeBaseRadialPoint,
  pointer: HomeBaseRadialPoint,
  endInsetPx = 0,
): HomeBaseRadialRayGeometry {
  const dx = pointer.x - source.x;
  const dy = pointer.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    return {
      distance: 0,
      endDistance: 0,
      sourceWidth: 10,
      targetWidth: 5.5,
      points: "",
    };
  }
  const endDistance = Math.max(0, distance - Math.max(0, endInsetPx));
  const endX = source.x + (dx / distance) * endDistance;
  const endY = source.y + (dy / distance) * endDistance;
  const nx = -dy / distance;
  const ny = dx / distance;
  const sourceWidth = 10;
  const targetWidth = clamp(5.5 - distance / 58, 1.25, 5.5);
  const points = [
    [source.x + nx * sourceWidth, source.y + ny * sourceWidth],
    [endX + nx * targetWidth, endY + ny * targetWidth],
    [endX - nx * targetWidth, endY - ny * targetWidth],
    [source.x - nx * sourceWidth, source.y - ny * sourceWidth],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  return { distance, endDistance, sourceWidth, targetWidth, points };
}

export function nextHomeBaseRadialTargetIndex(
  currentIndex: number,
  targetCount: number,
  direction: 1 | -1,
): number {
  if (targetCount <= 0) return -1;
  const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
  return (safeCurrent + direction + targetCount) % targetCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampToCap(
  value: number,
  min: number,
  cap: number,
): number {
  if (cap <= 0) return 0;
  const lower = Math.min(min, cap);
  return clamp(value, lower, cap);
}
