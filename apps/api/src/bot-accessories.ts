import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { tryUnlinkGeneratedImageFile } from "./image-storage.ts";

export const BOT_ACCESSORY_IMAGE_PURPOSE = "bot_accessory";
export const BOT_ACCESSORY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const BOT_ACCESSORY_SIZE = "512x512";

export function botAccessoryImageBelongsToBot(
  db: DatabaseSync,
  userId: string,
  botId: string,
  imageId: string
): boolean {
  const row = db
    .prepare(
      `SELECT id FROM images
       WHERE id = ?
         AND user_id = ?
         AND bot_id = ?
         AND purpose = ?
       LIMIT 1`
    )
    .get(imageId, userId, botId, BOT_ACCESSORY_IMAGE_PURPOSE) as
    | { id?: string }
    | undefined;
  return Boolean(row?.id);
}

export function parseBotAccessoryDataUrl(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== "string") {
    throw new Error("Accessory upload requires a data URL.");
  }
  const match = dataUrl.match(/^data:image\/(?:png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match?.[1]) {
    throw new Error("Accessory must be a transparent PNG or WebP data URL.");
  }
  const bytes = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (bytes.length === 0) {
    throw new Error("Accessory upload was empty.");
  }
  if (bytes.length > BOT_ACCESSORY_UPLOAD_MAX_BYTES) {
    throw new Error("Accessory upload is too large.");
  }
  return bytes;
}

export async function normalizeBotAccessoryPngBytes(
  inputBytes: Buffer
): Promise<Buffer> {
  return sharp(inputBytes, { limitInputPixels: 12_000_000 })
    .rotate()
    .resize(512, 512, {
      fit: "contain",
      position: "center",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export function clearBotAccessoryReference(
  db: DatabaseSync,
  userId: string,
  imageId: string,
  updatedAt = new Date().toISOString()
): void {
  db.prepare(
    "UPDATE bots SET accessory_image_id = NULL, updated_at = ? WHERE user_id = ? AND accessory_image_id = ?"
  ).run(updatedAt, userId, imageId);
}

export function deleteBotAccessoryImageIfOwned(
  db: DatabaseSync,
  userId: string,
  botId: string,
  imageId: string | null | undefined,
  unlinkImageFile: (localRelPath: string | null | undefined) => void = tryUnlinkGeneratedImageFile
): void {
  const trimmed = imageId?.trim();
  if (!trimmed) return;
  const row = db
    .prepare(
      `SELECT local_rel_path FROM images
       WHERE id = ?
         AND user_id = ?
         AND bot_id = ?
         AND purpose = ?`
    )
    .get(trimmed, userId, botId, BOT_ACCESSORY_IMAGE_PURPOSE) as
    | { local_rel_path: string | null }
    | undefined;
  if (!row) return;
  db.prepare("DELETE FROM images WHERE id = ? AND user_id = ?").run(trimmed, userId);
  unlinkImageFile(row.local_rel_path);
}
