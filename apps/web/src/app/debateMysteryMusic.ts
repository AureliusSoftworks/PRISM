import type { DebateMysteryPlayPhase } from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

export const WHODUNNIT_INVESTIGATION_MUSIC_URL =
  "/audio/debate/whodunnit/the-midnight-clue.mp3";

export const WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS = 720;
export const WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS = 260;

export const WHODUNNIT_INVESTIGATION_MUSIC_MIX = {
  background: 0.1,
  grain: 0,
  foley: 0,
} as const satisfies SessionAtmosphereMix;

export const WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX = {
  ...WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  background: 0,
} as const satisfies SessionAtmosphereMix;

export function mysteryInvestigationMusicSessionActive(
  playPhase: DebateMysteryPlayPhase,
): boolean {
  return playPhase === "investigation";
}

export function mysteryInvestigationMusicMix(args: {
  theoryBoardOpen: boolean;
  roomIntroductionActive?: boolean;
}): SessionAtmosphereMix {
  return args.theoryBoardOpen || args.roomIntroductionActive
    ? WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX
    : WHODUNNIT_INVESTIGATION_MUSIC_MIX;
}
