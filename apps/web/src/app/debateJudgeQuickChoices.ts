export type DebateJudgeGuidedStepKind = "gavel" | "question" | "verdict";

export interface DebateJudgeQuickChoice {
  id: string;
  label: string;
  detail: string;
  content: string | null;
}

export function debateJudgeGuidedStepKind(args: {
  playerRole: "judge" | "participant" | "spectator";
  status: string;
  stepKey: string;
  judgeGavelStatus?: string | null;
}): DebateJudgeGuidedStepKind | null {
  if (args.playerRole !== "judge" || args.status !== "waiting_for_player") {
    return null;
  }
  if (
    args.stepKey === "judge_gavel_message" &&
    args.judgeGavelStatus === "awaiting_message"
  ) {
    return "gavel";
  }
  if (args.stepKey === "challenge_judge_question") return "question";
  if (
    args.stepKey === "verdict_player" ||
    args.stepKey === "turnabout_verdict_player"
  ) {
    return "verdict";
  }
  return null;
}

const CUSTOM_JUDGE_CHOICE: DebateJudgeQuickChoice = {
  id: "custom",
  label: "Write my own…",
  detail: "Open the composer",
  content: null,
};

const JUDGE_GAVEL_CHOICES: readonly DebateJudgeQuickChoice[] = [
  {
    id: "clarify",
    label: "Clarify the claim",
    detail: "Name the point that matters",
    content: "Clarify the central claim you want the Judge to accept.",
  },
  {
    id: "answer-objection",
    label: "Answer the objection",
    detail: "Meet the strongest challenge",
    content: "Address the strongest objection from the other side directly.",
  },
  {
    id: "return-to-evidence",
    label: "Return to evidence",
    detail: "Ground the next answer",
    content: "Ground the next answer in the frozen evidence.",
  },
  CUSTOM_JUDGE_CHOICE,
];

const JUDGE_QUESTION_CHOICES: readonly DebateJudgeQuickChoice[] = [
  {
    id: "test-evidence",
    label: "Test the evidence",
    detail: "Ask for their strongest support",
    content: "What evidence most strongly supports your position?",
  },
  {
    id: "find-fault-line",
    label: "Find the fault line",
    detail: "Press the other side’s weakness",
    content: "Which part of the other side’s case is weakest, and why?",
  },
  {
    id: "set-threshold",
    label: "Set the threshold",
    detail: "Learn what could persuade them",
    content: "What would change your mind about this motion?",
  },
  CUSTOM_JUDGE_CHOICE,
];

export function debateJudgeQuickChoices(
  kind: Exclude<DebateJudgeGuidedStepKind, "verdict">,
): readonly DebateJudgeQuickChoice[] {
  return kind === "gavel" ? JUDGE_GAVEL_CHOICES : JUDGE_QUESTION_CHOICES;
}
