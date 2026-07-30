import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debateJudgeGuidedStepKind,
  debateJudgeQuickChoices,
} from "./debateJudgeQuickChoices.ts";

describe("Debate Judge quick choices", () => {
  it("only claims player-Judge prose and verdict waits", () => {
    assert.equal(
      debateJudgeGuidedStepKind({
        playerRole: "judge",
        status: "waiting_for_player",
        stepKey: "judge_gavel_message",
        judgeGavelStatus: "awaiting_message",
      }),
      "gavel",
    );
    assert.equal(
      debateJudgeGuidedStepKind({
        playerRole: "judge",
        status: "waiting_for_player",
        stepKey: "challenge_judge_question",
      }),
      "question",
    );
    assert.equal(
      debateJudgeGuidedStepKind({
        playerRole: "judge",
        status: "waiting_for_player",
        stepKey: "verdict_player",
      }),
      "verdict",
    );
    assert.equal(
      debateJudgeGuidedStepKind({
        playerRole: "participant",
        status: "waiting_for_player",
        stepKey: "challenge_judge_question",
      }),
      null,
    );
    assert.equal(
      debateJudgeGuidedStepKind({
        playerRole: "judge",
        status: "live",
        stepKey: "challenge_judge_question",
      }),
      null,
    );
  });

  it("offers three direct responses, a custom path, and a quiet dismissal", () => {
    for (const kind of ["gavel", "question"] as const) {
      const choices = debateJudgeQuickChoices(kind);
      assert.equal(choices.length, 5);
      assert.equal(
        choices
          .slice(0, 3)
          .every(
            (choice) =>
              choice.action === "submit" && Boolean(choice.content?.trim()),
          ),
        true,
      );
      assert.equal(choices[3]?.id, "custom");
      assert.equal(choices[3]?.action, "compose");
      assert.equal(choices[3]?.content, null);
      assert.equal(choices[4]?.id, "nevermind");
      assert.equal(choices[4]?.label, "nevermind");
      assert.equal(choices[4]?.action, "dismiss");
      assert.equal(choices[4]?.content, null);
    }
  });
});
