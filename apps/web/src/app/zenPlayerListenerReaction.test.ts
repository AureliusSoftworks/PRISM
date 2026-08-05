import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ListenerReactionPlanV1 } from "@localai/shared";

import {
  isZenPlayerListeningReactionAction,
  zenLiveBotActionFromPlayerListenerReaction,
  zenPlayerListenerVisualMoodHint,
  zenPlayerListenerVocalFoleyToActionSfxKind,
} from "./zenPlayerListenerReaction.ts";

function samplePlan(
  overrides: Partial<ListenerReactionPlanV1> = {},
): ListenerReactionPlanV1 {
  return {
    v: 1,
    name: "listenerReaction",
    speakerBotId: "player",
    listenerBotId: "bot-1",
    messageId: "msg-1",
    targetSource: "role",
    visualAction: "nod",
    targetProgress: 0.42,
    seed: "zen-player-listener-v1:zen:msg-1:bot-1",
    cameraCutEligible: false,
    ...overrides,
  };
}

describe("zenPlayerListenerReaction", () => {
  it("maps vocal Foley to Action SFX kinds", () => {
    assert.equal(
      zenPlayerListenerVocalFoleyToActionSfxKind("clears throat"),
      "throat_clear",
    );
    assert.equal(zenPlayerListenerVocalFoleyToActionSfxKind("coughs"), "cough");
    assert.equal(zenPlayerListenerVocalFoleyToActionSfxKind("sighs"), "sigh");
    assert.equal(zenPlayerListenerVocalFoleyToActionSfxKind("exhales"), "sigh");
    assert.equal(
      zenPlayerListenerVocalFoleyToActionSfxKind("chuckles"),
      "laugh",
    );
  });

  it("maps visual actions to mood hints and live plates", () => {
    assert.equal(zenPlayerListenerVisualMoodHint("soft_smile"), "amused");
    assert.equal(zenPlayerListenerVisualMoodHint("lean_in"), "attentive");
    assert.equal(zenPlayerListenerVisualMoodHint("nod"), "attentive");
    assert.equal(zenPlayerListenerVisualMoodHint("head_tilt"), "confused");
    assert.equal(zenPlayerListenerVisualMoodHint("thoughtful_hmm"), "waiting");

    const live = zenLiveBotActionFromPlayerListenerReaction({
      plan: samplePlan({ visualAction: "lean_in" }),
      botId: "bot-1",
      createdAtMs: 1_700_000_000_000,
    });
    assert.equal(live.action, "leans in");
    assert.equal(live.moodHint, "attentive");
    assert.equal(live.responseKind, "show_action");
    assert.equal(live.botId, "bot-1");
    assert.equal(live.clientSequenceId, "zen-player-listen:msg-1");
    assert.equal(live.source, "idle");
    assert.equal(live.createdAtMs, 1_700_000_000_000);
    assert.equal(isZenPlayerListeningReactionAction(live, "msg-1"), true);
    assert.equal(isZenPlayerListeningReactionAction(live, "other"), false);
  });
});
