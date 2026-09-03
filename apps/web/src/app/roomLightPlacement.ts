import {
  mansionDirectionalGeometryIsPolygonV2,
  mansionDirectionalLightPolygonV2,
  mansionDynamicLightCenterV2,
  mansionGodrayAimV2,
  mansionGodrayDescribeV2,
  mansionGodrayFromApertureV2,
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

/** A godray as the editor places it: aperture, landing, spread, direction, length. */
export function godrayRoomLightDescription(light: MansionDirectionalLightV2, aspect: number) {
  return mansionGodrayDescribeV2(directionalRoomLightPoints(light, aspect));
}

/** Moves one aperture corner; direction, length, and spread carry over so the far edge follows. */
export function setGodrayAperturePoint(
  light: MansionDirectionalLightV2, index: 0 | 1, point: LightPoint, aspect: number,
): MansionDirectionalLightV2 {
  const described = godrayRoomLightDescription(light, aspect);
  const corner = { x: clamp(point.x), y: clamp(point.y) };
  const aperture: [LightPoint, LightPoint] = index === 0 ? [corner, described.aperture[1]] : [described.aperture[0], corner];
  const mid = { x: (aperture[0].x + aperture[1].x) / 2, y: (aperture[0].y + aperture[1].y) / 2 };
  const landing = { x: mid.x + described.direction.x * described.length, y: mid.y + described.direction.y * described.length };
  return { ...light, geometry: { points: mansionGodrayFromApertureV2(aperture, landing, described.spread) } };
}

/** Drags where the ray lands: angle and length in one gesture. */
export function setGodrayLanding(light: MansionDirectionalLightV2, point: LightPoint, aspect: number): MansionDirectionalLightV2 {
  const described = godrayRoomLightDescription(light, aspect);
  return { ...light, geometry: { points: mansionGodrayFromApertureV2(described.aperture, { x: clamp(point.x), y: clamp(point.y) }, described.spread) } };
}

export function setGodraySpread(light: MansionDirectionalLightV2, spread: number, aspect: number): MansionDirectionalLightV2 {
  const described = godrayRoomLightDescription(light, aspect);
  return { ...light, geometry: { points: mansionGodrayFromApertureV2(described.aperture, described.landing, spread) } };
}

/** Re-aims a beam along a shared unit direction, keeping its own length and spread. */
export function aimGodray(light: MansionDirectionalLightV2, direction: LightPoint, aspect: number): MansionDirectionalLightV2 {
  return { ...light, geometry: { points: mansionGodrayAimV2(directionalRoomLightPoints(light, aspect), direction) } };
}

/** The room's sun: the mean direction of its beams that follow the shared sun, or null. */
export function roomSunDirection(lights: readonly MansionDynamicLightV2[], aspect: number, exceptId?: string): LightPoint | null {
  let x = 0; let y = 0; let count = 0;
  for (const light of lights) {
    if (light.kind !== "directional" || light.freeDirection || light.id === exceptId) continue;
    const { direction } = godrayRoomLightDescription(light, aspect);
    x += direction.x; y += direction.y; count += 1;
  }
  const length = Math.hypot(x, y);
  return count > 0 && length > 1e-6 ? { x: x / length, y: y / length } : null;
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
    // A window edge at the click with the ray falling toward the room's center and a little scatter.
    const top = { x: point.x, y: clamp(point.y - 0.1) };
    const bottom = { x: point.x, y: clamp(point.y + 0.06) };
    const ray = { x: point.x > 0.5 ? -0.26 : 0.26, y: 0.3 };
    const mid = { x: point.x, y: (top.y + bottom.y) / 2 };
    const points = mansionGodrayFromApertureV2([top, bottom], { x: mid.x + ray.x, y: mid.y + ray.y }, 0.12);
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

const ROOM_LIGHT_HUE_BIN_COUNT = 12;
const ROOM_LIGHT_NEUTRAL_SATURATION = 0.12;
const ROOM_LIGHT_STRONGEST_CLUSTER_SIZE = 32;
const ROOM_LIGHT_MIN_COHERENT_PIXELS = 3;
const ROOM_LIGHT_MIN_ALPHA = 8;
const ROOM_LIGHT_EDGE_DISTANCE_WEIGHT = 0.25;
const ROOM_LIGHT_CENTER_DISTANCE_WEIGHT = 0.75;
const ROOM_LIGHT_BASE_SELECTION_WEIGHT = 0.5;
const ROOM_LIGHT_SATURATION_SELECTION_WEIGHT = 0.5;
const COLOR_CHANNEL_MAX = 255;
const HUE_CIRCLE_DEGREES = 360;
const HUE_SECTOR_DEGREES = 60;

interface RoomLightColorCandidate {
  red: number;
  green: number;
  blue: number;
  selectionScore: number;
  colorWeight: number;
}

function roomLightPixelLuminance(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / COLOR_CHANNEL_MAX;
}

function roomLightPixelSaturation(red: number, green: number, blue: number): number {
  const maximum = Math.max(red, green, blue);
  return maximum === 0 ? 0 : (maximum - Math.min(red, green, blue)) / maximum;
}

function roomLightPixelHue(red: number, green: number, blue: number): number {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  if (chroma === 0) return 0;
  if (maximum === red) return (((green - blue) / chroma + 6) % 6) * HUE_SECTOR_DEGREES;
  if (maximum === green) return ((blue - red) / chroma + 2) * HUE_SECTOR_DEGREES;
  return ((red - green) / chroma + 4) * HUE_SECTOR_DEGREES;
}

function roomLightColorClusterKey(red: number, green: number, blue: number, saturation: number): number {
  if (saturation < ROOM_LIGHT_NEUTRAL_SATURATION) return ROOM_LIGHT_HUE_BIN_COUNT;
  const binSize = HUE_CIRCLE_DEGREES / ROOM_LIGHT_HUE_BIN_COUNT;
  return Math.floor(((roomLightPixelHue(red, green, blue) + binSize / 2) % HUE_CIRCLE_DEGREES) / binSize);
}

function retainStrongestRoomLightColor(
  candidates: RoomLightColorCandidate[],
  candidate: RoomLightColorCandidate,
): void {
  candidates.push(candidate);
  candidates.sort((left, right) => right.selectionScore - left.selectionScore);
  if (candidates.length > ROOM_LIGHT_STRONGEST_CLUSTER_SIZE) candidates.pop();
}

function roomLightColorClusterScore(candidates: readonly RoomLightColorCandidate[]): number {
  if (!candidates.length) return 0;
  const average = candidates.reduce((sum, candidate) => sum + candidate.selectionScore, 0) / candidates.length;
  const coherence = Math.min(1, candidates.length / ROOM_LIGHT_MIN_COHERENT_PIXELS);
  return average * coherence;
}

/** The brightest coherent color inside an ellipse of RGBA pixels. Each hue
 * competes using only its strongest nearby pixels, so a broad neutral wall
 * cannot outvote a compact lamp while isolated specular noise stays weak. */
export function sampleNaturalRoomLightColor(args: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}): string | null {
  const clusters = new Map<number, RoomLightColorCandidate[]>();
  const minX = Math.max(0, Math.floor(args.centerX - args.radiusX));
  const maxX = Math.min(args.width - 1, Math.ceil(args.centerX + args.radiusX));
  const minY = Math.max(0, Math.floor(args.centerY - args.radiusY));
  const maxY = Math.min(args.height - 1, Math.ceil(args.centerY + args.radiusY));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5 - args.centerX) / Math.max(1e-6, args.radiusX);
      const dy = (y + 0.5 - args.centerY) / Math.max(1e-6, args.radiusY);
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 1) continue;
      const offset = (y * args.width + x) * 4;
      const alpha = args.data[offset + 3] ?? 0;
      if (alpha < ROOM_LIGHT_MIN_ALPHA) continue;
      const red = args.data[offset]!; const green = args.data[offset + 1]!; const blue = args.data[offset + 2]!;
      const luminance = roomLightPixelLuminance(red, green, blue);
      const saturation = roomLightPixelSaturation(red, green, blue);
      const distanceWeight = ROOM_LIGHT_EDGE_DISTANCE_WEIGHT +
        (1 - distanceSquared) * ROOM_LIGHT_CENTER_DISTANCE_WEIGHT;
      const colorWeight = luminance * distanceWeight * (alpha / COLOR_CHANNEL_MAX);
      const selectionScore = colorWeight *
        (ROOM_LIGHT_BASE_SELECTION_WEIGHT + saturation * ROOM_LIGHT_SATURATION_SELECTION_WEIGHT);
      const key = roomLightColorClusterKey(red, green, blue, saturation);
      const candidates = clusters.get(key) ?? [];
      retainStrongestRoomLightColor(candidates, { red, green, blue, selectionScore, colorWeight });
      clusters.set(key, candidates);
    }
  }
  if (!clusters.size) return null;
  const winner = [...clusters.values()].reduce((best, candidates) =>
    roomLightColorClusterScore(candidates) > roomLightColorClusterScore(best) ? candidates : best,
  );
  const totalWeight = winner.reduce((sum, candidate) => sum + candidate.colorWeight, 0);
  if (totalWeight === 0) return null;
  const channel = (select: (candidate: RoomLightColorCandidate) => number) =>
    Math.round(winner.reduce((sum, candidate) => sum + select(candidate) * candidate.colorWeight, 0) / totalWeight)
      .toString(16).padStart(2, "0");
  return `#${channel((candidate) => candidate.red)}${channel((candidate) => candidate.green)}${channel((candidate) => candidate.blue)}`;
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
