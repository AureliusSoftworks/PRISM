import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coffeeShellPolicy,
  liveSessionChromePolicy,
} from "./coffee-shell-policy.ts";

describe("Coffee shell policy", () => {
  it("locks Coffee navigation while keeping Appearance available", () => {
    for (const phase of ["topic", "arriving", "live"] as const) {
      const policy = coffeeShellPolicy({ conversationActive: true, phase });
      assert.equal(policy.liveSessionActive, true);
      assert.equal(policy.showEndSessionInSwitcher, false);
      assert.equal(policy.disabledNavbarActions.settings, true);
      assert.equal(policy.disabledNavbarActions.voice, true);
      assert.equal(policy.disabledNavbarActions.memories, true);
      assert.equal(policy.disabledNavbarActions.usage, true);
      assert.equal(policy.disabledNavbarActions.theme, undefined);
      assert.deepEqual(policy.disabledNavbarActions, {
        promptCenter: true,
        refresh: true,
        settings: true,
        voice: true,
        usage: true,
        memories: true,
        images: true,
        bots: true,
      });
      assert.equal(
        policy.disabledNavbarActionTooltips.settings,
        "End the Coffee session before opening Settings.",
      );
      assert.match(
        policy.disabledNavbarActionTooltips.voice ?? "",
        /recorded speaking type is baked/u,
      );
    }
  });

  it("locks Signal navigation including Voice while keeping Appearance available", () => {
    const policy = liveSessionChromePolicy("Signal");
    assert.equal(policy.disabledNavbarActions.voice, true);
    assert.equal(policy.disabledNavbarActions.memories, true);
    assert.equal(policy.disabledNavbarActions.usage, true);
    assert.equal(policy.disabledNavbarActions.theme, undefined);
    assert.deepEqual(policy.disabledNavbarActions, {
      promptCenter: true,
      refresh: true,
      settings: true,
      voice: true,
      usage: true,
      memories: true,
      images: true,
      bots: true,
    });
    assert.match(
      policy.disabledNavbarActionTooltips.voice ?? "",
      /recorded speaking type is baked/u,
    );
    assert.equal(
      policy.disabledNavbarActionTooltips.memories,
      "Cut or finish the Signal session before opening Memories.",
    );
  });

  it("locks Debate chrome until the player returns to the lobby", () => {
    const policy = liveSessionChromePolicy("Debate");
    assert.match(policy.lockMessage, /Return to the Debate lobby/u);
    assert.match(policy.lockMessage, /model, Effort or Max/u);
    assert.match(policy.lockMessage, /Turbo setting/u);
    assert.match(
      policy.disabledNavbarActionTooltips.voice ?? "",
      /frozen for this Duel/u,
    );
  });

  it("locks Story chrome while generation or playback owns the session", () => {
    const policy = liveSessionChromePolicy("Story");
    assert.match(policy.lockMessage, /Start a new Story/u);
    assert.equal(policy.disabledNavbarActions.settings, true);
    assert.equal(policy.disabledNavbarActions.theme, undefined);
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

  it("leaves setup and an unowned topic phase unlocked", () => {
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
