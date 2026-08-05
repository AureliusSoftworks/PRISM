/**
 * Local action SFX pack persistence and ElevenLabs generation.
 * Packs stay off bot Marketplace export; account backup includes them.
 */

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  ACTION_SFX_PACK_CLIP_COUNT,
  ACTION_SFX_PACK_KINDS,
  ACTION_SFX_PACK_VARIANT_COUNT,
  ACTION_SFX_PACK_VERSION,
  actionSfxPackDurationSeconds,
  actionSfxPackOwnerIdFor,
  buildActionSfxPackPrompt,
  isActionSfxPackKind,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
  type ActionSfxPackSummaryV1,
} from "@localai/shared";
import {
  ElevenLabsSoundError,
  requestActionSfxPackClip,
} from "./elevenlabs-sound.ts";

export const ACTION_SFX_PACK_CLIP_MAX_BYTES = 512 * 1024;

export interface ActionSfxPackClipRow {
  kind: ActionSfxPackKind;
  variantIndex: number;
  contentType: string;
  audioBytes: Buffer;
  promptSeed: string;
  packGenerationId: string;
  createdAt: string;
}

export function ensureActionSfxPackSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_sfx_pack_clips (
      user_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      variant_index INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      audio_bytes BLOB NOT NULL,
      prompt_seed TEXT NOT NULL,
      pack_generation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, owner_kind, owner_id, kind, variant_index),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_action_sfx_pack_owner
      ON action_sfx_pack_clips (user_id, owner_kind, owner_id);
  `);
}

function randomId(bytes = 12): string {
  return randomBytes(bytes).toString("hex");
}

export function getActionSfxPackSummary(
  db: DatabaseSync,
  userId: string,
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
): ActionSfxPackSummaryV1 | null {
  const rows = db
    .prepare(
      `SELECT kind, pack_generation_id, created_at
         FROM action_sfx_pack_clips
        WHERE user_id = ? AND owner_kind = ? AND owner_id = ?
        ORDER BY created_at DESC`,
    )
    .all(userId, ownerKind, ownerId) as Array<{
    kind: string;
    pack_generation_id: string;
    created_at: string;
  }>;
  if (rows.length === 0) return null;
  const kinds = ACTION_SFX_PACK_KINDS.filter((kind) =>
    rows.some((row) => row.kind === kind),
  );
  const latest = rows[0]!;
  return {
    v: ACTION_SFX_PACK_VERSION,
    ownerKind,
    ownerId,
    packGenerationId: latest.pack_generation_id,
    createdAt: latest.created_at,
    clipCount: rows.length,
    kinds,
  };
}

export function getActionSfxPackClip(
  db: DatabaseSync,
  userId: string,
  ownerKind: ActionSfxPackOwnerKind,
  ownerId: string,
  kind: ActionSfxPackKind,
  variantIndex: number,
): ActionSfxPackClipRow | null {
  const row = db
    .prepare(
      `SELECT kind, variant_index, content_type, audio_bytes, prompt_seed,
              pack_generation_id, created_at
         FROM action_sfx_pack_clips
        WHERE user_id = ?
          AND owner_kind = ?
          AND owner_id = ?
          AND kind = ?
          AND variant_index = ?`,
    )
    .get(userId, ownerKind, ownerId, kind, variantIndex) as
    | {
        kind: string;
        variant_index: number;
        content_type: string;
        audio_bytes: Buffer;
        prompt_seed: string;
        pack_generation_id: string;
        created_at: string;
      }
    | undefined;
  if (!row || !isActionSfxPackKind(row.kind)) return null;
  return {
    kind: row.kind,
    variantIndex: row.variant_index,
    contentType: row.content_type,
    audioBytes: Buffer.from(row.audio_bytes),
    promptSeed: row.prompt_seed,
    packGenerationId: row.pack_generation_id,
    createdAt: row.created_at,
  };
}

export function listActionSfxPackClipsForBackup(
  db: DatabaseSync,
  userId: string,
): Array<{
  ownerKind: ActionSfxPackOwnerKind;
  ownerId: string;
  kind: ActionSfxPackKind;
  variantIndex: number;
  contentType: string;
  audioBase64: string;
  promptSeed: string;
  packGenerationId: string;
  createdAt: string;
}> {
  const rows = db
    .prepare(
      `SELECT owner_kind, owner_id, kind, variant_index, content_type,
              audio_bytes, prompt_seed, pack_generation_id, created_at
         FROM action_sfx_pack_clips
        WHERE user_id = ?
        ORDER BY owner_kind, owner_id, kind, variant_index`,
    )
    .all(userId) as Array<{
    owner_kind: string;
    owner_id: string;
    kind: string;
    variant_index: number;
    content_type: string;
    audio_bytes: Buffer;
    prompt_seed: string;
    pack_generation_id: string;
    created_at: string;
  }>;
  return rows
    .filter(
      (row): row is typeof row & {
        owner_kind: ActionSfxPackOwnerKind;
        kind: ActionSfxPackKind;
      } =>
        (row.owner_kind === "bot" || row.owner_kind === "player") &&
        isActionSfxPackKind(row.kind),
    )
    .map((row) => ({
      ownerKind: row.owner_kind,
      ownerId: row.owner_id,
      kind: row.kind,
      variantIndex: row.variant_index,
      contentType: row.content_type,
      audioBase64: Buffer.from(row.audio_bytes).toString("base64"),
      promptSeed: row.prompt_seed,
      packGenerationId: row.pack_generation_id,
      createdAt: row.created_at,
    }));
}

export function restoreActionSfxPackClipsFromBackup(
  db: DatabaseSync,
  userId: string,
  clips: unknown,
): void {
  if (!Array.isArray(clips)) return;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO action_sfx_pack_clips
      (user_id, owner_kind, owner_id, kind, variant_index, content_type,
       audio_bytes, prompt_seed, pack_generation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const entry of clips) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const ownerKind =
      record.ownerKind === "bot" || record.ownerKind === "player"
        ? record.ownerKind
        : null;
    const kind = isActionSfxPackKind(record.kind) ? record.kind : null;
    const ownerId =
      typeof record.ownerId === "string" ? record.ownerId.trim() : "";
    const variantIndex = Number(record.variantIndex);
    const contentType =
      typeof record.contentType === "string" ? record.contentType.trim() : "";
    const audioBase64 =
      typeof record.audioBase64 === "string" ? record.audioBase64.trim() : "";
    const promptSeed =
      typeof record.promptSeed === "string" ? record.promptSeed : "";
    const packGenerationId =
      typeof record.packGenerationId === "string"
        ? record.packGenerationId.trim()
        : "";
    const createdAt =
      typeof record.createdAt === "string" ? record.createdAt.trim() : "";
    if (
      !ownerKind ||
      !kind ||
      !ownerId ||
      !contentType.startsWith("audio/") ||
      !audioBase64 ||
      !packGenerationId ||
      !createdAt ||
      !Number.isInteger(variantIndex) ||
      variantIndex < 0 ||
      variantIndex >= ACTION_SFX_PACK_VARIANT_COUNT
    ) {
      continue;
    }
    let audioBytes: Buffer;
    try {
      audioBytes = Buffer.from(audioBase64, "base64");
    } catch {
      continue;
    }
    if (
      audioBytes.length === 0 ||
      audioBytes.length > ACTION_SFX_PACK_CLIP_MAX_BYTES
    ) {
      continue;
    }
    insert.run(
      userId,
      ownerKind,
      ownerId,
      kind,
      variantIndex,
      contentType,
      audioBytes,
      promptSeed.slice(0, 450),
      packGenerationId.slice(0, 64),
      createdAt.slice(0, 64),
    );
  }
}

export async function generateActionSfxPack(args: {
  db: DatabaseSync;
  userId: string;
  ownerKind: ActionSfxPackOwnerKind;
  botId?: string | null;
  ownerLabel: string;
  personaSnippet?: string | null;
  apiKey: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, kind: ActionSfxPackKind) => void;
  fetchImpl?: typeof fetch;
}): Promise<ActionSfxPackSummaryV1> {
  const ownerId = actionSfxPackOwnerIdFor(args.ownerKind, args.botId);
  const packGenerationId = randomId(8);
  const createdAt = new Date().toISOString();
  const clips: Array<{
    kind: ActionSfxPackKind;
    variantIndex: number;
    contentType: string;
    audioBytes: Buffer;
    promptSeed: string;
  }> = [];
  let done = 0;
  for (const kind of ACTION_SFX_PACK_KINDS) {
    for (
      let variantIndex = 0;
      variantIndex < ACTION_SFX_PACK_VARIANT_COUNT;
      variantIndex += 1
    ) {
      if (args.signal?.aborted) {
        throw new ElevenLabsSoundError(499, "Action SFX pack generation aborted.");
      }
      const promptSeed = buildActionSfxPackPrompt({
        kind,
        variantIndex,
        ownerLabel: args.ownerLabel,
        personaSnippet: args.personaSnippet,
      });
      const sound = await requestActionSfxPackClip({
        apiKey: args.apiKey,
        prompt: promptSeed,
        durationSeconds: actionSfxPackDurationSeconds(kind),
        signal: args.signal,
        fetchImpl: args.fetchImpl,
      });
      clips.push({
        kind,
        variantIndex,
        contentType: sound.contentType,
        audioBytes: sound.audioBytes,
        promptSeed,
      });
      done += 1;
      args.onProgress?.(done, ACTION_SFX_PACK_CLIP_COUNT, kind);
    }
  }

  const replace = args.db.prepare(
    `DELETE FROM action_sfx_pack_clips
      WHERE user_id = ? AND owner_kind = ? AND owner_id = ?`,
  );
  const insert = args.db.prepare(
    `INSERT INTO action_sfx_pack_clips
      (user_id, owner_kind, owner_id, kind, variant_index, content_type,
       audio_bytes, prompt_seed, pack_generation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  args.db.exec("BEGIN IMMEDIATE");
  try {
    replace.run(args.userId, args.ownerKind, ownerId);
    for (const clip of clips) {
      insert.run(
        args.userId,
        args.ownerKind,
        ownerId,
        clip.kind,
        clip.variantIndex,
        clip.contentType,
        clip.audioBytes,
        clip.promptSeed,
        packGenerationId,
        createdAt,
      );
    }
    args.db.exec("COMMIT");
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }

  return {
    v: ACTION_SFX_PACK_VERSION,
    ownerKind: args.ownerKind,
    ownerId,
    packGenerationId,
    createdAt,
    clipCount: clips.length,
    kinds: [...ACTION_SFX_PACK_KINDS],
  };
}
