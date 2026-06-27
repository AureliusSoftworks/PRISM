import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveZenPersonaPresenceDurations,
  resolveZenPersonaTransitionStyle,
  zenPersonaPresenceAfterPickerSelection,
  zenPersonaPresenceAfterRestore,
} from "./zenPersonaTransition.ts";

describe("resolveZenPersonaTransitionStyle", () => {
  it("passes explicit spoken styles through", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("new-speaks", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.99,
      }),
      "new-speaks"
    );
    assert.equal(
      resolveZenPersonaTransitionStyle("previous-introduces", {
        fromBotId: null,
        toBotId: "bot-b",
        random: () => 0,
      }),
      "previous-introduces"
    );
  });

  it("resolves Auto deterministically with injected random", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.1,
      }),
      "new-speaks"
    );
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: "bot-a",
        toBotId: "bot-b",
        random: () => 0.9,
      }),
      "previous-introduces"
    );
  });

  it("never resolves Auto to a quiet or off state", () => {
    const seen = new Set<string>();
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      seen.add(
        resolveZenPersonaTransitionStyle("auto", {
          fromBotId: "bot-a",
          toBotId: "bot-b",
          random: () => value,
        })
      );
    }
    assert.deepEqual([...seen].sort(), ["new-speaks", "previous-introduces"]);
  });

  it("lets Auto choose PRISM introduces when Default is the current persona", () => {
    assert.equal(
      resolveZenPersonaTransitionStyle("auto", {
        fromBotId: null,
        toBotId: "bot-b",
        random: () => 0.99,
      }),
      "previous-introduces"
    );
  });
});

describe("zenPersonaPresenceAfterPickerSelection", () => {
  it("keeps the outgoing bot visible while new-speaks begins departure", () => {
    assert.deepEqual(
      zenPersonaPresenceAfterPickerSelection({
        fromBotId: "bot-a",
        toBotId: "bot-b",
        style: "new-speaks",
      }),
      {
        visibleBotId: "bot-a",
        phase: "departing",
        targetBotId: "bot-b",
        waitingForIntroReveal: false,
      }
    );
  });

  it("keeps the outgoing bot stable while previous-introduces reveals", () => {
    assert.deepEqual(
      zenPersonaPresenceAfterPickerSelection({
        fromBotId: "bot-a",
        toBotId: "bot-b",
        style: "previous-introduces",
      }),
      {
        visibleBotId: "bot-a",
        phase: "stable",
        targetBotId: "bot-b",
        waitingForIntroReveal: true,
      }
    );
  });

  it("supports transitions back to Default", () => {
    assert.deepEqual(
      zenPersonaPresenceAfterPickerSelection({
        fromBotId: "bot-a",
        toBotId: null,
        style: "new-speaks",
      }),
      {
        visibleBotId: "bot-a",
        phase: "departing",
        targetBotId: null,
        waitingForIntroReveal: false,
      }
    );
  });

  it("restores the prior visible bot after an abort or error", () => {
    assert.deepEqual(zenPersonaPresenceAfterRestore("bot-a"), {
      visibleBotId: "bot-a",
      phase: "stable",
      targetBotId: "bot-a",
      waitingForIntroReveal: false,
    });
  });

  it("collapses leave and arrival timing for reduced motion", () => {
    assert.deepEqual(resolveZenPersonaPresenceDurations({ reducedMotion: true }), {
      departMs: 0,
      arriveMs: 0,
    });
  });

  it("uses fixed visual timings by default", () => {
    assert.deepEqual(resolveZenPersonaPresenceDurations(), {
      departMs: 260,
      arriveMs: 360,
    });
  });
});
