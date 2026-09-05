export type DebateJudgeGuidedStepKind =
  "gavel" | "question" | "objection" | "verdict";

export interface DebateJudgeQuickChoice {
  id: string;
  label: string;
  detail: string;
  content: string | null;
  action: "submit" | "compose" | "dismiss";
}

export type DebateJudgeObjectionRuling = "sustained" | "overruled";

export function debateJudgeObjectionRulingShortcut(args: {
  active: boolean;
  editableTarget: boolean;
  hasModifier: boolean;
  key: string;
}): DebateJudgeObjectionRuling | null {
  if (!args.active || args.editableTarget || args.hasModifier) return null;
  const key = args.key.toLocaleLowerCase();
  if (key === "s") return "sustained";
  if (key === "o") return "overruled";
  return null;
}

export function debateJudgeGuidedStepKind(args: {
  playerRole: "judge" | "participant" | "spectator";
  status: string;
  stepKey: string;
  judgeGavelStatus?: string | null;
  objectionRulingStatus?: string | null;
}): DebateJudgeGuidedStepKind | null {
  if (args.playerRole !== "judge" || args.status !== "waiting_for_player") {
    return null;
  }
  if (
    args.stepKey === "judge_objection_ruling" &&
    args.objectionRulingStatus === "awaiting_ruling"
  ) {
    return "objection";
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
  action: "compose",
};

const NEVERMIND_JUDGE_CHOICE: DebateJudgeQuickChoice = {
  id: "nevermind",
  label: "nevermind",
  detail: "Let the proceeding continue",
  content: null,
  action: "dismiss",
};

const JUDGE_GAVEL_CHOICES: readonly DebateJudgeQuickChoice[] = [
  {
    id: "clarify",
    label: "Clarify the claim",
    detail: "Name the point that matters",
    content: "Clarify the central claim you want the Judge to accept.",
    action: "submit",
  },
  {
    id: "answer-objection",
    label: "Answer the objection",
    detail: "Meet the strongest challenge",
    content: "Address the strongest objection from the other side directly.",
    action: "submit",
  },
  {
    id: "return-to-evidence",
    label: "Return to evidence",
    detail: "Ground the next answer",
    content: "Ground the next answer in the frozen evidence.",
    action: "submit",
  },
  CUSTOM_JUDGE_CHOICE,
  NEVERMIND_JUDGE_CHOICE,
];

const JUDGE_QUESTION_CHOICES: readonly DebateJudgeQuickChoice[] = [
  {
    id: "test-evidence",
    label: "Test the evidence",
    detail: "Ask for their strongest support",
    content: "What evidence most strongly supports your position?",
    action: "submit",
  },
  {
    id: "find-fault-line",
    label: "Find the fault line",
    detail: "Press the other side’s weakness",
    content: "Which part of the other side’s case is weakest, and why?",
    action: "submit",
  },
  {
    id: "set-threshold",
    label: "Set the threshold",
    detail: "Learn what could persuade them",
    content: "What would change your mind about this motion?",
    action: "submit",
  },
  CUSTOM_JUDGE_CHOICE,
  NEVERMIND_JUDGE_CHOICE,
];

export function debateJudgeQuickChoices(
  kind: Exclude<DebateJudgeGuidedStepKind, "verdict">,
): readonly DebateJudgeQuickChoice[] {
  if (kind === "objection") return [];
  return kind === "gavel" ? JUDGE_GAVEL_CHOICES : JUDGE_QUESTION_CHOICES;
}
