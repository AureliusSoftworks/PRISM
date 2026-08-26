import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  debateMysteryMansionBundleEligibleV2,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryMansionBundleRoomV1,
  type DebateMysteryMansionBundleSummaryV1,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import { getDebateSession } from "./debate.ts";
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
  created_at: string;
  updated_at: string;
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

function summary(row: MansionBundleRow): DebateMysteryMansionBundleSummaryV1 {
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
            suspect_count, style_json, layout_json, created_at, updated_at
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
  return summary(bundleRow(db, userId, bundleId));
}

export function listDebateMysteryMansionBundlesV2(
  db: DatabaseSync,
  userId: string,
): DebateMysteryMansionBundleSummaryV1[] {
  const rows = db.prepare(
    `SELECT id, user_id, source_session_id, name, floors, total_rooms,
            suspect_count, style_json, layout_json, created_at, updated_at
       FROM debate_mystery_mansion_bundles
      WHERE user_id = ?
      ORDER BY updated_at DESC, id`,
  ).all(userId) as unknown as MansionBundleRow[];
  return rows.map(summary);
}

function bundleRoomsFromState(
  state: DebateWhodunnitFormatStateV2,
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
    imageId: room.imageId,
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
  const rooms = bundleRoomsFromState(state);
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
  const name = `${state.caseTitle?.trim() || "Whodunnit"} mansion`.slice(0, 180);
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
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getDebateMysteryMansionBundleV2(db, userId, id);
}
