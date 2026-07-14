import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coffeeShellPolicy } from "./coffee-shell-policy.ts";

describe("Coffee shell policy", () => {
  it("keeps useful navbar actions available during a live session", () => {
    for (const phase of ["arriving", "live"] as const) {
      const policy = coffeeShellPolicy({ conversationActive: true, phase });
      assert.equal(policy.liveSessionActive, true);
      assert.equal(policy.showEndSessionInSwitcher, true);
      assert.equal(policy.disabledNavbarActions.settings, undefined);
      assert.equal(policy.disabledNavbarActions.voice, undefined);
      assert.equal(policy.disabledNavbarActions.memories, undefined);
      assert.deepEqual(policy.disabledNavbarActions, {
        refresh: true,
        images: true,
        bots: true,
      });
    }
  });

  it("treats a loaded finished conversation as review before replay starts", () => {
    const policy = coffeeShellPolicy({
      conversationActive: true,
      phase: "finished",
    });
    assert.equal(policy.reviewActive, true);
    assert.equal(policy.liveSessionActive, false);
    assert.deepEqual(policy.disabledNavbarActions, {});
  });

  it("does not enter review without a loaded conversation", () => {
    assert.equal(
      coffeeShellPolicy({ conversationActive: false, phase: "finished" })
        .reviewActive,
      false,
    );
  });
});
