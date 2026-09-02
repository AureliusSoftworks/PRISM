import sharp from "sharp";
import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";

const canonicalRoomArt = CURRENT_MANSION_ROOM_ART_CONTRACT;

export const DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1 = Object.freeze({
  version: canonicalRoomArt.version,
  defaultStyle: canonicalRoomArt.defaultStyle,
  defaultPresentation: canonicalRoomArt.defaultPresentation,
  upgradeStyle: canonicalRoomArt.upgradeStyle,
  outputWidth: canonicalRoomArt.pixelArt.outputWidth,
  outputHeight: canonicalRoomArt.pixelArt.outputHeight,
  source: "synthesized-pixel-art" as const,
  deterministicFilter: canonicalRoomArt.pixelArt.deterministicFilter,
  realisticUpgradeSource: canonicalRoomArt.realistic.source,
  mosaicPresentation: Object.freeze({
    ...canonicalRoomArt.pixelArt.grid,
  }),
});

export type DebateMysteryRoomArtVariantV1 = "mosaic" | "mosaic-reference";
export type DebateMysteryRoomArtFormatV1 = "png" | "webp";

export function debateMysteryIllustratedRoomSubjectIdV1(roomId: string): string {
  return `${roomId}:illustrated-v1`;
}

export interface DebateMysteryRoomArtResultV1 {
  bytes: Buffer;
  mimeType: "image/png" | "image/webp";
  width: 1920;
  height: 1080;
  variant: DebateMysteryRoomArtVariantV1;
}

export interface DebateMysteryMosaicPresentationResultV1 {
  bytes: Buffer;
  mimeType: "image/png" | "image/webp";
  width: 1920;
  height: 1080;
  cellSize: 6;
  medianLuminance: number;
}

export interface DebateMysteryRoomArtSourceAlignmentV1 {
  approved: boolean;
  correlation: number;
  minimumCorrelation: number;
}

const UPGRADED_SOURCE_LOCK_GRID_WIDTH = 32;
const UPGRADED_SOURCE_LOCK_GRID_HEIGHT = 18;
// Calibrated against the authored Mosaic/HD pairs (lowest known-good: 0.800)
// and the legacy drifted 3:2 crops (highest known-bad: 0.758). Keep a small
// margin on both sides so normal lighting/material changes remain acceptable.
const UPGRADED_SOURCE_LOCK_MINIMUM_CORRELATION = 0.78;

/** Reduces both images to the same coarse 16:9 luminance structure so style
 * and material detail do not overwhelm the camera/geometry comparison. */
async function sourceLockLuminanceGrid(input: Buffer): Promise<number[]> {
  const { data } = await sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: { r: 3, g: 8, b: 14 } })
    .resize(UPGRADED_SOURCE_LOCK_GRID_WIDTH, UPGRADED_SOURCE_LOCK_GRID_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data];
}

/** A local, deterministic composition gate. It compares only broad luminance
 * structure, permitting a material/lighting pass while rejecting changed
 * camera framing, architecture, and furniture massing. */
export async function validateDebateMysteryRoomArtSourceAlignmentV1(args: {
  source: Buffer;
  candidate: Buffer;
}): Promise<DebateMysteryRoomArtSourceAlignmentV1> {
  const [source, candidate] = await Promise.all([
    sourceLockLuminanceGrid(args.source),
    sourceLockLuminanceGrid(args.candidate),
  ]);
  const sourceMean = source.reduce((sum, value) => sum + value, 0) / source.length;
  const candidateMean = candidate.reduce((sum, value) => sum + value, 0) / candidate.length;
  let covariance = 0;
  let sourceEnergy = 0;
  let candidateEnergy = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sourceDelta = source[index]! - sourceMean;
    const candidateDelta = candidate[index]! - candidateMean;
    covariance += sourceDelta * candidateDelta;
    sourceEnergy += sourceDelta * sourceDelta;
    candidateEnergy += candidateDelta * candidateDelta;
  }
  const correlation = sourceEnergy === 0 && candidateEnergy === 0
    ? 1
    : sourceEnergy > 0 && candidateEnergy > 0
      ? covariance / Math.sqrt(sourceEnergy * candidateEnergy)
      : 0;
  return {
    approved: correlation >= UPGRADED_SOURCE_LOCK_MINIMUM_CORRELATION,
    correlation,
    minimumCorrelation: UPGRADED_SOURCE_LOCK_MINIMUM_CORRELATION,
  };
}

function encodeRoomArt(
  pipeline: sharp.Sharp,
  format: DebateMysteryRoomArtFormatV1,
): sharp.Sharp {
  return format === "png"
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.webp({ lossless: true, effort: 6 });
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Apply the approved presentation-only grid to the authored Mosaic base.
 * Each 320x180 logical sample owns one complete tessera and
 * is expanded with nearest-neighbour resampling before separators are drawn.
 * The line color is derived from its adjacent logical source sample, then
 * shifted gently lighter or darker around the scene's own median grid
 * luminance. Normal/over blending preserves hue and avoids an exposure lift.
 * The stored gridless source remains the same authored Mosaic composition so
 * an HD derivative can recover smooth detail without introducing a second
 * player-selectable room-art style. */
export async function applyDebateMysteryMosaicPresentationV1(
  input: Buffer,
  options: { format?: DebateMysteryRoomArtFormatV1 } = {},
): Promise<DebateMysteryMosaicPresentationResultV1> {
  const contract = DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1;
  const format = options.format ?? "webp";
  const { logicalWidth, logicalHeight, lineAlpha, lineDelta } =
    contract.mosaicPresentation;
  const cellSize = contract.outputWidth / logicalWidth;
  if (
    !Number.isInteger(cellSize) ||
    cellSize !== contract.outputHeight / logicalHeight
  ) {
    throw new Error("The Mosaic presentation contract requires square logical cells.");
  }

  const logical = sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: { r: 3, g: 8, b: 14 } })
    .resize(logicalWidth, logicalHeight, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.nearest,
    })
    .removeAlpha()
    .toColourspace("srgb");
  const { data: logicalPixels, info } = await logical
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    throw new Error(`Expected three-channel room art, received ${info.channels} channels.`);
  }

  const { data: luminance } = await sharp(logicalPixels, {
    raw: {
      width: logicalWidth,
      height: logicalHeight,
      channels: 3,
    },
  })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histogram = new Uint32Array(256);
  for (let y = 0; y < logicalHeight; y += 1) {
    for (let x = 0; x < logicalWidth; x += 1) {
      const value = luminance[y * logicalWidth + x]!;
      histogram[value] = histogram[value]! + 1;
    }
  }

  let medianLuminance = 0;
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value]!;
    if (cumulative >= (logicalWidth * logicalHeight) / 2) {
      medianLuminance = value;
      break;
    }
  }

  const basePixels = await sharp(logicalPixels, {
    raw: { width: logicalWidth, height: logicalHeight, channels: 3 },
  })
    .resize(contract.outputWidth, contract.outputHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .raw()
    .toBuffer();
  const grid = Buffer.alloc(contract.outputWidth * contract.outputHeight * 4, 0);
  for (let y = 0; y < contract.outputHeight; y += 1) {
    for (let x = 0; x < contract.outputWidth; x += 1) {
      if (x % cellSize !== 0 && y % cellSize !== 0) continue;
      const pixelIndex = y * contract.outputWidth + x;
      const logicalIndex =
        Math.min(logicalHeight - 1, Math.floor(y / cellSize)) * logicalWidth +
        Math.min(logicalWidth - 1, Math.floor(x / cellSize));
      const baseIndex = logicalIndex * 3;
      const gridIndex = pixelIndex * 4;
      const direction = luminance[logicalIndex]! < medianLuminance ? 1 : -1;
      for (let channel = 0; channel < 3; channel += 1) {
        grid[gridIndex + channel] = clampByte(
          logicalPixels[baseIndex + channel]! + direction * lineDelta,
        );
      }
      grid[gridIndex + 3] = lineAlpha;
    }
  }

  const composed = sharp(basePixels, {
    raw: {
      width: contract.outputWidth,
      height: contract.outputHeight,
      channels: 3,
    },
  }).composite([{
    input: grid,
    raw: {
      width: contract.outputWidth,
      height: contract.outputHeight,
      channels: 4,
    },
    blend: "over",
  }]);
  const bytes = format === "png"
    ? await composed.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    : await composed.webp({ lossless: true, effort: 6 }).toBuffer();

  return {
    bytes,
    mimeType: format === "png" ? "image/png" : "image/webp",
    width: contract.outputWidth,
    height: contract.outputHeight,
    cellSize: cellSize as 6,
    medianLuminance,
  };
}

/** Normalize an already-authored Mosaic base for storage or an HD-derivative
 * reference. This deliberately does not create Mosaic art from another room
 * image: no quantization, palette reduction, posterization, or
 * nearest-neighbour resampling occurs here. The legacy variant names remain
 * internal compatibility seams for saved preferences and URLs. */
export async function renderDebateMysteryRoomArtV1(
  input: Buffer,
  options: {
    variant?: DebateMysteryRoomArtVariantV1;
    format?: DebateMysteryRoomArtFormatV1;
  } = {},
): Promise<DebateMysteryRoomArtResultV1> {
  const contract = DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1;
  const variant = options.variant ?? "mosaic-reference";
  const format = options.format ?? "webp";

  const normalized = sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: { r: 3, g: 8, b: 14 } })
    .resize(contract.outputWidth, contract.outputHeight, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha();

  const bytes = await encodeRoomArt(
    normalized,
    format,
  ).toBuffer();

  return {
    bytes,
    mimeType: format === "png" ? "image/png" : "image/webp",
    width: contract.outputWidth,
    height: contract.outputHeight,
    variant,
  };
}

export function buildDebateMysteryIllustratedRoomUpgradePromptV1(args: {
  roomName: string;
  houseStylePrompt: string;
  roomBrief: string;
}): string {
  return [
    `Create a polished high-definition interpretation of this exact ${args.roomName} investigation room Mosaic.`,
    args.houseStylePrompt.trim(),
    args.roomBrief.trim(),
    "Treat the supplied high-resolution Mosaic room image as the sole strict composition and geometry reference.",
    "Keep every wall, doorway, floor division, architectural silhouette, camera edge, and furniture anchor in the exact same screen position and at the exact same scale across the full 16:9 frame.",
    "Preserve its camera, walls, floor divisions, stairs, doors, traversal openings, furniture anchors, inspection regions, and evidence-safe sightlines.",
    "Restore believable natural materials, photographic depth, nuanced lighting, and smooth edges without changing navigation, introducing people, or inventing clues, text, symbols, blood, weapons, or case facts.",
    "Return an unoccupied 16:9 room plate. Presentation changes only; the mystery remains immutable.",
  ].filter(Boolean).join(" ");
}
