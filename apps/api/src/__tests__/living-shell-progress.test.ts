import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { initializeDatabase } from "../db.ts";
import {
  createPendingLivingShellAccountProgress,
  getLivingShellAccountProgress,
  updateLivingShellAccountProgress,
} from "../living-shell-progress.ts";

function accountDb(): { db: DatabaseSync; userId: string } {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const userId = "living-shell-user";
  db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(
    userId,
    "living-shell@example.com",
    "Spectrum",
    "2026-07-22T00:00:00.000Z",
    "2026-07-22T00:00:00.000Z",
  );
  return { db, userId };
}

describe("living-shell account progress persistence", () => {
  it("starts a newly created account at the cinematic without inherited tutorials", () => {
    const { db, userId } = accountDb();
    createPendingLivingShellAccountProgress(db, userId);
    const progress = getLivingShellAccountProgress(db, userId);
    assert.equal(progress.onboardingVersion, 0);
    assert.equal(progress.onboardingState.stage, "intro");
    assert.equal(progress.tutorialProgress.zen.status, "pending");
    db.close();
  });

  it("treats an unseeded pre-existing account as completed", () => {
    const { db, userId } = accountDb();
    const progress = getLivingShellAccountProgress(db, userId);
    assert.equal(progress.onboardingState.stage, "complete");
    assert.equal(progress.tutorialProgress.slate.status, "completed");
    db.close();
  });

  it("persists only normalized onboarding and tutorial state", () => {
    const { db, userId } = accountDb();
    createPendingLivingShellAccountProgress(db, userId);
    const progress = updateLivingShellAccountProgress(db, userId, {
      onboardingState: {
        stage: "setup",
        introResolution: "skipped",
        setupStep: 3,
        secret: "must not persist",
      },
      tutorialProgress: {
        zen: {
          status: "remind",
          step: 2,
          remindAfter: "2026-07-23T00:00:00.000Z",
          transcript: "must not persist",
        },
      },
    });
    assert.deepEqual(progress.onboardingState, {
      stage: "setup",
      introResolution: "skipped",
      setupStep: 3,
    });
    assert.deepEqual(progress.tutorialProgress.zen, {
      status: "remind",
      step: 2,
      remindAfter: "2026-07-23T00:00:00.000Z",
    });
    assert.doesNotMatch(
      JSON.stringify(
        db
          .prepare(
            "SELECT onboarding_state, tutorial_progress FROM living_shell_account_state WHERE user_id = ?",
          )
          .get(userId),
      ),
      /secret|transcript/u,
    );
    db.close();
  });

});
