import { randomUUID } from "node:crypto";
import {
  MANSION_LAYOUT_V2_MAX_LIGHTS,
  mansionDynamicLightCenterV2,
  mansionGodrayParallelPointsV2,
  validateMansionLayoutV2,
  type MansionDynamicLightV2,
  type MansionLayoutV2,
  type MansionLightPointV2,
} from "@localai/shared";
import sharp from "sharp";
import { OpenAiProvider } from "./providers.ts";

/** Vision model for reading light sources off a room plate. One constant so the
 * inventory and geometry passes never disagree about what they saw. */
export const MYSTERY_ROOM_LIGHT_VISION_MODEL_V1 = "gpt-4o";
const REFERENCE_WIDTH = 1280;
const MATCH_DISTANCE = 0.14;
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
  window: MansionLightPointV2[] | null;
  floor: MansionLightPointV2[] | null;
  path: MansionLightPointV2[] | null;
}

const POINT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["x", "y"],
  properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
} as const;
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

const GEOMETRY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["placements"],
  properties: {
    placements: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "color", "intensity", "center", "radius", "rotation", "window", "floor", "path"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["fire", "omni", "directional", "neon"] },
          color: { type: ["string", "null"] },
          intensity: { type: "number", minimum: 0, maximum: 1 },
          center: POINT_SCHEMA,
          radius: { type: ["number", "null"], minimum: 0, maximum: 1 },
          rotation: { type: ["number", "null"], minimum: -360, maximum: 360 },
          window: NULLABLE_POINTS,
          floor: NULLABLE_POINTS,
          path: NULLABLE_POINTS,
        },
      },
    },
  },
} as const;

/** The plate with a normalized coordinate ruler burned in. Labelled lines every
 * 0.1 and ticks every 0.05 let the model read positions off the image instead of
 * estimating them, which is where most of the placement error came from. */
export async function renderRoomLightDetectionReferenceV1(bytes: Buffer): Promise<{ png: Buffer; aspectRatio: number }> {
  const source = sharp(bytes, { failOn: "error" }).rotate().flatten({ background: { r: 3, g: 8, b: 14 } });
  const { autoOrient } = await source.metadata();
  const aspectRatio = autoOrient.width && autoOrient.height ? autoOrient.width / autoOrient.height : 16 / 9;
  const width = REFERENCE_WIDTH;
  const height = Math.max(1, Math.round(width / aspectRatio));
  const lines: string[] = [];
  const labels: string[] = [];
  for (let step = 1; step < 20; step += 1) {
    const unit = step / 20;
    const major = step % 2 === 0;
    const x = (unit * width).toFixed(1);
    const y = (unit * height).toFixed(1);
    const stroke = major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)";
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${stroke}" stroke-width="1"/>`);
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`);
    if (!major) continue;
    const text = unit.toFixed(1);
    for (const edgeY of [16, height - 6]) {
      labels.push(`<text x="${x}" y="${edgeY}" text-anchor="middle">${text}</text>`);
    }
    for (const edgeX of [4, width - 4]) {
      labels.push(`<text x="${edgeX}" y="${(unit * height + 5).toFixed(1)}" text-anchor="${edgeX < 10 ? "start" : "end"}">${text}</text>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text{font:bold 15px sans-serif;fill:#fff;stroke:#000;stroke-width:3px;paint-order:stroke;}</style>
    ${lines.join("")}${labels.join("")}
  </svg>`;
  const png = await source
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { png, aspectRatio };
}

async function askVision<T>(args: {
  apiKey: string; png: Buffer; prompt: string[]; schema: Record<string, unknown>; schemaName: string; signal?: AbortSignal;
}): Promise<T> {
  const provider = new OpenAiProvider({ apiKey: args.apiKey });
  const response = await provider.generateResponse(
    [{
      role: "user",
      content: [
        ...args.prompt,
        "The image carries a coordinate ruler: labelled lines every 0.1 and unlabelled ticks every 0.05. x runs 0 at the far left to 1 at the far right; y runs 0 at the top to 1 at the bottom. Read every coordinate off that ruler.",
      ].join(" "),
      images: [{ mimeType: "image/png", data: args.png.toString("base64") }],
    }],
    {
      model: MYSTERY_ROOM_LIGHT_VISION_MODEL_V1,
      maxTokens: 1_600,
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

const isPoint = (value: unknown): value is MansionLightPointV2 =>
  typeof value === "object" && value !== null &&
  Number.isFinite((value as MansionLightPointV2).x) && Number.isFinite((value as MansionLightPointV2).y);
const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
const clampPoint = (point: MansionLightPointV2): MansionLightPointV2 => ({ x: clampUnit(point.x), y: clampUnit(point.y) });
const distance = (a: MansionLightPointV2, b: MansionLightPointV2): number => Math.hypot(a.x - b.x, a.y - b.y);

function inventoryKindToLightKind(kind: SourceKind): MansionDynamicLightV2["kind"] {
  if (kind === "fireplace" || kind === "candle") return "fire";
  if (kind === "window" || kind === "skylight") return "directional";
  if (kind === "neon") return "neon";
  return "omni";
}

/** Builds a godray from the window edge and floor landing the model reported,
 * then straightens it so every ray leaves the window at one shared angle. */
function godrayPoints(placement: LightPlacementV1): MansionLightPointV2[] | null {
  const window = (placement.window ?? []).filter(isPoint).map(clampPoint);
  if (window.length < 2) return null;
  const floor = (placement.floor ?? []).filter(isPoint).map(clampPoint);
  // Window corners share an x so the edge stands upright; the parallel landing then does too.
  const windowX = (window[0]!.x + window[1]!.x) / 2;
  const [w0, w1] = [{ x: windowX, y: window[0]!.y }, { x: windowX, y: window[1]!.y }];
  if (Math.abs(w0.y - w1.y) < 0.01) return null;
  let [f0, f1] = floor.length >= 2 ? [floor[0]!, floor[1]!] : floor.length === 1 ? [floor[0]!, floor[0]!] : [null, null];
  if (!f0 || !f1 || (f0.y + f1.y) / 2 <= (w0.y + w1.y) / 2 + 0.02) {
    // No usable landing: fall from the window toward the room's center.
    const towardCenter = (w0.x + w1.x) / 2 > 0.5 ? -0.26 : 0.26;
    f0 = clampPoint({ x: w0.x + towardCenter, y: w0.y + 0.32 });
    f1 = clampPoint({ x: w1.x + towardCenter, y: w1.y + 0.32 });
  }
  // Pair each window corner with the floor corner nearest to it so the quad never twists.
  const straight = distance(w0, f0) + distance(w1, f1) <= distance(w0, f1) + distance(w1, f0);
  const landingForW0 = straight ? f0 : f1;
  const landingForW1 = straight ? f1 : f0;
  return mansionGodrayParallelPointsV2([w0, w1, landingForW1, landingForW0]);
}

function placementToLight(
  placement: LightPlacementV1,
  roomId: string,
  existing: MansionDynamicLightV2 | undefined,
): MansionDynamicLightV2 | null {
  const id = existing?.id ?? `light:${randomUUID()}`;
  const color = /^#[0-9a-f]{6}$/i.test(placement.color ?? "")
    ? placement.color!.toLowerCase()
    : existing?.color ?? DEFAULT_COLOR[placement.kind];
  const intensity = existing?.intensity ?? clampUnit(Number.isFinite(placement.intensity) ? placement.intensity : 0.72);
  const base = {
    id, roomId, color, intensity, animationSeed: existing?.animationSeed ?? id,
    cuePermission: existing?.cuePermission ?? { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
  };
  const center = isPoint(placement.center) ? clampPoint(placement.center) : null;
  if (placement.kind === "directional") {
    const points = godrayPoints(placement);
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

/** Two vision passes over the plate: an inventory of every visible source with
 * whether it is actually giving light, then exact geometry for the lit ones.
 * Existing lights of the same kind near a detected source keep their identity,
 * color, and intensity; sources with no light are added; lights with no source
 * are dropped. The result is validated against the room's layout contract. */
export async function detectDebateMysteryRoomLightsV1(args: {
  apiKey: string;
  bytes: Buffer;
  roomId: string;
  roomName: string;
  layout: MansionLayoutV2;
  existingLights?: readonly MansionDynamicLightV2[];
  signal?: AbortSignal;
}): Promise<MansionDynamicLightV2[]> {
  const { png } = await renderRoomLightDetectionReferenceV1(args.bytes);
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
  if (litSources.length === 0) return [];

  const geometry = await askVision<{ placements?: LightPlacementV1[] }>({
    apiKey: args.apiKey, png, schema: GEOMETRY_SCHEMA, schemaName: "room_light_geometry", signal: args.signal,
    prompt: [
      `This ${args.roomName} room image has these lit light sources: ${litSources.map((source) => `${source.id} = ${source.kind}, ${source.description} (near ${source.cellHint})`).join("; ")}.`,
      "Report exact overlay geometry for each source using its id and one of these PRISM light kinds: fire for fireplaces and candles, omni for lamps, sconces, chandeliers, and screens, directional for windows and skylights with light shining in, neon for glowing tubes or signage.",
      "For fire and omni: center is the visible glow center, radius is the glow's reach as a fraction of the image width, rotation for fire is the flame lean in degrees or null.",
      "For directional: window is exactly two points on the window edge the light enters through, in the order you would trace the edge; floor is the two points where that light lands on the floor, paired in the same order as the window points so the beam does not twist. The beam must run from the window edge to the floor at the angle the light visibly travels.",
      "For neon: path is two to eight points along the glowing tube.",
      "color is the light's hex color as it appears on nearby surfaces, or null. intensity is 0 to 1 for how strongly the source lights the room.",
      "Fill unused fields with null. Read every coordinate off the ruler.",
    ],
  });

  const room = args.layout.entities.find((entity) => entity.kind === "room" && entity.id === args.roomId);
  if (!room) return [];
  const baseline = new Set(validateMansionLayoutV2({ ...args.layout, lights: [] }));
  const unmatched = [...(args.existingLights ?? [])].filter((light) => light.roomId === args.roomId);
  const lights: MansionDynamicLightV2[] = [];
  for (const placement of geometry.placements ?? []) {
    if (!placement || typeof placement !== "object" || !KIND_PRIORITY.hasOwnProperty(placement.kind)) continue;
    const probe = placementToLight(placement, args.roomId, undefined);
    if (!probe) continue;
    const center = mansionDynamicLightCenterV2(probe);
    const matchIndex = unmatched.findIndex((light) =>
      light.kind === probe.kind && distance(mansionDynamicLightCenterV2(light), center) <= MATCH_DISTANCE);
    const matched = matchIndex >= 0 ? unmatched.splice(matchIndex, 1)[0] : undefined;
    const light = placementToLight(placement, args.roomId, matched);
    if (!light) continue;
    const errors = validateMansionLayoutV2({ ...args.layout, lights: [light] }).filter((error) => !baseline.has(error));
    if (errors.length === 0) lights.push(light);
  }
  return lights
    .sort((left, right) => KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind] || right.intensity - left.intensity)
    .slice(0, MANSION_LAYOUT_V2_MAX_LIGHTS);
}
