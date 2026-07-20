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
 * Returns existing thumb bytes or creates the sidecar from the PNG and returns those bytes.
 */
export async function readOrCreateThumbBytes(
  localPngRelPath: string,
  encode: (inputBytes: Buffer) => Promise<Buffer> = encodeWebpThumbFromRasterBytes,
): Promise<Buffer> {
  const thumbRel = thumbWebpRelativePathFromPngRelativePath(localPngRelPath);
  const absThumb = resolveAbsoluteUnderDataRoot(thumbRel);
  if (existsSync(absThumb)) {
    return readFileSync(absThumb);
  }
  const absPng = resolveAbsoluteUnderDataRoot(localPngRelPath);
  const pngBytes = readGeneratedImageBytes(localPngRelPath);
  const webp = await encode(pngBytes);
  // No JavaScript cleanup can interleave between this synchronous existence
  // check and the atomic write. If Asset Cleanup moved the PNG while encoding,
  // do not recreate an orphan thumbnail in generated-images.
  if (!existsSync(absPng)) {
    throw new Error("Generated image was removed while creating its thumbnail.");
  }
  writeThumbWebpAtomically(absThumb, webp);
  return webp;
}
