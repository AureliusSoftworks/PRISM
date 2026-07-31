import type {
  DebateJudgeGavelDemeanor,
  DebateJudgeGavelReason,
  VoiceDeliveryMood,
} from "@localai/shared";

export const DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS = 2_000;
export const DEBATE_JUDGE_GAVEL_CUE_WINDOW_MS = 2_800;
export const DEBATE_JUDGE_GAVEL_MISSED_BEAT_MS = 900;

export type DebateJudgeGavelSpaceAction =
  | "cue"
  | "intervene"
  | "order"
  | "smash";

export function debateJudgeGavelCooldownBlocks(args: {
  overtime: boolean;
  cooldownRemainingMs: number;
}): boolean {
  return !args.overtime && args.cooldownRemainingMs > 0;
}

export function debateJudgeGavelVoiceMood(args: {
  gavelReason?: DebateJudgeGavelReason;
  gavelDemeanor?: DebateJudgeGavelDemeanor;
}): VoiceDeliveryMood {
  if (args.gavelReason !== "overtime") return "neutral";
  if (args.gavelDemeanor === "aggravated") return "strained";
  if (args.gavelDemeanor === "firm") return "guarded";
  return "neutral";
}

export function debateJudgeGavelSpaceAction(args: {
  code: string;
  hasModifier: boolean;
  editableTarget: boolean;
  ceremonialAvailable: boolean;
  interventionAvailable: boolean;
  liveJudge: boolean;
  orderAvailable: boolean;
  nowMs: number;
  smashUntilMs: number;
}): DebateJudgeGavelSpaceAction | null {
  if (args.code !== "Space" || args.hasModifier || args.editableTarget) {
    return null;
  }
  if (args.ceremonialAvailable) return "cue";
  if (!args.liveJudge) return null;
  if (args.nowMs < args.smashUntilMs) return "smash";
  if (args.interventionAvailable) return "intervene";
  return args.orderAvailable ? "order" : null;
}
