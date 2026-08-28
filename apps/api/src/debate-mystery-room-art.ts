import sharp from "sharp";

export const DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1 = Object.freeze({
  version: 1 as const,
  sourceWidth: 1280,
  sourceHeight: 720,
  logicalWidth: 320,
  logicalHeight: 180,
  outputWidth: 1600,
  outputHeight: 900,
  paletteColors: 24,
  dither: 0,
  cellSize: 5,
  grid: Object.freeze({
    red: 3,
    green: 8,
    blue: 14,
    alpha: 30,
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
  width: 1600;
  height: 900;
  variant: DebateMysteryRoomArtVariantV1;
}

function encodeRoomArt(
  pipeline: sharp.Sharp,
  format: DebateMysteryRoomArtFormatV1,
): sharp.Sharp {
  return format === "png"
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.webp({ lossless: true, effort: 6 });
}

/**
 * Derive PRISM's default investigation-room presentation from any room image.
 *
 * The gridless `mosaic-reference` is retained as the safe visual reference for
 * a later Illustrated upgrade. The visible `mosaic` adds the approved subtle
 * dark physical-pixel grid after nearest-neighbour reconstruction.
 */
export async function renderDebateMysteryRoomArtV1(
  input: Buffer,
  options: {
    variant?: DebateMysteryRoomArtVariantV1;
    format?: DebateMysteryRoomArtFormatV1;
  } = {},
): Promise<DebateMysteryRoomArtResultV1> {
  const contract = DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1;
  const variant = options.variant ?? "mosaic";
  const format = options.format ?? "webp";

  // Palette reduction intentionally happens before logical sampling. Encoding
  // to a palette PNG gives libvips a deterministic, non-dithered 24-color
  // source without introducing interpolation colors.
  const quantized = await sharp(input, { failOn: "error" })
    .rotate()
    .flatten({ background: { r: 3, g: 8, b: 14 } })
    .resize(contract.sourceWidth, contract.sourceHeight, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha()
    .png({
      palette: true,
      colours: contract.paletteColors,
      dither: contract.dither,
      compressionLevel: 9,
    })
    .toBuffer();

  const logical = await sharp(quantized)
    .resize(contract.logicalWidth, contract.logicalHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  const reconstructed = await sharp(logical, {
    raw: {
      width: contract.logicalWidth,
      height: contract.logicalHeight,
      channels: 3,
    },
  })
    .resize(contract.outputWidth, contract.outputHeight, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .raw()
    .toBuffer();

  if (variant === "mosaic") {
    const { cellSize, grid } = contract;
    const inverseAlpha = 255 - grid.alpha;
    for (let y = 0; y < contract.outputHeight; y += 1) {
      for (let x = 0; x < contract.outputWidth; x += 1) {
        if (x % cellSize !== 0 && y % cellSize !== 0) continue;
        const offset = (y * contract.outputWidth + x) * 3;
        reconstructed[offset] = Math.round(
          (reconstructed[offset]! * inverseAlpha + grid.red * grid.alpha) / 255,
        );
        reconstructed[offset + 1] = Math.round(
          (reconstructed[offset + 1]! * inverseAlpha + grid.green * grid.alpha) / 255,
        );
        reconstructed[offset + 2] = Math.round(
          (reconstructed[offset + 2]! * inverseAlpha + grid.blue * grid.alpha) / 255,
        );
      }
    }
  }

  const bytes = await encodeRoomArt(
    sharp(reconstructed, {
      raw: {
        width: contract.outputWidth,
        height: contract.outputHeight,
        channels: 3,
      },
    }),
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
    `Create a polished non-pixel illustrated version of this exact ${args.roomName} investigation room.`,
    args.houseStylePrompt.trim(),
    args.roomBrief.trim(),
    "Treat the supplied gridless 24-color room image as a strict composition and geometry reference.",
    "Preserve its camera, walls, floor divisions, stairs, doors, traversal openings, furniture anchors, inspection regions, and evidence-safe sightlines.",
    "Restore natural material detail, nuanced lighting, and smooth edges without changing navigation, introducing people, or inventing clues, text, symbols, blood, weapons, or case facts.",
    "Return an unoccupied 16:9 room plate. Presentation changes only; the mystery remains immutable.",
  ].filter(Boolean).join(" ");
}
