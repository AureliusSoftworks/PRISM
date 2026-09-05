import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS,
  DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS,
  DEBATE_JUDGE_GAVEL_ORDER_ESCALATE_WINDOW_MS,
  DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS,
  debateJudgeGavelCooldownBlocks,
  debateJudgeGavelSpaceAction,
  debateJudgeGavelVoiceMood,
} from "./debateJudgeGavel.ts";

describe("player Judge gavel keyboard control", () => {
  it("keeps overtime procedural through cooldown and scales its voice mood", () => {
    assert.equal(
      debateJudgeGavelCooldownBlocks({
        overtime: false,
        cooldownRemainingMs: 4_000,
      }),
      true,
    );
    assert.equal(
      debateJudgeGavelCooldownBlocks({
        overtime: true,
        cooldownRemainingMs: 4_000,
      }),
      false,
    );
    assert.equal(
      debateJudgeGavelVoiceMood({
        gavelReason: "overtime",
        gavelDemeanor: "measured",
      }),
      "neutral",
    );
    assert.equal(
      debateJudgeGavelVoiceMood({
        gavelReason: "overtime",
        gavelDemeanor: "firm",
      }),
      "guarded",
    );
    assert.equal(
      debateJudgeGavelVoiceMood({
        gavelReason: "overtime",
        gavelDemeanor: "aggravated",
      }),
      "strained",
    );
  });

  it("calms the room on one smack and escalates to the deck on a double smack", () => {
    const startedAt = 10_000;
    const smashUntilMs = startedAt + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    const base = {
      code: "Space",
      hasModifier: false,
      editableTarget: false,
      ceremonialAvailable: false,
      liveJudge: true,
      smashUntilMs: 0,
      callTimeAvailable: false,
      orderEscalateUntilMs: 0,
    } as const;
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: false,
        orderAvailable: true,
        nowMs: startedAt,
      }),
      "order",
    );
    // A single smack calms the room even when the intervention deck is
    // available — the deck is deliberately a double smack away.
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: true,
        orderAvailable: true,
        nowMs: startedAt,
      }),
      "order",
    );
    // The second smack, while the order call still hangs in the air,
    // escalates to the full intervention.
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: true,
        orderAvailable: true,
        nowMs: startedAt + 1_200,
        orderEscalateUntilMs:
          startedAt + DEBATE_JUDGE_GAVEL_ORDER_ESCALATE_WINDOW_MS,
      }),
      "intervene",
    );
    // Once the window lapses, the next smack calms the room again.
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: true,
        orderAvailable: true,
        nowMs: startedAt + DEBATE_JUDGE_GAVEL_ORDER_ESCALATE_WINDOW_MS + 1,
        orderEscalateUntilMs:
          startedAt + DEBATE_JUDGE_GAVEL_ORDER_ESCALATE_WINDOW_MS,
      }),
      "order",
    );
    // Overtime keeps the single-smack strike: calling time is the human
    // Judge's covenant, not a menu choice.
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: true,
        orderAvailable: true,
        callTimeAvailable: true,
        nowMs: startedAt,
      }),
      "intervene",
    );
    // When calming is unavailable, the smack still reaches the intervention.
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: true,
        orderAvailable: false,
        nowMs: startedAt,
      }),
      "intervene",
    );
    for (const nowMs of [startedAt + 1, startedAt + 400, smashUntilMs - 1]) {
      assert.equal(
        debateJudgeGavelSpaceAction({
          ...base,
          interventionAvailable: true,
          orderAvailable: false,
          nowMs,
          smashUntilMs,
        }),
        "smash",
      );
    }
    assert.equal(
      debateJudgeGavelSpaceAction({
        ...base,
        interventionAvailable: false,
        orderAvailable: false,
        nowMs: smashUntilMs,
        smashUntilMs,
      }),
      null,
    );
  });

  it("reserves Space for a presentation-only cue before any procedural action", () => {
    assert.equal(DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS, 2_800);
    assert.equal(DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS, 900);
    assert.equal(
      debateJudgeGavelSpaceAction({
        code: "Space",
        hasModifier: false,
        editableTarget: false,
        ceremonialAvailable: true,
        interventionAvailable: true,
        liveJudge: false,
        orderAvailable: false,
        nowMs: 10_000,
        smashUntilMs: 0,
        callTimeAvailable: false,
        orderEscalateUntilMs: 0,
      }),
      "cue",
    );
  });

  it("leaves typing, controls, modifiers, non-Judges, and other keys alone", () => {
    const base = {
      code: "Space",
      hasModifier: false,
      editableTarget: false,
      ceremonialAvailable: false,
      interventionAvailable: false,
      liveJudge: true,
      orderAvailable: true,
      nowMs: 1,
      smashUntilMs: 0,
      callTimeAvailable: false,
      orderEscalateUntilMs: 0,
    };
    assert.equal(
      debateJudgeGavelSpaceAction({ ...base, editableTarget: true }),
      null,
    );
    assert.equal(
      debateJudgeGavelSpaceAction({ ...base, hasModifier: true }),
      null,
    );
    assert.equal(
      debateJudgeGavelSpaceAction({ ...base, liveJudge: false }),
      null,
    );
    assert.equal(debateJudgeGavelSpaceAction({ ...base, code: "Enter" }), null);
  });
});
