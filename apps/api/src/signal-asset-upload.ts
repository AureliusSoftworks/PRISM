import sharp from "sharp";

export type SignalAssetSlot = "day-studio" | "night-studio" | "logo";

export const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;

const SIGNAL_ASSET_UPLOAD_MAX_PIXELS = 40_000_000;
const SIGNAL_LOGO_SIZE = 1024;
const SIGNAL_LOGO_BACKGROUND_DISTANCE = 72;
const SIGNAL_LOGO_COLOR_KEY = [255, 0, 255] as const;
const SIGNAL_LOGO_COLOR_KEY_DISTANCE = 28;
const SIGNAL_LOGO_LEGACY_BLACK_MAX = 36;
const SIGNAL_GENERATED_BACKGROUND_EDGE_MATCH_RATIO = 0.92;
const SIGNAL_ASSET_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/iu;

export interface NormalizedSignalAssetUpload {
  pngBytes: Buffer;
  width: number;
  height: number;
}

function rgbaOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function rgbDistance(
  pixels: Buffer,
  offset: number,
  background: readonly [number, number, number],
): number {
  return Math.max(
    Math.abs(pixels[offset]! - background[0]),
    Math.abs(pixels[offset + 1]! - background[1]),
    Math.abs(pixels[offset + 2]! - background[2]),
  );
}

function rgbTupleDistance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
}

function clearConnectedLogoBackground(
  pixels: Buffer,
  width: number,
  height: number,
  forcedBackgrounds?: readonly (readonly [number, number, number])[],
): void {
  const cornerOffsets = [
    rgbaOffset(width, 0, 0),
    rgbaOffset(width, width - 1, 0),
    rgbaOffset(width, 0, height - 1),
    rgbaOffset(width, width - 1, height - 1),
  ];
  const backgrounds =
    forcedBackgrounds ??
    cornerOffsets.map(
      (offset) =>
        [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!] as const,
    );
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  const distanceFromBackground = (pixelIndex: number): number => {
    const offset = pixelIndex * 4;
    return Math.min(
      ...backgrounds.map((background) =>
        rgbDistance(pixels, offset, background),
      ),
    );
  };
  const enqueue = (pixelIndex: number): void => {
    if (
      visited[pixelIndex] ||
      distanceFromBackground(pixelIndex) > SIGNAL_LOGO_BACKGROUND_DISTANCE
    ) {
      return;
    }
    visited[pixelIndex] = 1;
    queue[queueEnd] = pixelIndex;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++]!;
    const offset = pixelIndex * 4;
    const distance = distanceFromBackground(pixelIndex);
    pixels[offset + 3] =
      distance <= SIGNAL_LOGO_BACKGROUND_DISTANCE / 3
        ? 0
        : Math.min(
            pixels[offset + 3]!,
            Math.round(
              ((distance - SIGNAL_LOGO_BACKGROUND_DISTANCE / 3) /
                (SIGNAL_LOGO_BACKGROUND_DISTANCE * (2 / 3))) *
                255,
            ),
          );
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }
}

function replaceConnectedGeneratedLogoKey(
  pixels: Buffer,
  width: number,
  height: number,
): boolean {
  const cornerOffsets = [
    rgbaOffset(width, 0, 0),
    rgbaOffset(width, width - 1, 0),
    rgbaOffset(width, 0, height - 1),
    rgbaOffset(width, width - 1, height - 1),
  ];
  const cornerBackgrounds = cornerOffsets.map(
    (offset) =>
      [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!] as const,
  );
  let backgrounds = cornerBackgrounds.filter(
    (background) =>
      Math.max(...background) <= SIGNAL_LOGO_LEGACY_BLACK_MAX ||
      rgbTupleDistance(background, SIGNAL_LOGO_COLOR_KEY) <=
        SIGNAL_LOGO_COLOR_KEY_DISTANCE,
  );
  if (backgrounds.length === 0) {
    const anchor = cornerBackgrounds[0]!;
    if (
      !cornerBackgrounds.every(
        (background) =>
          rgbTupleDistance(background, anchor) <=
          SIGNAL_LOGO_COLOR_KEY_DISTANCE,
      )
    ) {
      return false;
    }
    let edgePixels = 0;
    let matchingEdgePixels = 0;
    const measureEdgePixel = (pixelIndex: number): void => {
      edgePixels += 1;
      const offset = pixelIndex * 4;
      if (
        cornerBackgrounds.some(
          (background) =>
            rgbDistance(pixels, offset, background) <=
            SIGNAL_LOGO_COLOR_KEY_DISTANCE,
        )
      ) {
        matchingEdgePixels += 1;
      }
    };
    for (let x = 0; x < width; x += 1) {
      measureEdgePixel(x);
      measureEdgePixel((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      measureEdgePixel(y * width);
      measureEdgePixel(y * width + width - 1);
    }
    if (
      matchingEdgePixels <
      edgePixels * SIGNAL_GENERATED_BACKGROUND_EDGE_MATCH_RATIO
    ) {
      return false;
    }
    backgrounds = cornerBackgrounds;
  }

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueue = (pixelIndex: number): void => {
    if (visited[pixelIndex]) return;
    const offset = pixelIndex * 4;
    const connected = backgrounds.some(
      (background) =>
        rgbDistance(pixels, offset, background) <=
        SIGNAL_LOGO_BACKGROUND_DISTANCE,
    );
    if (!connected) return;
    visited[pixelIndex] = 1;
    queue[queueEnd] = pixelIndex;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++]!;
    const offset = pixelIndex * 4;
    pixels[offset] = SIGNAL_LOGO_COLOR_KEY[0];
    pixels[offset + 1] = SIGNAL_LOGO_COLOR_KEY[1];
    pixels[offset + 2] = SIGNAL_LOGO_COLOR_KEY[2];
    pixels[offset + 3] = 255;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }
  return queueEnd > 0;
}

export async function normalizeSignalLogoImage(
  sourceBytes: Buffer,
  options: { generated?: boolean } = {},
): Promise<NormalizedSignalAssetUpload> {
  let pipeline = sharp(sourceBytes, {
    failOn: "error",
    limitInputPixels: SIGNAL_ASSET_UPLOAD_MAX_PIXELS,
  })
    .rotate()
    .resize(SIGNAL_LOGO_SIZE, SIGNAL_LOGO_SIZE, {
      fit: "inside",
      withoutEnlargement: false,
    });
  if (options.generated) {
    pipeline = pipeline.flatten({
      background: {
        r: SIGNAL_LOGO_COLOR_KEY[0],
        g: SIGNAL_LOGO_COLOR_KEY[1],
        b: SIGNAL_LOGO_COLOR_KEY[2],
      },
    });
  }
  const prepared = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = prepared.info;
  if (channels !== 4) {
    throw new Error("Signal logo could not be normalized to RGBA.");
  }
  const pixels = Buffer.from(prepared.data);
  let transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset]! < 250) transparentPixels += 1;
  }
  if (options.generated) {
    if (!replaceConnectedGeneratedLogoKey(pixels, width, height)) {
      throw new Error(
        "Generated Signal logo needs the exact magenta color-key background.",
      );
    }
    clearConnectedLogoBackground(pixels, width, height, [
      SIGNAL_LOGO_COLOR_KEY,
    ]);
  } else if (transparentPixels === 0) {
    clearConnectedLogoBackground(pixels, width, height);
  }

  let visiblePixels = 0;
  transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset]! < 250) transparentPixels += 1;
    if (pixels[offset]! > 16) visiblePixels += 1;
  }
  const pixelCount = width * height;
  if (transparentPixels < pixelCount * 0.02) {
    throw new Error(
      "Signal logo needs a transparent or removable plain background.",
    );
  }
  if (visiblePixels < pixelCount * 0.01) {
    throw new Error("Signal logo needs a visible mark.");
  }

  const normalized = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .resize(SIGNAL_LOGO_SIZE, SIGNAL_LOGO_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return {
    pngBytes: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

export function readSignalAssetSlot(value: unknown): SignalAssetSlot {
  if (value === "day-studio" || value === "night-studio" || value === "logo") {
    return value;
  }
  throw new Error("Signal asset must be a Light studio, Dark studio, or logo.");
}

function parseSignalAssetDataUrl(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new Error("Signal asset upload requires an image.");
  }
  const match = SIGNAL_ASSET_DATA_URL_PATTERN.exec(value);
  if (!match?.[1]) {
    throw new Error("Signal assets must be PNG, JPEG, or WebP images.");
  }
  const bytes = Buffer.from(match[1].replace(/\s+/gu, ""), "base64");
  if (bytes.length === 0) {
    throw new Error("Signal asset upload was empty.");
  }
  if (bytes.length > SIGNAL_ASSET_UPLOAD_MAX_BYTES) {
    throw new Error("Signal asset upload is too large.");
  }
  return bytes;
}

export async function normalizeSignalAssetUpload(
  value: unknown,
  slot: SignalAssetSlot,
): Promise<NormalizedSignalAssetUpload> {
  const sourceBytes = parseSignalAssetDataUrl(value);
  try {
    if (slot === "logo") {
      const normalizedLogo = await normalizeSignalLogoImage(sourceBytes);
      if (normalizedLogo.pngBytes.length > SIGNAL_ASSET_UPLOAD_MAX_BYTES) {
        throw new Error("Signal asset upload is too large after normalization.");
      }
      return normalizedLogo;
    }
    const pipeline = sharp(sourceBytes, {
      failOn: "error",
      limitInputPixels: SIGNAL_ASSET_UPLOAD_MAX_PIXELS,
    }).rotate();
    const normalized = await pipeline
      .resize(2048, 1536, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    if (normalized.data.length > SIGNAL_ASSET_UPLOAD_MAX_BYTES) {
      throw new Error("Signal asset upload is too large after normalization.");
    }
    return {
      pngBytes: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /too large after normalization|Signal logo needs/iu.test(error.message)
    ) {
      throw error;
    }
    throw new Error("Signal asset image could not be read.");
  }
}
