import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { tryUnlinkGeneratedImageFile } from "./image-storage.ts";

export const BOT_PROFILE_PICTURE_IMAGE_PURPOSE = "bot_profile_picture";
export const BOT_PROFILE_PICTURE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const BOT_PROFILE_PICTURE_SIZE = "1024x1024";
export const GALLERY_EXCLUDED_PURPOSE_SQL =
  "COALESCE(purpose, 'gallery') NOT IN ('wallpaper', 'bot_profile_picture')";

export function botProfilePictureImageBelongsToBot(
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
    .get(imageId, userId, botId, BOT_PROFILE_PICTURE_IMAGE_PURPOSE) as
    | { id?: string }
    | undefined;
  return Boolean(row?.id);
}

export function readProfilePictureImageIdForBot(
  db: DatabaseSync,
  value: unknown,
  userId: string,
  botId: string
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Profile picture image id must be a string or null.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!botProfilePictureImageBelongsToBot(db, userId, botId, trimmed)) {
    throw new Error("Profile picture image was not found for this bot.");
  }
  return trimmed;
}

export function parseBotProfilePictureDataUrl(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== "string") {
    throw new Error("Profile picture upload requires a data URL.");
  }
  const match = dataUrl.match(/^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match?.[1]) {
    throw new Error("Profile picture must be a PNG, JPEG, or WebP data URL.");
  }
  const bytes = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (bytes.length === 0) {
    throw new Error("Profile picture upload was empty.");
  }
  if (bytes.length > BOT_PROFILE_PICTURE_UPLOAD_MAX_BYTES) {
    throw new Error("Profile picture upload is too large.");
  }
  return bytes;
}

export async function normalizeBotProfilePicturePngBytes(inputBytes: Buffer): Promise<Buffer> {
  return sharp(inputBytes, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize(1024, 1024, {
      fit: "cover",
      position: "center",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

export function clearBotProfilePictureReference(
  db: DatabaseSync,
  userId: string,
  imageId: string,
  updatedAt = new Date().toISOString()
): void {
  db.prepare(
    "UPDATE bots SET profile_picture_image_id = NULL, updated_at = ? WHERE user_id = ? AND profile_picture_image_id = ?"
  ).run(updatedAt, userId, imageId);
}

export function deleteBotProfilePictureImageIfOwned(
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
    .get(trimmed, userId, botId, BOT_PROFILE_PICTURE_IMAGE_PURPOSE) as
    | { local_rel_path: string | null }
    | undefined;
  if (!row) return;
  db.prepare("DELETE FROM images WHERE id = ? AND user_id = ?").run(trimmed, userId);
  unlinkImageFile(row.local_rel_path);
}
