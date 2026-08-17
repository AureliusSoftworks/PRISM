import type { DatabaseSync } from "node:sqlite";
import {
  isAutoModelTurboPreferenceId,
  modelSupportsTurboMode,
  type ModelTurboPreferenceV1,
  type NativeReasoningEffortProvider,
} from "@localai/shared";
import {
  normalizeModelEffortModelId,
  normalizeModelEffortProvider,
} from "./model-effort-preferences.ts";

interface ModelTurboPreferenceRow {
  provider: string;
  model_id: string;
  updated_at: string;
}

export function isAutoModelTurboPreference(
  provider: NativeReasoningEffortProvider,
  modelId: string,
): boolean {
  return provider === "openai" && isAutoModelTurboPreferenceId(modelId);
}

function preferenceFromRow(
  row: ModelTurboPreferenceRow,
): ModelTurboPreferenceV1 | null {
  const provider = normalizeModelEffortProvider(row.provider);
  const modelId = normalizeModelEffortModelId(row.model_id);
  if (
    !provider ||
    !modelId ||
    (!modelSupportsTurboMode(provider, modelId) &&
      !isAutoModelTurboPreference(provider, modelId))
  ) {
    return null;
  }
  return { provider, modelId, turbo: true, updatedAt: row.updated_at };
}

export function listModelTurboPreferences(
  db: DatabaseSync,
  userId: string,
): ModelTurboPreferenceV1[] {
  const rows = db
    .prepare(
      `SELECT provider, model_id, updated_at
         FROM model_turbo_preferences
        WHERE user_id = ?
        ORDER BY updated_at ASC, provider ASC, model_id ASC`,
    )
    .all(userId) as unknown as ModelTurboPreferenceRow[];
  return rows
    .map(preferenceFromRow)
    .filter(
      (preference): preference is ModelTurboPreferenceV1 =>
        preference !== null,
    );
}

export function findModelTurboPreference(
  db: DatabaseSync,
  userId: string,
  provider: NativeReasoningEffortProvider,
  modelId: string,
): boolean {
  if (
    !modelSupportsTurboMode(provider, modelId) &&
    !isAutoModelTurboPreference(provider, modelId)
  ) {
    return false;
  }
  try {
    return Boolean(
      db
        .prepare(
          `SELECT 1
             FROM model_turbo_preferences
            WHERE user_id = ? AND provider = ? AND model_id = ?
            LIMIT 1`,
        )
        .get(userId, provider, modelId),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table:\s*model_turbo_preferences/iu.test(error.message)
    ) {
      return false;
    }
    throw error;
  }
}

export function setModelTurboPreference(
  db: DatabaseSync,
  args: {
    userId: string;
    provider: NativeReasoningEffortProvider;
    modelId: string;
    turbo: boolean;
    updatedAt?: string;
  },
): ModelTurboPreferenceV1 | null {
  if (!args.turbo) {
    db.prepare(
      `DELETE FROM model_turbo_preferences
        WHERE user_id = ? AND provider = ? AND model_id = ?`,
    ).run(args.userId, args.provider, args.modelId);
    return null;
  }
  if (
    !modelSupportsTurboMode(args.provider, args.modelId) &&
    !isAutoModelTurboPreference(args.provider, args.modelId)
  ) {
    throw new Error("Turbo is unavailable for this model.");
  }
  const updatedAt = args.updatedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO model_turbo_preferences
      (user_id, provider, model_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, provider, model_id) DO UPDATE SET
       updated_at = excluded.updated_at`,
  ).run(args.userId, args.provider, args.modelId, updatedAt);
  return {
    provider: args.provider,
    modelId: args.modelId,
    turbo: true,
    updatedAt,
  };
}

export function resetModelTurboPreferences(
  db: DatabaseSync,
  userId: string,
): number {
  const result = db
    .prepare("DELETE FROM model_turbo_preferences WHERE user_id = ?")
    .run(userId) as { changes?: number | bigint };
  return Number(result.changes ?? 0);
}
