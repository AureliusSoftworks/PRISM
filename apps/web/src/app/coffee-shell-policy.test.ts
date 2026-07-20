import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeShellPolicy,
  liveSessionChromePolicy,
} from "./coffee-shell-policy.ts";

describe("Coffee shell policy", () => {
  it("locks session-changing chrome and keeps read-only actions available live", () => {
    for (const phase of ["arriving", "live"] as const) {
      const policy = coffeeShellPolicy({ conversationActive: true, phase });
      assert.equal(policy.liveSessionActive, true);
      assert.equal(policy.showEndSessionInSwitcher, true);
      assert.equal(policy.disabledNavbarActions.settings, true);
      assert.equal(policy.disabledNavbarActions.voice, undefined);
      assert.equal(policy.disabledNavbarActions.memories, undefined);
      assert.equal(policy.disabledNavbarActions.usage, undefined);
      assert.equal(policy.disabledNavbarActions.theme, undefined);
      assert.deepEqual(policy.disabledNavbarActions, {
        promptCenter: true,
        refresh: true,
        settings: true,
        images: true,
        bots: true,
      });
      assert.equal(
        policy.disabledNavbarActionTooltips.settings,
        "End the Coffee session before opening Settings.",
      );
    }
  });

  it("keeps Signal voice direction live while locking session-changing chrome", () => {
    const policy = liveSessionChromePolicy("Signal");
    assert.equal(policy.disabledNavbarActions.voice, undefined);
    assert.equal(policy.disabledNavbarActions.memories, undefined);
    assert.equal(policy.disabledNavbarActions.usage, undefined);
    assert.equal(policy.disabledNavbarActions.theme, undefined);
    assert.deepEqual(policy.disabledNavbarActions, {
      promptCenter: true,
      refresh: true,
      settings: true,
      images: true,
      bots: true,
    });
    assert.equal(policy.disabledNavbarActionTooltips.voice, undefined);
  });

  it("treats a loaded finished conversation as review before replay starts", () => {
    const policy = coffeeShellPolicy({
      conversationActive: true,
      phase: "finished",
    });
    assert.equal(policy.reviewActive, true);
    assert.equal(policy.liveSessionActive, false);
    assert.deepEqual(policy.disabledNavbarActions, {});
    assert.deepEqual(policy.disabledNavbarActionTooltips, {});
  });

  it("leaves setup and topic phases unlocked", () => {
    for (const phase of ["selecting", "preview", "topic"] as const) {
      const policy = coffeeShellPolicy({ conversationActive: false, phase });
      assert.equal(policy.liveSessionActive, false);
      assert.equal(policy.showEndSessionInSwitcher, false);
      assert.deepEqual(policy.disabledNavbarActions, {});
      assert.deepEqual(policy.disabledNavbarActionTooltips, {});
    }
  });

  it("does not enter review without a loaded conversation", () => {
    assert.equal(
      coffeeShellPolicy({ conversationActive: false, phase: "finished" })
        .reviewActive,
      false,
    );
  });
});
