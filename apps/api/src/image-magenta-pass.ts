import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { ImageAssetKind, ImageAssetMemberRole } from "@localai/shared";
import {
  invalidateGeneratedImageThumbnail,
  readGeneratedImageBytes,
  replaceGeneratedImageBytesAtomically,
} from "./image-storage.ts";
import { tryGenerateThumbAfterPngWrite } from "./image-thumb.ts";
import { generateSignalStudioLightingMap } from "./signal-studio-lighting.ts";
import { decryptBytes, encryptBytes } from "./security.ts";

const MAGENTA_REVISION_RETENTION = 8;
const EDITABLE_ROLES = new Set<ImageAssetMemberRole>([
  "primary",
  "light",
  "dark",
]);

interface AssetMemberFile {
  imageId: string;
  role: ImageAssetMemberRole;
  localRelPath: string;
}

interface PreparedReplacement extends AssetMemberFile {
  before: Buffer;
  after: Buffer;
}

interface RevisionItemRow {
  image_id: string;
  role: ImageAssetMemberRole;
  local_rel_path: string;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
}

export interface ImageMagentaPassResult {
  assetSetId: string;
  changedPixels: number;
  passCount: number;
  undoAvailable: boolean;
}

export class ImageMagentaPassError extends Error {
  readonly code: "not_found" | "invalid" | "unavailable";

  constructor(code: ImageMagentaPassError["code"], message: string) {
    super(message);
    this.name = "ImageMagentaPassError";
    this.code = code;
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * One intentionally moderate color-key cleanup. Repeating it compounds the
 * result. Opaque artwork keeps its alpha; artwork that already has meaningful
 * transparency also fades strong key-magenta remnants toward transparency.
 */
export async function reduceMagentaInPng(input: Buffer): Promise<{
  pngBytes: Buffer;
  changedPixels: number;
}> {
  const raster = await sharp(input, { failOn: "error" })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (raster.info.channels !== 4) {
    throw new ImageMagentaPassError(
      "invalid",
      "This asset could not be read as an RGBA image.",
    );
  }
  const pixels = Buffer.from(raster.data);
  const pixelCount = raster.info.width * raster.info.height;
  let transparentPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset]! < 250) transparentPixels += 1;
  }
  const mayFadeKeyPixels = transparentPixels >= Math.max(1, pixelCount * 0.001);
  let changedPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset]!;
    const green = pixels[offset + 1]!;
    const blue = pixels[offset + 2]!;
    const alpha = pixels[offset + 3]!;
    if (alpha === 0) continue;
    const magentaFloor = Math.min(red, blue);
    const greenDeficit = magentaFloor - green - 12;
    if (greenDeficit <= 0 || magentaFloor < 72) continue;
    const redBlueBalance = 1 - Math.min(1, Math.abs(red - blue) / 104);
    const chromaStrength = Math.min(1, greenDeficit / 176);
    const brightnessStrength = Math.min(1, (magentaFloor - 72) / 150);
    const affinity = redBlueBalance * chromaStrength * brightnessStrength;
    if (affinity < 0.025) continue;

    const liftedGreen = clampByte(
      green + (magentaFloor - green) * 0.55 * affinity,
    );
    const nextRed = clampByte(
      red - Math.max(0, red - liftedGreen) * 0.22 * affinity,
    );
    const nextBlue = clampByte(
      blue - Math.max(0, blue - liftedGreen) * 0.22 * affinity,
    );
    const nextAlpha = mayFadeKeyPixels
      ? clampByte(alpha * (1 - 0.62 * affinity))
      : alpha;
    if (
      nextRed === red &&
      liftedGreen === green &&
      nextBlue === blue &&
      nextAlpha === alpha
    ) {
      continue;
    }
    pixels[offset] = nextRed;
    pixels[offset + 1] = liftedGreen;
    pixels[offset + 2] = nextBlue;
    pixels[offset + 3] = nextAlpha;
    changedPixels += 1;
  }
  if (changedPixels === 0) return { pngBytes: input, changedPixels: 0 };
  return {
    pngBytes: await sharp(pixels, {
      raw: {
        width: raster.info.width,
        height: raster.info.height,
        channels: 4,
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    changedPixels,
  };
}

function loadAssetMemberFiles(
  db: DatabaseSync,
  userId: string,
  setId: string,
): { kind: ImageAssetKind; members: AssetMemberFile[] } {
  const set = db
    .prepare(
      `SELECT kind, status FROM image_asset_sets
        WHERE id = ? AND user_id = ?`,
    )
    .get(setId, userId) as { kind: ImageAssetKind; status: string } | undefined;
  if (!set) {
    throw new ImageMagentaPassError("not_found", "That asset is unavailable.");
  }
  if (set.status !== "ready") {
    throw new ImageMagentaPassError(
      "invalid",
      "Only complete, ready assets can receive a magenta pass.",
    );
  }
  const rows = db
    .prepare(
      `SELECT images.id, items.role, images.local_rel_path
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? AND images.user_id = ?
        ORDER BY items.ordinal, images.id`,
    )
    .all(setId, userId) as Array<{
    id: string;
    role: ImageAssetMemberRole;
    local_rel_path: string | null;
  }>;
  const members = rows.map((row) => {
    const localRelPath = row.local_rel_path?.trim();
    if (!localRelPath) {
      throw new ImageMagentaPassError(
        "unavailable",
        "One of this asset’s original files is unavailable locally.",
      );
    }
    return { imageId: row.id, role: row.role, localRelPath };
  });
  if (!members.some((member) => EDITABLE_ROLES.has(member.role))) {
    throw new ImageMagentaPassError(
      "invalid",
      "This asset has no editable raster members.",
    );
  }
  return { kind: set.kind, members };
}

function activePassCount(
  db: DatabaseSync,
  userId: string,
  setId: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM image_asset_magenta_revisions
        WHERE user_id = ? AND set_id = ? AND status = 'committed'`,
    )
    .get(userId, setId) as { count: number | bigint };
  return Number(row.count);
}

function restoreReplacements(replacements: readonly PreparedReplacement[]): void {
  for (const replacement of replacements) {
    replaceGeneratedImageBytesAtomically(
      replacement.localRelPath,
      replacement.before,
    );
  }
}

async function refreshThumbnails(
  replacements: readonly PreparedReplacement[],
): Promise<void> {
  for (const replacement of replacements) {
    invalidateGeneratedImageThumbnail(replacement.localRelPath);
  }
  await Promise.all(
    replacements.map((replacement) =>
      tryGenerateThumbAfterPngWrite(replacement.localRelPath),
    ),
  );
}

function pruneRevisionHistory(
  db: DatabaseSync,
  userId: string,
  setId: string,
): void {
  db.prepare(
    `DELETE FROM image_asset_magenta_revisions
      WHERE user_id = ? AND set_id = ? AND status = 'undone'`,
  ).run(userId, setId);
  const stale = db
    .prepare(
      `SELECT id FROM image_asset_magenta_revisions
        WHERE user_id = ? AND set_id = ? AND status = 'committed'
        ORDER BY created_at DESC, id DESC
        LIMIT -1 OFFSET ?`,
    )
    .all(userId, setId, MAGENTA_REVISION_RETENTION) as Array<{ id: string }>;
  const remove = db.prepare(
    "DELETE FROM image_asset_magenta_revisions WHERE id = ? AND user_id = ?",
  );
  for (const row of stale) remove.run(row.id, userId);
}

export async function applyImageAssetMagentaPass(args: {
  db: DatabaseSync;
  userId: string;
  setId: string;
  userKey: Buffer;
  now?: Date;
}): Promise<ImageMagentaPassResult> {
  const loaded = loadAssetMemberFiles(args.db, args.userId, args.setId);
  const originals = new Map<string, Buffer>();
  for (const member of loaded.members) {
    try {
      originals.set(member.imageId, readGeneratedImageBytes(member.localRelPath));
    } catch {
      throw new ImageMagentaPassError(
        "unavailable",
        "One of this asset’s original files could not be read.",
      );
    }
  }

  let changedPixels = 0;
  const replacements: PreparedReplacement[] = [];
  for (const member of loaded.members.filter((item) => EDITABLE_ROLES.has(item.role))) {
    const before = originals.get(member.imageId)!;
    const reduced = await reduceMagentaInPng(before);
    changedPixels += reduced.changedPixels;
    replacements.push({ ...member, before, after: reduced.pngBytes });
  }
  if (changedPixels === 0) {
    const passCount = activePassCount(args.db, args.userId, args.setId);
    return {
      assetSetId: args.setId,
      changedPixels,
      passCount,
      undoAvailable: passCount > 0,
    };
  }

  if (loaded.kind === "signal_studio") {
    const light = replacements.find((member) => member.role === "light");
    const dark = replacements.find((member) => member.role === "dark");
    const lighting = loaded.members.find((member) => member.role === "lighting");
    if (light && dark && lighting) {
      const before = originals.get(lighting.imageId)!;
      const rebuilt = await generateSignalStudioLightingMap(
        light.after,
        dark.after,
      );
      replacements.push({ ...lighting, before, after: rebuilt.pngBytes });
    }
  }

  const revisionId = `magenta-${randomUUID()}`;
  const createdAt = (args.now ?? new Date()).toISOString();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db
      .prepare(
        `INSERT INTO image_asset_magenta_revisions
           (id, user_id, set_id, status, created_at)
         VALUES (?, ?, ?, 'committed', ?)`,
      )
      .run(revisionId, args.userId, args.setId, createdAt);
    const insertItem = args.db.prepare(
      `INSERT INTO image_asset_magenta_revision_items
         (revision_id, image_id, role, ciphertext, iv, tag)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const replacement of replacements) {
      const encrypted = encryptBytes(replacement.before, args.userKey);
      insertItem.run(
        revisionId,
        replacement.imageId,
        replacement.role,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
      );
    }
    args.db.exec("COMMIT");
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }

  try {
    for (const replacement of replacements) {
      replaceGeneratedImageBytesAtomically(
        replacement.localRelPath,
        replacement.after,
      );
    }
    args.db
      .prepare(
        "UPDATE image_asset_sets SET updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .run(createdAt, args.setId, args.userId);
  } catch (error) {
    try {
      restoreReplacements(replacements);
    } finally {
      args.db
        .prepare(
          "DELETE FROM image_asset_magenta_revisions WHERE id = ? AND user_id = ?",
        )
        .run(revisionId, args.userId);
    }
    throw error;
  }

  await refreshThumbnails(replacements);
  pruneRevisionHistory(args.db, args.userId, args.setId);
  const passCount = activePassCount(args.db, args.userId, args.setId);
  return {
    assetSetId: args.setId,
    changedPixels,
    passCount,
    undoAvailable: passCount > 0,
  };
}

export async function undoImageAssetMagentaPass(args: {
  db: DatabaseSync;
  userId: string;
  setId: string;
  userKey: Buffer;
  now?: Date;
}): Promise<ImageMagentaPassResult> {
  loadAssetMemberFiles(args.db, args.userId, args.setId);
  const revision = args.db
    .prepare(
      `SELECT id FROM image_asset_magenta_revisions
        WHERE user_id = ? AND set_id = ? AND status = 'committed'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(args.userId, args.setId) as { id: string } | undefined;
  if (!revision) {
    throw new ImageMagentaPassError(
      "invalid",
      "This asset has no magenta pass to undo.",
    );
  }
  const rows = args.db
    .prepare(
      `SELECT revision_items.image_id, revision_items.role,
              revision_items.ciphertext, revision_items.iv, revision_items.tag,
              images.local_rel_path
         FROM image_asset_magenta_revision_items revision_items
         JOIN images ON images.id = revision_items.image_id
        WHERE revision_items.revision_id = ? AND images.user_id = ?`,
    )
    .all(revision.id, args.userId) as unknown as RevisionItemRow[];
  if (rows.length === 0) {
    throw new ImageMagentaPassError(
      "unavailable",
      "The saved magenta revision is unavailable.",
    );
  }
  const replacements: PreparedReplacement[] = rows.map((row) => {
    const localRelPath = row.local_rel_path?.trim();
    if (!localRelPath) {
      throw new ImageMagentaPassError(
        "unavailable",
        "One of this asset’s original files is unavailable locally.",
      );
    }
    const before = readGeneratedImageBytes(localRelPath);
    const after = decryptBytes(
      {
        ciphertext: Buffer.from(row.ciphertext),
        iv: Buffer.from(row.iv),
        tag: Buffer.from(row.tag),
      },
      args.userKey,
    );
    return {
      imageId: row.image_id,
      role: row.role,
      localRelPath,
      before,
      after,
    };
  });
  try {
    for (const replacement of replacements) {
      replaceGeneratedImageBytesAtomically(
        replacement.localRelPath,
        replacement.after,
      );
    }
    const undoneAt = (args.now ?? new Date()).toISOString();
    args.db.exec("BEGIN IMMEDIATE");
    try {
      args.db
        .prepare(
          `DELETE FROM image_asset_magenta_revisions
            WHERE id = ? AND user_id = ? AND status = 'committed'`,
        )
        .run(revision.id, args.userId);
      args.db
        .prepare(
          "UPDATE image_asset_sets SET updated_at = ? WHERE id = ? AND user_id = ?",
        )
        .run(undoneAt, args.setId, args.userId);
      args.db.exec("COMMIT");
    } catch (error) {
      args.db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    restoreReplacements(replacements);
    throw error;
  }
  await refreshThumbnails(replacements);
  const passCount = activePassCount(args.db, args.userId, args.setId);
  return {
    assetSetId: args.setId,
    changedPixels: 0,
    passCount,
    undoAvailable: passCount > 0,
  };
}
