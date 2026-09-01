import type { DatabaseSync } from "node:sqlite";
import type { PrismJsonObject, PrismJsonValue } from "@localai/shared";
import { clearBotProfilePictureReference } from "./bot-profile-pictures.ts";
import { imageAssetUsageLabels } from "./image-asset-cleanup.ts";
import {
  listGeneratedImageRecoveryBatchesForUser,
  markGeneratedImageQuarantineCommitted,
  markGeneratedImageRecoveryBatchRestoring,
  quarantineGeneratedImageFiles,
  requarantineGeneratedImageRecoveryBatch,
  restoreQuarantinedGeneratedImageFiles,
} from "./image-storage.ts";
import { randomId } from "./security.ts";

export interface PrismImageDeletion {
  imageId: string;
  prompt: string;
  row: PrismJsonObject;
  botReferences: PrismJsonObject[];
  recoveryId: string;
  appliedAt: string;
}

function imageRow(
  db: DatabaseSync,
  userId: string,
  imageId: string,
): Record<string, unknown> {
  const row = db
    .prepare("SELECT * FROM images WHERE user_id = ? AND id = ?")
    .get(userId, imageId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Image not found.");
  return row;
}

function jsonRow(row: Record<string, unknown>): PrismJsonObject {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number"
      ) {
        return [key, value];
      }
      throw new Error(`Image ${key} cannot be journaled.`);
    }),
  ) as PrismJsonObject;
}

function primitive(
  value: PrismJsonValue | undefined,
): string | number | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value ?? null;
  }
  throw new Error("Image undo data is invalid.");
}

function stringField(row: PrismJsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Image ${key} is invalid.`);
  }
  return value;
}

function assertReusableImageIsUnused(
  db: DatabaseSync,
  userId: string,
  row: Record<string, unknown>,
): void {
  const imageId = typeof row.id === "string" ? row.id : "";
  const membership = db
    .prepare(
      `SELECT items.set_id
         FROM image_asset_set_items items
         JOIN image_asset_sets sets ON sets.id = items.set_id
        WHERE items.image_id = ? AND sets.user_id = ?`,
    )
    .get(imageId, userId) as { set_id: string } | undefined;
  const memberIds = membership
    ? (
        db
          .prepare(
            `SELECT items.image_id
               FROM image_asset_set_items AS items
               JOIN image_asset_sets AS sets ON sets.id = items.set_id
              WHERE sets.user_id = ? AND items.set_id = ?
              ORDER BY items.ordinal, items.image_id`,
          )
          .all(userId, membership.set_id) as Array<{ image_id: string }>
      ).map((member) => member.image_id)
    : [];
  if (memberIds.length > 1) {
    throw new Error(
      "This image belongs to a linked asset set. Use Storage to delete the complete set atomically.",
    );
  }
  const usageImageIds = memberIds.length > 0 ? memberIds : [imageId];
  const usageByImage = imageAssetUsageLabels(db, userId, usageImageIds);
  const usage = [
    ...new Set(usageImageIds.flatMap((id) => usageByImage.get(id) ?? [])),
  ];
  if (usage.length > 0) {
    throw new Error(
      `This asset is still used by ${usage.join(", ")}. Replace it before deleting it.`,
    );
  }
}

export function previewPrismImageDeletion(args: {
  db: DatabaseSync;
  userId: string;
  imageId: string;
}): {
  imageId: string;
  prompt: string;
  localFile: boolean;
  profileReferenceCount: number;
} {
  const row = jsonRow(imageRow(args.db, args.userId, args.imageId));
  assertReusableImageIsUnused(args.db, args.userId, row);
  const profileReferences = args.db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM bots
        WHERE user_id = ? AND profile_picture_image_id = ?`,
    )
    .get(args.userId, args.imageId) as { count: number };
  return {
    imageId: stringField(row, "id"),
    prompt: stringField(row, "prompt"),
    localFile:
      typeof row.local_rel_path === "string" &&
      row.local_rel_path.trim().length > 0,
    profileReferenceCount: Number(profileReferences.count),
  };
}

export function deletePrismImage(args: {
  db: DatabaseSync;
  userId: string;
  imageId: string;
  now: Date;
}): PrismImageDeletion {
  const row = jsonRow(imageRow(args.db, args.userId, args.imageId));
  assertReusableImageIsUnused(args.db, args.userId, row);
  const botReferences = (
    args.db
      .prepare(
        `SELECT id, profile_picture_image_id, updated_at
           FROM bots
          WHERE user_id = ? AND profile_picture_image_id = ?`,
      )
      .all(args.userId, args.imageId) as Array<Record<string, unknown>>
  ).map(jsonRow);
  const recoveryId = `prism-${randomId(12)}`;
  const localRelPath =
    typeof row.local_rel_path === "string" &&
    row.local_rel_path ===
      `generated-images/${args.userId}/${args.imageId}.png`
      ? row.local_rel_path
      : null;
  const quarantine = quarantineGeneratedImageFiles(
    args.userId,
    localRelPath ? [localRelPath] : [],
    recoveryId,
    JSON.stringify({
      quarantinedAt: args.now.toISOString(),
      images: [row],
    }),
  );
  try {
    clearBotProfilePictureReference(
      args.db,
      args.userId,
      args.imageId,
      args.now.toISOString(),
    );
    const deleted = args.db
      .prepare("DELETE FROM images WHERE id = ? AND user_id = ?")
      .run(args.imageId, args.userId);
    if (deleted.changes !== 1) throw new Error("Image not found.");
    markGeneratedImageQuarantineCommitted(quarantine);
  } catch (error) {
    restoreQuarantinedGeneratedImageFiles(quarantine);
    throw error;
  }
  return {
    imageId: args.imageId,
    prompt: stringField(row, "prompt"),
    row,
    botReferences,
    recoveryId,
    appliedAt: args.now.toISOString(),
  };
}

export function undoPrismImageDeletion(args: {
  db: DatabaseSync;
  userId: string;
  row: PrismJsonObject;
  botReferences: PrismJsonObject[];
  recoveryId: string;
  appliedAt: string;
}): void {
  const imageId = stringField(args.row, "id");
  if (stringField(args.row, "user_id") !== args.userId) {
    throw new Error("Image undo data belongs to another account.");
  }
  if (
    args.db
      .prepare("SELECT 1 AS present FROM images WHERE user_id = ? AND id = ?")
      .get(args.userId, imageId)
  ) {
    throw new Error("An image now occupies this restore target.");
  }
  const batch = listGeneratedImageRecoveryBatchesForUser(args.userId).find(
    (candidate) => candidate.journal.recoveryId === args.recoveryId,
  );
  if (!batch) throw new Error("The image recovery payload has expired.");
  for (const reference of args.botReferences) {
    const botId = stringField(reference, "id");
    const current = args.db
      .prepare(
        `SELECT profile_picture_image_id, updated_at
           FROM bots
          WHERE id = ? AND user_id = ?`,
      )
      .get(botId, args.userId) as
      | { profile_picture_image_id: string | null; updated_at: string }
      | undefined;
    if (
      !current ||
      current.profile_picture_image_id !== null ||
      current.updated_at !== args.appliedAt
    ) {
      throw new Error(
        "A bot profile picture changed after this deletion; undo was stopped.",
      );
    }
  }
  markGeneratedImageRecoveryBatchRestoring(batch);
  let filesRestored = false;
  try {
    const columns = Object.keys(args.row);
    if (
      columns.length === 0 ||
      columns.some((column) => !/^[a-z][a-z0-9_]*$/u.test(column))
    ) {
      throw new Error("Image undo data is invalid.");
    }
    args.db
      .prepare(
        `INSERT INTO images (${columns.join(", ")})
         VALUES (${columns.map(() => "?").join(", ")})`,
      )
      .run(...columns.map((column) => primitive(args.row[column])));
    restoreQuarantinedGeneratedImageFiles(batch.quarantine, {
      keepManifest: true,
    });
    filesRestored = true;
    for (const reference of args.botReferences) {
      args.db
        .prepare(
          `UPDATE bots
              SET profile_picture_image_id = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`,
        )
        .run(
          imageId,
          stringField(reference, "updated_at"),
          stringField(reference, "id"),
          args.userId,
        );
    }
  } catch (error) {
    if (filesRestored) {
      try {
        requarantineGeneratedImageRecoveryBatch(batch);
        markGeneratedImageQuarantineCommitted(batch.quarantine);
      } catch {
        // The restoring journal remains for startup recovery.
      }
    }
    throw error;
  }
  // Keep the restoring journal until the outer action transaction commits.
  // Startup/cleanup reconciliation removes it when the restored row is
  // visible, or safely re-quarantines the file if that transaction rolls back.
}
