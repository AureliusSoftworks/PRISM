import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZEN_AUTONOMY_FIRST_IDLE_MS,
  ZEN_AUTONOMY_MAX_SPOKEN_PER_VISIBLE_SESSION,
  ZEN_AUTONOMY_SILENT_COOLDOWN_MS,
  ZEN_AUTONOMY_SPOKEN_COOLDOWN_MS,
  nextZenAutonomyCooldownUntilMs,
  resolveZenAutonomyEligibility,
  zenAutonomySchedulerIsActive,
} from "./zenAutonomy.ts";

const base = {
  view: "chat" as const,
  enabled: true,
  documentVisible: true,
  hasConversation: true,
  pendingReply: false,
  editingMessageId: null,
  draft: "",
  inFlight: false,
  spokenCount: 0,
  nowMs: 1_000_000,
  lastActivityAtMs: 1_000_000 - ZEN_AUTONOMY_FIRST_IDLE_MS,
  cooldownUntilMs: 0,
};

describe("resolveZenAutonomyEligibility", () => {
  it("is eligible only after the idle window on a visible Zen conversation", () => {
    assert.deepEqual(resolveZenAutonomyEligibility(base), {
      eligible: true,
      reason: "eligible",
      delayMs: 0,
      idleMs: ZEN_AUTONOMY_FIRST_IDLE_MS,
    });

    const waiting = resolveZenAutonomyEligibility({
      ...base,
      lastActivityAtMs: base.nowMs - 60_000,
    });
    assert.equal(waiting.eligible, false);
    assert.equal(waiting.reason, "idle");
    assert.equal(waiting.delayMs, ZEN_AUTONOMY_FIRST_IDLE_MS - 60_000);
  });

  it("blocks hidden, busy, editing, and non-empty composer states", () => {
    for (const patch of [
      { documentVisible: false, reason: "hidden" },
      { pendingReply: true, reason: "pending" },
      { editingMessageId: "m1", reason: "editing" },
      { draft: "hello", reason: "draft" },
      { hasConversation: false, reason: "missing-conversation" },
    ] as const) {
      const result = resolveZenAutonomyEligibility({ ...base, ...patch });
      assert.equal(result.eligible, false);
      assert.equal(result.reason, patch.reason);
    }
  });

  it("backs off during cooldown and caps spoken turns per visible session", () => {
    const cooldown = resolveZenAutonomyEligibility({
      ...base,
      cooldownUntilMs: base.nowMs + 30_000,
    });
    assert.equal(cooldown.eligible, false);
    assert.equal(cooldown.reason, "cooldown");
    assert.equal(cooldown.delayMs, 30_000);

    const capped = resolveZenAutonomyEligibility({
      ...base,
      spokenCount: ZEN_AUTONOMY_MAX_SPOKEN_PER_VISIBLE_SESSION,
    });
    assert.equal(capped.eligible, false);
    assert.equal(capped.reason, "spoken-cap");
  });
});

describe("nextZenAutonomyCooldownUntilMs", () => {
  it("uses the silent and spoken cooldowns", () => {
    assert.equal(
      nextZenAutonomyCooldownUntilMs(5_000, { action: "silent" }),
      5_000 + ZEN_AUTONOMY_SILENT_COOLDOWN_MS
    );
    assert.equal(
      nextZenAutonomyCooldownUntilMs(5_000, { action: "speak", botId: null }),
      5_000 + ZEN_AUTONOMY_SPOKEN_COOLDOWN_MS
    );
  });
});

describe("zenAutonomySchedulerIsActive", () => {
  it("only permits ticks for a signed-in Zen surface with autonomy enabled", () => {
    assert.equal(
      zenAutonomySchedulerIsActive({
        view: "chat",
        enabled: true,
        hasUser: true,
      }),
      true
    );

    for (const input of [
      { view: "sandbox" as const, enabled: true, hasUser: true },
      { view: "chat" as const, enabled: false, hasUser: true },
      { view: "chat" as const, enabled: true, hasUser: false },
    ]) {
      assert.equal(zenAutonomySchedulerIsActive(input), false);
    }
  });
});
