export type MysteryRoomCinematographyArtStyle = "mosaic" | "illustrated";

export interface MysteryRoomLightEmitterV1 {
  id: string;
  role: "cool-window" | "warm-practical";
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  color: readonly [number, number, number];
  baseIntensity: number;
  primaryFrequencyHz: number;
  primaryDepth: number;
  secondaryFrequencyHz: number;
  secondaryDepth: number;
  phase: number;
}

export interface MysteryRoomCinematographyProfileV1 {
  version: 1;
  id: string;
  gradeTop: string;
  gradeBottom: string;
  grainOpacity: number;
  vignetteOpacity: number;
  emitters: readonly MysteryRoomLightEmitterV1[];
}

export type MysteryRoomCinematographyLightSourceV1 =
  | "authored"
  | "template"
  | "none";

const FOYER_PROFILE_V1: MysteryRoomCinematographyProfileV1 = Object.freeze({
  version: 1,
  id: "foyer-v1",
  gradeTop: "rgba(80, 119, 155, 0.22)",
  gradeBottom: "rgba(94, 54, 30, 0.1)",
  grainOpacity: 0.1,
  vignetteOpacity: 0.72,
  emitters: Object.freeze<MysteryRoomLightEmitterV1[]>([
    {
      id: "central-window",
      role: "cool-window",
      x: 0.49,
      y: 0.42,
      radiusX: 0.24,
      radiusY: 0.5,
      color: [118, 184, 235],
      baseIntensity: 0.46,
      primaryFrequencyHz: 0.08,
      primaryDepth: 0.008,
      secondaryFrequencyHz: 0,
      secondaryDepth: 0,
      phase: 0.4,
    },
    {
      id: "stair-field",
      role: "warm-practical",
      x: 0.17,
      y: 0.56,
      radiusX: 0.28,
      radiusY: 0.38,
      color: [255, 168, 91],
      baseIntensity: 0.52,
      primaryFrequencyHz: 0.34,
      primaryDepth: 0.067,
      secondaryFrequencyHz: 1.18,
      secondaryDepth: 0.034,
      phase: 0,
    },
    {
      id: "lower-stair-spill",
      role: "warm-practical",
      x: 0.27,
      y: 0.79,
      radiusX: 0.29,
      radiusY: 0.2,
      color: [255, 195, 122],
      baseIntensity: 0.42,
      primaryFrequencyHz: 0.34,
      primaryDepth: 0.054,
      secondaryFrequencyHz: 1.18,
      secondaryDepth: 0.027,
      phase: 0.3,
    },
    {
      id: "bench-practical",
      role: "warm-practical",
      x: 0.79,
      y: 0.59,
      radiusX: 0.23,
      radiusY: 0.28,
      color: [255, 162, 86],
      baseIntensity: 0.43,
      primaryFrequencyHz: 0.27,
      primaryDepth: 0.05,
      secondaryFrequencyHz: 0.97,
      secondaryDepth: 0.022,
      phase: 1.8,
    },
    ...[
      [0.075, 0.585],
      [0.115, 0.555],
      [0.155, 0.515],
      [0.198, 0.475],
      [0.238, 0.435],
      [0.275, 0.397],
    ].map(([x, y], index): MysteryRoomLightEmitterV1 => ({
      id: `stair-practical-${index + 1}`,
      role: "warm-practical",
      x,
      y,
      radiusX: 0.032,
      radiusY: 0.038,
      color: [255, 244, 216],
      baseIntensity: 0.32,
      primaryFrequencyHz: 0.51,
      primaryDepth: 0.055,
      secondaryFrequencyHz: 1.24,
      secondaryDepth: 0.018,
      phase: index * 0.8,
    })),
    {
      id: "bench-light-core",
      role: "warm-practical",
      x: 0.82,
      y: 0.62,
      radiusX: 0.12,
      radiusY: 0.055,
      color: [255, 231, 196],
      baseIntensity: 0.27,
      primaryFrequencyHz: 0.27,
      primaryDepth: 0.032,
      secondaryFrequencyHz: 0.97,
      secondaryDepth: 0.014,
      phase: 1.8,
    },
    {
      id: "right-wall-sconce",
      role: "warm-practical",
      x: 0.748,
      y: 0.467,
      radiusX: 0.045,
      radiusY: 0.07,
      color: [255, 239, 207],
      baseIntensity: 0.3,
      primaryFrequencyHz: 0.27,
      primaryDepth: 0.035,
      secondaryFrequencyHz: 0.97,
      secondaryDepth: 0.015,
      phase: 2.3,
    },
  ]),
});

export function mysteryRoomCinematographyProfileV1(room: {
  templateId?: string | null;
  name?: string | null;
}): MysteryRoomCinematographyProfileV1 | null {
  const templateId = room.templateId?.trim().toLowerCase() ?? "";
  const name = room.name?.trim().toLowerCase() ?? "";
  if (templateId === "foyer" || name === "foyer") return FOYER_PROFILE_V1;
  return null;
}

/** Authored room lights always win. Template emitters are safe only while the
 * matching bundled room plate is visible; custom/generated art has different
 * geometry even when it shares the same semantic room type. */
export function mysteryRoomCinematographyLightSourceV1(args: {
  authoredLightCount: number;
  templateLightingAligned: boolean;
  hasTemplateProfile: boolean;
}): MysteryRoomCinematographyLightSourceV1 {
  if (args.authoredLightCount > 0) return "authored";
  if (args.templateLightingAligned && args.hasTemplateProfile) return "template";
  return "none";
}

export function mysteryRoomUsesTemplateLightGeometryV1(room: {
  imageId?: string | null;
  acceptedRoomAssetId?: string | null;
  sealedAsset?: {
    revealed?: boolean;
    status?: string;
  } | null;
}): boolean {
  return !room.imageId &&
    !room.acceptedRoomAssetId &&
    !(room.sealedAsset?.revealed && room.sealedAsset.status === "ready");
}

export function mysteryRoomCinematographyCanvasSize(
  artStyle: MysteryRoomCinematographyArtStyle,
): Readonly<{ width: number; height: number }> {
  return artStyle === "mosaic"
    ? { width: 480, height: 270 }
    : { width: 800, height: 450 };
}

export function mysteryRoomCinematographyArtStyleV1(
  roomImageCss: string | null | undefined,
): MysteryRoomCinematographyArtStyle {
  return /(?:-mosaic\.|[?&]style=mosaic(?:[&#)]|$))/iu.test(roomImageCss ?? "")
    ? "mosaic"
    : "illustrated";
}

export function mysteryRoomLightIntensityV1(args: {
  emitter: MysteryRoomLightEmitterV1;
  elapsedSeconds: number;
  reducedMotion: boolean;
}): number {
  const { emitter } = args;
  if (args.reducedMotion) return emitter.baseIntensity;
  const primary = Math.sin(
    args.elapsedSeconds * Math.PI * 2 * emitter.primaryFrequencyHz + emitter.phase,
  ) * emitter.primaryDepth;
  const secondary = Math.sin(
    args.elapsedSeconds * Math.PI * 2 * emitter.secondaryFrequencyHz + emitter.phase * 0.37,
  ) * emitter.secondaryDepth;
  return Math.max(0, Math.min(1, emitter.baseIntensity + primary + secondary));
}

export function mysteryRoomCinematographySeed(roomId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < roomId.length; index += 1) {
    hash ^= roomId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
