import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_ONBOARDING_VERSION,
  createPrismCapabilityRevelations,
  createCompletedPrismOnboardingState,
  createPendingPrismOnboardingState,
  createPrismTutorialProgress,
  normalizePrismCapabilityRevelations,
  normalizePrismOnboardingState,
  normalizePrismTutorialProgress,
  revealPrismCapability,
  type PrismCapabilityId,
  type PrismCapabilityRevelationReason,
  type PrismCapabilityRevelations,
  type PrismOnboardingState,
  type PrismTutorialProgress,
} from "@localai/shared";

interface LivingShellAccountStateRow {
  onboarding_version: number;
  onboarding_state: string;
  tutorial_progress: string;
  capability_revelations: string;
}

export interface LivingShellAccountProgress {
  onboardingVersion: number;
  onboardingState: PrismOnboardingState;
  tutorialProgress: PrismTutorialProgress;
  capabilityRevelations: PrismCapabilityRevelations;
}

export function createPendingLivingShellAccountProgress(
  db: DatabaseSync,
  userId: string,
  now = new Date().toISOString(),
): void {
  db.prepare(
    `INSERT OR REPLACE INTO living_shell_account_state (
       user_id, onboarding_version, onboarding_state, tutorial_progress,
       capability_revelations, updated_at
     ) VALUES (?, 0, ?, ?, ?, ?)`,
  ).run(
    userId,
    JSON.stringify(createPendingPrismOnboardingState()),
    JSON.stringify(createPrismTutorialProgress()),
    JSON.stringify(createPrismCapabilityRevelations({ now })),
    now,
  );
}

function seedCompletedProgressIfMissing(
  db: DatabaseSync,
  userId: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO living_shell_account_state (
       user_id, onboarding_version, onboarding_state, tutorial_progress,
       capability_revelations, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    PRISM_ONBOARDING_VERSION,
    JSON.stringify(createCompletedPrismOnboardingState()),
    JSON.stringify(createPrismTutorialProgress("completed")),
    JSON.stringify(createPrismCapabilityRevelations({
      completed: true,
      now: new Date().toISOString(),
    })),
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
      `SELECT onboarding_version, onboarding_state, tutorial_progress,
              capability_revelations
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
    capabilityRevelations: normalizePrismCapabilityRevelations(
      row.capability_revelations,
      { completedFallback: true },
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
  return {
    onboardingVersion,
    onboardingState,
    tutorialProgress,
    capabilityRevelations: current.capabilityRevelations,
  };
}

export function revealLivingShellCapability(
  db: DatabaseSync,
  userId: string,
  capability: PrismCapabilityId,
  reason: PrismCapabilityRevelationReason,
  now = new Date().toISOString(),
): LivingShellAccountProgress {
  const current = getLivingShellAccountProgress(db, userId);
  const capabilityRevelations = revealPrismCapability(
    current.capabilityRevelations,
    capability,
    reason,
    now,
  );
  if (capabilityRevelations !== current.capabilityRevelations) {
    db.prepare(
      `UPDATE living_shell_account_state
          SET capability_revelations = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(JSON.stringify(capabilityRevelations), now, userId);
  }
  return { ...current, capabilityRevelations };
}

export function revealSignalAfterZenReplyMilestone(
  db: DatabaseSync,
  userId: string,
): LivingShellAccountProgress {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT messages.bot_id) AS bot_count
         FROM messages
         JOIN conversations
           ON conversations.id = messages.conversation_id
          AND conversations.user_id = messages.user_id
        WHERE messages.user_id = ?
          AND messages.role = 'assistant'
          AND messages.bot_id IS NOT NULL
          AND conversations.conversation_mode = 'zen'`,
    )
    .get(userId) as { bot_count?: number } | undefined;
  if ((row?.bot_count ?? 0) < 2) {
    return getLivingShellAccountProgress(db, userId);
  }
  return revealLivingShellCapability(
    db,
    userId,
    "signal",
    "zen_reply_milestone",
  );
}
