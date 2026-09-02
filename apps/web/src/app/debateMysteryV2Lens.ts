interface MysteryLensPoint {
  x: number;
  y: number;
}

export interface MysteryLensHotspot {
  id: string;
  polygon: MysteryLensPoint[];
  unlocked: boolean;
  examined: boolean;
}

export interface MysteryLensState {
  x: number;
  y: number;
  proximity: number;
  hotspotId: string | null;
}

export const DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS = 24;
export const DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS = 15;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function pointLiesOnSegment(
  point: MysteryLensPoint,
  start: MysteryLensPoint,
  end: MysteryLensPoint,
): boolean {
  const cross = (point.x - start.x) * (end.y - start.y) -
    (point.y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > 0.0001) return false;
  return (point.x - start.x) * (point.x - end.x) +
    (point.y - start.y) * (point.y - end.y) <= 0.0001;
}

export function debateMysteryV2PointInHotspot(
  point: MysteryLensPoint,
  polygon: readonly MysteryLensPoint[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (pointLiesOnSegment(point, current, prior)) return true;
    const crosses = (current.y > point.y) !== (prior.y > point.y) &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function debateMysteryV2HotspotArea(
  polygon: readonly MysteryLensPoint[],
): number {
  return Math.abs(polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? point;
    return area + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

export function debateMysteryV2HotspotCenter(
  polygon: readonly MysteryLensPoint[],
): MysteryLensPoint {
  if (polygon.length === 0) return { x: 50, y: 50 };
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return {
    x: clampPercent((Math.min(...xs) + Math.max(...xs)) / 2),
    y: clampPercent((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

export function debateMysteryV2HotspotFocusPoint(
  polygon: readonly MysteryLensPoint[],
): MysteryLensPoint {
  const center = debateMysteryV2HotspotCenter(polygon);
  if (debateMysteryV2PointInHotspot(center, polygon)) return center;
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (let row = 1; row < 10; row += 1) {
    for (let column = 1; column < 10; column += 1) {
      const point = { x: minX + ((maxX - minX) * column) / 10, y: minY + ((maxY - minY) * row) / 10 };
      if (debateMysteryV2PointInHotspot(point, polygon)) return point;
    }
  }
  return polygon[0] ?? center;
}

export function resolveDebateMysteryV2Lens(
  x: number,
  y: number,
  hotspots: readonly MysteryLensHotspot[],
): MysteryLensState {
  const lensX = clampPercent(x);
  const lensY = clampPercent(y);
  const point = { x: lensX, y: lensY };
  let target: { id: string; area: number } | null = null;
  for (const hotspot of hotspots) {
    if (!hotspot.unlocked || hotspot.examined) continue;
    if (!debateMysteryV2PointInHotspot(point, hotspot.polygon)) continue;
    const area = debateMysteryV2HotspotArea(hotspot.polygon);
    if (!target || area < target.area) target = { id: hotspot.id, area };
  }
  return {
    x: lensX,
    y: lensY,
    proximity: target ? 1 : 0,
    hotspotId: target?.id ?? null,
  };
}

/**
 * The glow and click share one containment contract; a target exists only
 * when the lens sits inside its eligible polygon.
 */
export function debateMysteryV2LensClickTarget(
  lens: Pick<MysteryLensState, "hotspotId" | "proximity">,
): string | null {
  return lens.hotspotId;
}

export function debateMysteryV2ExamineGridCellIndexes(
  lens: Pick<MysteryLensState, "x" | "y" | "hotspotId">,
  hotspots: readonly MysteryLensHotspot[],
  columns: number = DEBATE_MYSTERY_V2_EXAMINE_GRID_COLUMNS,
  rows: number = DEBATE_MYSTERY_V2_EXAMINE_GRID_ROWS,
): number[] {
  const target = hotspots.find((hotspot) => hotspot.id === lens.hotspotId);
  if (!target || !target.unlocked || target.examined) return [];
  if (!debateMysteryV2PointInHotspot({ x: lens.x, y: lens.y }, target.polygon)) return [];
  const radius = 4.6;
  const cells = new Set<number>();
  const lensColumn = Math.min(columns - 1, Math.max(0, Math.floor((lens.x / 100) * columns)));
  const lensRow = Math.min(rows - 1, Math.max(0, Math.floor((lens.y / 100) * rows)));
  cells.add(lensRow * columns + lensColumn);
  const firstColumn = Math.max(0, Math.floor(((lens.x - radius) / 100) * columns));
  const lastColumn = Math.min(columns - 1, Math.ceil(((lens.x + radius) / 100) * columns));
  const firstRow = Math.max(0, Math.floor(((lens.y - radius) / 100) * rows));
  const lastRow = Math.min(rows - 1, Math.ceil(((lens.y + radius) / 100) * rows));
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const point = { x: ((column + 0.5) / columns) * 100, y: ((row + 0.5) / rows) * 100 };
      if (Math.hypot(point.x - lens.x, point.y - lens.y) <= radius && debateMysteryV2PointInHotspot(point, target.polygon)) cells.add(row * columns + column);
    }
  }
  return [...cells].sort((left, right) => left - right);
}

export function debateMysteryV2RoomComplete(
  hotspots: readonly Pick<MysteryLensHotspot, "examined">[],
): boolean {
  return hotspots.length > 0 && hotspots.every((hotspot) => hotspot.examined);
}

export function debateMysteryV2ExaminationCompletesRoom(
  hotspots: readonly Pick<MysteryLensHotspot, "id" | "examined">[],
  hotspotId: string,
): boolean {
  return hotspots.length > 0 && hotspots.every(
    (hotspot) => hotspot.examined || hotspot.id === hotspotId,
  );
}
