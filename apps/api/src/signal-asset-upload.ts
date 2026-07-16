import sharp from "sharp";

export type SignalAssetSlot = "day-studio" | "night-studio" | "logo";

export const SIGNAL_ASSET_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;

const SIGNAL_ASSET_UPLOAD_MAX_PIXELS = 40_000_000;
const SIGNAL_ASSET_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/iu;

export interface NormalizedSignalAssetUpload {
  pngBytes: Buffer;
  width: number;
  height: number;
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
    const pipeline = sharp(sourceBytes, {
      failOn: "error",
      limitInputPixels: SIGNAL_ASSET_UPLOAD_MAX_PIXELS,
    }).rotate();
    const normalized = await (slot === "logo"
      ? pipeline.resize(1024, 1024, { fit: "cover", position: "center" })
      : pipeline.resize(2048, 1536, {
          fit: "inside",
          withoutEnlargement: true,
        }))
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
    if (error instanceof Error && /too large after normalization/iu.test(error.message)) {
      throw error;
    }
    throw new Error("Signal asset image could not be read.");
  }
}
