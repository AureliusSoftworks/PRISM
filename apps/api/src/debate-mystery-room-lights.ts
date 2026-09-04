import { randomUUID } from "node:crypto";
import {
  MANSION_LAYOUT_V2_MAX_LIGHTS,
  MANSION_LIGHT_DEFAULT_INTENSITY_V1,
  mansionDirectionalGeometryIsPolygonV2,
  mansionDynamicLightCenterV2,
  mansionGodrayAimV2,
  mansionGodrayDescribeV2,
  mansionGodrayFromApertureV2,
  mansionNaturalLightTintV2,
  validateMansionLayoutV2,
  type MansionDynamicLightV2,
  type MansionLayoutV2,
  type MansionLightPointV2,
} from "@localai/shared";
import sharp from "sharp";
import { OpenAiProvider } from "./providers.ts";

/** Vision model for reading light sources off a room plate. One constant so
 * every pass sees the same eyes. */
export const MYSTERY_ROOM_LIGHT_VISION_MODEL_V1 = "gpt-4o";
const REFERENCE_WIDTH = 1280;
const MATCH_DISTANCE = 0.14;
const REFINE_LIMIT = 6;
/** Beams within this many degrees of the room's median ray share one sun. */
const SUN_SNAP_DEGREES = 35;
const KIND_PRIORITY: Record<MansionDynamicLightV2["kind"], number> = { fire: 0, directional: 1, omni: 2, neon: 3 };
const DEFAULT_COLOR: Record<MansionDynamicLightV2["kind"], string> = {
  fire: "#ff9a3c", omni: "#ffb067", directional: "#ffe7b8", neon: "#66e5ea",
};

type SourceKind = "fireplace" | "candle" | "lamp" | "chandelier" | "screen" | "window" | "skylight" | "neon" | "other";
interface LightSourceInventoryV1 { id: string; kind: SourceKind; lit: boolean; description: string; cellHint: string }
interface LightPlacementV1 {
  id: string;
  kind: MansionDynamicLightV2["kind"];
  color: string | null;
  intensity: number;
  center: MansionLightPointV2;
  radius: number | null;
  rotation: number | null;
  /** Two points on the window edge the light enters through. */
  window: MansionLightPointV2[] | null;
  /** Center of the lit patch where the beam lands. */
  landing: MansionLightPointV2 | null;
  /** How much wider the landing is than the aperture: 0 parallel, 1 twice as wide. */
  spread: number | null;
  path: MansionLightPointV2[] | null;
}
interface Region { x0: number; y0: number; x1: number; y1: number }

/** What each pass saw and decided. Filled progressively so a caller can show
 * it next to the result, or next to a screenshot when the result is wrong. */
export interface RoomLightDetectionTraceV1 {
  model: string;
  inventory?: LightSourceInventoryV1[];
  litSourceIds?: string[];
  geometry?: LightPlacementV1[];
  refinements?: Array<{ id: string; region: Region; accepted: boolean; center?: MansionLightPointV2 | null; radius?: number | null; reason?: string }>;
  verification?: Array<{ id: string; ok: boolean; center: MansionLightPointV2 | null; window: MansionLightPointV2[] | null; landing: MansionLightPointV2 | null; applied: boolean }>;
  sunSnapped?: string[];
  built?: Array<{ placementId: string; lightId: string; matchedExistingId: string | null }>;
  dropped?: string[];
  errors?: string[];
}

const POINT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["x", "y"],
  properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
} as const;
const NULLABLE_POINT = { anyOf: [POINT_SCHEMA, { type: "null" }] } as const;
const NULLABLE_POINTS = { anyOf: [{ type: "array", maxItems: 8, items: POINT_SCHEMA }, { type: "null" }] } as const;

const INVENTORY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sources"],
  properties: {
    sources: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "lit", "description", "cellHint"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["fireplace", "candle", "lamp", "chandelier", "screen", "window", "skylight", "neon", "other"] },
          lit: { type: "boolean" },
          description: { type: "string" },
          cellHint: { type: "string" },
        },
      },
    },
  },
} as const;

const PLACEMENT_ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "kind", "color", "intensity", "center", "radius", "rotation", "window", "landing", "spread", "path"],
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: ["fire", "omni", "directional", "neon"] },
    color: { type: ["string", "null"] },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    center: POINT_SCHEMA,
    radius: { type: ["number", "null"], minimum: 0, maximum: 1 },
    rotation: { type: ["number", "null"], minimum: -360, maximum: 360 },
    window: NULLABLE_POINTS,
    landing: NULLABLE_POINT,
    spread: { type: ["number", "null"], minimum: -0.5, maximum: 1.5 },
    path: NULLABLE_POINTS,
  },
} as const;
const GEOMETRY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["placements"],
  properties: { placements: { type: "array", maxItems: 16, items: PLACEMENT_ITEM_SCHEMA } },
} as const;
const VERIFY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["checks"],
  properties: {
    checks: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "ok", "center", "window", "landing"],
        properties: {
          id: { type: "string" },
          ok: { type: "boolean" },
          center: NULLABLE_POINT,
          window: NULLABLE_POINTS,
          landing: NULLABLE_POINT,
        },
      },
    },
  },
} as const;

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
const isPoint = (value: unknown): value is MansionLightPointV2 =>
  typeof value === "object" && value !== null &&
  Number.isFinite((value as MansionLightPointV2).x) && Number.isFinite((value as MansionLightPointV2).y);
const clampPoint = (point: MansionLightPointV2): MansionLightPointV2 => ({ x: clampUnit(point.x), y: clampUnit(point.y) });
const distance = (a: MansionLightPointV2, b: MansionLightPointV2): number => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (value: number): string => value.toFixed(2);

/** A ruler step that gives roughly eight labelled lines across `span`. */
function rulerStep(span: number): number {
  const candidates = [0.01, 0.02, 0.025, 0.05, 0.1];
  return candidates.find((step) => span / step <= 9) ?? 0.1;
}

/** The plate, or a region of it, with a normalized coordinate ruler burned in.
 * Labels are always absolute room coordinates, so a zoomed crop reads the same
 * way as the whole plate and no coordinate mapping is needed afterwards. */
export async function renderRoomLightDetectionReferenceV1(
  bytes: Buffer,
  region: Region = { x0: 0, y0: 0, x1: 1, y1: 1 },
  markers: string[] = [],
): Promise<{ png: Buffer; aspectRatio: number }> {
  const source = sharp(bytes, { failOn: "error" }).rotate().flatten({ background: { r: 3, g: 8, b: 14 } });
  const { autoOrient } = await source.metadata();
  const sourceWidth = autoOrient.width ?? 1600;
  const sourceHeight = autoOrient.height ?? 900;
  const spanX = region.x1 - region.x0;
  const spanY = region.y1 - region.y0;
  const aspectRatio = (sourceWidth * spanX) / (sourceHeight * spanY);
  const width = REFERENCE_WIDTH;
  const height = Math.max(1, Math.round(width / aspectRatio));
  const toX = (x: number): number => ((x - region.x0) / spanX) * width;
  const toY = (y: number): number => ((y - region.y0) / spanY) * height;
  const step = rulerStep(Math.max(spanX, spanY));
  const lines: string[] = [];
  const labels: string[] = [];
  for (let value = Math.ceil(region.x0 / (step / 2)) * (step / 2); value <= region.x1 + 1e-9; value += step / 2) {
    const major = Math.abs(value / step - Math.round(value / step)) < 1e-6;
    const x = toX(value).toFixed(1);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}" stroke-width="1"/>`);
    if (major) for (const edgeY of [16, height - 6]) labels.push(`<text x="${x}" y="${edgeY}" text-anchor="middle">${fmt(value)}</text>`);
  }
  for (let value = Math.ceil(region.y0 / (step / 2)) * (step / 2); value <= region.y1 + 1e-9; value += step / 2) {
    const major = Math.abs(value / step - Math.round(value / step)) < 1e-6;
    const y = toY(value).toFixed(1);
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}" stroke-width="1"/>`);
    if (major) for (const edgeX of [4, width - 4]) {
      labels.push(`<text x="${edgeX}" y="${(toY(value) + 5).toFixed(1)}" text-anchor="${edgeX < 10 ? "start" : "end"}">${fmt(value)}</text>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text{font:bold 15px sans-serif;fill:#fff;stroke:#000;stroke-width:3px;paint-order:stroke;}.m{font:bold 18px sans-serif;fill:#ff5cf0;}</style>
    ${lines.join("")}${labels.join("")}${markers.join("")}
  </svg>`;
  // Round the edges together so a zoom crop never overruns the plate by a pixel.
  const left = Math.min(sourceWidth - 1, Math.max(0, Math.round(region.x0 * sourceWidth)));
  const top = Math.min(sourceHeight - 1, Math.max(0, Math.round(region.y0 * sourceHeight)));
  const png = await source
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(sourceWidth - left, Math.round(spanX * sourceWidth))),
      height: Math.max(1, Math.min(sourceHeight - top, Math.round(spanY * sourceHeight))),
    })
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { png, aspectRatio };
}

/** Draws proposed lights over the full plate so the model can judge each one. */
function markerSvg(lights: readonly MansionDynamicLightV2[], labels: ReadonlyMap<string, string>, width: number, height: number): string[] {
  const px = (point: MansionLightPointV2): string => `${(point.x * width).toFixed(1)},${(point.y * height).toFixed(1)}`;
  return lights.flatMap((light) => {
    const label = labels.get(light.id) ?? light.id;
    const center = mansionDynamicLightCenterV2(light);
    const text = `<text class="m" x="${(center.x * width + 8).toFixed(1)}" y="${(center.y * height - 8).toFixed(1)}">${label}</text>`;
    if (light.kind === "neon") {
      return [`<polyline points="${light.geometry.points.map(px).join(" ")}" fill="none" stroke="#ff5cf0" stroke-width="3"/>`, text];
    }
    if (light.kind === "directional") {
      const points = mansionDirectionalGeometryIsPolygonV2(light.geometry) ? light.geometry.points : [];
      return [`<polygon points="${points.map(px).join(" ")}" fill="rgba(255,92,240,0.12)" stroke="#ff5cf0" stroke-width="3"/>`, text];
    }
    return [
      `<circle cx="${(center.x * width).toFixed(1)}" cy="${(center.y * height).toFixed(1)}" r="${(light.geometry.radius * width).toFixed(1)}" fill="none" stroke="#ff5cf0" stroke-width="3"/>`,
      `<circle cx="${(center.x * width).toFixed(1)}" cy="${(center.y * height).toFixed(1)}" r="5" fill="#ff5cf0"/>`,
      text,
    ];
  });
}

export async function askVision<T>(args: {
  apiKey: string; png: Buffer; prompt: string[]; schema: Record<string, unknown>; schemaName: string; signal?: AbortSignal;
}): Promise<T> {
  const provider = new OpenAiProvider({ apiKey: args.apiKey });
  const response = await provider.generateResponse(
    [{
      role: "user",
      content: [
        ...args.prompt,
        "The image carries a coordinate ruler: labelled lines with their exact normalized values and unlabelled half-step ticks between them. x runs 0 at the far left of the whole room to 1 at its far right; y runs 0 at the top to 1 at the bottom. Read every coordinate off that ruler and interpolate between lines.",
      ].join(" "),
      images: [{ mimeType: "image/png", data: args.png.toString("base64") }],
    }],
    {
      model: MYSTERY_ROOM_LIGHT_VISION_MODEL_V1,
      maxTokens: 1_800,
      jsonSchema: args.schema,
      jsonSchemaName: args.schemaName,
      usagePurpose: "image_generation",
      allowFinalLocalFallback: false,
      signal: args.signal,
      generationWork: {
        workflow: "debate_mystery_scene_repair",
        stage: "observe_scene_geometry",
        privacyMode: "online",
        outputClass: "critical",
      },
    },
  );
  return JSON.parse(response) as T;
}

/** Builds a godray from the aperture edge and landing the model reported. Both
 * sides leave the aperture along one direction; a missing landing falls toward
 * the room's center. */
function godrayPoints(window: MansionLightPointV2[] | null, landing: MansionLightPointV2 | null, spread: number | null): MansionLightPointV2[] | null {
  const aperture = (window ?? []).filter(isPoint).map(clampPoint);
  if (aperture.length < 2 || distance(aperture[0]!, aperture[1]!) < 0.01) return null;
  const [a0, a1] = [aperture[0]!, aperture[1]!];
  const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
  let land = landing && isPoint(landing) ? clampPoint(landing) : null;
  if (!land || land.y <= mid.y + 0.02) {
    land = clampPoint({ x: mid.x + (mid.x > 0.5 ? -0.26 : 0.26), y: mid.y + 0.32 });
  }
  return mansionGodrayFromApertureV2([a0, a1], land, Math.max(0, Math.min(1, spread ?? 0.12)));
}

function placementToLight(
  placement: LightPlacementV1,
  roomId: string,
  existing: MansionDynamicLightV2 | undefined,
): MansionDynamicLightV2 | null {
  const id = existing?.id ?? `light:${randomUUID()}`;
  const suggested = /^#[0-9a-f]{6}$/i.test(placement.color ?? "")
    ? placement.color!.toLowerCase()
    : existing?.color ?? DEFAULT_COLOR[placement.kind];
  // Daylight through a window is white first; the model's color only says warm or cool.
  const color = placement.kind === "directional" ? mansionNaturalLightTintV2(suggested) : suggested;
  // A matched light keeps its tuned intensity. A new lamp spawns at the shared
  // default (half) so Hard Light does not blow it out; other kinds follow the model.
  const intensity = existing?.intensity ?? (placement.kind === "omni"
    ? MANSION_LIGHT_DEFAULT_INTENSITY_V1.omni
    : clampUnit(Number.isFinite(placement.intensity) ? placement.intensity : MANSION_LIGHT_DEFAULT_INTENSITY_V1[placement.kind]));
  const base = {
    id, roomId, color, intensity, animationSeed: existing?.animationSeed ?? id,
    cuePermission: existing?.cuePermission ?? { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
  };
  const center = isPoint(placement.center) ? clampPoint(placement.center) : null;
  if (placement.kind === "directional") {
    const points = godrayPoints(placement.window, placement.landing, placement.spread);
    return points ? { ...base, kind: "directional", dust: true, geometry: { points } } : null;
  }
  if (placement.kind === "neon") {
    const points = (placement.path ?? []).filter(isPoint).map(clampPoint);
    if (points.length < 2) return null;
    return { ...base, kind: "neon", geometry: { points: points.slice(0, 32), width: 0.012 } };
  }
  if (!center) return null;
  const radius = Math.max(0.03, Math.min(0.6, placement.radius ?? 0.16));
  if (placement.kind === "fire") {
    const rotation = Math.max(-360, Math.min(360, placement.rotation ?? 0));
    return { ...base, kind: "fire", animation: "flicker", geometry: { ...center, radius, rotation } };
  }
  return { ...base, kind: "omni", geometry: { ...center, radius } };
}

/** Moves a light so its center lands on `target`, keeping its shape. */
function relocate(light: MansionDynamicLightV2, target: MansionLightPointV2): MansionDynamicLightV2 {
  const center = mansionDynamicLightCenterV2(light);
  const shift = (point: MansionLightPointV2): MansionLightPointV2 => clampPoint({ x: point.x + target.x - center.x, y: point.y + target.y - center.y });
  if (light.kind === "neon") return { ...light, geometry: { ...light.geometry, points: light.geometry.points.map(shift) } };
  if (light.kind === "directional") {
    return mansionDirectionalGeometryIsPolygonV2(light.geometry)
      ? { ...light, geometry: { points: light.geometry.points.map(shift) } }
      : { ...light, geometry: { ...light.geometry, x: target.x, y: target.y } };
  }
  if (light.kind === "fire") {
    return { ...light, geometry: { ...light.geometry, x: target.x, y: target.y } };
  }
  return { ...light, geometry: { ...light.geometry, x: target.x, y: target.y } };
}

/** One sun per room: beams whose ray is within SUN_SNAP_DEGREES of the median
 * ray are re-aimed to that median. Skylights and side windows that genuinely
 * differ are left alone. */
function snapBeamsToRoomSun(lights: MansionDynamicLightV2[], trace?: RoomLightDetectionTraceV1): MansionDynamicLightV2[] {
  const beams = lights.filter((light): light is Extract<MansionDynamicLightV2, { kind: "directional" }> =>
    light.kind === "directional" && mansionDirectionalGeometryIsPolygonV2(light.geometry) && !light.freeDirection);
  if (beams.length < 2) return lights;
  const angles = beams.map((beam) => {
    const { direction } = mansionGodrayDescribeV2((beam.geometry as { points: MansionLightPointV2[] }).points);
    return Math.atan2(direction.y, direction.x);
  }).sort((left, right) => left - right);
  const median = angles[Math.floor(angles.length / 2)]!;
  const sun = { x: Math.cos(median), y: Math.sin(median) };
  return lights.map((light) => {
    if (light.kind !== "directional" || !mansionDirectionalGeometryIsPolygonV2(light.geometry) || light.freeDirection) return light;
    const { direction } = mansionGodrayDescribeV2(light.geometry.points);
    const delta = Math.abs(((Math.atan2(direction.y, direction.x) - median + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (delta > (SUN_SNAP_DEGREES * Math.PI) / 180) return light;
    if (trace) (trace.sunSnapped ??= []).push(light.id);
    return { ...light, geometry: { points: mansionGodrayAimV2(light.geometry.points, sun) } };
  });
}

/** Four vision passes over the plate:
 *  1. inventory every visible source and whether it is actually giving light;
 *  2. coarse geometry for the lit ones on the whole plate;
 *  3. a zoomed crop per small source (fire, lamps, neon) with a finer ruler;
 *  4. the proposal drawn back onto the plate for a yes-or-fix check per light.
 * Existing lights of the same kind near a detected source keep identity, color,
 * and intensity; sources without a light are added; lights without a source are
 * dropped. Beams share the room's sun. Results validate against the layout. */
export async function detectDebateMysteryRoomLightsV1(args: {
  apiKey: string;
  bytes: Buffer;
  roomId: string;
  roomName: string;
  layout: MansionLayoutV2;
  existingLights?: readonly MansionDynamicLightV2[];
  signal?: AbortSignal;
  /** Optional collector; the caller keeps it even when the result is poor. */
  trace?: RoomLightDetectionTraceV1;
}): Promise<MansionDynamicLightV2[]> {
  const trace = args.trace;
  if (trace) trace.model = MYSTERY_ROOM_LIGHT_VISION_MODEL_V1;
  const { png, aspectRatio } = await renderRoomLightDetectionReferenceV1(args.bytes);
  const inventory = await askVision<{ sources?: LightSourceInventoryV1[] }>({
    apiKey: args.apiKey, png, schema: INVENTORY_SCHEMA, schemaName: "room_light_sources", signal: args.signal,
    prompt: [
      `Inspect this ${args.roomName} room image and list every visible light source or light-emitting fixture: fireplaces, hearths, candles, lamps, sconces, chandeliers, screens, windows, skylights, neon or glowing signage.`,
      "For each, report whether it is actually giving light right now: a fire with flames or embers, a lamp that is switched on, a window or skylight with daylight or moonlight noticeably shining in (a visible shaft, a bright pool on the floor, or a strong bloom). Dark windows, unlit lamps, and cold hearths are lit=false.",
      "Give each source a short id, a one-line description, and cellHint naming the ruler coordinates nearest its center, for example \"x 0.7, y 0.4\".",
      "Do not invent sources that are not in the image.",
    ],
  });
  const litSources = (inventory.sources ?? []).filter((source) => source.lit && typeof source.id === "string").slice(0, 12);
  if (trace) { trace.inventory = inventory.sources ?? []; trace.litSourceIds = litSources.map((source) => source.id); }
  if (litSources.length === 0) return [];

  const geometry = await askVision<{ placements?: LightPlacementV1[] }>({
    apiKey: args.apiKey, png, schema: GEOMETRY_SCHEMA, schemaName: "room_light_geometry", signal: args.signal,
    prompt: [
      `This ${args.roomName} room image has these lit light sources: ${litSources.map((source) => `${source.id} = ${source.kind}, ${source.description} (near ${source.cellHint})`).join("; ")}.`,
      "Report overlay geometry for each source using its id and one of these PRISM light kinds: fire for fireplaces and candles, omni for lamps, sconces, chandeliers, and screens, directional for windows and skylights with light shining in, neon for glowing tubes or signage.",
      "For fire and omni: center is the visible glow center (the flame, or the bulb or shade), radius is how far the glow visibly reaches as a fraction of the image width, rotation for fire is the flame lean in degrees or null.",
      "For directional: window is exactly two points on the window edge the light enters through, following that edge as it appears in perspective (it may lean). landing is the center of the lit patch where the beam reaches the floor or wall. spread is how much wider that patch is than the window edge: 0 for the same width, 0.5 for half again as wide.",
      "For neon: path is two to eight points along the glowing tube.",
      "color is the light's hex color as it appears on nearby surfaces, or null. intensity is 0 to 1 for how strongly the source lights the room.",
      "Fill unused fields with null. Read every coordinate off the ruler.",
    ],
  });
  const placements = new Map<string, LightPlacementV1>();
  for (const placement of geometry.placements ?? []) {
    if (placement && typeof placement === "object" && typeof placement.id === "string" && KIND_PRIORITY.hasOwnProperty(placement.kind)) {
      placements.set(placement.id, placement);
    }
  }
  if (trace) trace.geometry = [...placements.values()];
  if (placements.size === 0) return [];

  // Pass 3: small sources get a zoomed second look with a finer ruler.
  const refineTargets = [...placements.values()]
    .filter((placement) => placement.kind !== "directional" && isPoint(placement.center))
    .sort((left, right) => KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind])
    .slice(0, REFINE_LIMIT);
  for (const placement of refineTargets) {
    try {
      const center = clampPoint(placement.center);
      const halfX = Math.max(0.12, (placement.radius ?? 0.12) * 1.6);
      const halfY = halfX * aspectRatio;
      const region: Region = {
        x0: clampUnit(center.x - halfX), x1: clampUnit(center.x + halfX),
        y0: clampUnit(center.y - halfY), y1: clampUnit(center.y + halfY),
      };
      if (region.x1 - region.x0 < 0.05 || region.y1 - region.y0 < 0.05) {
        if (trace) (trace.refinements ??= []).push({ id: placement.id, region, accepted: false, reason: "crop too small" });
        continue;
      }
      const crop = await renderRoomLightDetectionReferenceV1(args.bytes, region);
      const refined = await askVision<{ placements?: LightPlacementV1[] }>({
        apiKey: args.apiKey, png: crop.png, schema: GEOMETRY_SCHEMA, schemaName: "room_light_geometry_zoom", signal: args.signal,
        prompt: [
          `This is a zoomed crop of the ${args.roomName} room around one light source: ${placement.id}, a ${placement.kind} light. The ruler labels are absolute room coordinates.`,
          `Report its exact geometry with id ${placement.id} and kind ${placement.kind}: center on the light's visible core, radius as the glow's reach as a fraction of the whole room's width${placement.kind === "neon" ? ", path along the tube" : ""}. Fill unused fields with null.`,
        ],
      });
      const better = (refined.placements ?? []).find((entry) => entry?.id === placement.id && isPoint(entry.center));
      if (!better) {
        if (trace) (trace.refinements ??= []).push({ id: placement.id, region, accepted: false, reason: "no matching id in crop answer" });
        continue;
      }
      const point = clampPoint(better.center);
      if (point.x < region.x0 || point.x > region.x1 || point.y < region.y0 || point.y > region.y1) {
        if (trace) (trace.refinements ??= []).push({ id: placement.id, region, accepted: false, center: point, radius: better.radius, reason: "answer outside crop" });
        continue;
      }
      if (trace) (trace.refinements ??= []).push({ id: placement.id, region, accepted: true, center: point, radius: better.radius });
      placements.set(placement.id, {
        ...placement,
        center: point,
        radius: Number.isFinite(better.radius) ? better.radius : placement.radius,
        rotation: Number.isFinite(better.rotation) ? better.rotation : placement.rotation,
        path: placement.kind === "neon" && Array.isArray(better.path) && better.path.length >= 2 ? better.path : placement.path,
      });
    } catch (error) {
      // Keep the coarse placement; the check pass can still move it.
      if (trace) (trace.errors ??= []).push(`refine ${placement.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const room = args.layout.entities.find((entity) => entity.kind === "room" && entity.id === args.roomId);
  if (!room) return [];
  const baseline = new Set(validateMansionLayoutV2({ ...args.layout, lights: [] }));
  const unmatched = [...(args.existingLights ?? [])].filter((light) => light.roomId === args.roomId);
  let lights: MansionDynamicLightV2[] = [];
  const labelById = new Map<string, string>();
  for (const placement of placements.values()) {
    const probe = placementToLight(placement, args.roomId, undefined);
    if (!probe) { if (trace) (trace.dropped ??= []).push(`${placement.id}: could not build a ${placement.kind} light from its geometry`); continue; }
    const center = mansionDynamicLightCenterV2(probe);
    const matchIndex = unmatched.findIndex((light) =>
      light.kind === probe.kind && distance(mansionDynamicLightCenterV2(light), center) <= MATCH_DISTANCE);
    const matched = matchIndex >= 0 ? unmatched.splice(matchIndex, 1)[0] : undefined;
    const light = placementToLight(placement, args.roomId, matched);
    if (light) {
      lights.push(light); labelById.set(light.id, placement.id);
      if (trace) (trace.built ??= []).push({ placementId: placement.id, lightId: light.id, matchedExistingId: matched?.id ?? null });
    }
  }
  lights = snapBeamsToRoomSun(lights, trace);

  // Pass 4: draw the proposal back onto the plate and ask for corrections.
  if (lights.length > 0) {
    try {
      const marked = await renderRoomLightDetectionReferenceV1(
        args.bytes, undefined, markerSvg(lights, labelById, REFERENCE_WIDTH, Math.round(REFERENCE_WIDTH / aspectRatio)),
      );
      const verify = await askVision<{ checks?: Array<{ id: string; ok: boolean; center: MansionLightPointV2 | null; window: MansionLightPointV2[] | null; landing: MansionLightPointV2 | null }> }>({
        apiKey: args.apiKey, png: marked.png, schema: VERIFY_SCHEMA, schemaName: "room_light_check", signal: args.signal,
        prompt: [
          `The ${args.roomName} room image now carries magenta markers, each labelled with a light id: circles for lamps and fire, a quad for each window beam, a line for neon.`,
          "For each id, say ok=true when the marker sits on the real light source it names. When it does not, set ok=false and give the corrected center on the real source; for a beam also give the two corrected window points and the corrected landing center. Use null for fields you are not correcting.",
        ],
      });
      const byLabel = new Map([...labelById.entries()].map(([id, label]) => [label, id]));
      const fixes = new Map((verify.checks ?? []).filter((check) => check && typeof check.id === "string").map((check) => [byLabel.get(check.id) ?? check.id, check]));
      lights = lights.map((light) => {
        const fix = fixes.get(light.id);
        const note = (applied: boolean) => {
          if (trace && fix) (trace.verification ??= []).push({ id: labelById.get(light.id) ?? light.id, ok: fix.ok, center: fix.center ?? null, window: fix.window ?? null, landing: fix.landing ?? null, applied });
        };
        if (!fix || fix.ok) { note(false); return light; }
        if (light.kind === "directional" && Array.isArray(fix.window) && fix.window.length >= 2) {
          const described = mansionDirectionalGeometryIsPolygonV2(light.geometry) ? mansionGodrayDescribeV2(light.geometry.points) : null;
          const points = godrayPoints(fix.window, fix.landing ?? described?.landing ?? null, described?.spread ?? null);
          note(Boolean(points));
          return points ? { ...light, geometry: { points } } : light;
        }
        if (fix.center && isPoint(fix.center) && distance(mansionDynamicLightCenterV2(light), fix.center) <= 0.2) { note(true); return relocate(light, clampPoint(fix.center)); }
        note(false);
        return light;
      });
      lights = snapBeamsToRoomSun(lights, trace);
    } catch (error) {
      // The unchecked proposal is still better than none.
      if (trace) (trace.errors ??= []).push(`verify: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const valid = lights.filter((light) => {
    const errors = validateMansionLayoutV2({ ...args.layout, lights: [light] }).filter((error) => !baseline.has(error));
    if (errors.length && trace) (trace.dropped ??= []).push(`${labelById.get(light.id) ?? light.id}: ${errors[0]}`);
    return errors.length === 0;
  });
  return valid
    .sort((left, right) => KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind] || right.intensity - left.intensity)
    .slice(0, MANSION_LAYOUT_V2_MAX_LIGHTS);
}
