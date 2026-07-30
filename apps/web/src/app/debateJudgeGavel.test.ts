import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS,
  debateJudgeGavelSpaceAction,
} from "./debateJudgeGavel.ts";

describe("player Judge gavel keyboard control", () => {
  it("starts one deliberation, then treats every Space inside two seconds as showmanship", () => {
    const startedAt = 10_000;
    const smashUntilMs = startedAt + DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS;
    assert.equal(
      debateJudgeGavelSpaceAction({
        code: "Space",
        hasModifier: false,
        editableTarget: false,
        liveJudge: true,
        semanticAvailable: true,
        nowMs: startedAt,
        smashUntilMs: 0,
      }),
      "deliberate",
    );
    for (const nowMs of [startedAt + 1, startedAt + 400, smashUntilMs - 1]) {
      assert.equal(
        debateJudgeGavelSpaceAction({
          code: "Space",
          hasModifier: false,
          editableTarget: false,
          liveJudge: true,
          semanticAvailable: false,
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
        liveJudge: true,
        semanticAvailable: false,
        nowMs: smashUntilMs,
        smashUntilMs,
      }),
      null,
    );
  });

  it("leaves typing, controls, modifiers, non-Judges, and other keys alone", () => {
    const base = {
      code: "Space",
      hasModifier: false,
      editableTarget: false,
      liveJudge: true,
      semanticAvailable: true,
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
