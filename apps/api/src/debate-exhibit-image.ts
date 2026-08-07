import sharp from "sharp";
import {
  debateEvidenceExhibitTitle,
  normalizeDebateEvidenceExhibitAdjective,
  normalizeDebateEvidenceExhibitObject,
} from "@localai/shared";
import { applyAutomaticMagentaCleanupPasses } from "./image-magenta-pass.ts";

export const DEBATE_EXHIBIT_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
export const DEBATE_EXHIBIT_IMAGE_SIZE = 1024;

const DEBATE_EXHIBIT_IMAGE_MAX_PIXELS = 40_000_000;
const DEBATE_EXHIBIT_COLOR_KEY = [255, 0, 255] as const;
const DEBATE_EXHIBIT_COLOR_KEY_DISTANCE = 46;
const DEBATE_EXHIBIT_UPLOAD_BACKGROUND_DISTANCE = 44;
const DEBATE_EXHIBIT_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/iu;

export interface DebateExhibitDescriptor {
  adjective: string;
  object: string;
  title: string;
}

export interface NormalizedDebateExhibitImage {
  pngBytes: Buffer;
  width: number;
  height: number;
}

export function normalizeDebateExhibitDescriptor(args: {
  adjective: unknown;
  object: unknown;
}): DebateExhibitDescriptor {
  const adjective = normalizeDebateEvidenceExhibitAdjective(args.adjective);
  const object = normalizeDebateEvidenceExhibitObject(args.object);
  const title = debateEvidenceExhibitTitle({ adjective, object });
  if (!adjective || !object || !title) {
    throw new Error(
      "An evidence object needs one adjective and one object before it can be synthesized.",
    );
  }
  return { adjective, object, title };
}

/**
 * One server-owned art bible keeps every Debate exhibit legible as part of the
 * same visual collection, independent of the selected image provider.
 */
export function buildDebateExhibitSpritePrompt(args: {
  adjective: unknown;
  object: unknown;
}): string {
  const descriptor = normalizeDebateExhibitDescriptor(args);
  return [
    `Create one evidence exhibit sprite depicting exactly: "${descriptor.title}".`,
    "PRISM evidence-exhibit house style: one tactile premium miniature with grounded materials, restrained near-real proportions, a slightly stylized museum-maquette finish, crisp silhouette, and meticulous object-defining details.",
    "Use the same consistent three-quarter view, gentle overhead key light, cool neutral fill, subtle rim light, moderate contrast, and clean catalog readability used for every object in this collection.",
    "Center exactly one complete subject, occupying about 70 percent of the square canvas. Scale even enormous subjects such as vehicles or buildings into a convincing collectible miniature without adding a scene.",
    "No people unless the named subject is itself a person or creature. No extra props, duplicate subjects, scenery, room, landscape, pedestal, plaque, border, card, caption, symbols, lettering, logo, watermark, or readable text.",
    "Output one full-frame opaque square image. Fill every background pixel with the exact flat electric-magenta color key #FF00FF, and keep #FF00FF out of the subject itself. Do not use black, white, a gradient, or a photographic environment as the background.",
    "The subject must remain unmistakable at 96 pixels and look appropriate hovering above a dark or light PRISM evidence pedestal after the magenta background is removed.",
  ].join(" ");
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

function cornerBackgrounds(
  pixels: Buffer,
  width: number,
  height: number,
): Array<readonly [number, number, number]> {
  return [
    rgbaOffset(width, 0, 0),
    rgbaOffset(width, width - 1, 0),
    rgbaOffset(width, 0, height - 1),
    rgbaOffset(width, width - 1, height - 1),
  ].map(
    (offset) =>
      [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!] as const,
  );
}

function edgeColorMatchRatio(
  pixels: Buffer,
  width: number,
  height: number,
  background: readonly [number, number, number],
  threshold: number,
): number {
  let matched = 0;
  let total = 0;
  const count = (x: number, y: number): void => {
    total += 1;
    if (rgbDistance(pixels, rgbaOffset(width, x, y), background) <= threshold) {
      matched += 1;
    }
  };
  for (let x = 0; x < width; x += 1) {
    count(x, 0);
    count(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    count(0, y);
    count(width - 1, y);
  }
  return total > 0 ? matched / total : 0;
}

function clearConnectedBackground(
  pixels: Buffer,
  width: number,
  height: number,
  backgrounds: readonly (readonly [number, number, number])[],
  threshold: number,
): number {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const matches = (pixelIndex: number): boolean => {
    const offset = pixelIndex * 4;
    if (pixels[offset + 3] === 0) return true;
    return backgrounds.some(
      (background) => rgbDistance(pixels, offset, background) <= threshold,
    );
  };
  const enqueue = (pixelIndex: number): void => {
    if (visited[pixelIndex] || !matches(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
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
    pixels[offset + 3] = 0;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }
  return queueEnd;
}

async function normalizeDebateExhibitImageBytes(
  sourceBytes: Buffer,
  options: { generated: boolean },
): Promise<NormalizedDebateExhibitImage> {
  let pipeline = sharp(sourceBytes, {
    failOn: "error",
    limitInputPixels: DEBATE_EXHIBIT_IMAGE_MAX_PIXELS,
  })
    .rotate()
    .resize(DEBATE_EXHIBIT_IMAGE_SIZE, DEBATE_EXHIBIT_IMAGE_SIZE, {
      fit: "contain",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  if (options.generated) {
    pipeline = pipeline.flatten({
      background: {
        r: DEBATE_EXHIBIT_COLOR_KEY[0],
        g: DEBATE_EXHIBIT_COLOR_KEY[1],
        b: DEBATE_EXHIBIT_COLOR_KEY[2],
      },
    });
  }
  const prepared = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = prepared.info;
  if (channels !== 4) {
    throw new Error("Evidence exhibit could not be normalized to RGBA.");
  }
  const pixels = Buffer.from(prepared.data);
  let transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset]! < 250) transparentPixels += 1;
  }
  if (options.generated) {
    const keyed =
      edgeColorMatchRatio(
        pixels,
        width,
        height,
        DEBATE_EXHIBIT_COLOR_KEY,
        DEBATE_EXHIBIT_COLOR_KEY_DISTANCE,
      ) >= 0.52;
    clearConnectedBackground(
      pixels,
      width,
      height,
      keyed
        ? [DEBATE_EXHIBIT_COLOR_KEY]
        : cornerBackgrounds(pixels, width, height),
      keyed
        ? DEBATE_EXHIBIT_COLOR_KEY_DISTANCE
        : DEBATE_EXHIBIT_UPLOAD_BACKGROUND_DISTANCE,
    );
  } else if (transparentPixels < width * height * 0.02) {
    clearConnectedBackground(
      pixels,
      width,
      height,
      cornerBackgrounds(pixels, width, height),
      DEBATE_EXHIBIT_UPLOAD_BACKGROUND_DISTANCE,
    );
  }

  let visiblePixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset]! > 16) visiblePixels += 1;
  }
  if (visiblePixels < width * height * 0.01) {
    throw new Error("Evidence exhibit image needs one visible subject.");
  }

  const normalized = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .resize(DEBATE_EXHIBIT_IMAGE_SIZE, DEBATE_EXHIBIT_IMAGE_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const pngBytes = options.generated
    ? (await applyAutomaticMagentaCleanupPasses(normalized.data)).pngBytes
    : normalized.data;
  return {
    pngBytes,
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

export async function normalizeGeneratedDebateExhibitImage(
  sourceBytes: Buffer,
): Promise<NormalizedDebateExhibitImage> {
  return normalizeDebateExhibitImageBytes(sourceBytes, { generated: true });
}

export function parseDebateExhibitImageDataUrl(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new Error("Evidence exhibit upload requires an image.");
  }
  const match = value.match(DEBATE_EXHIBIT_DATA_URL_PATTERN);
  if (!match?.[1]) {
    throw new Error("Upload a PNG, JPEG, or WebP evidence image.");
  }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0) {
    throw new Error("Evidence exhibit image is empty.");
  }
  if (bytes.length > DEBATE_EXHIBIT_IMAGE_MAX_BYTES) {
    throw new Error("Evidence exhibit images must be 16 MB or smaller.");
  }
  return bytes;
}

export async function normalizeUploadedDebateExhibitImage(
  value: unknown,
): Promise<NormalizedDebateExhibitImage> {
  return normalizeDebateExhibitImageBytes(
    parseDebateExhibitImageDataUrl(value),
    { generated: false },
  );
}
