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

/**
 * How long after a room-calming order strike a second strike escalates to the
 * full intervention deck. Long enough to read the room settle and decide;
 * short enough that a later, unrelated smack starts over at calming.
 */
export const DEBATE_JUDGE_GAVEL_ORDER_ESCALATE_WINDOW_MS = 5_000;

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
  /** The active speaker is visibly overtime; a smack means "time". */
  callTimeAvailable: boolean;
  /** A prior order strike is still hanging in the air. */
  orderEscalateUntilMs: number;
}): DebateJudgeGavelSpaceAction | null {
  if (args.code !== "Space" || args.hasModifier || args.editableTarget) {
    return null;
  }
  if (args.ceremonialAvailable) return "cue";
  if (!args.liveJudge) return null;
  if (args.nowMs < args.smashUntilMs) return "smash";
  // Overtime is the one case where a single smack still strikes at the
  // speaker: calling time is the human Judge's covenant, not a menu choice.
  if (args.interventionAvailable && args.callTimeAvailable) return "intervene";
  // One smack calms the room. A second smack while that order call still
  // hangs in the air escalates to the full intervention deck.
  if (args.interventionAvailable && args.nowMs < args.orderEscalateUntilMs) {
    return "intervene";
  }
  if (args.orderAvailable) return "order";
  return args.interventionAvailable ? "intervene" : null;
}
