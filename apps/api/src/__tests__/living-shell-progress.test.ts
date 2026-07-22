import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { initializeDatabase } from "../db.ts";
import {
  createPendingLivingShellAccountProgress,
  getLivingShellAccountProgress,
  revealLivingShellCapability,
  revealSignalAfterZenReplyMilestone,
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
    assert.equal(progress.capabilityRevelations.slate.revealed, true);
    assert.equal(progress.capabilityRevelations.marketplace.revealed, false);
    db.close();
  });

  it("treats an unseeded pre-existing account as completed", () => {
    const { db, userId } = accountDb();
    const progress = getLivingShellAccountProgress(db, userId);
    assert.equal(progress.onboardingState.stage, "complete");
    assert.equal(progress.tutorialProgress.slate.status, "completed");
    assert.equal(progress.capabilityRevelations.coffee.revealed, true);
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

  it("reveals capabilities monotonically without accepting them in progress patches", () => {
    const { db, userId } = accountDb();
    createPendingLivingShellAccountProgress(db, userId);
    const revealed = revealLivingShellCapability(
      db,
      userId,
      "marketplace",
      "bot_saved",
      "2026-07-22T01:00:00.000Z",
    );
    assert.equal(revealed.capabilityRevelations.marketplace.reason, "bot_saved");
    updateLivingShellAccountProgress(db, userId, {
      capabilityRevelations: { marketplace: { revealed: false } },
    });
    const persisted = getLivingShellAccountProgress(db, userId);
    assert.equal(persisted.capabilityRevelations.marketplace.revealed, true);
    db.close();
  });

  it("reveals Signal after replies from two distinct Zen bots", () => {
    const { db, userId } = accountDb();
    createPendingLivingShellAccountProgress(db, userId);
    for (const botId of ["bot-a", "bot-b"]) {
      db.prepare(
        `INSERT INTO bots (
           id, user_id, name, system_prompt, created_at, updated_at
         ) VALUES (?, ?, ?, '', ?, ?)`,
      ).run(
        botId,
        userId,
        botId,
        "2026-07-22T00:00:00.000Z",
        "2026-07-22T00:00:00.000Z",
      );
      db.prepare(
        `INSERT INTO conversations (
           id, user_id, title, conversation_mode, bot_id, created_at, updated_at
         ) VALUES (?, ?, ?, 'zen', ?, ?, ?)`,
      ).run(
        `conversation-${botId}`,
        userId,
        botId,
        botId,
        "2026-07-22T00:00:00.000Z",
        "2026-07-22T00:00:00.000Z",
      );
      db.prepare(
        `INSERT INTO messages (
           id, conversation_id, user_id, role, content, bot_id, created_at
         ) VALUES (?, ?, ?, 'assistant', 'Hello', ?, ?)`,
      ).run(
        `message-${botId}`,
        `conversation-${botId}`,
        userId,
        botId,
        "2026-07-22T00:00:00.000Z",
      );
      const progress = revealSignalAfterZenReplyMilestone(db, userId);
      assert.equal(progress.capabilityRevelations.signal.revealed, botId === "bot-b");
    }
    db.close();
  });
});
