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
import {
  readGeneratedImageBytes,
  resolveAbsoluteUnderDataRoot,
  thumbWebpRelativePathFromPngRelativePath,
} from "./image-storage.ts";

/** Longest edge for inline chat / gallery tiles (decode cost vs clarity on hi-DPI). */
export const GENERATED_IMAGE_THUMB_MAX_EDGE_PX = 512;

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
    if (!existsSync(absolutePngPath)) return;
    const thumbRel = thumbWebpRelativePathFromPngRelativePath(localPngRelPath);
    writeThumbWebpAtomically(resolveAbsoluteUnderDataRoot(thumbRel), webp);
  } catch (error) {
    console.warn(
      "[image-thumb] post-write thumb failed:",
      error instanceof Error ? error.message : error
    );
  }
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
