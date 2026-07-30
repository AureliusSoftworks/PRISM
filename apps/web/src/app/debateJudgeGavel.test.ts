import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS,
  DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS,
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

  it("restores audience order, then treats every Space inside two seconds as showmanship", () => {
    const startedAt = 10_000;
    const smashUntilMs = startedAt + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    assert.equal(
      debateJudgeGavelSpaceAction({
        code: "Space",
        hasModifier: false,
        editableTarget: false,
        ceremonialAvailable: false,
        liveJudge: true,
        orderAvailable: true,
        nowMs: startedAt,
        smashUntilMs: 0,
      }),
      "order",
    );
    for (const nowMs of [startedAt + 1, startedAt + 400, smashUntilMs - 1]) {
      assert.equal(
        debateJudgeGavelSpaceAction({
          code: "Space",
          hasModifier: false,
          editableTarget: false,
          ceremonialAvailable: false,
          liveJudge: true,
          orderAvailable: false,
          nowMs,
          smashUntilMs,
        }),
        "smash",
      );
    }
    assert.equal(
      debateJudgeGavelSpaceAction({
        code: "Space",
        hasModifier: false,
        editableTarget: false,
        ceremonialAvailable: false,
        liveJudge: true,
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
        liveJudge: false,
        orderAvailable: false,
        nowMs: 10_000,
        smashUntilMs: 0,
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
      liveJudge: true,
      orderAvailable: true,
      nowMs: 1,
      smashUntilMs: 0,
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
