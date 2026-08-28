import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  debateMysteryAcousticThemePaletteV1,
  normalizeDebateMysteryAtmosphereContractV1,
  debateMysteryMansionBundleEligibleV2,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryMansionAssetV1,
  type DebateMysteryMansionBundleRoomV1,
  type DebateMysteryMansionBundleSummaryV1,
  type DebateWhodunnitFormatStateV2,
  type PortableMansionInstallationMetadataV1,
} from "@localai/shared";
import { getDebateSession } from "./debate.ts";
import { decryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

interface MansionBundleRow {
  id: string;
  user_id: string;
  source_session_id: string | null;
  name: string;
  floors: number;
  total_rooms: number;
  suspect_count: number;
  style_json: string;
  layout_json: string;
  portable_metadata_json: string | null;
  portable_payload_sha256: string | null;
  created_at: string;
  updated_at: string;
}

function parsePortableMetadata(
  value: string | null,
): PortableMansionInstallationMetadataV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PortableMansionInstallationMetadataV1;
    return parsed && typeof parsed.packageId === "string" && typeof parsed.payloadSha256 === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseStyle(value: string): DebateMysteryHouseStyleV2 {
  const parsed = JSON.parse(value) as Partial<DebateMysteryHouseStyleV2>;
  if (
    parsed.version !== 1 ||
    typeof parsed.id !== "string" ||
    typeof parsed.label !== "string" ||
    typeof parsed.promptContract !== "string"
  ) {
    throw new Error("Saved mansion style is invalid.");
  }
  return {
    version: 1,
    id: parsed.id,
    label: parsed.label,
    promptContract: parsed.promptContract,
    atmosphere: normalizeDebateMysteryAtmosphereContractV1(
      parsed.atmosphere,
      `${parsed.label} ${parsed.promptContract}`,
    ),
    acousticThemePaletteId:
      typeof parsed.acousticThemePaletteId === "string" && parsed.acousticThemePaletteId.trim()
        ? parsed.acousticThemePaletteId.trim().slice(0, 200)
        : debateMysteryAcousticThemePaletteV1(`${parsed.label} ${parsed.promptContract}`),
    bespokeAmbienceRequested: parsed.bespokeAmbienceRequested === true,
    ambience:
      parsed.ambience && typeof parsed.ambience === "object" && parsed.ambience.version === 1
        ? parsed.ambience
        : null,
  };
}

function parseRooms(value: string): DebateMysteryMansionBundleRoomV1[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Saved mansion layout is invalid.");
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Saved mansion room is invalid.");
    }
    const room = entry as Partial<DebateMysteryMansionBundleRoomV1>;
    const floor = room.floor;
    const x = room.x;
    const y = room.y;
    const width = room.width;
    const height = room.height;
    if (
      typeof room.id !== "string" ||
      typeof room.templateId !== "string" ||
      typeof room.name !== "string" ||
      typeof floor !== "number" || !Number.isInteger(floor) ||
      typeof x !== "number" || !Number.isFinite(x) ||
      typeof y !== "number" || !Number.isFinite(y) ||
      typeof width !== "number" || !Number.isFinite(width) ||
      typeof height !== "number" || !Number.isFinite(height) ||
      !Array.isArray(room.neighborIds) ||
      typeof room.emoji !== "string"
    ) {
      throw new Error("Saved mansion room contract is incomplete.");
    }
    return {
      id: room.id,
      templateId: room.templateId,
      name: room.name,
      floor,
      x,
      y,
      width,
      height,
      neighborIds: room.neighborIds.filter((id): id is string => typeof id === "string"),
      assignedSuspectSeatId:
        typeof room.assignedSuspectSeatId === "string"
          ? room.assignedSuspectSeatId
          : null,
      emoji: room.emoji,
      imageId: typeof room.imageId === "string" ? room.imageId : null,
      bundledAssetPath:
        typeof room.bundledAssetPath === "string"
          ? room.bundledAssetPath
          : null,
    };
  });
}

function aggregateAssets(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionAssetV1[] {
  return (db.prepare(
    `SELECT assets.id, refs.role, refs.logical_id, assets.mime_type,
            assets.sha256, assets.byte_size
       FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ?
      ORDER BY refs.role, refs.logical_id, assets.id`,
  ).all(bundleId, userId) as unknown as Array<{
    id: string;
    role: DebateMysteryMansionAssetV1["role"];
    logical_id: string;
    mime_type: DebateMysteryMansionAssetV1["mimeType"];
    sha256: string;
    byte_size: number;
  }>).map((asset) => ({
    id: asset.id,
    role: asset.role,
    logicalId: asset.logical_id,
    mimeType: asset.mime_type,
    sha256: asset.sha256,
    byteLength: asset.byte_size,
  }));
}

function summary(
  db: DatabaseSync,
  row: MansionBundleRow,
): DebateMysteryMansionBundleSummaryV1 {
  return {
    version: 1,
    id: row.id,
    name: row.name,
    sourceSessionId: row.source_session_id,
    floors: row.floors,
    totalRooms: row.total_rooms,
    suspectCount: row.suspect_count,
    houseStyle: parseStyle(row.style_json),
    rooms: parseRooms(row.layout_json),
    assets: aggregateAssets(db, row.user_id, row.id),
    portable: parsePortableMetadata(row.portable_metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bundleRow(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): MansionBundleRow {
  const row = db.prepare(
    `SELECT id, user_id, source_session_id, name, floors, total_rooms,
            suspect_count, style_json, layout_json, portable_metadata_json,
            portable_payload_sha256, created_at, updated_at
       FROM debate_mystery_mansion_bundles
      WHERE id = ? AND user_id = ?`,
  ).get(bundleId, userId) as MansionBundleRow | undefined;
  if (!row) throw new HttpError(404, "That saved mansion was not found.");
  return row;
}

export function getDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionBundleSummaryV1 {
  return summary(db, bundleRow(db, userId, bundleId));
}

export function listDebateMysteryMansionBundlesV2(
  db: DatabaseSync,
  userId: string,
): DebateMysteryMansionBundleSummaryV1[] {
  const rows = db.prepare(
    `SELECT id, user_id, source_session_id, name, floors, total_rooms,
            suspect_count, style_json, layout_json, portable_metadata_json,
            portable_payload_sha256, created_at, updated_at
       FROM debate_mystery_mansion_bundles
      WHERE user_id = ?
      ORDER BY updated_at DESC, id`,
  ).all(userId) as unknown as MansionBundleRow[];
  return rows.map((row) => summary(db, row));
}

export function deleteDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): void {
  bundleRow(db, userId, bundleId);
  const sessions = db.prepare(
    "SELECT session_json FROM debate_sessions WHERE user_id = ? AND status <> 'cancelled'",
  ).all(userId) as Array<{ session_json: string }>;
  const inUse = sessions.some((row) => {
    try {
      const session = JSON.parse(row.session_json) as {
        formatState?: { config?: { mansionBundleId?: string | null } };
      };
      return session.formatState?.config?.mansionBundleId === bundleId;
    } catch {
      return false;
    }
  });
  if (inUse) {
    throw new HttpError(409, "That mansion is still used by a Whodunnit in Archive.");
  }
  db.prepare(
    "DELETE FROM debate_mystery_mansion_bundles WHERE id = ? AND user_id = ?",
  ).run(bundleId, userId);
}

export function getDebateMysteryMansionAssetFileV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  bundleId: string,
  assetId: string,
): { mimeType: DebateMysteryMansionAssetV1["mimeType"]; bytes: Buffer } {
  const row = db.prepare(
    `SELECT assets.mime_type, assets.ciphertext, assets.cipher_iv, assets.cipher_tag
       FROM debate_mystery_mansion_asset_refs AS refs
       JOIN debate_mystery_mansion_assets AS assets
         ON assets.id = refs.asset_id AND assets.user_id = refs.user_id
      WHERE refs.bundle_id = ? AND refs.user_id = ? AND assets.id = ?
      LIMIT 1`,
  ).get(bundleId, userId, assetId) as {
    mime_type: DebateMysteryMansionAssetV1["mimeType"];
    ciphertext: Buffer;
    cipher_iv: Buffer;
    cipher_tag: Buffer;
  } | undefined;
  if (!row) throw new HttpError(404, "That mansion asset was not found.");
  const bytes = decryptBytes({
    ciphertext: row.ciphertext,
    iv: row.cipher_iv,
    tag: row.cipher_tag,
  }, userKey);
  const mimeType = Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "OggS"
    ? "audio/ogg" as const
    : row.mime_type;
  return {
    mimeType,
    bytes,
  };
}

interface ReusableVaultAssetRow {
  subject_id: string;
  kind: "room" | "evidence";
  mime_type: "image/png" | "image/webp";
  ciphertext: Buffer;
  cipher_iv: Buffer;
  cipher_tag: Buffer;
  sha256: string;
  byte_size: number;
  provider: string | null;
  model: string | null;
  review_json: string;
}

function reusableVaultAssetDimensions(
  row: ReusableVaultAssetRow,
): { width: number; height: number } {
  try {
    const review = JSON.parse(row.review_json) as {
      pixels?: { width?: unknown; height?: unknown };
    };
    if (
      typeof review.pixels?.width === "number" &&
      Number.isInteger(review.pixels.width) &&
      typeof review.pixels.height === "number" &&
      Number.isInteger(review.pixels.height)
    ) {
      return { width: review.pixels.width, height: review.pixels.height };
    }
  } catch {
    // Legacy rows did not preserve inspected dimensions.
  }
  return row.kind === "room"
    ? row.subject_id.endsWith(":illustrated-v1")
      ? { width: 1600, height: 900 }
      : { width: 1536, height: 1024 }
    : { width: 1024, height: 1024 };
}

/** Replaces one bundle's protected asset references inside the caller's save
 * transaction. Content rows deduplicate per tenant by plaintext SHA-256. */
export function replaceProtectedDebateMysteryMansionAssetsV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
  sessionId: string,
): void {
  const rows = db.prepare(
    `SELECT subject_id, kind, mime_type, ciphertext, cipher_iv, cipher_tag,
            sha256, byte_size, provider, model, review_json
       FROM debate_mystery_asset_vault
      WHERE user_id = ? AND session_id = ? AND status = 'ready'
        AND ciphertext IS NOT NULL AND cipher_iv IS NOT NULL
        AND cipher_tag IS NOT NULL AND sha256 IS NOT NULL AND byte_size > 0
      ORDER BY kind, subject_id`,
  ).all(userId, sessionId) as unknown as ReusableVaultAssetRow[];
  db.prepare(
    `DELETE FROM debate_mystery_mansion_asset_refs
      WHERE bundle_id = ? AND user_id = ? AND role IN ('room', 'prop')`,
  ).run(bundleId, userId);
  const insertAsset = db.prepare(
    `INSERT INTO debate_mystery_mansion_assets
       (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
        mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(user_id, sha256) DO UPDATE SET
       width = COALESCE(debate_mystery_mansion_assets.width, excluded.width),
       height = COALESCE(debate_mystery_mansion_assets.height, excluded.height),
       updated_at = excluded.updated_at`,
  );
  const assetId = db.prepare(
    "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
  );
  const insertRef = db.prepare(
    `INSERT INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  let propIndex = 0;
  for (const row of rows) {
    const dimensions = reusableVaultAssetDimensions(row);
    insertAsset.run(
      randomUUID(),
      userId,
      row.ciphertext,
      row.cipher_iv,
      row.cipher_tag,
      row.sha256,
      row.byte_size,
      row.mime_type,
      dimensions.width,
      dimensions.height,
      row.provider,
      row.model,
      now,
      now,
    );
    const stored = assetId.get(userId, row.sha256) as { id: string };
    const role = row.kind === "room" ? "room" : "prop";
    const logicalId = row.kind === "room"
      ? row.subject_id
      : `prop-${String(++propIndex).padStart(3, "0")}`;
    insertRef.run(bundleId, userId, stored.id, role, logicalId, now);
  }
  db.prepare(
    `DELETE FROM debate_mystery_mansion_assets
      WHERE user_id = ? AND NOT EXISTS (
        SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
         WHERE refs.user_id = debate_mystery_mansion_assets.user_id
           AND refs.asset_id = debate_mystery_mansion_assets.id
      )`,
  ).run(userId);
}

function bundleRoomsFromState(
  state: DebateWhodunnitFormatStateV2,
  roomImageIdById: Readonly<Record<string, string>> = {},
): DebateMysteryMansionBundleRoomV1[] {
  return state.rooms.map((room) => ({
    id: room.id,
    templateId: room.templateId?.trim() || room.id,
    name: room.name,
    floor: room.floor,
    x: room.x ?? 0,
    y: room.y ?? 0,
    width: room.width ?? 1,
    height: room.height ?? 1,
    neighborIds: [...(room.neighborIds ?? [])],
    assignedSuspectSeatId:
      state.suspects.find((suspect) => suspect.roomId === room.id)?.seatId ?? null,
    emoji: room.emoji,
    imageId: roomImageIdById[room.id] ?? room.imageId,
    bundledAssetPath: room.bundledAssetPath,
  }));
}

/**
 * Saves layout, room assets, and house style as one tenant-owned aggregate.
 * Re-saving the same source refreshes that aggregate atomically.
 */
export function saveDebateMysteryMansionBundleV2(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  roomImageIdById: Readonly<Record<string, string>> = {},
): DebateMysteryMansionBundleSummaryV1 {
  const session = getDebateSession(db, userId, sessionId);
  if (session.status === "cancelled") {
    throw new HttpError(409, "That case is no longer available.");
  }
  const state = session.formatState;
  if (state.format !== "whodunnit" || state.version !== 2) {
    throw new HttpError(409, "Reusable mansions are available for Whodunnit V2 cases only.");
  }
  if (!debateMysteryMansionBundleEligibleV2(state)) {
    throw new HttpError(
      409,
      "Visit every room and review every examination point before saving this mansion.",
    );
  }
  const rooms = bundleRoomsFromState(state, roomImageIdById);
  const imageIds = [...new Set(rooms.flatMap((room) => room.imageId ? [room.imageId] : []))];
  if (imageIds.length > 0) {
    const owned = db.prepare(
      `SELECT id FROM images
        WHERE user_id = ? AND id IN (${imageIds.map(() => "?").join(", ")})`,
    ).all(userId, ...imageIds) as unknown as Array<{ id: string }>;
    if (owned.length !== imageIds.length) {
      throw new HttpError(409, "One or more mansion room assets are unavailable.");
    }
  }
  const existing = db.prepare(
    `SELECT id, created_at FROM debate_mystery_mansion_bundles
      WHERE user_id = ? AND source_session_id = ?`,
  ).get(userId, sessionId) as { id: string; created_at: string } | undefined;
  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();
  const createdAt = existing?.created_at ?? now;
  const name = `${state.config.houseStyle.label.trim() || "Whodunnit"} mansion`.slice(0, 180);
  const floors = Math.max(...rooms.map((room) => room.floor), 1);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         floors = excluded.floors,
         total_rooms = excluded.total_rooms,
         suspect_count = excluded.suspect_count,
         style_json = excluded.style_json,
         layout_json = excluded.layout_json,
         updated_at = excluded.updated_at
       WHERE debate_mystery_mansion_bundles.user_id = excluded.user_id`,
    ).run(
      id,
      userId,
      sessionId,
      name,
      floors,
      rooms.length,
      state.suspects.length,
      JSON.stringify(state.config.houseStyle),
      JSON.stringify(rooms),
      createdAt,
      now,
    );
    db.prepare(
      "DELETE FROM debate_mystery_mansion_bundle_assets WHERE bundle_id = ? AND user_id = ?",
    ).run(id, userId);
    const insertAsset = db.prepare(
      `INSERT INTO debate_mystery_mansion_bundle_assets
         (bundle_id, user_id, room_id, image_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const room of rooms) {
      if (room.imageId) insertAsset.run(id, userId, room.id, room.imageId, now);
    }
    replaceProtectedDebateMysteryMansionAssetsV1(db, userId, id, sessionId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, id);
}
