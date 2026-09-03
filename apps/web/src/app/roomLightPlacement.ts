import {
  mansionDirectionalGeometryIsPolygonV2,
  mansionDirectionalLightPolygonV2,
  mansionDynamicLightCenterV2,
  mansionGodrayParallelPointsV2,
  type MansionDirectionalLightV2,
  type MansionDynamicLightV2,
  type MansionLightBlendModeV1,
} from "@localai/shared";

export type LightPoint = { x: number; y: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function roomLightPoint(client: LightPoint, rect: { left: number; top: number; width: number; height: number }): LightPoint {
  return { x: clamp((client.x - rect.left) / rect.width), y: clamp((client.y - rect.top) / rect.height) };
}

export function roomLightCenter(light: MansionDynamicLightV2): LightPoint {
  return mansionDynamicLightCenterV2(light);
}

/** Slides a point set as one body; the whole shape stays inside the room. */
function translatePoints(points: readonly LightPoint[], delta: LightPoint): LightPoint[] {
  const dx = Math.max(-Math.min(...points.map((p) => p.x)), Math.min(1 - Math.max(...points.map((p) => p.x)), delta.x));
  const dy = Math.max(-Math.min(...points.map((p) => p.y)), Math.min(1 - Math.max(...points.map((p) => p.y)), delta.y));
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function moveRoomLight(light: MansionDynamicLightV2, delta: LightPoint): MansionDynamicLightV2 {
  if (light.kind === "neon") {
    return { ...light, geometry: { ...light.geometry, points: translatePoints(light.geometry.points, delta) } };
  }
  if (light.kind === "directional") {
    const geometry = light.geometry;
    if (mansionDirectionalGeometryIsPolygonV2(geometry)) {
      return { ...light, geometry: { points: translatePoints(geometry.points, delta) } };
    }
    return { ...light, geometry: { ...geometry, x: clamp(geometry.x + delta.x), y: clamp(geometry.y + delta.y) } };
  }
  const x = clamp(light.geometry.x + delta.x);
  const y = clamp(light.geometry.y + delta.y);
  if (light.kind === "omni") return { ...light, geometry: { ...light.geometry, x, y } };
  return { ...light, geometry: { ...light.geometry, x, y } };
}

/** Godray corners for handles. A legacy rectangle expands in the stage's aspect. */
export function directionalRoomLightPoints(light: MansionDirectionalLightV2, aspect: number): LightPoint[] {
  return mansionDirectionalLightPolygonV2(light, aspect);
}

/** Dragging any corner converts a legacy rectangle into an editable polygon. */
export function setDirectionalRoomLightPoint(
  light: MansionDirectionalLightV2, index: number, point: LightPoint, aspect: number,
): MansionDirectionalLightV2 {
  const points = directionalRoomLightPoints(light, aspect)
    .map((old, position) => position === index ? { x: clamp(point.x), y: clamp(point.y) } : old);
  return { ...light, geometry: { points } };
}

/** Neutral warm white for a light whose room color could not be sampled. */
export const ROOM_LIGHT_DEFAULT_COLOR = "#ffe6c7";

export function createRoomLight(
  roomId: string, kind: MansionDynamicLightV2["kind"], point: LightPoint, id: string, color?: string,
): MansionDynamicLightV2 {
  const base = { id, roomId, color: color ?? (kind === "neon" ? "#66e5ea" : "#ffb067"), intensity: 0.72, animationSeed: id,
    cuePermission: { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] } };
  if (kind === "fire") return { ...base, kind, animation: "flicker", geometry: { ...point, radius: 0.18, rotation: 0 } };
  if (kind === "omni") return { ...base, kind, geometry: { ...point, radius: 0.18 } };
  if (kind === "directional") {
    // A window edge at the click with the ray falling toward the room's center.
    const top = { x: point.x, y: clamp(point.y - 0.1) };
    const bottom = { x: point.x, y: clamp(point.y + 0.06) };
    const ray = { x: point.x > 0.5 ? -0.26 : 0.26, y: 0.3 };
    const points = mansionGodrayParallelPointsV2([
      top, bottom, { x: bottom.x + ray.x, y: bottom.y + ray.y }, { x: top.x + ray.x, y: top.y + ray.y },
    ]);
    return { ...base, kind, dust: true, geometry: { points } };
  }
  // A visible segment, including when placed at the edge; never a zero-length stroke.
  const start = Math.min(0.88, Math.max(0, point.x - 0.06));
  return { ...base, kind, geometry: { points: [{ x: start, y: point.y }, { x: start + 0.12, y: point.y }], width: 0.012 } };
}

export function roomLightBlend(mode: MansionLightBlendModeV1 | undefined, artStyle: "mosaic" | "illustrated"): string {
  return !mode || mode === "auto" ? artStyle === "mosaic" ? "hard-light" : "overlay" : mode;
}

/** A copy with its own identity and seed, offset so both markers stay grabbable.
 * The offset turns inward on any axis where the shape already touches the edge. */
export function cloneRoomLight(source: MansionDynamicLightV2, id: string): MansionDynamicLightV2 {
  const copy = { ...(structuredClone(source) as MansionDynamicLightV2), id, animationSeed: id };
  const points = copy.kind === "neon" || (copy.kind === "directional" && mansionDirectionalGeometryIsPolygonV2(copy.geometry))
    ? (copy.geometry as { points: LightPoint[] }).points
    : [roomLightCenter(copy)];
  const step = 0.04;
  const delta = {
    x: Math.max(...points.map((point) => point.x)) + step > 1 ? -step : step,
    y: Math.max(...points.map((point) => point.y)) + step > 1 ? -step : step,
  };
  return moveRoomLight(copy, delta);
}

/** Sampling radius around a placed light, in the room art's natural pixels. */
export const ROOM_LIGHT_SAMPLE_RADIUS_PX = 64;

/** The brightest coherent color inside an ellipse of RGBA pixels. Colors are
 * binned coarsely; a bin must hold a few percent of the samples so one stray
 * specular pixel cannot outvote the lamp shade or window glow around it. */
export function sampleNaturalRoomLightColor(args: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}): string | null {
  const bins = new Map<number, { red: number; green: number; blue: number; count: number }>();
  let total = 0;
  const minX = Math.max(0, Math.floor(args.centerX - args.radiusX));
  const maxX = Math.min(args.width - 1, Math.ceil(args.centerX + args.radiusX));
  const minY = Math.max(0, Math.floor(args.centerY - args.radiusY));
  const maxY = Math.min(args.height - 1, Math.ceil(args.centerY + args.radiusY));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5 - args.centerX) / Math.max(1e-6, args.radiusX);
      const dy = (y + 0.5 - args.centerY) / Math.max(1e-6, args.radiusY);
      if (dx * dx + dy * dy > 1) continue;
      const offset = (y * args.width + x) * 4;
      if ((args.data[offset + 3] ?? 0) < 8) continue;
      const red = args.data[offset]!; const green = args.data[offset + 1]!; const blue = args.data[offset + 2]!;
      const key = (red >> 3) << 10 | (green >> 3) << 5 | (blue >> 3);
      const bin = bins.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
      bin.red += red; bin.green += green; bin.blue += blue; bin.count += 1;
      bins.set(key, bin);
      total += 1;
    }
  }
  if (total === 0) return null;
  const luminance = (bin: { red: number; green: number; blue: number; count: number }) =>
    (0.2126 * bin.red + 0.7152 * bin.green + 0.0722 * bin.blue) / bin.count;
  const coherent = [...bins.values()].filter((bin) => bin.count >= Math.max(3, total * 0.04));
  const candidates = coherent.length ? coherent : [...bins.values()];
  const best = candidates.reduce((winner, bin) => luminance(bin) > luminance(winner) ? bin : winner);
  const hex = (sum: number) => Math.round(sum / best.count).toString(16).padStart(2, "0");
  return `#${hex(best.red)}${hex(best.green)}${hex(best.blue)}`;
}

/** Samples the room art around a normalized point. Returns null when the image
 * cannot be read (not yet loaded, or cross-origin tainted). */
export function sampleRoomLightColorFromImage(image: HTMLImageElement, point: LightPoint): string | null {
  try {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!image.complete || width === 0 || height === 0) return null;
    const radius = ROOM_LIGHT_SAMPLE_RADIUS_PX;
    const size = radius * 2;
    const left = Math.round(clamp(point.x) * width - radius);
    const top = Math.round(clamp(point.y) * height - radius);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, left, top, size, size, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    return sampleNaturalRoomLightColor({
      data, width: size, height: size, centerX: radius, centerY: radius, radiusX: radius, radiusY: radius,
    });
  } catch {
    return null;
  }
}
