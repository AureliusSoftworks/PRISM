import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { assertRefractionActive } from "./refraction-cancellation.ts";
import {
  readGeneratedImageBytes,
  resolveAbsoluteUnderDataRoot,
  thumbWebpRelativePathFromPngRelativePath,
} from "./image-storage.ts";

/** Longest edge for inline chat / gallery tiles (decode cost vs clarity on hi-DPI). */
export const GENERATED_IMAGE_THUMB_MAX_EDGE_PX = 512;

/** Deliberately small, replay-owned Signal image proxy. */
export const SIGNAL_REPLAY_IMAGE_PROXY_MAX_EDGE_PX = 128;
export const SIGNAL_REPLAY_IMAGE_PROXY_QUALITY = 40;

/**
 * Downscale arbitrary raster bytes (typically PNG) to a bounded WebP thumbnail.
 */
export async function encodeWebpThumbFromRasterBytes(inputBytes: Buffer): Promise<Buffer> {
  return sharp(inputBytes)
    .resize(GENERATED_IMAGE_THUMB_MAX_EDGE_PX, GENERATED_IMAGE_THUMB_MAX_EDGE_PX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
}

/**
 * Encodes the durable, intentionally degraded image used by new Signal
 * replays. The source is normalized PNG bytes, so WebP preserves transparency
 * for physical items while dropping EXIF and other source metadata.
 */
export async function encodeSignalReplayImageProxyFromRasterBytes(
  inputBytes: Buffer,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const encoded = await sharp(inputBytes)
    .rotate()
    .resize(
      SIGNAL_REPLAY_IMAGE_PROXY_MAX_EDGE_PX,
      SIGNAL_REPLAY_IMAGE_PROXY_MAX_EDGE_PX,
      {
        fit: "inside",
        withoutEnlargement: true,
      },
    )
    .webp({
      quality: SIGNAL_REPLAY_IMAGE_PROXY_QUALITY,
      alphaQuality: SIGNAL_REPLAY_IMAGE_PROXY_QUALITY,
    })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
  };
}

/**
 * Writes thumbnail bytes via temp file + rename to avoid torn reads under concurrent GET /thumb.
 */
export function writeThumbWebpAtomically(absoluteThumbPath: string, webpBytes: Buffer): void {
  mkdirSync(dirname(absoluteThumbPath), { recursive: true });
  const tmp = `${absoluteThumbPath}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, webpBytes);
    renameSync(tmp, absoluteThumbPath);
  } finally {
    try {
      if (existsSync(tmp)) {
        unlinkSync(tmp);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Best-effort thumbnail next to a freshly written PNG. Failures are logged; GET /thumb can backfill.
 */
export async function tryGenerateThumbAfterPngWrite(localPngRelPath: string): Promise<void> {
  try {
    const absolutePngPath = resolveAbsoluteUnderDataRoot(localPngRelPath);
    const pngBytes = readGeneratedImageBytes(localPngRelPath);
    const webp = await encodeWebpThumbFromRasterBytes(pngBytes);
    assertRefractionActive();
    if (existsSync(absolutePngPath)) {
      const thumbRel = thumbWebpRelativePathFromPngRelativePath(localPngRelPath);
      writeThumbWebpAtomically(resolveAbsoluteUnderDataRoot(thumbRel), webp);
    }
  } catch {
    console.warn("[image-thumb] post-write thumbnail failed.");
  }
  assertRefractionActive();
}

/**
 * Returns existing thumb bytes or creates the sidecar from the primary and returns those bytes.
 * Primary may be hot PNG or cold full-res WebP.
 */
export async function readOrCreateThumbBytes(
  localPrimaryRelPath: string,
  encode: (inputBytes: Buffer) => Promise<Buffer> = encodeWebpThumbFromRasterBytes,
): Promise<Buffer> {
  const thumbRel = thumbWebpRelativePathFromPngRelativePath(localPrimaryRelPath);
  const absThumb = resolveAbsoluteUnderDataRoot(thumbRel);
  if (existsSync(absThumb)) {
    return readFileSync(absThumb);
  }
  const absPrimary = resolveAbsoluteUnderDataRoot(localPrimaryRelPath);
  const primaryBytes = readGeneratedImageBytes(localPrimaryRelPath);
  const webp = await encode(primaryBytes);
  if (!existsSync(absPrimary)) {
    throw new Error("Generated image was removed while creating its thumbnail.");
  }
  writeThumbWebpAtomically(absThumb, webp);
  return webp;
}
