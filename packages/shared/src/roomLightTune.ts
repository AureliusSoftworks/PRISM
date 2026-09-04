import type { MansionDynamicLightV2, MansionLightBlendModeV1 } from "./mansionLayoutV2.ts";
import { MANSION_LIGHT_BLEND_MODES_V1 } from "./mansionLayoutV2.ts";

/**
 * Bounded model tuning of a room's lights. The player places geometry; a judge
 * that has seen the rendered room may adjust color and intensity per light and
 * pick the room's one blend. Everything here is pure so the bounds can be
 * tested without a model, and so a verdict from JSON can never move a marker,
 * change a kind, or push a value outside the window.
 */

/** Blends the judge may pick from, rendered as candidates on the contact sheet. */
export const ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1 = ["hard-light", "overlay", "screen", "soft-light"] as const;
export type RoomLightTuneBlendV1 = typeof ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1[number];

export interface RoomLightTuneBoundsV1 {
  /** Intensity window every tuned light must land in. */
  readonly intensity: { readonly min: number; readonly max: number };
  /** Largest move one pass may make to a light's intensity. */
  readonly intensityStep: number;
  /** Largest per-channel move (0-255) a suggested color may make from the current one. */
  readonly colorMaxChannelDelta: number;
}

export const ROOM_LIGHT_TUNE_BOUNDS_V1: RoomLightTuneBoundsV1 = Object.freeze({
  intensity: Object.freeze({ min: 0.15, max: 0.95 }),
  intensityStep: 0.35,
  colorMaxChannelDelta: 96,
});

export type RoomLightTuneReadingV1 = "ok" | "blown_out" | "too_dim" | "off_color";

/** One judged light. Nulls mean the judge had no suggestion for that field. */
export interface RoomLightTuneLightVerdictV1 {
  id: string;
  reading?: RoomLightTuneReadingV1 | string | null;
  intensity?: number | null;
  color?: string | null;
}

/** What a judge returns, already parsed from JSON but not yet trusted. */
export interface RoomLightTuneVerdictV1 {
  /** The blend the judge preferred, or null to keep the current one. */
  blend?: string | null;
  lights?: ReadonlyArray<RoomLightTuneLightVerdictV1> | null;
  summary?: string | null;
}

export interface RoomLightTuneChangeV1 {
  id: string;
  intensity?: { from: number; to: number };
  color?: { from: string; to: string };
}

export interface RoomLightTuneRefusalV1 {
  id: string;
  reason: string;
}

export interface RoomLightTuneResultV1 {
  lights: MansionDynamicLightV2[];
  blendMode: MansionLightBlendModeV1;
  blendChanged: boolean;
  applied: RoomLightTuneChangeV1[];
  refused: RoomLightTuneRefusalV1[];
}

const HEX_COLOR = /^#([0-9a-f]{6})$/iu;

function hexChannels(color: string): [number, number, number] | null {
  const match = HEX_COLOR.exec(color.trim());
  if (!match) return null;
  const hex = match[1]!;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isRoomLightTuneBlendV1(value: unknown): value is RoomLightTuneBlendV1 {
  return typeof value === "string" && (ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1 as readonly string[]).includes(value);
}

/**
 * Applies a judge's verdict within bounds. Geometry, kind, and ids never change;
 * unknown ids, far colors, and off-list blends are refused with a reason so the
 * review dump can show what the model wanted and what was kept.
 */
export function applyRoomLightTuneVerdictV1(args: {
  lights: readonly MansionDynamicLightV2[];
  blendMode: MansionLightBlendModeV1 | undefined;
  verdict: RoomLightTuneVerdictV1 | null | undefined;
  bounds?: RoomLightTuneBoundsV1;
}): RoomLightTuneResultV1 {
  const bounds = args.bounds ?? ROOM_LIGHT_TUNE_BOUNDS_V1;
  const verdict = args.verdict ?? {};
  const applied: RoomLightTuneChangeV1[] = [];
  const refused: RoomLightTuneRefusalV1[] = [];
  const currentBlend: MansionLightBlendModeV1 = args.blendMode && (MANSION_LIGHT_BLEND_MODES_V1 as readonly string[]).includes(args.blendMode)
    ? args.blendMode
    : "auto";

  let blendMode = currentBlend;
  let blendChanged = false;
  if (verdict.blend !== undefined && verdict.blend !== null && verdict.blend !== "") {
    if (isRoomLightTuneBlendV1(verdict.blend)) {
      blendChanged = verdict.blend !== currentBlend;
      blendMode = verdict.blend;
    } else {
      refused.push({ id: "room", reason: `blend "${String(verdict.blend)}" is outside the shortlist` });
    }
  }

  const byId = new Map<string, MansionDynamicLightV2>();
  for (const light of args.lights) byId.set(light.id, light);
  const seen = new Set<string>();
  for (const entry of verdict.lights ?? []) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") continue;
    const current = byId.get(entry.id);
    if (!current) { refused.push({ id: entry.id, reason: "no light with this id" }); continue; }
    if (seen.has(entry.id)) { refused.push({ id: entry.id, reason: "judged twice; first verdict kept" }); continue; }
    seen.add(entry.id);
    const change: RoomLightTuneChangeV1 = { id: entry.id };
    let next: MansionDynamicLightV2 = current;

    if (entry.intensity !== undefined && entry.intensity !== null) {
      if (typeof entry.intensity !== "number" || !Number.isFinite(entry.intensity)) {
        refused.push({ id: entry.id, reason: "intensity is not a number" });
      } else {
        const target = clamp(entry.intensity, bounds.intensity.min, bounds.intensity.max);
        const stepped = current.intensity + clamp(target - current.intensity, -bounds.intensityStep, bounds.intensityStep);
        const to = Math.round(clamp(stepped, bounds.intensity.min, bounds.intensity.max) * 1000) / 1000;
        if (Math.abs(to - current.intensity) >= 0.005) {
          change.intensity = { from: current.intensity, to };
          next = { ...next, intensity: to };
        }
      }
    }

    if (entry.color !== undefined && entry.color !== null) {
      const suggested = typeof entry.color === "string" ? hexChannels(entry.color) : null;
      const existing = hexChannels(current.color);
      if (!suggested) {
        refused.push({ id: entry.id, reason: "color is not a six-digit hex" });
      } else if (!existing) {
        refused.push({ id: entry.id, reason: "current color is not hex, so it cannot be judged against" });
      } else {
        const delta = Math.max(...suggested.map((channel, index) => Math.abs(channel - existing[index]!)));
        const to = `#${suggested.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        if (delta > bounds.colorMaxChannelDelta) {
          refused.push({ id: entry.id, reason: `color moves ${delta}/255 on a channel; the limit is ${bounds.colorMaxChannelDelta}` });
        } else if (to !== current.color.toLowerCase()) {
          change.color = { from: current.color, to };
          next = { ...next, color: to };
        }
      }
    }

    if (change.intensity || change.color) {
      applied.push(change);
      byId.set(entry.id, next);
    }
  }

  return {
    lights: args.lights.map((light) => byId.get(light.id) ?? light),
    blendMode,
    blendChanged,
    applied,
    refused,
  };
}
