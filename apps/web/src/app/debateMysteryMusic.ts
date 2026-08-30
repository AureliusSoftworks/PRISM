import type {
  DebateMysteryPlayPhase,
  DebateMysteryPlayPhaseV2,
} from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

export const WHODUNNIT_INVESTIGATION_MUSIC_URL =
  "/audio/debate/whodunnit/the-midnight-clue.mp3";

export const WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS = 720;
export const WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS = 260;

export const WHODUNNIT_INVESTIGATION_MUSIC_MIX = {
  background: 0.07,
  grain: 0,
  foley: 0,
} as const satisfies SessionAtmosphereMix;

export const WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX = {
  ...WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  background: 0,
} as const satisfies SessionAtmosphereMix;

export const WHODUNNIT_CASE_FORGE_MUSIC_MIX = {
  ...WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  background: 0.055,
} as const satisfies SessionAtmosphereMix;

export const WHODUNNIT_TITLE_CARD_MUSIC_MIX = {
  ...WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  background: 0.075,
} as const satisfies SessionAtmosphereMix;

export function mysteryInvestigationMusicSessionActive(
  playPhase: DebateMysteryPlayPhase,
): boolean {
  return playPhase === "investigation";
}

export function mysteryCasePreludeMusicSessionActive(
  playPhase: DebateMysteryPlayPhaseV2,
): boolean {
  return playPhase === "case_forge" || playPhase === "title_card";
}

export function mysteryCasePreludeMusicMix(
  playPhase: DebateMysteryPlayPhaseV2,
): SessionAtmosphereMix {
  return playPhase === "title_card"
    ? WHODUNNIT_TITLE_CARD_MUSIC_MIX
    : WHODUNNIT_CASE_FORGE_MUSIC_MIX;
}

export function mysteryInvestigationMusicMix(args: {
  caseFileOpen: boolean;
  outside: boolean;
  roomComplete: boolean;
  roomIntroductionActive: boolean;
  roomView: "mansion" | "room";
}): SessionAtmosphereMix {
  return args.outside ||
    args.caseFileOpen ||
    (args.roomView === "room" &&
      (args.roomIntroductionActive || args.roomComplete))
    ? WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX
    : WHODUNNIT_INVESTIGATION_MUSIC_MIX;
}
