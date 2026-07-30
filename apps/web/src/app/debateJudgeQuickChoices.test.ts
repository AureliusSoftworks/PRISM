import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debateJudgeGuidedStepKind,
  debateJudgeObjectionRulingShortcut,
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
        stepKey: "judge_objection_ruling",
        objectionRulingStatus: "awaiting_ruling",
      }),
      "objection",
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

  it("keeps gavel interventions separate from lifecycle controls", () => {
    const choices = debateJudgeQuickChoices("gavel");
    assert.equal(choices.length, 5);
    assert.equal(
      choices.some((choice) => choice.id === "end-debate"),
      false,
    );
    assert.equal(
      choices
        .slice(0, 3)
        .every(
          (choice) =>
            choice.action === "submit" && Boolean(choice.content?.trim()),
        ),
      true,
    );
    assert.equal(choices[3]?.action, "compose");
    assert.equal(choices[4]?.action, "dismiss");
  });

  it("keeps questions to three direct prompts, custom prose, or dismissal", () => {
    const choices = debateJudgeQuickChoices("question");
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
    assert.equal(choices[4]?.id, "nevermind");
    assert.equal(choices[4]?.action, "dismiss");
  });

  it("reserves objection rulings for the timed Sustained / Overruled dock", () => {
    assert.deepEqual(debateJudgeQuickChoices("objection"), []);
  });

  it("maps S and O to objection rulings without stealing editable input", () => {
    const base = {
      active: true,
      editableTarget: false,
      hasModifier: false,
    };
    assert.equal(
      debateJudgeObjectionRulingShortcut({ ...base, key: "s" }),
      "sustained",
    );
    assert.equal(
      debateJudgeObjectionRulingShortcut({ ...base, key: "O" }),
      "overruled",
    );
    assert.equal(
      debateJudgeObjectionRulingShortcut({
        ...base,
        editableTarget: true,
        key: "s",
      }),
      null,
    );
    assert.equal(
      debateJudgeObjectionRulingShortcut({
        ...base,
        hasModifier: true,
        key: "o",
      }),
      null,
    );
    assert.equal(
      debateJudgeObjectionRulingShortcut({
        ...base,
        active: false,
        key: "s",
      }),
      null,
    );
    assert.equal(
      debateJudgeObjectionRulingShortcut({ ...base, key: "Enter" }),
      null,
    );
  });
});
