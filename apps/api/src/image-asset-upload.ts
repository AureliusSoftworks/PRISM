import sharp from "sharp";

export const IMAGE_ASSET_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export interface NormalizedImageAssetUpload {
  pngBytes: Buffer;
  width: number;
  height: number;
}

export function parseImageAssetDataUrl(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new Error("Image upload requires a data URL.");
  }
  const match = value.match(
    /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,([A-Za-z0-9+/=\r\n]+)$/iu,
  );
  if (!match?.[1]) {
    throw new Error("Upload a PNG, JPEG, WebP, GIF, or AVIF image.");
  }
  const bytes = Buffer.from(match[1].replace(/\s+/gu, ""), "base64");
  if (bytes.length === 0) throw new Error("The uploaded image was empty.");
  if (bytes.length > IMAGE_ASSET_UPLOAD_MAX_BYTES) {
    throw new Error("The uploaded image is larger than 20 MB.");
  }
  return bytes;
}

export async function normalizeImageAssetUpload(
  value: unknown,
  options: { width?: number; height?: number; fit?: "inside" | "cover" } = {},
): Promise<NormalizedImageAssetUpload> {
  const source = parseImageAssetDataUrl(value);
  const width = Math.max(256, Math.min(4096, options.width ?? 2048));
  const height = Math.max(256, Math.min(4096, options.height ?? 2048));
  const pngBytes = await sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, height, {
      fit: options.fit ?? "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(pngBytes).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The uploaded image dimensions could not be read.");
  }
  return { pngBytes, width: metadata.width, height: metadata.height };
}
