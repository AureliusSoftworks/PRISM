import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkElevenLabsCreditMonitor,
  listPrismNotifications,
  upsertElevenLabsCreditMonitor,
} from "../prism-monitors.ts";
import {
  closeTestDatabase,
  createTestDatabase,
} from "../test-support.ts";

function insertUser(db: ReturnType<typeof createTestDatabase>): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at)
     VALUES ('u1', 'monitor@example.com', 'Monitor', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-07-26T00:00:00.000Z", "2026-07-26T00:00:00.000Z");
}

describe("Prism ElevenLabs credit monitor", () => {
  it("triggers once per billing cycle and rearms after reset", async () => {
    const db = createTestDatabase();
    try {
      insertUser(db);
      upsertElevenLabsCreditMonitor({
        db,
        userId: "u1",
        thresholdRatio: 0.2,
        hardLocal: false,
        now: new Date("2026-07-26T01:00:00.000Z"),
      });
      const lowBalance = async () => ({
        usedCredits: 82,
        totalCredits: 100,
        remainingCredits: 18,
        resetAt: "2026-08-01T00:00:00.000Z",
        tier: "creator",
        status: "active",
        checkedAt: "2026-07-26T02:00:00.000Z",
      });
      const first = await checkElevenLabsCreditMonitor({
        db,
        userId: "u1",
        hardLocal: false,
        readBalance: lowBalance,
        force: true,
        now: new Date("2026-07-26T02:00:00.000Z"),
      });
      assert.equal(first.notificationCreated, true);
      assert.equal(listPrismNotifications(db, "u1").length, 1);

      const second = await checkElevenLabsCreditMonitor({
        db,
        userId: "u1",
        hardLocal: false,
        readBalance: lowBalance,
        force: true,
        now: new Date("2026-07-26T03:00:00.000Z"),
      });
      assert.equal(second.notificationCreated, false);
      assert.equal(listPrismNotifications(db, "u1").length, 1);

      const nextCycle = await checkElevenLabsCreditMonitor({
        db,
        userId: "u1",
        hardLocal: false,
        readBalance: async () => ({
          ...(await lowBalance()),
          resetAt: "2026-09-01T00:00:00.000Z",
        }),
        force: true,
        now: new Date("2026-08-26T03:00:00.000Z"),
      });
      assert.equal(nextCycle.notificationCreated, true);
      assert.equal(listPrismNotifications(db, "u1").length, 2);
    } finally {
      closeTestDatabase(db);
    }
  });

  it("pauses without egress in hard LOCAL", async () => {
    const db = createTestDatabase();
    try {
      insertUser(db);
      upsertElevenLabsCreditMonitor({
        db,
        userId: "u1",
        thresholdRatio: 0.2,
        hardLocal: false,
      });
      let calls = 0;
      const result = await checkElevenLabsCreditMonitor({
        db,
        userId: "u1",
        hardLocal: true,
        readBalance: async () => {
          calls += 1;
          throw new Error("must not run");
        },
        force: true,
      });
      assert.equal(calls, 0);
      assert.equal(result.monitor?.status, "paused-local");
    } finally {
      closeTestDatabase(db);
    }
  });
});

