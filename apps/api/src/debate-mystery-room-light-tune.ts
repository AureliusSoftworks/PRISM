import {
  MANSION_LIGHT_BLEND_MODES_V1,
  ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1,
  applyRoomLightTuneVerdictV1,
  isRoomLightTuneBlendV1,
  type MansionDynamicLightV2,
  type MansionLightBlendModeV1,
  type RoomLightTuneResultV1,
  type RoomLightTuneVerdictV1,
} from "@localai/shared";
import { HttpError } from "./utils.http.ts";
import { MYSTERY_ROOM_LIGHT_VISION_MODEL_V1, askVision } from "./debate-mystery-room-lights.ts";

/**
 * Bounded model tuning of a room's lights. The client composites a contact
 * sheet of the lit room; a vision judge picks a blend and reads each light;
 * the shared apply function keeps every change inside its window. ONLINE only:
 * the route refuses LOCAL before anything here runs, so no room snapshot ever
 * leaves the machine on a LOCAL turn.
 */

export const ROOM_LIGHT_TUNE_MAX_SHEET_BYTES = 6 * 1024 * 1024;
export const ROOM_LIGHT_TUNE_MAX_SHEET_EDGE = 4096;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface RoomLightTuneSheetInputV1 {
  png: Buffer;
  width: number;
  height: number;
  columns: number;
  tile: { width: number; height: number };
  candidates: Array<{ label: string; blend: MansionLightBlendModeV1 }>;
  markers: Array<{ label: string; id: string }>;
  pass: 1 | 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max ? value : null;
}

/** Validates a client sheet without decoding it: size, PNG magic, grid, candidates, markers. */
export function validateRoomLightTuneSheetV1(value: unknown, lightIds: ReadonlySet<string>): RoomLightTuneSheetInputV1 {
  if (!isRecord(value)) throw new HttpError(400, "Tuning needs the lit room's contact sheet.");
  const pass = value.pass === 2 ? 2 : value.pass === 1 ? 1 : null;
  if (!pass) throw new HttpError(400, "Tuning pass must be 1 or 2.");
  if (typeof value.png !== "string" || value.png.length === 0 || value.png.length > ROOM_LIGHT_TUNE_MAX_SHEET_BYTES * 1.4) {
    throw new HttpError(400, "The contact sheet is missing or too large.");
  }
  const png = Buffer.from(value.png, "base64");
  if (png.length === 0 || png.length > ROOM_LIGHT_TUNE_MAX_SHEET_BYTES || !png.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new HttpError(400, "The contact sheet must be a PNG under 6 MB.");
  }
  const width = positiveInt(value.width, ROOM_LIGHT_TUNE_MAX_SHEET_EDGE);
  const height = positiveInt(value.height, ROOM_LIGHT_TUNE_MAX_SHEET_EDGE);
  const columns = positiveInt(value.columns, 2);
  const tile = isRecord(value.tile) ? { width: positiveInt(value.tile.width, ROOM_LIGHT_TUNE_MAX_SHEET_EDGE), height: positiveInt(value.tile.height, ROOM_LIGHT_TUNE_MAX_SHEET_EDGE) } : null;
  if (!width || !height || !columns || !tile?.width || !tile.height) throw new HttpError(400, "The contact sheet grid is invalid.");
  if (!Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1.length) {
    throw new HttpError(400, "The contact sheet needs one to four candidate blends.");
  }
  const labels = new Set<string>();
  const candidates = value.candidates.map((entry) => {
    if (!isRecord(entry) || typeof entry.label !== "string" || !/^[A-D]$/u.test(entry.label) || labels.has(entry.label)) {
      throw new HttpError(400, "Candidate labels must be unique letters A to D.");
    }
    labels.add(entry.label);
    const blend = entry.blend;
    // Pass 1 offers the shortlist; pass 2 re-shows whatever pass 1 chose, which may be the room's saved pick.
    const allowed = pass === 1 ? isRoomLightTuneBlendV1(blend) : typeof blend === "string" && (MANSION_LIGHT_BLEND_MODES_V1 as readonly string[]).includes(blend);
    if (!allowed) throw new HttpError(400, "Candidate blends must come from the tuning shortlist.");
    return { label: entry.label, blend: blend as MansionLightBlendModeV1 };
  });
  if (!Array.isArray(value.markers) || value.markers.length > 8) throw new HttpError(400, "The contact sheet marker list is invalid.");
  const markerLabels = new Set<string>();
  const markers = value.markers.map((entry) => {
    if (!isRecord(entry) || typeof entry.label !== "string" || !/^[1-8]$/u.test(entry.label) || markerLabels.has(entry.label) ||
      typeof entry.id !== "string" || !lightIds.has(entry.id)) {
      throw new HttpError(400, "Every marker must name one of the room's lights with a unique number.");
    }
    markerLabels.add(entry.label);
    return { label: entry.label, id: entry.id };
  });
  return { png, width, height, columns, tile: { width: tile.width, height: tile.height }, candidates, markers, pass };
}

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidate", "lights", "summary"],
  properties: {
    candidate: { type: ["string", "null"], description: "Label of the tile whose lighting reads best, or null when there is one tile." },
    lights: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["marker", "reading", "intensity", "color"],
        properties: {
          marker: { type: "string" },
          reading: { type: "string", enum: ["ok", "blown_out", "too_dim", "off_color"] },
          intensity: { type: ["number", "null"], minimum: 0, maximum: 1 },
          color: { type: ["string", "null"] },
        },
      },
    },
    summary: { type: "string" },
  },
} as const;

interface JudgeAnswerV1 {
  candidate?: string | null;
  lights?: Array<{ marker?: string; reading?: string; intensity?: number | null; color?: string | null }>;
  summary?: string;
}

/** Turns the judge's marker-labelled answer into a verdict keyed by light id. */
export function roomLightTuneVerdictFromJudgeV1(answer: JudgeAnswerV1 | null | undefined, sheet: Pick<RoomLightTuneSheetInputV1, "candidates" | "markers">): RoomLightTuneVerdictV1 {
  const blendByLabel = new Map(sheet.candidates.map((candidate) => [candidate.label, candidate.blend]));
  const idByMarker = new Map(sheet.markers.map((marker) => [marker.label, marker.id]));
  const candidate = typeof answer?.candidate === "string" ? blendByLabel.get(answer.candidate.trim().toUpperCase()) ?? null : null;
  return {
    blend: candidate ?? null,
    lights: (answer?.lights ?? []).flatMap((entry) => {
      const id = typeof entry?.marker === "string" ? idByMarker.get(entry.marker.trim()) : undefined;
      return id ? [{ id, reading: entry.reading ?? null, intensity: entry.intensity ?? null, color: entry.color ?? null }] : [];
    }),
    summary: typeof answer?.summary === "string" ? answer.summary.slice(0, 600) : null,
  };
}

export interface RoomLightTuneOutcomeV1 extends RoomLightTuneResultV1 {
  tune: {
    pass: 1 | 2;
    model: string;
    candidate: string | null;
    verdict: RoomLightTuneVerdictV1;
    applied: RoomLightTuneResultV1["applied"];
    refused: RoomLightTuneResultV1["refused"];
    summary: string | null;
    ranAt: string;
  };
}

export async function tuneDebateMysteryRoomLightingV1(args: {
  apiKey: string;
  sheet: RoomLightTuneSheetInputV1;
  lights: readonly MansionDynamicLightV2[];
  blendMode: MansionLightBlendModeV1;
  roomName: string;
  signal?: AbortSignal;
}): Promise<RoomLightTuneOutcomeV1> {
  const { sheet } = args;
  const tiles = sheet.candidates.map((candidate) => `${candidate.label} = ${candidate.blend}`).join(", ");
  const markerList = sheet.markers.map((marker) => {
    const light = args.lights.find((entry) => entry.id === marker.id);
    return `${marker.label}: ${light?.kind ?? "light"} at intensity ${light ? Math.round(light.intensity * 100) : "?"}% color ${light?.color ?? "?"}`;
  }).join("; ");
  const prompt = sheet.pass === 1
    ? [
        `This contact sheet shows the ${args.roomName} room rendered ${sheet.candidates.length} times in a ${sheet.columns}-column grid, each tile titled with a letter and the blend mode used to composite the same set of lights over the same art: ${tiles}.`,
        "Choose the single tile whose lighting reads most naturally: sources glow where they should, nothing is blown to white, nothing important is lost in darkness, and colors match the room. Answer with its letter as candidate.",
        `Magenta numbered markers sit on each light source in every tile: ${markerList}.`,
        "For each marker, judged on the tile you chose, say whether it reads ok, blown_out, too_dim, or off_color. When it is not ok, suggest a new intensity from 0 to 1 and, only if its color clashes with the room, a hex color close to what surrounds it. Leave intensity and color null when the light already reads well. Never suggest moving a light.",
        "Write a one-sentence summary of the room's lighting.",
      ]
    : [
        `This is the ${args.roomName} room rendered once with its lights composited using ${sheet.candidates[0]?.blend ?? args.blendMode}.`,
        `Magenta numbered markers sit on each light source: ${markerList}.`,
        "This is a confirmation pass after adjustments. For each marker, say whether it reads ok, blown_out, too_dim, or off_color, and suggest a small intensity correction from 0 to 1 only where needed. Leave intensity and color null when the light reads well. Set candidate to null. Never suggest moving a light.",
        "Write a one-sentence summary.",
      ];
  const answer = await askVision<JudgeAnswerV1>({
    apiKey: args.apiKey,
    png: sheet.png,
    prompt,
    schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    schemaName: sheet.pass === 1 ? "room_light_tune" : "room_light_tune_confirm",
    signal: args.signal,
  });
  const verdict = roomLightTuneVerdictFromJudgeV1(answer, sheet);
  const result = applyRoomLightTuneVerdictV1({ lights: args.lights, blendMode: args.blendMode, verdict });
  return {
    ...result,
    tune: {
      pass: sheet.pass,
      model: MYSTERY_ROOM_LIGHT_VISION_MODEL_V1,
      candidate: typeof answer?.candidate === "string" ? answer.candidate : null,
      verdict,
      applied: result.applied,
      refused: result.refused,
      summary: verdict.summary ?? null,
      ranAt: new Date().toISOString(),
    },
  };
}
