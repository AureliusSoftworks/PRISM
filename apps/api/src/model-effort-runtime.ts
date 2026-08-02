import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  effectiveModelReasoningEffort,
  modelReasoningEffortPreferenceKey,
  type ModelReasoningEffortPreference,
  type NativeReasoningEffortProvider,
} from "@localai/shared";
import {
  findModelReasoningEffortPreference,
  listModelReasoningEffortPreferences,
} from "./model-effort-preferences.ts";

function userAllowsSimulatedLocalEffort(
  db: DatabaseSync,
  userId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT experimental_all_model_effort_enabled AS enabled
         FROM users WHERE id = ? LIMIT 1`,
    )
    .get(userId) as { enabled?: number } | undefined;
  return row?.enabled === 1;
}

export function resolveUserModelReasoningEffort(
  db: DatabaseSync,
  args: {
    userId: string;
    provider: NativeReasoningEffortProvider;
    modelId: string;
    simulatedLocalEnabled?: boolean;
  },
): ModelReasoningEffortPreference | undefined {
  const preference = findModelReasoningEffortPreference(
    db,
    args.userId,
    args.provider,
    args.modelId,
  );
  const effective = effectiveModelReasoningEffort({
    provider: args.provider,
    modelId: args.modelId,
    preference,
    simulatedLocalEnabled:
      args.provider === "local" &&
      (args.simulatedLocalEnabled ??
        userAllowsSimulatedLocalEffort(db, args.userId)),
  });
  return effective ?? undefined;
}

export function modelReasoningEffortCursorHash(
  db: DatabaseSync,
  userId: string,
  models: ReadonlyArray<{
    provider: NativeReasoningEffortProvider;
    modelId: string;
  }>,
): string {
  const snapshot = [...models]
    .map(({ provider, modelId }) => ({
      key: modelReasoningEffortPreferenceKey(provider, modelId),
      effort:
        resolveUserModelReasoningEffort(db, { userId, provider, modelId }) ??
        "default",
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function allModelReasoningEffortCursorHash(
  db: DatabaseSync,
  userId: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        simulatedLocalEnabled: userAllowsSimulatedLocalEffort(db, userId),
        preferences: listModelReasoningEffortPreferences(db, userId).map(
          ({ provider, modelId, effort }) => ({ provider, modelId, effort }),
        ),
      }),
    )
    .digest("hex");
}
