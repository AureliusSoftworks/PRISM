import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  effectiveModelReasoningEffort,
  modelSupportsTurboMode,
  modelReasoningEffortPreferenceKey,
  type ModelReasoningEffortPreference,
  type NativeReasoningEffortProvider,
} from "@localai/shared";
import {
  findModelReasoningEffortPreference,
  listModelReasoningEffortPreferences,
} from "./model-effort-preferences.ts";
import {
  findModelTurboPreference,
  listModelTurboPreferences,
} from "./model-turbo-preferences.ts";

/** Simulated Effort is the product default for models without native effort. */
function userAllowsSimulatedEffort(
  _db: DatabaseSync,
  _userId: string,
): boolean {
  return true;
}

/** Experimental deep ladder (not the enable-gate for simulation). */
export function userUsesDeepSimulatedEffortLadder(
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
    simulatedEffortEnabled?: boolean;
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
    simulatedEffortEnabled:
      args.simulatedEffortEnabled ??
      userAllowsSimulatedEffort(db, args.userId),
  });
  return effective ?? undefined;
}

export function resolveUserModelTurboMode(
  db: DatabaseSync,
  args: {
    userId: string;
    provider: NativeReasoningEffortProvider;
    modelId: string;
  },
): boolean {
  return (
    modelSupportsTurboMode(args.provider, args.modelId) &&
    findModelTurboPreference(
      db,
      args.userId,
      args.provider,
      args.modelId,
    )
  );
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
      turbo: resolveUserModelTurboMode(db, { userId, provider, modelId }),
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
        simulatedEffortEnabled: userAllowsSimulatedEffort(db, userId),
        preferences: listModelReasoningEffortPreferences(db, userId).map(
          ({ provider, modelId, effort }) => ({ provider, modelId, effort }),
        ),
        turboPreferences: listModelTurboPreferences(db, userId).map(
          ({ provider, modelId }) => ({ provider, modelId }),
        ),
      }),
    )
    .digest("hex");
}
