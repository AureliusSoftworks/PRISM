import type { DatabaseSync } from "node:sqlite";
import {
  normalizeModelReasoningEffortPreference,
  type ModelReasoningEffortPreference,
  type ModelReasoningEffortPreferenceV1,
  type NativeReasoningEffortProvider,
} from "@localai/shared";

const MODEL_ID_MAX_LENGTH = 240;

interface ModelEffortPreferenceRow {
  provider: string;
  model_id: string;
  effort: string;
  updated_at: string;
}

export function normalizeModelEffortProvider(
  value: unknown,
): NativeReasoningEffortProvider | null {
  return value === "local" ||
    value === "ollama_cloud" ||
    value === "openai" ||
    value === "anthropic"
    ? value
    : null;
}

export function normalizeModelEffortModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const modelId = value.trim();
  return modelId.length > 0 && modelId.length <= MODEL_ID_MAX_LENGTH
    ? modelId
    : null;
}

function preferenceFromRow(
  row: ModelEffortPreferenceRow,
): ModelReasoningEffortPreferenceV1 | null {
  const provider = normalizeModelEffortProvider(row.provider);
  const modelId = normalizeModelEffortModelId(row.model_id);
  const effort = normalizeModelReasoningEffortPreference(row.effort);
  if (!provider || !modelId || !effort) return null;
  return { provider, modelId, effort, updatedAt: row.updated_at };
}

export function listModelReasoningEffortPreferences(
  db: DatabaseSync,
  userId: string,
): ModelReasoningEffortPreferenceV1[] {
  const rows = db
    .prepare(
      `SELECT provider, model_id, effort, updated_at
         FROM model_reasoning_effort_preferences
        WHERE user_id = ?
        ORDER BY updated_at ASC, provider ASC, model_id ASC`,
    )
    .all(userId) as unknown as ModelEffortPreferenceRow[];
  return rows
    .map(preferenceFromRow)
    .filter(
      (preference): preference is ModelReasoningEffortPreferenceV1 =>
        preference !== null,
    );
}

export function findModelReasoningEffortPreference(
  db: DatabaseSync,
  userId: string,
  provider: NativeReasoningEffortProvider,
  modelId: string,
): ModelReasoningEffortPreference | null {
  let row: ModelEffortPreferenceRow | undefined;
  try {
    row = db
      .prepare(
        `SELECT provider, model_id, effort, updated_at
           FROM model_reasoning_effort_preferences
          WHERE user_id = ? AND provider = ? AND model_id = ?
          LIMIT 1`,
      )
      .get(userId, provider, modelId) as ModelEffortPreferenceRow | undefined;
  } catch (error) {
    // Older portable databases and focused in-memory fixtures can predate the
    // preference table. Treat that state as provider Default until migration.
    if (
      error instanceof Error &&
      /no such table:\s*model_reasoning_effort_preferences/iu.test(
        error.message,
      )
    ) {
      return null;
    }
    throw error;
  }
  return row ? (preferenceFromRow(row)?.effort ?? null) : null;
}

export function setModelReasoningEffortPreference(
  db: DatabaseSync,
  args: {
    userId: string;
    provider: NativeReasoningEffortProvider;
    modelId: string;
    effort: ModelReasoningEffortPreference | null;
    updatedAt?: string;
  },
): ModelReasoningEffortPreferenceV1 | null {
  if (!args.effort) {
    db.prepare(
      `DELETE FROM model_reasoning_effort_preferences
        WHERE user_id = ? AND provider = ? AND model_id = ?`,
    ).run(args.userId, args.provider, args.modelId);
    return null;
  }
  const updatedAt = args.updatedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO model_reasoning_effort_preferences
      (user_id, provider, model_id, effort, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider, model_id) DO UPDATE SET
       effort = excluded.effort,
       updated_at = excluded.updated_at`,
  ).run(args.userId, args.provider, args.modelId, args.effort, updatedAt);
  return {
    provider: args.provider,
    modelId: args.modelId,
    effort: args.effort,
    updatedAt,
  };
}

export function resetModelReasoningEffortPreferences(
  db: DatabaseSync,
  userId: string,
): number {
  const result = db
    .prepare(
      "DELETE FROM model_reasoning_effort_preferences WHERE user_id = ?",
    )
    .run(userId) as { changes?: number | bigint };
  return Number(result.changes ?? 0);
}
