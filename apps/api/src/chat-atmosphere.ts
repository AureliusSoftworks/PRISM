import type { DatabaseSync } from "node:sqlite";
import {
  CHAT_ATMOSPHERE_IMAGE_PURPOSE,
  CHAT_ATMOSPHERE_RETENTION_DAYS,
  chatAtmosphereRetentionCutoffIso,
  chatAtmosphereUtcDate,
} from "@localai/shared";

export type ChatAtmosphereBotRow = {
  id: string;
  name: string;
  system_prompt: string;
  chat_atmosphere_image_id: string | null;
  chat_atmosphere_generated_on: string | null;
};

export type ChatAtmosphereEnsureResult = {
  imageId: string | null;
  generatedOn: string | null;
  needsGeneration: boolean;
  wipedCount: number;
};

export function promoteChatAtmosphereImage(
  db: DatabaseSync,
  args: {
    userId: string;
    botId: string;
    imageId: string;
    generatedOn?: string;
  },
): void {
  const generatedOn = args.generatedOn ?? chatAtmosphereUtcDate();
  db.prepare(
    `UPDATE bots
        SET chat_atmosphere_image_id = ?,
            chat_atmosphere_generated_on = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    args.imageId,
    generatedOn,
    new Date().toISOString(),
    args.botId,
    args.userId,
  );
}

export function readChatAtmosphereBot(
  db: DatabaseSync,
  userId: string,
  botId: string,
): ChatAtmosphereBotRow | null {
  const row = db
    .prepare(
      `SELECT id, name, system_prompt,
              chat_atmosphere_image_id, chat_atmosphere_generated_on
         FROM bots
        WHERE id = ? AND user_id = ?`,
    )
    .get(botId, userId) as ChatAtmosphereBotRow | undefined;
  return row ?? null;
}

export function chatAtmosphereImageIsCurrent(
  db: DatabaseSync,
  userId: string,
  imageId: string | null | undefined,
): boolean {
  const trimmed = imageId?.trim() || null;
  if (!trimmed) return false;
  const row = db
    .prepare(
      `SELECT id FROM images
        WHERE id = ? AND user_id = ? AND purpose = ?`,
    )
    .get(trimmed, userId, CHAT_ATMOSPHERE_IMAGE_PURPOSE) as
    | { id: string }
    | undefined;
  return Boolean(row);
}

/**
 * Wipe Chat atmosphere images for a bot older than the retention window.
 * Protects the currently pointed active image even if it is older.
 */
export function wipeExpiredChatAtmospheresForBot(
  db: DatabaseSync,
  args: {
    userId: string;
    botId: string;
    now?: Date;
    retentionDays?: number;
    protectImageId?: string | null;
  },
): { wipedIds: string[]; wipedCount: number } {
  const cutoff = chatAtmosphereRetentionCutoffIso(
    args.now ?? new Date(),
    args.retentionDays ?? CHAT_ATMOSPHERE_RETENTION_DAYS,
  );
  const protect = args.protectImageId?.trim() || null;
  const rows = db
    .prepare(
      `SELECT id FROM images
        WHERE user_id = ?
          AND bot_id = ?
          AND purpose = ?
          AND created_at < ?
          AND (? IS NULL OR id != ?)`,
    )
    .all(
      args.userId,
      args.botId,
      CHAT_ATMOSPHERE_IMAGE_PURPOSE,
      cutoff,
      protect,
      protect,
    ) as Array<{ id: string }>;

  const wipedIds: string[] = [];
  const deleteStmt = db.prepare(
    "DELETE FROM images WHERE id = ? AND user_id = ?",
  );
  for (const row of rows) {
    deleteStmt.run(row.id, args.userId);
    wipedIds.push(row.id);
  }
  return { wipedIds, wipedCount: wipedIds.length };
}

export function evaluateChatAtmosphereEnsure(
  db: DatabaseSync,
  args: {
    userId: string;
    botId: string;
    now?: Date;
  },
): ChatAtmosphereEnsureResult {
  const bot = readChatAtmosphereBot(db, args.userId, args.botId);
  if (!bot) {
    return {
      imageId: null,
      generatedOn: null,
      needsGeneration: false,
      wipedCount: 0,
    };
  }
  const today = chatAtmosphereUtcDate(args.now);
  const imageId = bot.chat_atmosphere_image_id?.trim() || null;
  const generatedOn = bot.chat_atmosphere_generated_on?.trim() || null;
  const imageOk = chatAtmosphereImageIsCurrent(db, args.userId, imageId);
  const wipe = wipeExpiredChatAtmospheresForBot(db, {
    userId: args.userId,
    botId: args.botId,
    now: args.now,
    protectImageId: imageOk ? imageId : null,
  });
  const needsGeneration = !imageOk || generatedOn !== today;
  return {
    imageId: imageOk ? imageId : null,
    generatedOn: imageOk ? generatedOn : null,
    needsGeneration,
    wipedCount: wipe.wipedCount,
  };
}
