interface MysteryLensPoint {
  x: number;
  y: number;
}

export interface MysteryLensSurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a viewport point through the fitted room-art plane. Letterboxed
 * space is intentionally inert so it cannot select an edge hotspot.
 */
export function debateMysteryV2ImagePointFromClientPoint(
  point: { clientX: number; clientY: number },
  surface: MysteryLensSurfaceRect,
): MysteryLensPoint | null {
  if (surface.width <= 0 || surface.height <= 0) return null;
  const x = (point.clientX - surface.left) / surface.width;
  const y = (point.clientY - surface.top) / surface.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: x * 100, y: y * 100 };
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
  let target: { id: string; area: number; examined: boolean } | null = null;
  for (const hotspot of hotspots) {
    if (!hotspot.unlocked) continue;
    if (!debateMysteryV2PointInHotspot(point, hotspot.polygon)) continue;
    const area = debateMysteryV2HotspotArea(hotspot.polygon);
    // An examined specific region still owns its footprint. It must not
    // reveal an overlapping broad ambient parent, but smaller details remain.
    if (!target || area < target.area || (area === target.area && !hotspot.examined)) {
      target = { id: hotspot.id, area, examined: hotspot.examined };
    }
  }
  if (target?.examined) target = null;
  return {
    x: lensX,
    y: lensY,
    proximity: target ? 1 : 0,
    hotspotId: target?.id ?? null,
  };
}

/** Find a point actually owned by this target, not a reviewed overlap or a
 * smaller neighboring detail. Keyboard focus uses exactly the pointer resolver. */
export function debateMysteryV2HotspotAccessiblePoint(
  hotspot: MysteryLensHotspot,
  hotspots: readonly MysteryLensHotspot[],
): MysteryLensPoint | null {
  if (!hotspot.unlocked || hotspot.examined) return null;
  const center = debateMysteryV2HotspotFocusPoint(hotspot.polygon);
  const owns = (point: MysteryLensPoint): boolean => resolveDebateMysteryV2Lens(point.x, point.y, hotspots).hotspotId === hotspot.id;
  if (owns(center)) return center;
  const xs = hotspot.polygon.map((point) => point.x);
  const ys = hotspot.polygon.map((point) => point.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  const width = Math.max(...xs) - left, height = Math.max(...ys) - top;
  for (let row = 0; row <= 32; row += 1) {
    for (let column = 0; column <= 32; column += 1) {
      const point = { x: left + width * column / 32, y: top + height * row / 32 };
      if (owns(point)) return point;
    }
  }
  // A fixed probe grid can miss a thin remaining strip. Sweep the polygon
  // arrangement instead: edge order is stable between vertices/intersections,
  // so every nonempty ownership interval has a representative midpoint.
  const edges = hotspots.filter((entry) => entry.unlocked).flatMap((entry) =>
    entry.polygon.map((start, index) => ({ start, end: entry.polygon[(index + 1) % entry.polygon.length]! })));
  const criticalX = new Set(edges.flatMap(({ start, end }) => [start.x, end.x]));
  for (let i = 0; i < edges.length; i += 1) {
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length; j += 1) {
      const b = edges[j]!;
      const ax = a.end.x - a.start.x, ay = a.end.y - a.start.y;
      const bx = b.end.x - b.start.x, by = b.end.y - b.start.y;
      const cross = ax * by - ay * bx;
      if (Math.abs(cross) < 1e-10) continue;
      const dx = b.start.x - a.start.x, dy = b.start.y - a.start.y;
      const t = (dx * by - dy * bx) / cross;
      const u = (dx * ay - dy * ax) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) criticalX.add(a.start.x + t * ax);
    }
  }
  const withMidpoints = (values: number[]): number[] => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    return sorted.flatMap((value, index) => index ? [(sorted[index - 1]! + value) / 2, value] : [value]);
  };
  for (const x of withMidpoints([...criticalX]).filter((value) => value >= left && value <= left + width)) {
    const crossings = edges.flatMap(({ start, end }) => {
      if (x < Math.min(start.x, end.x) || x > Math.max(start.x, end.x)) return [];
      if (start.x === end.x) return [start.y, end.y];
      return [start.y + (x - start.x) * (end.y - start.y) / (end.x - start.x)];
    });
    for (const y of withMidpoints(crossings)) {
      if (owns({ x, y })) return { x, y };
    }
  }
  return null;
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
  // The coarse grid is continuous pointer feedback, while hotspot eligibility
  // controls only the hand cursor and click target. A stale non-null target is
  // still rejected so state changes cannot illuminate the wrong clue.
  if (lens.hotspotId !== null) {
    const target = hotspots.find((hotspot) => hotspot.id === lens.hotspotId);
    if (!target || !target.unlocked || target.examined) return [];
    if (resolveDebateMysteryV2Lens(lens.x, lens.y, hotspots).hotspotId !== target.id) return [];
    if (!debateMysteryV2PointInHotspot({ x: lens.x, y: lens.y }, target.polygon)) return [];
  }
  const column = Math.min(columns - 1, Math.max(0, Math.floor((lens.x / 100) * columns)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((lens.y / 100) * rows)));
  return [row * columns + column];
}

export function debateMysteryV2RoomComplete(
  hotspots: readonly Pick<MysteryLensHotspot, "examined">[],
): boolean {
  return hotspots.every((hotspot) => hotspot.examined);
}

export function debateMysteryV2ExaminationCompletesRoom(
  hotspots: readonly Pick<MysteryLensHotspot, "id" | "examined">[],
  hotspotId: string,
): boolean {
  return hotspots.length > 0 && hotspots.every(
    (hotspot) => hotspot.examined || hotspot.id === hotspotId,
  );
}
