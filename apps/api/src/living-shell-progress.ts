import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_ONBOARDING_VERSION,
  createCompletedPrismOnboardingState,
  createPendingPrismOnboardingState,
  createPrismTutorialProgress,
  normalizePrismOnboardingState,
  normalizePrismTutorialProgress,
  type PrismOnboardingState,
  type PrismTutorialProgress,
} from "@localai/shared";

interface LivingShellAccountStateRow {
  onboarding_version: number;
  onboarding_state: string;
  tutorial_progress: string;
}

export interface LivingShellAccountProgress {
  onboardingVersion: number;
  onboardingState: PrismOnboardingState;
  tutorialProgress: PrismTutorialProgress;
}

export function createPendingLivingShellAccountProgress(
  db: DatabaseSync,
  userId: string,
  now = new Date().toISOString(),
): void {
  db.prepare(
    `INSERT OR REPLACE INTO living_shell_account_state (
       user_id, onboarding_version, onboarding_state, tutorial_progress, updated_at
     ) VALUES (?, 0, ?, ?, ?)`,
  ).run(
    userId,
    JSON.stringify(createPendingPrismOnboardingState()),
    JSON.stringify(createPrismTutorialProgress()),
    now,
  );
}

function seedCompletedProgressIfMissing(
  db: DatabaseSync,
  userId: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO living_shell_account_state (
       user_id, onboarding_version, onboarding_state, tutorial_progress, updated_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    userId,
    PRISM_ONBOARDING_VERSION,
    JSON.stringify(createCompletedPrismOnboardingState()),
    JSON.stringify(createPrismTutorialProgress("completed")),
    new Date().toISOString(),
  );
}

export function getLivingShellAccountProgress(
  db: DatabaseSync,
  userId: string,
): LivingShellAccountProgress {
  seedCompletedProgressIfMissing(db, userId);
  const row = db
    .prepare(
      `SELECT onboarding_version, onboarding_state, tutorial_progress
         FROM living_shell_account_state
        WHERE user_id = ?`,
    )
    .get(userId) as unknown as LivingShellAccountStateRow | undefined;
  if (!row) throw new Error("Living-shell account progress was not created.");
  return {
    onboardingVersion: row.onboarding_version,
    onboardingState: normalizePrismOnboardingState(
      row.onboarding_state,
      row.onboarding_version,
    ),
    tutorialProgress: normalizePrismTutorialProgress(
      row.tutorial_progress,
      "completed",
    ),
  };
}

export function updateLivingShellAccountProgress(
  db: DatabaseSync,
  userId: string,
  value: unknown,
): LivingShellAccountProgress {
  const current = getLivingShellAccountProgress(db, userId);
  const body =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const onboardingState = Object.prototype.hasOwnProperty.call(
    body,
    "onboardingState",
  )
    ? normalizePrismOnboardingState(body.onboardingState, 0)
    : current.onboardingState;
  const tutorialProgress = Object.prototype.hasOwnProperty.call(
    body,
    "tutorialProgress",
  )
    ? normalizePrismTutorialProgress(body.tutorialProgress)
    : current.tutorialProgress;
  const onboardingVersion =
    onboardingState.stage === "complete" ? PRISM_ONBOARDING_VERSION : 0;
  db.prepare(
    `UPDATE living_shell_account_state
        SET onboarding_version = ?, onboarding_state = ?, tutorial_progress = ?, updated_at = ?
      WHERE user_id = ?`,
  ).run(
    onboardingVersion,
    JSON.stringify(onboardingState),
    JSON.stringify(tutorialProgress),
    new Date().toISOString(),
    userId,
  );
  return { onboardingVersion, onboardingState, tutorialProgress };
}
