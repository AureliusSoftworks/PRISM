export const DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS = 2_000;

export type DebateJudgeGavelSpaceAction = "deliberate" | "smash";

export function debateJudgeGavelSpaceAction(args: {
  code: string;
  hasModifier: boolean;
  editableTarget: boolean;
  liveJudge: boolean;
  semanticAvailable: boolean;
  nowMs: number;
  smashUntilMs: number;
}): DebateJudgeGavelSpaceAction | null {
  if (
    args.code !== "Space" ||
    args.hasModifier ||
    args.editableTarget ||
    !args.liveJudge
  ) {
    return null;
  }
  if (args.nowMs < args.smashUntilMs) return "smash";
  return args.semanticAvailable ? "deliberate" : null;
}
